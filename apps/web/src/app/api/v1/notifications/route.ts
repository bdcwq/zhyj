import { NextRequest } from "next/server";
import { notificationListQuerySchema } from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { searchParams } = new URL(request.url);
    const raw = {
      limit: searchParams.get("limit") || undefined,
      offset: searchParams.get("offset") || undefined,
      recipientType: searchParams.get("recipientType") || undefined,
      type: searchParams.get("type") || undefined,
      status: searchParams.get("status") || undefined,
    };

    const parsed = notificationListQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse("NOTIFICATION_001", parsed.error.errors[0].message, 400);
    }

    const { limit, offset, recipientType, type, status } = parsed.data;

    const where: Record<string, unknown> = { storeId: ctx.storeId };
    if (recipientType) where.recipientType = recipientType;
    if (type) where.type = type;
    if (status) where.status = status;

    const [records, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          type: true,
          recipientType: true,
          recipientId: true,
          title: true,
          content: true,
          status: true,
          channel: true,
          sentAt: true,
          error: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({ where }),
    ]);

    return successResponse({ records, total, limit, offset });
  } catch (error) {
    console.error("[notification] List error:", error);
    return errorResponse("NOTIFICATION_002", "获取通知列表失败", 500);
  }
}
