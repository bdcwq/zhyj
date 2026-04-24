import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { STORE_ERRORS } from "@zhyj/shared";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    const body = await request.json();
    const { disabled } = body as { disabled?: boolean };

    if (typeof disabled !== "boolean") {
      return errorResponse(STORE_ERRORS.INVALID_PARAMS, "disabled 参数无效", 400);
    }

    // Look up store by id (include soft-deleted for re-enable)
    const store = await prisma.store.findUnique({
      where: { id },
    });

    if (!store) {
      return errorResponse(STORE_ERRORS.NOT_FOUND, "店铺不存在", 404);
    }

    const updated = await prisma.store.update({
      where: { id },
      data: {
        deletedAt: disabled ? new Date() : null,
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

    console.log(`[store] Disabled/Enabled store: id=${id}, disabled=${disabled}`);

    return successResponse(updated);
  } catch (error) {
    console.error("[store] Disable error:", error);
    return errorResponse(STORE_ERRORS.DISABLE_FAILED, "操作店铺失败", 500);
  }
}
