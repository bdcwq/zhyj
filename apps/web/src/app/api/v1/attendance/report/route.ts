import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { ATTENDANCE_ERRORS, LEAVE_ERRORS, STAFF_ROLES } from "@zhyj/shared";
import { attendanceReportQuerySchema } from "@zhyj/shared";

// ── GET /api/v1/attendance/report — Monthly attendance report ──

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(
      ctx,
      [STAFF_ROLES.ADMIN, STAFF_ROLES.STORE_MANAGER, STAFF_ROLES.STAFF],
      request.url,
    );
    if (roleGuard) return roleGuard;

    const { searchParams } = new URL(request.url);
    const raw = Object.fromEntries(searchParams.entries());
    const parsed = attendanceReportQuerySchema.safeParse(raw);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return errorResponse(
        ATTENDANCE_ERRORS.INVALID_PARAMS,
        firstError?.message || "参数验证失败",
        400,
      );
    }

    const { month, storeId: queryStoreId, staffId: queryStaffId, limit, offset } = parsed.data;

    // Calculate month boundaries
    const [yearStr, monthStr] = month.split("-");
    const monthStart = new Date(
      `${yearStr}-${monthStr}-01T00:00:00`,
    );
    const lastDay = new Date(
      parseInt(yearStr, 10),
      parseInt(monthStr, 10),
      0,
    );
    const monthEnd = new Date(
      `${yearStr}-${monthStr}-${String(lastDay.getDate()).padStart(2, "0")}T23:59:59.999`,
    );

    // Build base where clause for staff filtering based on RBAC
    const staffWhere: Record<string, unknown> = { deletedAt: null };

    // RBAC scoping
    if (ctx.role === STAFF_ROLES.STAFF) {
      staffWhere.id = ctx.staffId;
    } else if (ctx.role === STAFF_ROLES.STORE_MANAGER) {
      staffWhere.staffStores = {
        some: { storeId: ctx.storeId },
      };
      if (queryStaffId) {
        staffWhere.id = queryStaffId;
      }
    } else {
      // Admin
      if (queryStoreId) {
        staffWhere.staffStores = {
          some: { storeId: queryStoreId },
        };
      }
      if (queryStaffId) {
        staffWhere.id = queryStaffId;
      }
    }

    // Get staff list to generate report for
    const staffList = await prisma.staff.findMany({
      where: staffWhere,
      select: { id: true, name: true },
      skip: offset,
      take: limit,
    });

    const totalStaff = await prisma.staff.count({ where: staffWhere });

    // Build per-staff summary for each staff member
    const summaries = await Promise.all(
      staffList.map(async (staff) => {
        // Attendance counts for the month
        const attendances = await prisma.attendance.findMany({
          where: {
            staffId: staff.id,
            date: { gte: monthStart, lte: monthEnd },
          },
          select: { status: true, workedMinutes: true },
        });

        let presentDays = 0;
        let lateDays = 0;
        let earlyLeaveDays = 0;
        let totalHours = 0;

        for (const a of attendances) {
          if (a.workedMinutes) {
            totalHours += a.workedMinutes / 60;
          }
          switch (a.status) {
            case "normal":
              presentDays++;
              break;
            case "late":
              lateDays++;
              break;
            case "early_leave":
              earlyLeaveDays++;
              break;
            case "late_and_early":
              lateDays++;
              earlyLeaveDays++;
              break;
            default:
              break;
          }
        }

        // Approved leave count for the month
        const leaveDays = await prisma.leave.count({
          where: {
            staffId: staff.id,
            status: "approved",
            startDate: { lte: monthEnd },
            endDate: { gte: monthStart },
          },
        });

        // Absent count: scheduled shifts with no attendance record
        const scheduledShifts = await prisma.schedule.findMany({
          where: {
            staffId: staff.id,
            date: { gte: monthStart, lte: monthEnd },
            status: "scheduled",
          },
          select: { id: true },
        });

        const attendedScheduleIds = new Set(
          (
            await prisma.attendance.findMany({
              where: {
                staffId: staff.id,
                date: { gte: monthStart, lte: monthEnd },
                scheduleId: { not: null },
              },
              select: { scheduleId: true },
            })
          )
            .map((a) => a.scheduleId)
            .filter(Boolean),
        );

        const absentDays = scheduledShifts.filter(
          (s) => !attendedScheduleIds.has(s.id),
        ).length;

        return {
          staffId: staff.id,
          staffName: staff.name,
          presentDays,
          lateDays,
          earlyLeaveDays,
          leaveDays,
          absentDays,
          totalHours: Math.round(totalHours * 100) / 100,
        };
      }),
    );

    console.log(
      `[attendance-report] Generated report: month=${month}, staff count=${summaries.length}, role=${ctx.role}`,
    );

    return successResponse({ records: summaries, total: totalStaff, limit, offset });
  } catch (error) {
    console.error("[attendance-report] Generate error:", error);
    return errorResponse(
      LEAVE_ERRORS.QUERY_FAILED,
      "生成考勤报表失败",
      500,
    );
  }
}
