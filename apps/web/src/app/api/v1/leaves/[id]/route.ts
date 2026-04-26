import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { LEAVE_ERRORS, STAFF_ROLES } from "@zhyj/shared";
import { approveLeaveSchema } from "@zhyj/shared";

// ── GET /api/v1/leaves/[id] — Get single leave detail ──

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(
      ctx,
      [STAFF_ROLES.ADMIN, STAFF_ROLES.STORE_MANAGER, STAFF_ROLES.STAFF],
      request.url,
    );
    if (roleGuard) return roleGuard;

    const { id } = await params;

    const leave = await prisma.leave.findUnique({
      where: { id },
      include: {
        staff: {
          select: { id: true, name: true, phone: true },
        },
        approver: {
          select: { id: true, name: true },
        },
      },
    });

    if (!leave) {
      return errorResponse(LEAVE_ERRORS.NOT_FOUND, "请假记录不存在", 404);
    }

    // RBAC: staff can only see own leaves, store_manager only same store, admin sees all
    if (ctx.role === STAFF_ROLES.STAFF && leave.staffId !== ctx.staffId) {
      return errorResponse(LEAVE_ERRORS.NOT_FOUND, "请假记录不存在", 404);
    }
    if (
      ctx.role === STAFF_ROLES.STORE_MANAGER &&
      leave.storeId !== ctx.storeId
    ) {
      return errorResponse(LEAVE_ERRORS.NOT_FOUND, "请假记录不存在", 404);
    }

    return successResponse(leave);
  } catch (error) {
    console.error("[leave] Get error:", error);
    return errorResponse(LEAVE_ERRORS.QUERY_FAILED, "获取请假详情失败", 500);
  }
}

// ── PUT /api/v1/leaves/[id] — Approve or reject leave (admin + store_manager only) ──

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let newStatus: string | undefined;

  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(
      ctx,
      [STAFF_ROLES.ADMIN, STAFF_ROLES.STORE_MANAGER],
      request.url,
    );
    if (roleGuard) return roleGuard;

    const { id } = await params;

    const body = await request.json();
    const parsed = approveLeaveSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return errorResponse(
        LEAVE_ERRORS.INVALID_PARAMS,
        firstError?.message || "参数验证失败",
        400,
      );
    }

    newStatus = parsed.data.status;

    // Fetch existing leave
    const leave = await prisma.leave.findUnique({
      where: { id },
    });

    if (!leave) {
      return errorResponse(LEAVE_ERRORS.NOT_FOUND, "请假记录不存在", 404);
    }

    // Store manager: only approve/reject leaves from own store
    if (ctx.role === STAFF_ROLES.STORE_MANAGER && leave.storeId !== ctx.storeId) {
      return errorResponse(LEAVE_ERRORS.NOT_FOUND, "请假记录不存在", 404);
    }

    // Prevent staff from approving their own leave
    if (leave.staffId === ctx.staffId) {
      return errorResponse(
        LEAVE_ERRORS.INVALID_PARAMS,
        "不能审批自己的请假",
        400,
      );
    }

    // Enforce status machine: only pending can transition
    if (leave.status !== "pending") {
      return errorResponse(
        LEAVE_ERRORS.INVALID_PARAMS,
        "只能审批待处理的请假申请",
        400,
      );
    }

    if (newStatus === "approved") {
      // Transaction: update leave + cancel overlapping schedules
      await prisma.$transaction(async (tx: any) => {
        // 1. Update leave status
        await tx.leave.update({
          where: { id },
          data: {
            status: "approved",
            approvedBy: ctx.staffId,
            approvedAt: new Date(),
          },
        });

        // 2. Find overlapping scheduled shifts
        const overlappingSchedules = await tx.schedule.findMany({
          where: {
            staffId: leave.staffId,
            date: { gte: leave.startDate, lte: leave.endDate },
            status: "scheduled",
          },
          include: { attendances: true },
        });

        // 3. Filter out schedules that already have attendance records
        const cancellableSchedules = overlappingSchedules.filter(
          (s: { attendances: unknown[] }) => s.attendances.length === 0,
        );
        const skippedCount = overlappingSchedules.length - cancellableSchedules.length;

        // 4. Cancel schedules without attendance
        if (cancellableSchedules.length > 0) {
          await tx.schedule.updateMany({
            where: {
              id: { in: cancellableSchedules.map((s: { id: string }) => s.id) },
            },
            data: { status: "cancelled" },
          });
        }

        console.log(
          `[leave] Approved leave: id=${id}, cancelled schedules=${cancellableSchedules.length}, skipped (has attendance)=${skippedCount}`,
        );
      });

      // Re-fetch with relations for response
      const result = await prisma.leave.findUnique({
        where: { id },
        include: {
          staff: {
            select: { id: true, name: true, phone: true },
          },
          approver: {
            select: { id: true, name: true },
          },
        },
      });

      return successResponse(result);
    } else {
      // Rejected — no schedule changes needed
      const rejected = await prisma.leave.update({
        where: { id },
        data: { status: "rejected" },
        include: {
          staff: {
            select: { id: true, name: true, phone: true },
          },
          approver: {
            select: { id: true, name: true },
          },
        },
      });

      console.log(`[leave] Rejected leave: id=${id}`);

      return successResponse(rejected);
    }
  } catch (error) {
    console.error("[leave] Approve/reject error:", error);
    const errorCode =
      newStatus === "approved"
        ? LEAVE_ERRORS.APPROVE_FAILED
        : newStatus === "rejected"
          ? LEAVE_ERRORS.REJECT_FAILED
          : LEAVE_ERRORS.UPDATE_FAILED;
    return errorResponse(errorCode, "审批请假失败", 500);
  }
}
