import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { markNoShow } from "@/lib/verification-rules";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager", "staff"], request.url);
    if (roleGuard) return roleGuard;

    // Staff-only
    if (!ctx.staffId) {
      return errorResponse("AUTH_006", "仅工作人员可操作", 403);
    }

    const { id } = await params;

    // Verify appointment exists in store
    const appointment = await prisma.appointment.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
    });

    if (!appointment) {
      return errorResponse("VERIFICATION_001", "预约不存在", 404);
    }

    // Call markNoShow in a transaction
    await prisma.$transaction(async (tx) => {
      await markNoShow(tx, id, ctx.staffId!, ctx.storeId);
    });

    console.log(`[verification] Marked no-show for appointment ${id}`);

    return successResponse({ id, markedNoShow: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "标记爽约失败";

    console.error("[verification] No-show error:", error);

    // Map thrown errors to VERIFICATION_* codes
    if (message.includes("not found") || message.includes("不存在")) {
      return errorResponse("VERIFICATION_001", message, 404);
    }
    if (message.includes("status") || message.includes("状态")) {
      return errorResponse("VERIFICATION_003", message, 400);
    }
    if (message.includes("no-show") || message.includes("爽约")) {
      return errorResponse("VERIFICATION_004", message, 400);
    }

    return errorResponse("VERIFICATION_005", "标记爽约失败", 500);
  }
}
