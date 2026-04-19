import { NextRequest } from "next/server";
import { getAuthContext, hashPassword } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { EMPLOYEE_ERRORS } from "@zhyj/shared";

// ── GET /api/v1/staff — List staff with search/filter/pagination ──

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const role = searchParams.get("role") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)),
    );

    // Build where clause
    const where: Record<string, unknown> = { deletedAt: null };

    // Store manager: scope to their own store via StaffStore
    if (ctx.role === "store_manager") {
      where.staffStores = { some: { storeId: ctx.storeId } };
    }

    // Search by name or phone (case-insensitive)
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }

    // Role filter
    if (role) {
      where.role = role;
    }

    const [records, total] = await Promise.all([
      prisma.staff.findMany({
        where,
        select: {
          id: true,
          username: true,
          phone: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          staffStores: {
            select: { storeId: true, store: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      prisma.staff.count({ where }),
    ]);

    console.log(`[staff] Listed ${records.length} staff (total: ${total})`);

    return successResponse({ records, total, page, pageSize });
  } catch (error) {
    console.error("[staff] List error:", error);
    return errorResponse(EMPLOYEE_ERRORS.CREATE_FAILED, "获取员工列表失败", 500);
  }
}

// ── POST /api/v1/staff — Create a new staff member ──

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const body = await request.json();
    const { username, password, phone, name, role, storeIds } = body as {
      username?: string;
      password?: string;
      phone?: string;
      name?: string;
      role?: string;
      storeIds?: string[];
    };

    // Validate required fields
    if (!username || !password || !phone || !name || !role) {
      return errorResponse(EMPLOYEE_ERRORS.INVALID_PARAMS, "缺少必填字段", 400);
    }

    if (!["admin", "store_manager", "staff"].includes(role)) {
      return errorResponse(EMPLOYEE_ERRORS.INVALID_PARAMS, "无效的角色", 400);
    }

    // Check username uniqueness
    const existingUsername = await prisma.staff.findFirst({
      where: { username, deletedAt: null },
    });
    if (existingUsername) {
      return errorResponse(EMPLOYEE_ERRORS.USERNAME_EXISTS, "用户名已存在", 409);
    }

    // Check phone uniqueness
    const existingPhone = await prisma.staff.findFirst({
      where: { phone, deletedAt: null },
    });
    if (existingPhone) {
      return errorResponse(EMPLOYEE_ERRORS.PHONE_EXISTS, "手机号已存在", 409);
    }

    // Determine store assignments
    const effectiveStoreIds =
      ctx.role === "store_manager" ? [ctx.storeId] : storeIds || [];

    if (effectiveStoreIds.length === 0 && ctx.role === "admin") {
      return errorResponse(EMPLOYEE_ERRORS.INVALID_PARAMS, "必须指定所属门店", 400);
    }

    // Validate store IDs exist
    const storeCount = await prisma.store.count({
      where: { id: { in: effectiveStoreIds } },
    });
    if (storeCount !== effectiveStoreIds.length) {
      return errorResponse(EMPLOYEE_ERRORS.INVALID_PARAMS, "部分门店不存在", 400);
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create staff with store assignments in a transaction
    const staff = await prisma.$transaction(async (tx) => {
      const created = await tx.staff.create({
        data: {
          username,
          password: hashedPassword,
          phone,
          name,
          role,
        },
        select: {
          id: true,
          username: true,
          phone: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      if (effectiveStoreIds.length > 0) {
        await tx.staffStore.createMany({
          data: effectiveStoreIds.map((storeId) => ({
            staffId: created.id,
            storeId,
          })),
        });
      }

      return created;
    });

    // Fetch the created staff with stores for the response
    const staffWithStores = await prisma.staff.findUnique({
      where: { id: staff.id },
      select: {
        id: true,
        username: true,
        phone: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        staffStores: {
          select: { storeId: true, store: { select: { id: true, name: true } } },
        },
      },
    });

    console.log(`[staff] Created staff: id=${staff.id}, role=${staff.role}`);

    return successResponse(staffWithStores, 201);
  } catch (error) {
    console.error("[staff] Create error:", error);
    return errorResponse(EMPLOYEE_ERRORS.CREATE_FAILED, "创建员工失败", 500);
  }
}
