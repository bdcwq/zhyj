import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { STORE_ERRORS } from "@zhyj/shared";

// ── GET /api/v1/stores — List stores with search/pagination ──

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

    // Build where clause
    const where: Record<string, unknown> = { deletedAt: null };

    // Store manager: only see their own store
    if (ctx.role === "store_manager") {
      where.id = ctx.storeId;
    }

    // Search by name (case-insensitive)
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const [records, total] = await Promise.all([
      prisma.store.findMany({
        where,
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
          businessHours: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.store.count({ where }),
    ]);

    console.log(`[store] Listed ${records.length} stores (total: ${total})`);

    return successResponse({ records, total, limit, offset });
  } catch (error) {
    console.error("[store] List error:", error);
    return errorResponse(STORE_ERRORS.CREATE_FAILED, "获取店铺列表失败", 500);
  }
}

// ── POST /api/v1/stores — Create a new store ──

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin"], request.url);
    if (roleGuard) return roleGuard;

    const body = await request.json();
    const { name, address, phone, businessHours } = body as {
      name?: string;
      address?: string;
      phone?: string;
      businessHours?: string;
    };

    // Validate required fields
    if (!name) {
      return errorResponse(STORE_ERRORS.INVALID_PARAMS, "店铺名称不能为空", 400);
    }

    // Check name uniqueness
    const existing = await prisma.store.findFirst({
      where: { name, deletedAt: null },
    });
    if (existing) {
      return errorResponse(STORE_ERRORS.NAME_EXISTS, "店铺名称已存在", 409);
    }

    const store = await prisma.store.create({
      data: {
        name,
        address: address || null,
        phone: phone || null,
        businessHours: businessHours || null,
      },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        businessHours: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    console.log(`[store] Created store: id=${store.id}, name=${store.name}`);

    return successResponse(store, 201);
  } catch (error) {
    console.error("[store] Create error:", error);
    return errorResponse(STORE_ERRORS.CREATE_FAILED, "创建店铺失败", 500);
  }
}
