import { NextRequest } from "next/server";
import { statisticsPeriodQuerySchema } from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { Prisma } from "@prisma/client";
import { dbDateTrunc } from "@/lib/db-date-trunc";

/** Convert BigInt values to Number for JSON serialization (Prisma raw queries return BigInt from SQLite) */
function serializeRecords<T>(records: T[]): T[] {
  return JSON.parse(JSON.stringify(records, (_, value) =>
    typeof value === "bigint" ? Number(value) : value
  ));
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

    const trunc = dbDateTrunc('m."monitoringDate"', period);

    const records = await prisma.$queryRaw<
      Array<{ date: string; count: number; avgScore: number }>
    >(Prisma.sql`
      SELECT
        ${trunc.select} AS date,
        CAST(COUNT(*) AS INTEGER) AS count,
        CAST(ROUND(AVG(m.score), 1) AS REAL) AS "avgScore"
      FROM "MonitoringRecord" m
      WHERE m."storeId" = ${ctx.storeId}
        AND m."monitoringDate" >= ${from}
        AND m."monitoringDate" <= ${to}
        AND m."deletedAt" IS NULL
      GROUP BY ${trunc.groupBy}
      ORDER BY date ASC
    `);

    console.log(
      `[statistics] Monitoring stats: ${records.length} periods (${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)})`
    );

    return successResponse({ records: serializeRecords(records) });
  } catch (error) {
    console.error("[statistics] Monitoring stats error:", error);
    return errorResponse("STAT_002", "获取监测统计失败", 500);
  }
}
