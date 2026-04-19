import { NextRequest } from "next/server";
import { NOTIFICATION_ERRORS } from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { notificationService } from "@/lib/notification";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { appointmentId } = await params;

    // Look up the appointment
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        storeId: ctx.storeId,
        deletedAt: null,
      },
      include: {
        resident: { select: { name: true } },
      },
    });

    if (!appointment) {
      return errorResponse(NOTIFICATION_ERRORS.NOT_FOUND, "预约不存在", 404);
    }

    const scheduledDate = appointment.scheduledAt.toLocaleDateString("zh-CN", {
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const idempotentTitle = `[${appointmentId.slice(0, 8)}] 预约提醒`;

    const result = await notificationService.send({
      recipientType: "resident",
      recipientId: appointment.residentId,
      type: "appointment_reminder",
      title: idempotentTitle,
      content: `${appointment.resident.name}，您有一个预约：${scheduledDate}，请准时到达。`,
      channel: "console",
      storeId: ctx.storeId,
    });

    if (result.success) {
      return successResponse({
        notificationId: result.notificationId,
        status: "sent",
        appointmentId,
        residentName: appointment.resident.name,
        scheduledAt: appointment.scheduledAt,
      });
    } else {
      return errorResponse(
        NOTIFICATION_ERRORS.SEND_FAILED,
        result.error || "发送提醒失败",
        500
      );
    }
  } catch (error) {
    console.error("[reminder] Manual trigger error:", error);
    return errorResponse(NOTIFICATION_ERRORS.SEND_FAILED, "发送提醒失败", 500);
  }
}
