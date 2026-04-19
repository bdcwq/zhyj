import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { getBookingStatus } from "@/lib/verification-rules";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager", "staff"], request.url);
    if (roleGuard) return roleGuard;

    const { id: residentId } = await params;

    // Ownership guard for residents
    if (ctx.residentId) {
      if (ctx.residentId !== residentId) {
        return errorResponse("AUTH_006", "无权访问", 403);
      }
    }

    const status = await getBookingStatus(prisma, residentId, ctx.storeId);

    return successResponse({
      canBook: status.canBook,
      reasons: status.reasons,
    });
  } catch (error) {
    console.error("[verification] Booking status error:", error);
    return errorResponse("VERIFICATION_005", "获取预约状态失败", 500);
  }
}
