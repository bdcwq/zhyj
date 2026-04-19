import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { ROBOT_ROUTINES } from "@/lib/robot-routines";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager", "staff"], request.url);
    if (roleGuard) return roleGuard;

    return successResponse(ROBOT_ROUTINES);
  } catch (error) {
    console.error("[robot-session] Routines error:", error);
    return errorResponse("ROBOT_006", "获取机器人程序列表失败", 500);
  }
}
