import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager", "staff"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    const appointment = await prisma.appointment.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
      include: {
        resident: { select: { id: true, name: true, phone: true } },
        room: { select: { id: true, name: true, capacity: true } },
        machine: { select: { id: true, name: true, status: true } },
        staff: { select: { id: true, name: true } },
        verification: true,
      },
    });

    if (!appointment) {
      return errorResponse("APPOINTMENT_006", "预约不存在", 404);
    }

    // Ownership guard for residents
    if (ctx.residentId && appointment.residentId !== ctx.residentId) {
      return errorResponse("AUTH_006", "无权访问", 403);
    }

    return successResponse(appointment);
  } catch (error) {
    console.error("[appointments] Get error:", error);
    return errorResponse("APPOINTMENT_006", "获取预约详情失败", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager", "staff"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    const appointment = await prisma.appointment.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
    });

    if (!appointment) {
      return errorResponse("APPOINTMENT_006", "预约不存在", 404);
    }

    // Ownership guard for residents
    if (ctx.residentId && appointment.residentId !== ctx.residentId) {
      return errorResponse("AUTH_006", "无权操作", 403);
    }

    // Can only cancel booked appointments
    if (appointment.status !== "booked") {
      return errorResponse("APPOINTMENT_007", "只能取消已预约的订单", 400);
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        status: "cancelled",
        deletedAt: new Date(),
      },
    });

    console.log(`[appointments] Cancelled appointment ${id}`);

    return successResponse(updated);
  } catch (error) {
    console.error("[appointments] Cancel error:", error);
    return errorResponse("APPOINTMENT_007", "取消预约失败", 500);
  }
}
