import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { PERMISSION_ERRORS, ROLE_ACCESS_LEVELS } from "@zhyj/shared";
import type { StaffRole } from "@zhyj/shared";
import type { AuthContext } from "@/lib/auth";

export { ROLE_ACCESS_LEVELS };

/**
 * RBAC guard: returns a 403 NextResponse if the authenticated user's role
 * is not in the allowed list, otherwise returns null (access allowed).
 *
 * Logs structured denial info for security audit trail.
 */
export function requireRole(
  ctx: AuthContext,
  allowedRoles: StaffRole[],
  requestUrl?: string,
): NextResponse | null {
  if (!ctx.role || !allowedRoles.includes(ctx.role as StaffRole)) {
    const url = requestUrl ?? "unknown";
    console.warn(
      `[RBAC] Permission denied — role=${ctx.role ?? "undefined"}, ` +
        `required=[${allowedRoles.join(",")}], endpoint=${url}`,
    );
    return errorResponse(PERMISSION_ERRORS.FORBIDDEN, "权限不足", 403);
  }
  return null;
}
