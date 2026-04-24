import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { STORE_ERRORS } from "@zhyj/shared";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    // Look up store by id (active only)
    const store = await prisma.store.findFirst({
      where: { id, deletedAt: null },
    });

    if (!store) {
      return errorResponse(STORE_ERRORS.NOT_FOUND, "店铺不存在", 404);
    }

    const body = await request.json();
    const { name, address, phone, businessHours } = body as {
      name?: string;
      address?: string;
      phone?: string;
      businessHours?: string;
    };

    // Build update data (partial update)
    const updateData: Record<string, unknown> = {};

    if (name !== undefined) {
      // Check name uniqueness if changing name
      if (name !== store.name) {
        const existing = await prisma.store.findFirst({
          where: { name, deletedAt: null, id: { not: id } },
        });
        if (existing) {
          return errorResponse(STORE_ERRORS.NAME_EXISTS, "店铺名称已存在", 409);
        }
      }
      updateData.name = name;
    }
    if (address !== undefined) updateData.address = address || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (businessHours !== undefined) updateData.businessHours = businessHours || null;

    const updated = await prisma.store.update({
      where: { id },
      data: updateData,
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

    console.log(`[store] Updated store: id=${id}`);

    return successResponse(updated);
  } catch (error) {
    console.error("[store] Update error:", error);
    return errorResponse(STORE_ERRORS.UPDATE_FAILED, "更新店铺失败", 500);
  }
}
