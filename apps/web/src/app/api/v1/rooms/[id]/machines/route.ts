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
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    // Verify room belongs to store
    const room = await prisma.room.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
    });

    if (!room) {
      return errorResponse("APPOINTMENT_008", "房间不存在", 404);
    }

    const machines = await prisma.machine.findMany({
      where: { roomId: id, deletedAt: null },
      orderBy: { name: "asc" },
    });

    return successResponse(machines);
  } catch (error) {
    console.error("[appointments] Room machines error:", error);
    return errorResponse("APPOINTMENT_009", "获取设备列表失败", 500);
  }
}
