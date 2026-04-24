import { NextRequest } from "next/server";
import type { StoreSummary } from "@zhyj/shared";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);
    if (!authContext?.residentId) {
      return errorResponse("AUTH_006", "未登录或登录已过期", 401);
    }

    const [storeAssignments, resident] = await Promise.all([
      prisma.residentStore.findMany({
        where: { residentId: authContext.residentId },
        include: { store: { select: { id: true, name: true } } },
      }),
      prisma.resident.findUnique({
        where: { id: authContext.residentId },
        select: { name: true },
      }),
    ]);

    const stores: StoreSummary[] = storeAssignments.map((a: { store: { id: string; name: string } }) => ({
      id: a.store.id,
      name: a.store.name,
    }));

    return successResponse({
      stores,
      currentStoreId: authContext.storeId,
      residentId: authContext.residentId,
      name: resident?.name ?? "",
    });
  } catch (error) {
    console.error("[auth] Fetch resident stores error:", error);
    return errorResponse("AUTH_006", "获取门店列表失败", 500);
  }
}
