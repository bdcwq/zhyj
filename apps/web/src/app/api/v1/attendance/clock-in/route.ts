import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { ATTENDANCE_ERRORS, STAFF_ROLES } from "@zhyj/shared";
import { clockInSchema } from "@zhyj/shared";

// ── POST /api/v1/attendance/clock-in ──

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(
      ctx,
      [STAFF_ROLES.ADMIN, STAFF_ROLES.STORE_MANAGER, STAFF_ROLES.STAFF],
      request.url,
    );
    if (roleGuard) return roleGuard;

    if (!ctx.staffId) {
      return errorResponse(
        ATTENDANCE_ERRORS.INVALID_PARAMS,
        "员工身份信息缺失",
        400,
      );
    }

    const body = await request.json();
    const parsed = clockInSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return errorResponse(
        ATTENDANCE_ERRORS.INVALID_PARAMS,
        firstError?.message || "参数验证失败",
        400,
      );
    }

    const { scheduleId } = parsed.data;

    // Find the schedule
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      return errorResponse(
        ATTENDANCE_ERRORS.SCHEDULE_NOT_FOUND,
        "排班不存在",
        404,
      );
    }

    if (schedule.status !== "scheduled") {
      return errorResponse(
        ATTENDANCE_ERRORS.INVALID_PARAMS,
        "该排班已取消或已完成",
        400,
      );
    }

    // Verify the schedule belongs to this staff member
    if (schedule.staffId !== ctx.staffId) {
      return errorResponse(
        ATTENDANCE_ERRORS.INVALID_PARAMS,
        "该排班不属于当前员工",
        403,
      );
    }

    const now = new Date();

    // Calculate today's date range (UTC+8 aware)
    const today = new Date(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T00:00:00`,
    );
    const endOfDay = new Date(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T23:59:59.999`,
    );

    // Check for existing attendance record for this staff+date+schedule
    const existing = await prisma.attendance.findFirst({
      where: {
        staffId: ctx.staffId,
        date: { gte: today, lte: endOfDay },
        scheduleId: schedule.id,
      },
    });

    if (existing) {
      if (existing.clockIn) {
        console.log(
          `[attendance] Already clocked in: staffId=${ctx.staffId}, attendanceId=${existing.id}`,
        );
        return errorResponse(
          ATTENDANCE_ERRORS.ALREADY_CLOCKED_IN,
          "今日已签到，无需重复打卡",
          400,
        );
      }

      // Update existing record with clockIn (idempotent for late clock-in)
      const updated = await prisma.attendance.update({
        where: { id: existing.id },
        data: { clockIn: now },
      });

      console.log(
        `[attendance] Clock-in updated: staffId=${ctx.staffId}, attendanceId=${existing.id}, scheduleId=${scheduleId}`,
      );

      return successResponse(updated);
    }

    // Create new attendance record
    const attendance = await prisma.attendance.create({
      data: {
        staffId: ctx.staffId,
        storeId: ctx.storeId,
        scheduleId: schedule.id,
        date: now,
        clockIn: now,
        scheduledStart: schedule.startTime,
        scheduledEnd: schedule.endTime,
        status: "pending",
      },
    });

    console.log(
      `[attendance] Clock-in: staffId=${ctx.staffId}, attendanceId=${attendance.id}, scheduleId=${scheduleId}`,
    );

    return successResponse(attendance);
  } catch (error) {
    console.error("[attendance] Clock-in error:", error);
    return errorResponse(
      ATTENDANCE_ERRORS.CREATE_FAILED,
      "签到失败",
      500,
    );
  }
}
