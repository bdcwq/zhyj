import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager", "staff"], request.url);
    if (roleGuard) return roleGuard;

    // Resident-only endpoint
    if (!ctx.residentId) {
      return errorResponse("AUTH_006", "仅居民可查看", 403);
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const where = {
      residentId: ctx.residentId,
      storeId: ctx.storeId,
      deletedAt: null,
    };

    const [records, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        include: {
          room: { select: { id: true, name: true, capacity: true } },
          machine: { select: { id: true, name: true, status: true } },
        },
        orderBy: { scheduledAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.appointment.count({ where }),
    ]);

    console.log(
      `[appointments] Listed ${records.length} my-appointments (total: ${total})`
    );

    return successResponse({ records, total, limit, offset });
  } catch (error) {
    console.error("[appointments] My appointments error:", error);
    return errorResponse("APPOINTMENT_006", "获取我的预约失败", 500);
  }
}
