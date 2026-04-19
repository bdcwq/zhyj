import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager", "staff"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    const record = await prisma.monitoringRecord.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
      include: {
        resident: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!record) {
      return errorResponse("MONITORING_003", "监测记录不存在", 404);
    }

    return successResponse(record);
  } catch (error) {
    console.error("[monitoring] Get error:", error);
    return errorResponse("MONITORING_003", "获取监测记录失败", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager", "staff"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    const record = await prisma.monitoringRecord.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
    });

    if (!record) {
      return errorResponse("MONITORING_003", "监测记录不存在", 404);
    }

    await prisma.monitoringRecord.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    console.log(`[monitoring] Soft-deleted record ${id}`);

    return successResponse({ id, deleted: true });
  } catch (error) {
    console.error("[monitoring] Delete error:", error);
    return errorResponse("MONITORING_005", "删除监测记录失败", 500);
  }
}
