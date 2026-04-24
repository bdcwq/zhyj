import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { EMPLOYEE_ERRORS } from "@zhyj/shared";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    const body = await request.json();
    const { disabled } = body as { disabled?: boolean };

    if (typeof disabled !== "boolean") {
      return errorResponse(EMPLOYEE_ERRORS.INVALID_PARAMS, "disabled 参数无效", 400);
    }

    // Look up staff by id (include soft-deleted for re-enable)
    const staff = await prisma.staff.findUnique({
      where: { id },
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

    // Prevent disabling self
    if (disabled && ctx.staffId === id) {
      return errorResponse(EMPLOYEE_ERRORS.DISABLE_FAILED, "不能禁用自己的账号", 400);
    }

    const updated = await prisma.staff.update({
      where: { id },
      data: {
        deletedAt: disabled ? new Date() : null,
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

    console.log(`[staff] Disabled/Enabled staff: id=${id}, disabled=${disabled}`);

    return successResponse(updated);
  } catch (error) {
    console.error("[staff] Disable error:", error);
    return errorResponse(EMPLOYEE_ERRORS.DISABLE_FAILED, "操作员工失败", 500);
  }
}
