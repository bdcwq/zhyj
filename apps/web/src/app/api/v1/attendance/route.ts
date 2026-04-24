import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { ATTENDANCE_ERRORS, STAFF_ROLES } from "@zhyj/shared";
import { attendanceListQuerySchema } from "@zhyj/shared";

// ── GET /api/v1/attendance — List attendance records with filters/pagination ──

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
    const parsed = attendanceListQuerySchema.safeParse(raw);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return errorResponse(
        ATTENDANCE_ERRORS.INVALID_PARAMS,
        firstError?.message || "参数验证失败",
        400,
      );
    }

    const { limit, offset, dateFrom, dateTo, staffId, status } = parsed.data;

    // Build where clause
    const where: Record<string, unknown> = {};

    // Role-based scoping
    if (ctx.role === STAFF_ROLES.STAFF) {
      where.staffId = ctx.staffId;
    } else if (ctx.role === STAFF_ROLES.STORE_MANAGER) {
      where.storeId = ctx.storeId;
      // Store manager can optionally filter by staffId within their store
      if (staffId) {
        where.staffId = staffId;
      }
    } else if (staffId) {
      // Admin can filter by staffId
      where.staffId = staffId;
    }

    // Date range filters
    if (dateFrom) {
      where.date = { ...(where.date as Record<string, unknown>), gte: new Date(dateFrom) };
    }
    if (dateTo) {
      where.date = { ...(where.date as Record<string, unknown>), lte: new Date(dateTo) };
    }

    // Status filter
    if (status) {
      where.status = status;
    }

    const [records, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        include: {
          staff: {
            select: { id: true, name: true, phone: true },
          },
          schedule: {
            select: {
              id: true,
              date: true,
              startTime: true,
              endTime: true,
              shiftType: true,
            },
          },
        },
        orderBy: [{ date: "desc" }, { clockIn: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma.attendance.count({ where }),
    ]);

    console.log(
      `[attendance] Listed ${records.length} records (total: ${total})` +
        (dateFrom ? `, from=${dateFrom}` : "") +
        (dateTo ? `, to=${dateTo}` : "") +
        (staffId ? `, staffId=${staffId}` : "") +
        (status ? `, status=${status}` : "") +
        ` role=${ctx.role}`,
    );

    return successResponse({ records, total, limit, offset });
  } catch (error) {
    console.error("[attendance] List error:", error);
    return errorResponse(ATTENDANCE_ERRORS.QUERY_FAILED, "获取考勤列表失败", 500);
  }
}
