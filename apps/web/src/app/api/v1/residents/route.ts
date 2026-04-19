import { NextRequest } from "next/server";
import { residentListQuerySchema } from "@zhyj/shared";
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

    const { searchParams } = new URL(request.url);
    const query = residentListQuerySchema.safeParse({
      limit: searchParams.get("limit") || undefined,
      offset: searchParams.get("offset") || undefined,
      search: searchParams.get("search") || undefined,
    });

    if (!query.success) {
      return errorResponse("AUTH_005", query.error.errors[0].message, 400);
    }

    const { limit, offset, search } = query.data;

    const baseWhere = {
      residentStores: { some: { storeId: ctx.storeId } },
      deletedAt: null as null,
    };

    const where = search
      ? {
          ...baseWhere,
          OR: [{ name: { contains: search } }, { phone: { contains: search } }],
        }
      : baseWhere;

    const [records, total] = await Promise.all([
      prisma.resident.findMany({
        where,
        select: {
          id: true,
          name: true,
          phone: true,
          registrationSource: true,
          residentStores: {
            include: { store: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.resident.count({ where }),
    ]);

    console.log(
      `[residents] Listed ${records.length} residents (total: ${total})${search ? `, search: "${search}"` : ""}`
    );

    return successResponse({ records, total, limit, offset });
  } catch (error) {
    console.error("[residents] List error:", error);
    return errorResponse("AUTH_006", "获取居民列表失败", 500);
  }
}
