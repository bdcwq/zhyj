import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { TRANSFER_ERRORS } from "@zhyj/shared";
import { transferSchema } from "@zhyj/shared";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // ── Auth & RBAC ──
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);

    const roleGuard = requireRole(ctx, ["admin"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    // ── Validate request body ──
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(
        TRANSFER_ERRORS.TRANSFER_FAILED,
        "请求体格式错误",
        400,
      );
    }

    const parsed = transferSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        TRANSFER_ERRORS.TRANSFER_FAILED,
        parsed.error.issues.map((e) => e.message).join("; "),
        400,
      );
    }

    const { fromStoreId, toStoreId } = parsed.data;

    // ── Fetch staff with store assignments ──
    const staff = await prisma.staff.findFirst({
      where: { id, deletedAt: null },
      include: { staffStores: true },
    });

    if (!staff) {
      console.warn(`[staff-transfer] Staff not found: id=${id}`);
      return errorResponse(
        TRANSFER_ERRORS.STAFF_NOT_FOUND,
        "员工不存在",
        404,
      );
    }

    // ── Verify fromStoreId exists in current assignments ──
    const hasFromStore = staff.staffStores.some(
      (ss: { storeId: string }) => ss.storeId === fromStoreId,
    );
    if (!hasFromStore) {
      console.warn(
        `[staff-transfer] Store not assigned: staffId=${id}, fromStoreId=${fromStoreId}`,
      );
      return errorResponse(
        TRANSFER_ERRORS.STORE_NOT_ASSIGNED,
        "原店铺未分配给该员工",
        400,
      );
    }

    // ── Verify staff has more than one store (can't remove last) ──
    if (staff.staffStores.length <= 1) {
      console.warn(
        `[staff-transfer] Cannot remove last store: staffId=${id}`,
      );
      return errorResponse(
        TRANSFER_ERRORS.LAST_STORE,
        "员工至少需要保留一个店铺",
        400,
      );
    }

    // ── Atomic transfer: remove fromStoreId, add toStoreId ──
    await prisma.$transaction(async (tx: any) => {
      await tx.staffStore.deleteMany({
        where: { staffId: id, storeId: fromStoreId },
      });

      await tx.staffStore.createMany({
        data: [{ staffId: id, storeId: toStoreId }],
        skipDuplicates: true,
      });
    });

    // ── Fetch updated staff with stores ──
    const updatedStaff = await prisma.staff.findUnique({
      where: { id },
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
          select: {
            storeId: true,
            store: { select: { id: true, name: true } },
          },
        },
      },
    });

    console.log(
      `[staff-transfer] Success: staffId=${id}, from=${fromStoreId}, to=${toStoreId}`,
    );

    return successResponse(updatedStaff);
  } catch (error) {
    console.error("[staff-transfer] Transfer error:", error);
    return errorResponse(
      TRANSFER_ERRORS.TRANSFER_FAILED,
      "调动失败",
      500,
    );
  }
}
