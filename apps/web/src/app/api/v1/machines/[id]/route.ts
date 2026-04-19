import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { MACHINE_ERRORS } from "@zhyj/shared";
import { updateMachineSchema } from "@zhyj/shared";

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

    const machine = await prisma.machine.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
      include: {
        room: { select: { id: true, name: true } },
      },
    });

    if (!machine) {
      return errorResponse(MACHINE_ERRORS.NOT_FOUND, "设备不存在", 404);
    }

    return successResponse(machine);
  } catch (error) {
    console.error("[machines] Machine get error:", error);
    return errorResponse(MACHINE_ERRORS.UPDATE_FAILED, "获取设备详情失败", 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    // Verify machine belongs to store
    const existing = await prisma.machine.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
    });
    if (!existing) {
      return errorResponse(MACHINE_ERRORS.NOT_FOUND, "设备不存在", 404);
    }

    const body = await request.json();
    const parsed = updateMachineSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(MACHINE_ERRORS.VALIDATION_ERROR, parsed.error.issues[0].message, 400);
    }

    // If roomId is being set (non-null), validate room exists in same store
    if (parsed.data.roomId !== undefined && parsed.data.roomId !== null) {
      const room = await prisma.room.findFirst({
        where: { id: parsed.data.roomId, storeId: ctx.storeId, deletedAt: null },
      });
      if (!room) {
        return errorResponse(MACHINE_ERRORS.ROOM_NOT_FOUND, "房间不存在", 404);
      }
    }

    const machine = await prisma.machine.update({
      where: { id },
      data: parsed.data,
      include: {
        room: { select: { id: true, name: true } },
      },
    });

    console.log(`[machines] Updated machine: id=${machine.id}, fields=${Object.keys(parsed.data).join(",")}`);
    return successResponse(machine);
  } catch (error) {
    console.error("[machines] Machine update error:", error);
    return errorResponse(MACHINE_ERRORS.UPDATE_FAILED, "更新设备失败", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    // Verify machine belongs to store
    const existing = await prisma.machine.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
    });
    if (!existing) {
      return errorResponse(MACHINE_ERRORS.NOT_FOUND, "设备不存在", 404);
    }

    await prisma.machine.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    console.log(`[machines] Deleted machine: id=${id}, name=${existing.name}`);
    return successResponse({ id, deleted: true });
  } catch (error) {
    console.error("[machines] Machine delete error:", error);
    return errorResponse(MACHINE_ERRORS.DELETE_FAILED, "删除设备失败", 500);
  }
}
