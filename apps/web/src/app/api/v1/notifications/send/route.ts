import { NextRequest } from "next/server";
import { sendNotificationSchema } from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { notificationService } from "@/lib/notification";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const body = await request.json();
    const parsed = sendNotificationSchema.safeParse({
      ...body,
      channel: body.channel || "console",
    });

    if (!parsed.success) {
      return errorResponse("NOTIFICATION_001", parsed.error.errors[0].message, 400);
    }

    const { recipientType, recipientId, type, title, content, channel } = parsed.data;

    const result = await notificationService.send({
      recipientType,
      recipientId,
      type,
      title,
      content,
      channel,
      storeId: ctx.storeId,
    });

    if (result.success) {
      return successResponse({
        notificationId: result.notificationId,
        status: "sent",
      });
    } else {
      return errorResponse("NOTIFICATION_002", result.error || "发送通知失败", 500);
    }
  } catch (error) {
    console.error("[notification] Send error:", error);
    return errorResponse("NOTIFICATION_002", "发送通知失败", 500);
  }
}
