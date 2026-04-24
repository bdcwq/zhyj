import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { RESIDENT_ERRORS } from "@zhyj/shared";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { id: residentId } = await params;

    // Fetch resident scoped to current store
    const resident = await prisma.resident.findFirst({
      where: {
        id: residentId,
        residentStores: { some: { storeId: ctx.storeId } },
        deletedAt: null,
      },
      include: {
        residentStores: {
          include: { store: { select: { id: true, name: true } } },
        },
      },
    });

    if (!resident) {
      return errorResponse(RESIDENT_ERRORS.NOT_FOUND, "居民不存在", 404);
    }

    // Fetch stats for the current store
    const [monitoringCount, appointmentCount] = await Promise.all([
      prisma.monitoringRecord.count({
        where: { residentId, storeId: ctx.storeId },
      }),
      prisma.appointment.count({
        where: { residentId, storeId: ctx.storeId },
      }),
    ]);

    return successResponse({
      ...resident,
      stores: resident.residentStores.map((rs: { store: { id: string; name: string } }) => ({
        id: rs.store.id,
        name: rs.store.name,
      })),
      stats: { monitoringCount, appointmentCount },
    });
  } catch (error) {
    console.error("[residents] Detail error:", error);
    return errorResponse(RESIDENT_ERRORS.NOT_FOUND, "获取居民详情失败", 500);
  }
}
