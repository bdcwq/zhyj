import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);

    // Resident-only endpoint
    if (!ctx.residentId) {
      return errorResponse("AUTH_006", "仅居民可查看", 403);
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const status = searchParams.get("status") || undefined;

    const where: Record<string, unknown> = {
      appointment: { residentId: ctx.residentId },
      storeId: ctx.storeId,
    };

    if (status) where.status = status;

    const [records, total] = await Promise.all([
      prisma.robotSession.findMany({
        where,
        include: {
          appointment: {
            include: {
              room: { select: { id: true, name: true } },
              machine: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { startedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.robotSession.count({ where }),
    ]);

    console.log(
      `[robot-sessions/my] Listed ${records.length} sessions for residentId: ${ctx.residentId} (total: ${total})`
    );

    return successResponse({ records, total, limit, offset });
  } catch (error) {
    console.error("[robot-sessions/my] List error:", error);
    return errorResponse("ROBOT_006", "获取理疗记录失败", 500);
  }
}
