import { NextRequest } from "next/server";
import {
  registerActivitySchema,
  ACTIVITY_ERRORS,
} from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { isRegistrationAllowed } from "@/lib/activity-rules";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);

    const { id: activityId } = await params;

    // Resolve residentId: from token for resident auth, from body for staff auth
    let residentId: string;
    if (ctx.residentId && !ctx.staffId) {
      residentId = ctx.residentId;
    } else if (ctx.staffId) {
      const body = await request.json();
      const parsed = registerActivitySchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse(
          ACTIVITY_ERRORS.OPERATION_FAILED,
          parsed.error.errors[0].message,
          400
        );
      }
      residentId = parsed.data.residentId;
    } else {
      return errorResponse("AUTH_006", "仅居民或工作人员可操作", 403);
    }

    const storeId = ctx.storeId;

    // Pre-check registration rules (non-transactional, for early rejection)
    const ruleResult = await isRegistrationAllowed(
      prisma,
      residentId,
      activityId,
      storeId
    );
    if (!ruleResult.allowed) {
      return errorResponse(ruleResult.code!, ruleResult.reason!, 400);
    }

    // Atomic transaction: re-check capacity + create registration
    const registration = await prisma.$transaction(async (tx: any) => {
      // Re-check capacity inside transaction (MEM035)
      const activity = await tx.activity.findUnique({
        where: { id: activityId },
        select: { currentCapacity: true, maxCapacity: true, status: true },
      });
      if (!activity) throw new Error(ACTIVITY_ERRORS.NOT_FOUND);
      if (activity.status !== "published")
        throw new Error(ACTIVITY_ERRORS.NOT_PUBLISHED);
      if (activity.currentCapacity >= activity.maxCapacity)
        throw new Error(ACTIVITY_ERRORS.FULL);

      await tx.activity.update({
        where: { id: activityId },
        data: { currentCapacity: { increment: 1 } },
      });

      return tx.activityRegistration.create({
        data: { activityId, residentId, storeId, status: "registered" },
      });
    });

    console.log(`[activity] Registered: ${residentId} for ${activityId}`);

    return successResponse(registration, 201);
  } catch (error) {
    // Map transaction errors to appropriate API responses
    if (error instanceof Error) {
      const msg = error.message;
      if (msg === ACTIVITY_ERRORS.FULL) {
        return errorResponse(ACTIVITY_ERRORS.FULL, "活动人数已满", 400);
      }
      if (msg === ACTIVITY_ERRORS.NOT_PUBLISHED) {
        return errorResponse(
          ACTIVITY_ERRORS.NOT_PUBLISHED,
          "活动未发布",
          400
        );
      }
      if (msg === ACTIVITY_ERRORS.NOT_FOUND) {
        return errorResponse(ACTIVITY_ERRORS.NOT_FOUND, "活动不存在", 404);
      }
      // Prisma unique constraint violation (duplicate registration)
      if (msg.includes("Unique constraint") || msg.includes("P2002")) {
        return errorResponse(
          ACTIVITY_ERRORS.ALREADY_REGISTERED,
          "已报名该活动",
          400
        );
      }
    }

    console.error("[activity] Register error:", error);
    return errorResponse(
      ACTIVITY_ERRORS.OPERATION_FAILED,
      "报名失败",
      500
    );
  }
}
