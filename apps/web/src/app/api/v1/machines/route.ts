import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { MACHINE_ERRORS } from "@zhyj/shared";
import { createMachineSchema, machineListQuerySchema } from "@zhyj/shared";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const searchParams = request.nextUrl.searchParams;
    const limitStr = searchParams.get("limit");
    const offsetStr = searchParams.get("offset");
    const roomId = searchParams.get("roomId") || undefined;
    const status = searchParams.get("status") || undefined;

    // Backward compatible: if no limit/offset, return all machines (no pagination)
    const isPaginated = limitStr !== null || offsetStr !== null;

    if (isPaginated) {
      const parsed = machineListQuerySchema.safeParse({
        limit: limitStr,
        offset: offsetStr,
        roomId,
        status,
      });
      if (!parsed.success) {
        return errorResponse(MACHINE_ERRORS.VALIDATION_ERROR, parsed.error.issues[0].message, 400);
      }

      const { limit, offset } = parsed.data;
      const where: Record<string, unknown> = { storeId: ctx.storeId, deletedAt: null };
      if (roomId) where.roomId = roomId;
      if (status) where.status = status;

      const [machines, total] = await Promise.all([
        prisma.machine.findMany({
          where,
          include: {
            room: { select: { id: true, name: true } },
          },
          orderBy: { name: "asc" },
          skip: offset,
          take: limit,
        }),
        prisma.machine.count({ where }),
      ]);

      const page = Math.floor(offset / limit) + 1;

      console.log(`[machines] Listed ${machines.length} machines (page=${page}, total=${total})`);
      return successResponse({ records: machines, total, page, pageSize: limit });
    }

    // No pagination — original behavior
    const where: Record<string, unknown> = { storeId: ctx.storeId, deletedAt: null };
    if (roomId) where.roomId = roomId;
    if (status) where.status = status;

    const machines = await prisma.machine.findMany({
      where,
      include: {
        room: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });

    console.log(`[machines] Listed ${machines.length} machines`);
    return successResponse(machines);
  } catch (error) {
    console.error("[machines] Machines list error:", error);
    return errorResponse(MACHINE_ERRORS.CREATE_FAILED, "获取设备列表失败", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const body = await request.json();
    const parsed = createMachineSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(MACHINE_ERRORS.VALIDATION_ERROR, parsed.error.issues[0].message, 400);
    }

    const { name, roomId, status } = parsed.data;

    // If roomId provided, validate room exists in same store
    if (roomId) {
      const room = await prisma.room.findFirst({
        where: { id: roomId, storeId: ctx.storeId, deletedAt: null },
      });
      if (!room) {
        return errorResponse(MACHINE_ERRORS.ROOM_NOT_FOUND, "房间不存在", 404);
      }
    }

    const machine = await prisma.machine.create({
      data: {
        name,
        roomId: roomId ?? null,
        status: status ?? "available",
        storeId: ctx.storeId,
      },
      include: {
        room: { select: { id: true, name: true } },
      },
    });

    console.log(`[machines] Created machine: id=${machine.id}, name=${machine.name}, roomId=${roomId ?? "unassigned"}, status=${machine.status}`);
    return successResponse(machine, 201);
  } catch (error) {
    console.error("[machines] Machine create error:", error);
    return errorResponse(MACHINE_ERRORS.CREATE_FAILED, "创建设备失败", 500);
  }
}
