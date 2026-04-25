import { NextRequest } from "next/server";
import { statisticsPeriodQuerySchema } from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { searchParams } = new URL(request.url);
    const raw = {
      storeId: ctx.storeId,
      period: searchParams.get("period") || "monthly",
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
    };

    const parsed = statisticsPeriodQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse("STAT_001", parsed.error.errors[0].message, 400);
    }

    const { period, dateFrom, dateTo } = parsed.data;

    // Default date range: current period
    const now = new Date();
    let start: Date;
    let end: Date;

    if (dateFrom && dateTo) {
      start = new Date(dateFrom + "T00:00:00.000Z");
      end = new Date(dateTo + "T23:59:59.999Z");
    } else {
      end = new Date(now.toISOString());
      if (period === "daily") {
        start = new Date(end);
        start.setHours(start.getHours() - 24);
      } else if (period === "weekly") {
        start = new Date(end);
        start.setDate(start.getDate() - 7);
      } else {
        // monthly
        start = new Date(end);
        start.setMonth(start.getMonth() - 1);
      }
    }

    const activityWhere = {
      storeId: ctx.storeId,
      deletedAt: null as null,
      activityDate: { gte: start, lte: end },
    };

    const registrationWhere = {
      storeId: ctx.storeId,
      registeredAt: { gte: start, lte: end },
    };

    const [
      activityCount,
      totalRegistrations,
      checkedInCount,
      noShowCount,
      typeBreakdown,
    ] = await Promise.all([
      prisma.activity.count({ where: activityWhere }),

      prisma.activityRegistration.count({ where: registrationWhere }),

      prisma.activityRegistration.count({
        where: { ...registrationWhere, status: "checked_in" },
      }),

      prisma.activityRegistration.count({
        where: { ...registrationWhere, status: "no_show" },
      }),

      // Breakdown by activity type
      prisma.activity.groupBy({
        by: ["type"],
        where: activityWhere,
        _count: { id: true },
        _sum: { currentCapacity: true },
      }),
    ]);

    const checkInRate =
      totalRegistrations > 0
        ? Math.round((checkedInCount / totalRegistrations) * 1000) / 10
        : 0;
    const noShowRate =
      totalRegistrations > 0
        ? Math.round((noShowCount / totalRegistrations) * 1000) / 10
        : 0;

    const breakdown = typeBreakdown.map((item) => ({
      type: item.type,
      count: item._count.id,
      totalParticipants: item._sum.currentCapacity ?? 0,
    }));

    console.log(
      `[statistics] Activity stats for ${dateFrom ?? period}: ${activityCount} activities, ${totalRegistrations} registrations, ${checkInRate}% check-in`
    );

    return successResponse({
      period,
      dateFrom: start.toISOString().split("T")[0],
      dateTo: end.toISOString().split("T")[0],
      activityCount,
      totalRegistrations,
      checkedInCount,
      noShowCount,
      checkInRate,
      noShowRate,
      breakdown,
    });
  } catch (error) {
    console.error("[statistics] Activity stats error:", error);
    return errorResponse("STAT_002", "获取活动统计数据失败", 500);
  }
}
