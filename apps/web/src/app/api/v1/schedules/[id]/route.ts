import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { SCHEDULE_ERRORS } from "@zhyj/shared";
import { updateScheduleSchema } from "@zhyj/shared";

// ── PUT /api/v1/schedules/[id] — Update a schedule ──

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    const body = await request.json();

    // Zod validation
    const parsed = updateScheduleSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return errorResponse(
        SCHEDULE_ERRORS.INVALID_PARAMS,
        firstError?.message || "参数验证失败",
        400,
      );
    }

    // Find existing schedule
    const schedule = await prisma.schedule.findUnique({
      where: { id },
      include: { staff: true, store: true },
    });

    if (!schedule) {
      return errorResponse(SCHEDULE_ERRORS.NOT_FOUND, "排班不存在", 404);
    }

    // Store manager: only update schedules from own store
    if (ctx.role === "store_manager" && schedule.storeId !== ctx.storeId) {
      return errorResponse(SCHEDULE_ERRORS.NOT_FOUND, "排班不存在", 404);
    }

    // If updating staffId, check for conflicts
    if (parsed.data.staffId && parsed.data.staffId !== schedule.staffId) {
      const existingSchedule = await prisma.schedule.findFirst({
        where: {
          staffId: parsed.data.staffId,
          date: schedule.date,
          shiftType: schedule.shiftType,
          status: "scheduled",
          id: { not: id },
        },
      });

      if (existingSchedule) {
        return errorResponse(
          SCHEDULE_ERRORS.CONFLICT_DETECTED,
          "该员工在此日期和班次已有排班",
          409,
        );
      }
    }

    const updated = await prisma.schedule.update({
      where: { id },
      data: parsed.data,
      include: {
        staff: {
          select: { id: true, name: true, phone: true },
        },
      },
    });

    console.log(
      `[schedule] Updated schedule: id=${id}, changes=${JSON.stringify(parsed.data)}`,
    );

    return successResponse(updated);
  } catch (error) {
    console.error("[schedule] Update error:", error);
    return errorResponse(SCHEDULE_ERRORS.UPDATE_FAILED, "更新排班失败", 500);
  }
}

// ── DELETE /api/v1/schedules/[id] — Cancel a schedule ──

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    // Find existing schedule
    const schedule = await prisma.schedule.findUnique({
      where: { id },
    });

    if (!schedule) {
      return errorResponse(SCHEDULE_ERRORS.NOT_FOUND, "排班不存在", 404);
    }

    // Store manager: only cancel schedules from own store
    if (ctx.role === "store_manager" && schedule.storeId !== ctx.storeId) {
      return errorResponse(SCHEDULE_ERRORS.NOT_FOUND, "排班不存在", 404);
    }

    // Soft-delete: set status to cancelled
    const cancelled = await prisma.schedule.update({
      where: { id },
      data: { status: "cancelled" },
      include: {
        staff: {
          select: { id: true, name: true, phone: true },
        },
      },
    });

    console.log(`[schedule] Cancelled schedule: id=${id}, date=${schedule.date}, staffId=${schedule.staffId}`);

    return successResponse(cancelled);
  } catch (error) {
    console.error("[schedule] Delete error:", error);
    return errorResponse(SCHEDULE_ERRORS.DELETE_FAILED, "取消排班失败", 500);
  }
}
