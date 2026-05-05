import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { INSTRUCTOR_ERRORS } from "@zhyj/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(_request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);

    const { id } = await params;
    const instructor = await prisma.instructor.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
      include: { _count: { select: { activities: true } } },
    });

    if (!instructor) {
      return errorResponse(INSTRUCTOR_ERRORS.NOT_FOUND, "授课老师不存在", 404);
    }

    return successResponse(instructor);
  } catch (error) {
    console.error("[instructors] Get error:", error);
    return errorResponse(INSTRUCTOR_ERRORS.NOT_FOUND, "获取授课老师详情失败", 500);
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
    const existing = await prisma.instructor.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
    });
    if (!existing) {
      return errorResponse(INSTRUCTOR_ERRORS.NOT_FOUND, "授课老师不存在", 404);
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (!body.name?.trim()) return errorResponse(INSTRUCTOR_ERRORS.VALIDATION_ERROR, "姓名不能为空", 400);
      data.name = body.name.trim();
    }
    if (body.specialty !== undefined) data.specialty = body.specialty?.trim() || null;
    if (body.bio !== undefined) data.bio = body.bio?.trim() || null;
    if (body.phone !== undefined) data.phone = body.phone?.trim() || null;
    if (body.status !== undefined) {
      if (!["active", "inactive"].includes(body.status)) {
        return errorResponse(INSTRUCTOR_ERRORS.VALIDATION_ERROR, "无效状态", 400);
      }
      data.status = body.status;
    }

    const instructor = await prisma.instructor.update({
      where: { id },
      data,
    });

    console.log(`[instructors] Updated: id=${id}`);
    return successResponse(instructor);
  } catch (error) {
    console.error("[instructors] Update error:", error);
    return errorResponse(INSTRUCTOR_ERRORS.UPDATE_FAILED, "更新授课老师失败", 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(_request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], _request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;
    const existing = await prisma.instructor.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
    });
    if (!existing) {
      return errorResponse(INSTRUCTOR_ERRORS.NOT_FOUND, "授课老师不存在", 404);
    }

    // Soft delete
    await prisma.instructor.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    console.log(`[instructors] Deleted: id=${id}, name=${existing.name}`);
    return successResponse({ id });
  } catch (error) {
    console.error("[instructors] Delete error:", error);
    return errorResponse(INSTRUCTOR_ERRORS.DELETE_FAILED, "删除授课老师失败", 500);
  }
}
