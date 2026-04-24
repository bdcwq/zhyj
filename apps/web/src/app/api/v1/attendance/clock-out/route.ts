import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { ATTENDANCE_ERRORS, STAFF_ROLES, SCHEDULE_STATUS } from "@zhyj/shared";
import { clockOutSchema } from "@zhyj/shared";

// ── Helpers ──

const GRACE_MINUTES = 10;
const BREAK_MINUTES = 60;
const ROUNDING_UNIT = 0.25; // round worked hours to nearest 0.25

/**
 * Calculate worked hours between clockIn and clockOut.
 * If shift > 6h, subtract 60min break.
 * Round to nearest 0.25.
 */
function calculateWorkedHours(
  clockIn: Date,
  clockOut: Date,
  scheduledStart: string | null | undefined,
  scheduledEnd: string | null | undefined,
): number {
  const diffMs = clockOut.getTime() - clockIn.getTime();
  let workedHours = diffMs / (1000 * 60 * 60);

  // If we have schedule info, check if the shift is > 6h to apply break deduction
  if (scheduledStart && scheduledEnd) {
    const [sh, sm] = scheduledStart.split(":").map(Number);
    const [eh, em] = scheduledEnd.split(":").map(Number);
    let shiftHours = eh + em / 60 - (sh + sm / 60);
    // Handle overnight shifts (e.g. 22:00 - 06:00)
    if (shiftHours <= 0) shiftHours += 24;
    if (shiftHours > 6) {
      workedHours -= BREAK_MINUTES / 60;
      if (workedHours < 0) workedHours = 0;
    }
  }

  // Round to nearest 0.25
  return Math.round(workedHours / ROUNDING_UNIT) * ROUNDING_UNIT;
}

/**
 * Determine attendance status by comparing clock times to schedule times
 * with a 10-minute grace period.
 */
function determineStatus(
  clockIn: Date,
  clockOut: Date,
  scheduledStart: string | null | undefined,
  scheduledEnd: string | null | undefined,
): string {
  if (!scheduledStart || !scheduledEnd) return "normal";

  const [sh, sm] = scheduledStart.split(":").map(Number);
  const [eh, em] = scheduledEnd.split(":").map(Number);

  // Build scheduled datetimes on the same day as clockIn
  const schedStart = new Date(clockIn);
  schedStart.setHours(sh, sm, 0, 0);

  const schedEnd = new Date(clockIn);
  schedEnd.setHours(eh, em, 0, 0);
  // Handle overnight shifts
  if (schedEnd <= schedStart) schedEnd.setDate(schedEnd.getDate() + 1);

  const isLate = clockIn.getTime() > schedStart.getTime() + GRACE_MINUTES * 60 * 1000;
  const isEarlyLeave = clockOut.getTime() < schedEnd.getTime() - GRACE_MINUTES * 60 * 1000;

  if (isLate && isEarlyLeave) return "late_and_early";
  if (isLate) return "late";
  if (isEarlyLeave) return "early_leave";
  return "normal";
}

// ── POST /api/v1/attendance/clock-out ──

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
    const parsed = clockOutSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return errorResponse(
        ATTENDANCE_ERRORS.INVALID_PARAMS,
        firstError?.message || "参数验证失败",
        400,
      );
    }

    const { attendanceId } = parsed.data;

    // Find the attendance record
    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { schedule: true },
    });

    if (!attendance) {
      return errorResponse(
        ATTENDANCE_ERRORS.NOT_CLOCKED_IN,
        "考勤记录不存在",
        404,
      );
    }

    // Verify ownership
    if (attendance.staffId !== ctx.staffId) {
      return errorResponse(
        ATTENDANCE_ERRORS.INVALID_PARAMS,
        "该考勤记录不属于当前员工",
        403,
      );
    }

    if (!attendance.clockIn) {
      return errorResponse(
        ATTENDANCE_ERRORS.NOT_CLOCKED_IN,
        "尚未签到，无法签退",
        400,
      );
    }

    if (attendance.clockOut) {
      return errorResponse(
        ATTENDANCE_ERRORS.ALREADY_CLOCKED_OUT,
        "今日已签退",
        400,
      );
    }

    const now = new Date();

    // Calculate worked hours and status
    const workedHours = calculateWorkedHours(
      attendance.clockIn,
      now,
      attendance.scheduledStart,
      attendance.scheduledEnd,
    );

    const status = determineStatus(
      attendance.clockIn,
      now,
      attendance.scheduledStart,
      attendance.scheduledEnd,
    );

    const workedMinutes = Math.round(workedHours * 60);

    // Update attendance record
    const updated = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        clockOut: now,
        status,
        workedMinutes,
      },
    });

    // Update the associated schedule to completed
    if (attendance.scheduleId && attendance.schedule) {
      await prisma.schedule.update({
        where: { id: attendance.scheduleId },
        data: { status: SCHEDULE_STATUS.COMPLETED },
      });

      console.log(
        `[attendance] Schedule completed: scheduleId=${attendance.scheduleId}`,
      );
    }

    console.log(
      `[attendance] Clock-out: staffId=${ctx.staffId}, attendanceId=${attendanceId}, ` +
        `status=${status}, workedHours=${workedHours}`,
    );

    return successResponse(updated);
  } catch (error) {
    console.error("[attendance] Clock-out error:", error);
    return errorResponse(
      ATTENDANCE_ERRORS.CREATE_FAILED,
      "签退失败",
      500,
    );
  }
}
