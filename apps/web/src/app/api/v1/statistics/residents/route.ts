import { NextRequest } from "next/server";
import { statisticsPeriodQuerySchema } from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { Prisma } from "@prisma/client";
import { dbDateTrunc } from "@/lib/db-date-trunc";

/** Convert BigInt values to Number (Prisma raw queries return BigInt from integer columns) */
function toNumber(val: unknown): number {
  return typeof val === "bigint" ? Number(val) : (val as number);
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { searchParams } = new URL(request.url);
    const raw = {
      storeId: ctx.storeId,
      period: searchParams.get("period") || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
    };

    const parsed = statisticsPeriodQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse("STAT_001", parsed.error.errors[0].message, 400);
    }

    const { period, dateFrom, dateTo } = parsed.data;

    const to = dateTo ? new Date(dateTo + "T23:59:59.999Z") : new Date();
    const from = dateFrom
      ? new Date(dateFrom + "T00:00:00.000Z")
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const trunc = dbDateTrunc('r."createdAt"', period);

    // New residents per period — JOIN through ResidentStore, use parameterized query
    const newRecords = await prisma.$queryRaw<
      Array<{ date: string; newCount: number }>
    >(Prisma.sql`
      SELECT
        ${trunc.select} AS date,
        CAST(COUNT(DISTINCT r.id) AS INTEGER) AS "newCount"
      FROM "Resident" r
      JOIN "ResidentStore" rs ON rs."residentId" = r.id
      WHERE rs."storeId" = ${ctx.storeId}
        AND r."createdAt" >= ${from}
        AND r."createdAt" <= ${to}
        AND r."deletedAt" IS NULL
      GROUP BY ${trunc.groupBy}
      ORDER BY date ASC
    `);

    // Total residents up to each period end (cumulative)
    const totalRecords = await prisma.$queryRaw<
      Array<{ date: string; totalCount: number }>
    >(Prisma.sql`
      SELECT
        ${trunc.select} AS date,
        CAST(COUNT(DISTINCT r.id) AS INTEGER) AS "totalCount"
      FROM "Resident" r
      JOIN "ResidentStore" rs ON rs."residentId" = r.id
      WHERE rs."storeId" = ${ctx.storeId}
        AND r."createdAt" <= ${to}
        AND r."deletedAt" IS NULL
      GROUP BY ${trunc.groupBy}
      ORDER BY date ASC
    `);

    // Build cumulative total map
    const totalMap = new Map<string, number>();
    let cumulative = 0;
    for (const row of totalRecords as Array<{ date: string; totalCount: number }>) {
      cumulative += toNumber(row.totalCount);
      totalMap.set(row.date, cumulative);
    }

    // Merge new counts with cumulative totals
    const typedNewRecords = newRecords as Array<{ date: string; newCount: number }>;
    const newMap = new Map(typedNewRecords.map((r) => [r.date, toNumber(r.newCount)]));
    const allDates = new Set([...newMap.keys(), ...totalMap.keys()]);
    const records = Array.from(allDates)
      .sort()
      .map((date) => ({
        date,
        newCount: newMap.get(date) || 0,
        totalCount: totalMap.get(date) || 0,
      }));

    console.log(
      `[statistics] Resident stats: ${records.length} periods (${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)})`
    );

    return successResponse({ records });
  } catch (error) {
    console.error("[statistics] Resident stats error:", error);
    return errorResponse("STAT_002", "获取居民统计失败", 500);
  }
}
