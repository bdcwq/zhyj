import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { ROOM_ERRORS } from "@zhyj/shared";
import { createRoomSchema, roomListQuerySchema } from "@zhyj/shared";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const searchParams = request.nextUrl.searchParams;
    const limitStr = searchParams.get("limit");
    const offsetStr = searchParams.get("offset");
    const search = searchParams.get("search") || undefined;

    // Backward compatible: if no limit/offset, return all rooms (no pagination)
    const isPaginated = limitStr !== null || offsetStr !== null;

    if (isPaginated) {
      const parsed = roomListQuerySchema.safeParse({
        limit: limitStr,
        offset: offsetStr,
        search,
      });
      if (!parsed.success) {
        return errorResponse(ROOM_ERRORS.VALIDATION_ERROR, parsed.error.issues[0].message, 400);
      }

      const { limit, offset } = parsed.data;
      const where: Record<string, unknown> = { storeId: ctx.storeId, deletedAt: null };
      if (search) {
        where.name = { contains: search, mode: "insensitive" };
      }

      const [rooms, total] = await Promise.all([
        prisma.room.findMany({
          where,
          include: {
            _count: { select: { machines: true } },
          },
          orderBy: { name: "asc" },
          skip: offset,
          take: limit,
        }),
        prisma.room.count({ where }),
      ]);

      const page = Math.floor(offset / limit) + 1;

      console.log(`[rooms] Listed ${rooms.length} rooms (page=${page}, total=${total})`);
      return successResponse({ records: rooms, total, page, pageSize: limit });
    }

    // No pagination — original behavior
    const where: Record<string, unknown> = { storeId: ctx.storeId, deletedAt: null };
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const rooms = await prisma.room.findMany({
      where,
      include: {
        _count: {
          select: { machines: true },
        },
      },
      orderBy: { name: "asc" },
    });

    console.log(`[rooms] Listed ${rooms.length} rooms`);
    return successResponse(rooms);
  } catch (error) {
    console.error("[rooms] Rooms list error:", error);
    return errorResponse(ROOM_ERRORS.CREATE_FAILED, "获取房间列表失败", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const body = await request.json();
    const parsed = createRoomSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(ROOM_ERRORS.VALIDATION_ERROR, parsed.error.issues[0].message, 400);
    }

    const { name, capacity } = parsed.data;

    // Check for duplicate name within the same store
    const existing = await prisma.room.findFirst({
      where: { name, storeId: ctx.storeId, deletedAt: null },
    });
    if (existing) {
      return errorResponse(ROOM_ERRORS.NAME_EXISTS, "房间名称已存在", 409);
    }

    const room = await prisma.room.create({
      data: {
        name,
        capacity,
        storeId: ctx.storeId,
      },
      include: {
        _count: { select: { machines: true } },
      },
    });

    console.log(`[rooms] Created room: id=${room.id}, name=${room.name}, capacity=${room.capacity}`);
    return successResponse(room, 201);
  } catch (error) {
    console.error("[rooms] Room create error:", error);
    return errorResponse(ROOM_ERRORS.CREATE_FAILED, "创建房间失败", 500);
  }
}
