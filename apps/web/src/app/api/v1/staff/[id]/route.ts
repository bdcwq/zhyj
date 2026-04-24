import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { EMPLOYEE_ERRORS } from "@zhyj/shared";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    // Look up staff by id (active only)
    const staff = await prisma.staff.findFirst({
      where: { id, deletedAt: null },
      include: { staffStores: true },
    });

    if (!staff) {
      return errorResponse(EMPLOYEE_ERRORS.NOT_FOUND, "员工不存在", 404);
    }

    // Store manager scoping: verify the target staff belongs to their store
    if (ctx.role === "store_manager") {
      const belongsToStore = staff.staffStores.some(
        (ss: { storeId: string }) => ss.storeId === ctx.storeId,
      );
      if (!belongsToStore) {
        return errorResponse(EMPLOYEE_ERRORS.NOT_FOUND, "员工不存在", 404);
      }
    }

    const body = await request.json();
    const { name, phone, role, storeIds } = body as {
      name?: string;
      phone?: string;
      role?: string;
      storeIds?: string[];
    };

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) {
      if (!["admin", "store_manager", "staff"].includes(role)) {
        return errorResponse(EMPLOYEE_ERRORS.INVALID_PARAMS, "无效的角色", 400);
      }
      updateData.role = role;
    }

    // If phone is being changed, check uniqueness (excluding self)
    if (phone !== undefined && phone !== staff.phone) {
      const existingPhone = await prisma.staff.findFirst({
        where: { phone, deletedAt: null, id: { not: id } },
      });
      if (existingPhone) {
        return errorResponse(EMPLOYEE_ERRORS.PHONE_EXISTS, "手机号已存在", 409);
      }
      updateData.phone = phone;
    }

    // Update staff and store assignments in a transaction
    const updated = await prisma.$transaction(async (tx: any) => {
      const result = await tx.staff.update({
        where: { id },
        data: updateData,
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

      // If storeIds provided, replace all StaffStore assignments
      if (storeIds !== undefined) {
        // Store manager: override to their own store
        const effectiveStoreIds =
          ctx.role === "store_manager" ? [ctx.storeId] : storeIds;

        // Delete existing assignments
        await tx.staffStore.deleteMany({ where: { staffId: id } });

        // Create new assignments
        if (effectiveStoreIds.length > 0) {
          await tx.staffStore.createMany({
            data: effectiveStoreIds.map((storeId) => ({
              staffId: id,
              storeId,
            })),
          });
        }
      }

      return result;
    });

    // Fetch the updated staff with stores for the response
    const staffWithStores = await prisma.staff.findUnique({
      where: { id: updated.id },
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

    console.log(`[staff] Updated staff: id=${id}`);

    return successResponse(staffWithStores);
  } catch (error) {
    console.error("[staff] Update error:", error);
    return errorResponse(EMPLOYEE_ERRORS.UPDATE_FAILED, "更新员工失败", 500);
  }
}
