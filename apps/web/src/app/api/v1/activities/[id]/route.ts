import { NextRequest } from "next/server";
import { updateActivitySchema, ACTIVITY_ERRORS } from "@zhyj/shared";
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

    const { id } = await params;

    const activity = await prisma.activity.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
      include: {
        instructor: { select: { id: true, name: true } },
        _count: { select: { registrations: true } },
      },
    });

    if (!activity) {
      return errorResponse(ACTIVITY_ERRORS.NOT_FOUND, "活动不存在", 404);
    }

    // Residents can only view published activities
    if (ctx.residentId && !ctx.staffId && activity.status !== "published") {
      return errorResponse(ACTIVITY_ERRORS.NOT_FOUND, "活动不存在", 404);
    }

    // Get registration counts by status
    const registrationStats = await prisma.activityRegistration.groupBy({
      by: ["status"],
      where: { activityId: id },
      _count: { status: true },
    });

    const statusCounts: Record<string, number> = {};
    for (const stat of registrationStats) {
      statusCounts[stat.status] = stat._count.status;
    }

    return successResponse({
      ...activity,
      registrationCount: activity._count.registrations,
      checkedInCount: statusCounts["checked_in"] || 0,
      noShowCount: statusCounts["no_show"] || 0,
    });
  } catch (error) {
    console.error("[activity] Get error:", error);
    return errorResponse(ACTIVITY_ERRORS.OPERATION_FAILED, "获取活动详情失败", 500);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    const existing = await prisma.activity.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
    });
    if (!existing) {
      return errorResponse(ACTIVITY_ERRORS.NOT_FOUND, "活动不存在", 404);
    }

    // Can only edit draft and published activities
    if (existing.status === "completed" || existing.status === "cancelled") {
      return errorResponse(
        ACTIVITY_ERRORS.OPERATION_FAILED,
        "已完成或已取消的活动无法编辑",
        400
      );
    }

    const body = await request.json();
    const parsed = updateActivitySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        ACTIVITY_ERRORS.OPERATION_FAILED,
        parsed.error.errors[0].message,
        400
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.description !== undefined) data.description = parsed.data.description;
    if (parsed.data.customType !== undefined) data.customType = parsed.data.customType;
    if (parsed.data.activityDate !== undefined) data.activityDate = new Date(parsed.data.activityDate);
    if (parsed.data.startTime !== undefined) data.startTime = parsed.data.startTime;
    if (parsed.data.endTime !== undefined) data.endTime = parsed.data.endTime;
    if (parsed.data.maxCapacity !== undefined) {
      // Ensure maxCapacity >= currentCapacity
      if (parsed.data.maxCapacity < existing.currentCapacity) {
        return errorResponse(
          ACTIVITY_ERRORS.OPERATION_FAILED,
          `最大人数不能小于已报名人数（${existing.currentCapacity}）`,
          400
        );
      }
      data.maxCapacity = parsed.data.maxCapacity;
    }
    if (parsed.data.liveStreamUrl !== undefined) data.liveStreamUrl = parsed.data.liveStreamUrl;
    if (parsed.data.instructorId !== undefined) data.instructorId = parsed.data.instructorId;

    const activity = await prisma.activity.update({
      where: { id },
      data,
    });

    console.log(`[activity] Updated: ${id}`);

    return successResponse(activity);
  } catch (error) {
    console.error("[activity] Update error:", error);
    return errorResponse(ACTIVITY_ERRORS.OPERATION_FAILED, "更新活动失败", 500);
  }
}
