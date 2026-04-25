import { NextRequest } from "next/server";
import {
  myRegistrationsQuerySchema,
  ACTIVITY_ERRORS,
} from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);

    // Resident auth required
    if (!ctx.residentId) {
      return errorResponse("AUTH_006", "仅居民可查看报名记录", 403);
    }

    const { searchParams } = new URL(request.url);
    const raw = {
      status: searchParams.get("status") || undefined,
      limit: searchParams.get("limit") || undefined,
      offset: searchParams.get("offset") || undefined,
    };

    const parsed = myRegistrationsQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(
        ACTIVITY_ERRORS.OPERATION_FAILED,
        parsed.error.errors[0].message,
        400
      );
    }

    const { status, limit, offset } = parsed.data;

    const where: Record<string, unknown> = {
      residentId: ctx.residentId,
      storeId: ctx.storeId,
    };

    if (status) where.status = status;

    const [registrations, total] = await Promise.all([
      prisma.activityRegistration.findMany({
        where,
        orderBy: { registeredAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          status: true,
          registeredAt: true,
          checkedInAt: true,
          activity: {
            select: {
              id: true,
              name: true,
              type: true,
              customType: true,
              activityDate: true,
              startTime: true,
              endTime: true,
              maxCapacity: true,
              currentCapacity: true,
              status: true,
            },
          },
        },
      }),
      prisma.activityRegistration.count({ where }),
    ]);

    console.log(
      `[activity] My registrations: ${ctx.residentId}, ${total} records`
    );

    return successResponse({ records: registrations, total, limit, offset });
  } catch (error) {
    console.error("[activity] My registrations error:", error);
    return errorResponse(
      ACTIVITY_ERRORS.OPERATION_FAILED,
      "获取报名记录失败",
      500
    );
  }
}
