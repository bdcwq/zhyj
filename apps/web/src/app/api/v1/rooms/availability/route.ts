import { NextRequest } from "next/server";
import { availabilityQuerySchema } from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { searchParams } = new URL(request.url);
    const query = availabilityQuerySchema.safeParse({
      date: searchParams.get("date"),
      startTime: searchParams.get("startTime") || undefined,
      endTime: searchParams.get("endTime") || undefined,
      roomId: searchParams.get("roomId") || undefined,
    });

    if (!query.success) {
      return errorResponse("AUTH_005", query.error.errors[0].message, 400);
    }

    const { date, roomId } = query.data;

    // Date range for the query day
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    // Query rooms with machines
    const roomsWhere: Record<string, unknown> = {
      storeId: ctx.storeId,
      deletedAt: null,
    };
    if (roomId) roomsWhere.id = roomId;

    const rooms = await prisma.room.findMany({
      where: roomsWhere,
      include: {
        machines: {
          where: { deletedAt: null },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    // For each machine, find non-cancelled appointments on that date
    const roomsWithAvailability = await Promise.all(
      rooms.map(async (room) => {
        const machinesWithSlots = await Promise.all(
          room.machines.map(async (machine) => {
            const appointments = await prisma.appointment.findMany({
              where: {
                machineId: machine.id,
                scheduledAt: { gte: dayStart, lte: dayEnd },
                status: { notIn: ["cancelled"] },
                deletedAt: null,
              },
              select: { scheduledAt: true },
            });

            const available =
              machine.status === "available" && appointments.length === 0;

            return {
              id: machine.id,
              name: machine.name,
              status: machine.status,
              available,
              bookedSlots: appointments.map((a) => a.scheduledAt.toISOString()),
            };
          })
        );

        return {
          id: room.id,
          name: room.name,
          capacity: room.capacity,
          appointmentCount: machinesWithSlots.reduce(
            (sum, m) => sum + m.bookedSlots.length,
            0
          ),
          machines: machinesWithSlots,
        };
      })
    );

    return successResponse({
      date,
      rooms: roomsWithAvailability,
    });
  } catch (error) {
    console.error("[appointments] Availability error:", error);
    return errorResponse("APPOINTMENT_008", "获取可用性失败", 500);
  }
}
