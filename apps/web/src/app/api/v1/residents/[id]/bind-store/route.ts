import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { bindStoreSchema, RESIDENT_ERRORS } from "@zhyj/shared";

/**
 * POST /api/v1/residents/[id]/bind-store — Bind resident to a store
 * DELETE /api/v1/residents/[id]/bind-store — Unbind resident from a store
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { id: residentId } = await params;
    const body = await request.json();
    const parsed = bindStoreSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("AUTH_005", parsed.error.errors[0].message, 400);
    }

    const { storeId } = parsed.data;

    // Verify resident exists in current store scope
    const resident = await prisma.resident.findFirst({
      where: {
        id: residentId,
        residentStores: { some: { storeId: ctx.storeId } },
        deletedAt: null,
      },
    });

    if (!resident) {
      return errorResponse(RESIDENT_ERRORS.NOT_FOUND, "居民不存在", 404);
    }

    // store_manager scope check: can only bind to stores they're assigned to
    if (ctx.role === "store_manager" && ctx.staffId) {
      const staffAssignment = await prisma.staffStore.findFirst({
        where: { staffId: ctx.staffId, storeId },
      });
      if (!staffAssignment) {
        return errorResponse("PERMISSION_001", "无权操作该门店", 403);
      }
    }

    // Check if binding already exists
    const existing = await prisma.residentStore.findUnique({
      where: { residentId_storeId: { residentId, storeId } },
    });

    if (existing) {
      console.log(JSON.stringify({
        event: "bind_store_denied",
        adminId: ctx.staffId ?? ctx.residentId,
        residentId,
        storeId,
        action: "bind",
        reason: "already_bound",
      }));
      return errorResponse(RESIDENT_ERRORS.ALREADY_BOUND, "居民已绑定该门店", 409);
    }

    // Create binding
    await prisma.residentStore.create({
      data: { residentId, storeId },
    });

    console.log(JSON.stringify({
      event: "bind_store",
      adminId: ctx.staffId ?? ctx.residentId,
      residentId,
      storeId,
      action: "bind",
    }));

    return successResponse({ residentId, storeId, bound: true });
  } catch (error) {
    console.error("[residents] Bind store error:", error);
    return errorResponse(RESIDENT_ERRORS.BIND_FAILED, "绑定门店失败", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { id: residentId } = await params;
    const body = await request.json();
    const parsed = bindStoreSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("AUTH_005", parsed.error.errors[0].message, 400);
    }

    const { storeId } = parsed.data;

    // Verify resident exists in current store scope
    const resident = await prisma.resident.findFirst({
      where: {
        id: residentId,
        residentStores: { some: { storeId: ctx.storeId } },
        deletedAt: null,
      },
    });

    if (!resident) {
      return errorResponse(RESIDENT_ERRORS.NOT_FOUND, "居民不存在", 404);
    }

    // store_manager scope check
    if (ctx.role === "store_manager" && ctx.staffId) {
      const staffAssignment = await prisma.staffStore.findFirst({
        where: { staffId: ctx.staffId, storeId },
      });
      if (!staffAssignment) {
        return errorResponse("PERMISSION_001", "无权操作该门店", 403);
      }
    }

    // Check binding exists
    const existing = await prisma.residentStore.findUnique({
      where: { residentId_storeId: { residentId, storeId } },
    });

    if (!existing) {
      console.log(JSON.stringify({
        event: "unbind_store_denied",
        adminId: ctx.staffId ?? ctx.residentId,
        residentId,
        storeId,
        action: "unbind",
        reason: "not_bound",
      }));
      return errorResponse(RESIDENT_ERRORS.NOT_BOUND, "居民未绑定该门店", 404);
    }

    // Check if this is the resident's last store binding
    const bindingCount = await prisma.residentStore.count({
      where: { residentId },
    });

    if (bindingCount <= 1) {
      console.log(JSON.stringify({
        event: "unbind_store_denied",
        adminId: ctx.staffId ?? ctx.residentId,
        residentId,
        storeId,
        action: "unbind",
        reason: "last_store",
      }));
      return errorResponse(RESIDENT_ERRORS.LAST_STORE, "居民至少需要绑定一个门店", 400);
    }

    // Delete binding
    await prisma.residentStore.delete({
      where: { residentId_storeId: { residentId, storeId } },
    });

    console.log(JSON.stringify({
      event: "unbind_store",
      adminId: ctx.staffId ?? ctx.residentId,
      residentId,
      storeId,
      action: "unbind",
    }));

    return successResponse({ residentId, storeId, bound: false });
  } catch (error) {
    console.error("[residents] Unbind store error:", error);
    return errorResponse(RESIDENT_ERRORS.UNBIND_FAILED, "解绑门店失败", 500);
  }
}
