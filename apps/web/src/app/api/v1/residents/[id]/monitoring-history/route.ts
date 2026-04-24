import { NextRequest } from "next/server";
import { monitoringHistoryQuerySchema } from "@zhyj/shared";
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

    const { id: residentId } = await params;

    // Ownership guard: if resident auth, force residentId from token
    if (ctx.residentId) {
      if (ctx.residentId !== residentId) {
        return errorResponse("AUTH_006", "无权访问", 403);
      }
    }

    const { searchParams } = new URL(request.url);
    const query = monitoringHistoryQuerySchema.safeParse({
      limit: searchParams.get("limit") || "20",
      offset: searchParams.get("offset") || "0",
    });

    if (!query.success) {
      return errorResponse("AUTH_005", query.error.errors[0].message, 400);
    }

    const { limit, offset } = query.data;

    // Verify resident exists in store
    const resident = await prisma.resident.findFirst({
      where: { id: residentId, residentStores: { some: { storeId: ctx.storeId } }, deletedAt: null },
    });

    if (!resident) {
      return errorResponse("MONITORING_001", "居民不存在", 404);
    }

    // Query all records for this resident
    const [records, totalCount] = await Promise.all([
      prisma.monitoringRecord.findMany({
        where: {
          residentId,
          storeId: ctx.storeId,
          deletedAt: null,
        },
        orderBy: { monitoringDate: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.monitoringRecord.count({
        where: {
          residentId,
          storeId: ctx.storeId,
          deletedAt: null,
        },
      }),
    ]);

    // Compute stats
    const allScores = records.map((r: { score: number }) => r.score);
    const averageScore =
      allScores.length > 0
        ? Math.round((allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length) * 10) / 10
        : 0;
    const latestScore = allScores.length > 0 ? allScores[0] : null;

    console.log(
      `[monitoring] Fetched monitoring history for resident ${residentId}: ${records.length} records`
    );

    return successResponse({
      records,
      stats: {
        totalCount,
        averageScore,
        latestScore,
      },
    });
  } catch (error) {
    console.error("[monitoring] History error:", error);
    return errorResponse("MONITORING_003", "获取监测历史失败", 500);
  }
}
