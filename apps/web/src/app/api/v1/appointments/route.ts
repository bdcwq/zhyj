import { NextRequest } from "next/server";
import { createAppointmentSchema, appointmentListQuerySchema } from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { isBookingAllowed } from "@/lib/appointment-rules";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager", "staff"], request.url);
    if (roleGuard) return roleGuard;

    const body = await request.json();
    const parsed = createAppointmentSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("AUTH_005", parsed.error.errors[0].message, 400);
    }

    let { residentId, machineId, roomId, scheduledAt } = parsed.data;

    // If resident auth, force residentId from token
    if (ctx.residentId) {
      residentId = ctx.residentId;
    }

    // Check booking rules
    const ruleResult = await isBookingAllowed(prisma, {
      residentId,
      storeId: ctx.storeId,
      machineId: machineId ?? undefined,
      scheduledAt: new Date(scheduledAt),
    });

    if (!ruleResult.allowed) {
      return errorResponse(ruleResult.code || "APPOINTMENT_005", ruleResult.reason || "无法预约", 400);
    }

    // Create appointment
    const appointment = await prisma.appointment.create({
      data: {
        residentId,
        staffId: ctx.staffId || null,
        machineId: machineId || null,
        roomId: roomId || null,
        scheduledAt: new Date(scheduledAt),
        status: "booked",
        storeId: ctx.storeId,
      },
      include: {
        resident: { select: { id: true, name: true, phone: true } },
        room: { select: { id: true, name: true, capacity: true } },
        machine: { select: { id: true, name: true, status: true } },
        staff: { select: { id: true, name: true } },
      },
    });

    console.log(`[appointments] Created appointment ${appointment.id} for resident ${residentId}`);

    return successResponse(appointment, 201);
  } catch (error) {
    console.error("[appointments] Create error:", error);
    return errorResponse("APPOINTMENT_005", "创建预约失败", 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager", "staff"], request.url);
    if (roleGuard) return roleGuard;

    // Staff-only endpoint
    if (!ctx.staffId) {
      return errorResponse("AUTH_006", "仅工作人员可查看", 403);
    }

    const { searchParams } = new URL(request.url);
    const query = appointmentListQuerySchema.safeParse({
      limit: searchParams.get("limit") || "20",
      offset: searchParams.get("offset") || "0",
      residentId: searchParams.get("residentId") || undefined,
      status: searchParams.get("status") || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
    });

    if (!query.success) {
      return errorResponse("AUTH_005", query.error.errors[0].message, 400);
    }

    const { limit, offset, residentId, status, dateFrom, dateTo } = query.data;

    const where: Record<string, unknown> = {
      storeId: ctx.storeId,
      deletedAt: null,
    };

    if (residentId) where.residentId = residentId;
    if (status) where.status = status;
    if (dateFrom) where.scheduledAt = { ...(where.scheduledAt as Record<string, unknown>), gte: new Date(dateFrom) };
    if (dateTo) {
      const end = new Date(dateTo);
      end.setUTCHours(23, 59, 59, 999);
      where.scheduledAt = { ...(where.scheduledAt as Record<string, unknown>), lte: end };
    }

    const [records, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        include: {
          resident: { select: { id: true, name: true, phone: true } },
          room: { select: { id: true, name: true, capacity: true } },
          machine: { select: { id: true, name: true, status: true } },
          staff: { select: { id: true, name: true } },
        },
        orderBy: { scheduledAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.appointment.count({ where }),
    ]);

    console.log(`[appointments] Listed ${records.length} appointments (total: ${total})`);

    return successResponse({ records, total, limit, offset });
  } catch (error) {
    console.error("[appointments] List error:", error);
    return errorResponse("APPOINTMENT_006", "获取预约列表失败", 500);
  }
}
