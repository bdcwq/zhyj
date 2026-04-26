import { NextRequest } from "next/server";
import { crossStoreReportSchema } from "@zhyj/shared";
import { STAT_ERRORS } from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { Prisma } from "@prisma/client";
import { dbDateTrunc } from "@/lib/db-date-trunc";

/** Convert BigInt values to Number for JSON serialization (Prisma raw queries return BigInt from SQLite) */
function serializeRecords<T>(records: T[]): T[] {
  return JSON.parse(
    JSON.stringify(records, (_, value) =>
      typeof value === "bigint" ? Number(value) : value
    )
  );
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);

    const roleGuard = requireRole(ctx, ["admin"], request.url);
    if (roleGuard) return roleGuard;

    const { searchParams } = new URL(request.url);
    const raw = {
      period: searchParams.get("period") || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      metric: searchParams.get("metric") || undefined,
    };

    const parsed = crossStoreReportSchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(
        STAT_ERRORS.INVALID_DATE_RANGE,
        parsed.error.errors[0].message,
        400
      );
    }

    const { period, dateFrom, dateTo, metric } = parsed.data;

    // Default date range: last 30 days
    const to = dateTo
      ? new Date(dateTo + "T23:59:59.999Z")
      : new Date();
    const from = dateFrom
      ? new Date(dateFrom + "T00:00:00.000Z")
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Fetch all active stores
    const stores = await prisma.store.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });

    if (metric === "overview") {
      const storesWithMetrics = await Promise.all(
        stores.map(async (store) => {
          const [monitoringCount, avgResult, appointmentGroups, newResidentsCount, staffCount] =
            await Promise.all([
              prisma.monitoringRecord.count({
                where: {
                  storeId: store.id,
                  deletedAt: null,
                  monitoringDate: { gte: from, lte: to },
                },
              }),
              prisma.monitoringRecord.aggregate({
                where: {
                  storeId: store.id,
                  deletedAt: null,
                  monitoringDate: { gte: from, lte: to },
                },
                _avg: { score: true },
              }),
              prisma.appointment.groupBy({
                by: ["status"],
                where: {
                  storeId: store.id,
                  deletedAt: null,
                  scheduledAt: { gte: from, lte: to },
                },
                _count: true,
              }),
              prisma.resident.count({
                where: {
                  residentStores: { some: { storeId: store.id } },
                  createdAt: { gte: from, lte: to },
                  deletedAt: null,
                },
              }),
              prisma.staffStore.count({
                where: { storeId: store.id },
              }),
            ]);

          // Merge appointment groupBy into flat counts
          const appointmentCounts = {
            booked: 0,
            completed: 0,
            no_show: 0,
            cancelled: 0,
            verified: 0,
            in_progress: 0,
          };
          for (const group of appointmentGroups) {
            const key = group.status as keyof typeof appointmentCounts;
            if (key in appointmentCounts) {
              appointmentCounts[key] = group._count;
            }
          }

          return {
            storeId: store.id,
            storeName: store.name,
            monitoringCount,
            avgScore: avgResult._avg.score ?? null,
            ...appointmentCounts,
            newResidentsCount,
            staffCount,
          };
        })
      );

      console.log(
        `[statistics] Cross-store overview: ${storesWithMetrics.length} stores (${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)})`
      );

      return successResponse({
        stores: storesWithMetrics,
        period,
        dateFrom: from.toISOString().slice(0, 10),
        dateTo: to.toISOString().slice(0, 10),
      });
    }

    // Period-based queries (daily/weekly/monthly) with raw SQL
    const trunc = dbDateTrunc('a."scheduledAt"', period);

    let records: Array<{
      storeId: string;
      date: string;
      booked: number;
      completed: number;
      noShow: number;
      cancelled: number;
    }>;

    if (metric === "appointments") {
      records = await prisma.$queryRaw(Prisma.sql`
        SELECT
          a."storeId",
          ${trunc.select} AS date,
          CAST(SUM(CASE WHEN a.status = 'booked' THEN 1 ELSE 0 END) AS INTEGER) AS booked,
          CAST(SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) AS INTEGER) AS completed,
          CAST(SUM(CASE WHEN a.status = 'no_show' THEN 1 ELSE 0 END) AS INTEGER) AS "noShow",
          CAST(SUM(CASE WHEN a.status = 'cancelled' THEN 1 ELSE 0 END) AS INTEGER) AS cancelled
        FROM "Appointment" a
        WHERE a."scheduledAt" >= ${from}
          AND a."scheduledAt" <= ${to}
          AND a."deletedAt" IS NULL
        GROUP BY a."storeId", ${trunc.groupBy}
        ORDER BY a."storeId", date ASC
      `);
    } else if (metric === "monitoring") {
      const mTrunc = dbDateTrunc('r."monitoringDate"', period);
      records = await prisma.$queryRaw(Prisma.sql`
        SELECT
          r."storeId",
          ${mTrunc.select} AS date,
          CAST(COUNT(*) AS INTEGER) AS booked,
          CAST(COALESCE(AVG(r.score), 0) AS INTEGER) AS completed,
          CAST(0 AS INTEGER) AS "noShow",
          CAST(0 AS INTEGER) AS cancelled
        FROM "MonitoringRecord" r
        WHERE r."monitoringDate" >= ${from}
          AND r."monitoringDate" <= ${to}
          AND r."deletedAt" IS NULL
        GROUP BY r."storeId", ${mTrunc.groupBy}
        ORDER BY r."storeId", date ASC
      `);
    } else {
      // metric === "residents"
      const rTrunc = dbDateTrunc('rs."createdAt"', period);
      records = await prisma.$queryRaw(Prisma.sql`
        SELECT
          rs."storeId",
          ${rTrunc.select} AS date,
          CAST(COUNT(*) AS INTEGER) AS booked,
          CAST(0 AS INTEGER) AS completed,
          CAST(0 AS INTEGER) AS "noShow",
          CAST(0 AS INTEGER) AS cancelled
        FROM "ResidentStore" rs
        WHERE rs."createdAt" >= ${from}
          AND rs."createdAt" <= ${to}
        GROUP BY rs."storeId", ${rTrunc.groupBy}
        ORDER BY rs."storeId", date ASC
      `);
    }

    // Map storeId to storeName
    const storeMap = new Map(stores.map((s: { id: string; name: string }) => [s.id, s.name]));

    const result = serializeRecords(records).map((r: any) => ({
      storeId: r.storeId,
      storeName: storeMap.get(r.storeId) ?? null,
      date: r.date,
      ...(metric === "monitoring" ? { monitoringCount: r.booked, avgScore: r.completed } : {}),
      ...(metric === "residents" ? { newResidentsCount: r.booked } : {}),
      ...(metric === "appointments" ? { booked: r.booked, completed: r.completed, noShow: r.noShow, cancelled: r.cancelled } : {}),
    }));

    console.log(
      `[statistics] Cross-store ${metric}: ${records.length} periods (${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)})`
    );

    return successResponse({
      stores: result,
      period,
      dateFrom: from.toISOString().slice(0, 10),
      dateTo: to.toISOString().slice(0, 10),
    });
  } catch (error) {
    console.error("[statistics] Cross-store report error:", error);
    return errorResponse(STAT_ERRORS.QUERY_FAILED, "获取跨店统计数据失败", 500);
  }
}
