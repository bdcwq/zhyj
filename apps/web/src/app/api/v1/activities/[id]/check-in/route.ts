import { NextRequest } from "next/server";
import {
  checkInActivitySchema,
  ACTIVITY_ERRORS,
} from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { checkInRules } from "@/lib/activity-rules";

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
      const parsed = checkInActivitySchema.safeParse(body);
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

    // Check-in rules (includes idempotent check)
    const ruleResult = await checkInRules(
      prisma,
      residentId,
      activityId,
      storeId
    );
    if (!ruleResult.allowed) {
      return errorResponse(ruleResult.code!, ruleResult.reason!, 400);
    }

    // Check if already checked in (idempotent — return existing record)
    const existing = await prisma.activityRegistration.findUnique({
      where: { activityId_residentId: { activityId, residentId } },
    });

    if (existing && existing.status === "checked_in") {
      console.log(
        `[activity] Checked in (idempotent): ${residentId} for ${activityId}`
      );
      return successResponse(existing);
    }

    // Update registration to checked_in
    const registration = await prisma.activityRegistration.update({
      where: { activityId_residentId: { activityId, residentId } },
      data: { status: "checked_in", checkedInAt: new Date() },
    });

    console.log(`[activity] Checked in: ${residentId} for ${activityId}`);

    return successResponse(registration);
  } catch (error) {
    console.error("[activity] Check-in error:", error);
    return errorResponse(
      ACTIVITY_ERRORS.OPERATION_FAILED,
      "签到失败",
      500
    );
  }
}
