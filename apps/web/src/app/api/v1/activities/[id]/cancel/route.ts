import { NextRequest } from "next/server";
import { ACTIVITY_ERRORS } from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { notificationService } from "@/lib/notification";
import { successResponse, errorResponse } from "@/lib/api-response";

/**
 * PATCH /api/v1/activities/[id]/cancel
 * Cancel a published activity. Updates all non-cancelled registrations to cancelled.
 */
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

    const existing = await prisma.activity.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
    });
    if (!existing) {
      return errorResponse(ACTIVITY_ERRORS.NOT_FOUND, "活动不存在", 404);
    }

    if (existing.status !== "published") {
      return errorResponse(
        ACTIVITY_ERRORS.OPERATION_FAILED,
        "只有已发布的活动可以取消",
        400
      );
    }

    // Cancel the activity and all active registrations in a transaction
    const [activity] = await prisma.$transaction([
      prisma.activity.update({
        where: { id },
        data: { status: "cancelled" },
      }),
      prisma.activityRegistration.updateMany({
        where: {
          activityId: id,
          status: { in: ["registered"] },
        },
        data: { status: "cancelled" },
      }),
    ]);

    // S04 will add notification logic here

    // Send cancellation notifications to registered residents (fire-and-forget)
    try {
      const cancelledRegistrations = await prisma.activityRegistration.findMany({
        where: {
          activityId: id,
          status: "cancelled",
        },
        select: { residentId: true },
      });

      if (cancelledRegistrations.length > 0) {
        const idempotentTitle = `[${id.slice(0, 8)}] 活动取消通知`;
        const content = `您报名的"${existing.name}"已被取消，给您带来的不便敬请谅解。`;

        const payloads = cancelledRegistrations.map((reg) => ({
          recipientType: "resident" as const,
          recipientId: reg.residentId,
          type: "activity_cancelled",
          title: idempotentTitle,
          content,
          storeId: ctx.storeId,
        }));

        const results = await notificationService.sendBulk(payloads);
        const sentCount = results.filter((r) => r.success).length;
        console.log(
          `[activity] Cancel notification sent: ${sentCount}/${results.length} for activity ${id}`
        );
      }
    } catch (err) {
      // Notification failure MUST NOT block the cancel response
      console.error(`[activity] Failed to send cancel notifications for ${id}:`, err);
    }

    console.log(
      `[activity] Cancelled: ${id} "${existing.name}"`
    );

    return successResponse(activity);
  } catch (error) {
    console.error("[activity] Cancel error:", error);
    return errorResponse(ACTIVITY_ERRORS.OPERATION_FAILED, "取消活动失败", 500);
  }
}
