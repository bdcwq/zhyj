import { NextRequest } from "next/server";
import type { StoreSummary } from "@zhyj/shared";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request);
    if (!authContext?.staffId) {
      return errorResponse("AUTH_006", "未登录或登录已过期", 401);
    }

    const [storeAssignments, staff] = await Promise.all([
      prisma.staffStore.findMany({
        where: { staffId: authContext.staffId },
        include: { store: { select: { id: true, name: true } } },
      }),
      prisma.staff.findUnique({
        where: { id: authContext.staffId },
        select: { name: true, role: true },
      }),
    ]);

    const stores: StoreSummary[] = storeAssignments.map((a: { store: { id: string; name: string } }) => ({
      id: a.store.id,
      name: a.store.name,
    }));

    return successResponse({
      stores,
      currentStoreId: authContext.storeId,
      staffId: authContext.staffId,
      role: staff?.role ?? authContext.role,
      name: staff?.name ?? "",
    });
  } catch (error) {
    console.error("[auth] Fetch stores error:", error);
    return errorResponse("AUTH_006", "获取门店列表失败", 500);
  }
}
