import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { ROOM_ERRORS } from "@zhyj/shared";
import { updateRoomSchema } from "@zhyj/shared";

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

    const room = await prisma.room.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
      include: {
        _count: { select: { machines: true } },
      },
    });

    if (!room) {
      return errorResponse(ROOM_ERRORS.NOT_FOUND, "房间不存在", 404);
    }

    return successResponse(room);
  } catch (error) {
    console.error("[rooms] Room get error:", error);
    return errorResponse(ROOM_ERRORS.UPDATE_FAILED, "获取房间详情失败", 500);
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

    // Verify room belongs to store
    const existing = await prisma.room.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
    });
    if (!existing) {
      return errorResponse(ROOM_ERRORS.NOT_FOUND, "房间不存在", 404);
    }

    const body = await request.json();
    const parsed = updateRoomSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(ROOM_ERRORS.VALIDATION_ERROR, parsed.error.issues[0].message, 400);
    }

    // If name is being updated, check uniqueness within the same store
    if (parsed.data.name && parsed.data.name !== existing.name) {
      const duplicate = await prisma.room.findFirst({
        where: { name: parsed.data.name, storeId: ctx.storeId, deletedAt: null },
      });
      if (duplicate) {
        return errorResponse(ROOM_ERRORS.NAME_EXISTS, "房间名称已存在", 409);
      }
    }

    const room = await prisma.room.update({
      where: { id },
      data: parsed.data,
      include: {
        _count: { select: { machines: true } },
      },
    });

    console.log(`[rooms] Updated room: id=${room.id}, fields=${Object.keys(parsed.data).join(",")}`);
    return successResponse(room);
  } catch (error) {
    console.error("[rooms] Room update error:", error);
    return errorResponse(ROOM_ERRORS.UPDATE_FAILED, "更新房间失败", 500);
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

    // Verify room belongs to store
    const existing = await prisma.room.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
    });
    if (!existing) {
      return errorResponse(ROOM_ERRORS.NOT_FOUND, "房间不存在", 404);
    }

    // Soft-delete room and cascade to all its machines in a transaction
    await prisma.$transaction([
      prisma.machine.updateMany({
        where: { roomId: id, deletedAt: null },
        data: { deletedAt: new Date() },
      }),
      prisma.room.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    ]);

    console.log(`[rooms] Deleted room: id=${id}, name=${existing.name} (cascade to machines)`);
    return successResponse({ id, deleted: true });
  } catch (error) {
    console.error("[rooms] Room delete error:", error);
    return errorResponse(ROOM_ERRORS.DELETE_FAILED, "删除房间失败", 500);
  }
}
