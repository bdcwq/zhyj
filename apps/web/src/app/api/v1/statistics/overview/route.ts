import { NextRequest } from "next/server";
import { statisticsOverviewQuerySchema } from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

function dayRange(dateStr: string) {
  const start = new Date(dateStr + "T00:00:00.000Z");
  const end = new Date(dateStr + "T23:59:59.999Z");
  return { start, end };
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
      date: searchParams.get("date") || undefined,
    };

    const parsed = statisticsOverviewQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse("STAT_001", parsed.error.errors[0].message, 400);
    }

    const { date } = parsed.data;
    const today = new Date().toISOString().split("T")[0];
    const { start, end } = dayRange(date || today);

    const baseStoreFilter = { storeId: ctx.storeId, deletedAt: null as null };

    // Resident-specific filter needs ResidentStore join pattern
    const residentStoreFilter = {
      residentStores: { some: { storeId: ctx.storeId } },
      deletedAt: null as null,
    };

    const [
      monitoringCount,
      appointmentCount,
      completedCount,
      noShowCount,
      newResidentsCount,
      cancelledCount,
    ] = await Promise.all([
      prisma.monitoringRecord.count({
        where: {
          ...baseStoreFilter,
          monitoringDate: { gte: start, lte: end },
        },
      }),
      prisma.appointment.count({
        where: {
          ...baseStoreFilter,
          scheduledAt: { gte: start, lte: end },
        },
      }),
      prisma.appointment.count({
        where: {
          ...baseStoreFilter,
          scheduledAt: { gte: start, lte: end },
          status: "completed",
        },
      }),
      prisma.appointment.count({
        where: {
          ...baseStoreFilter,
          scheduledAt: { gte: start, lte: end },
          status: "no_show",
        },
      }),
      prisma.resident.count({
        where: {
          ...residentStoreFilter,
          createdAt: { gte: start, lte: end },
        },
      }),
      prisma.appointment.count({
        where: {
          ...baseStoreFilter,
          scheduledAt: { gte: start, lte: end },
          status: "cancelled",
        },
      }),
    ]);

    console.log(
      `[statistics] Overview for ${date || today}: ${monitoringCount} monitoring, ${appointmentCount} appointments`
    );

    return successResponse({
      monitoringCount,
      appointmentCount,
      completedCount,
      noShowCount,
      newResidentsCount,
      cancelledCount,
    });
  } catch (error) {
    console.error("[statistics] Overview error:", error);
    return errorResponse("STAT_002", "获取统计数据失败", 500);
  }
}
