import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { LEAVE_ERRORS, STAFF_ROLES } from "@zhyj/shared";
import {
  createLeaveSchema,
  leaveListQuerySchema,
} from "@zhyj/shared";

// ── POST /api/v1/leaves — Submit leave request ──

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
        LEAVE_ERRORS.INVALID_PARAMS,
        "员工身份信息缺失",
        400,
      );
    }

    const body = await request.json();
    const parsed = createLeaveSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return errorResponse(
        LEAVE_ERRORS.INVALID_PARAMS,
        firstError?.message || "参数验证失败",
        400,
      );
    }

    const { type, startDate, endDate, reason } = parsed.data;
    const startDateDate = new Date(startDate);
    const endDateDate = new Date(endDate);

    // Check for overlapping approved leaves
    const overlapping = await prisma.leave.findFirst({
      where: {
        staffId: ctx.staffId,
        status: "approved",
        startDate: { lte: endDateDate },
        endDate: { gte: startDateDate },
      },
    });

    if (overlapping) {
      return errorResponse(
        LEAVE_ERRORS.OVERLAP_DETECTED,
        "该时间段已有已批准的请假",
        409,
      );
    }

    const leave = await prisma.leave.create({
      data: {
        staffId: ctx.staffId,
        storeId: ctx.storeId,
        type,
        startDate: startDateDate,
        endDate: endDateDate,
        reason,
        status: "pending",
      },
      include: {
        staff: {
          select: { id: true, name: true, phone: true },
        },
      },
    });

    console.log(
      `[leave] Created leave: id=${leave.id}, staff=${ctx.staffId}, type=${type}`,
    );

    return successResponse(leave, 201);
  } catch (error) {
    console.error("[leave] Create error:", error);
    return errorResponse(LEAVE_ERRORS.CREATE_FAILED, "提交请假失败", 500);
  }
}

// ── GET /api/v1/leaves — List leaves with filters/pagination ──

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
    const parsed = leaveListQuerySchema.safeParse(raw);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return errorResponse(
        LEAVE_ERRORS.INVALID_PARAMS,
        firstError?.message || "参数验证失败",
        400,
      );
    }

    const { limit, offset, staffId, status, dateFrom, dateTo } = parsed.data;

    // Build where clause
    const where: Record<string, unknown> = {};

    // Role-based scoping
    if (ctx.role === STAFF_ROLES.STAFF) {
      where.staffId = ctx.staffId;
    } else if (ctx.role === STAFF_ROLES.STORE_MANAGER) {
      where.storeId = ctx.storeId;
      if (staffId) {
        where.staffId = staffId;
      }
    } else if (staffId) {
      // Admin can filter by staffId
      where.staffId = staffId;
    }

    // Status filter
    if (status) {
      where.status = status;
    }

    // Date range filters: find leaves that overlap with [dateFrom, dateTo]
    // Leave overlaps when leave.startDate <= dateTo AND leave.endDate >= dateFrom
    if (dateFrom || dateTo) {
      const rangeStart = dateFrom ? new Date(dateFrom) : new Date("1970-01-01");
      const rangeEnd = dateTo ? new Date(dateTo) : new Date("2099-12-31");
      where.startDate = { lte: rangeEnd };
      where.endDate = { gte: rangeStart };
    }

    const [records, total] = await Promise.all([
      prisma.leave.findMany({
        where,
        include: {
          staff: {
            select: { id: true, name: true, phone: true },
          },
          approver: {
            select: { id: true, name: true },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma.leave.count({ where }),
    ]);

    console.log(
      `[leave] Listed leaves: count=${total}, role=${ctx.role}`,
    );

    return successResponse({ records, total, limit, offset });
  } catch (error) {
    console.error("[leave] List error:", error);
    return errorResponse(LEAVE_ERRORS.QUERY_FAILED, "获取请假列表失败", 500);
  }
}
