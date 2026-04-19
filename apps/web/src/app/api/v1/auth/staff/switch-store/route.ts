import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { JWT_EXPIRY, switchStoreSchema, STORE_SWITCH_ERRORS } from "@zhyj/shared";
import type { StoreSummary } from "@zhyj/shared";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

export async function POST(request: NextRequest) {
  try {
    // ── Validate auth ──
    const authContext = await getAuthContext(request);
    if (!authContext?.staffId) {
      return errorResponse("AUTH_006", "未登录或登录已过期", 401);
    }

    // ── Parse & validate body ──
    const body = await request.json();
    const parsed = switchStoreSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        STORE_SWITCH_ERRORS.INVALID_STORE,
        parsed.error.errors[0].message,
        400
      );
    }

    const { storeId } = parsed.data;
    if (!storeId) {
      return errorResponse(
        STORE_SWITCH_ERRORS.INVALID_STORE,
        "门店ID不能为空",
        400
      );
    }

    // ── Verify store is assigned to this staff ──
    const assignment = await prisma.staffStore.findFirst({
      where: { staffId: authContext.staffId, storeId },
    });

    if (!assignment) {
      console.warn(
        `[auth] Switch-store denied: staff ${authContext.staffId} tried to switch to unassigned store ${storeId}`
      );
      return errorResponse(
        STORE_SWITCH_ERRORS.STORE_NOT_ASSIGNED,
        "该门店未分配给当前员工",
        403
      );
    }

    // ── Re-fetch staff info for JWT payload ──
    const staff = await prisma.staff.findFirst({
      where: { id: authContext.staffId, deletedAt: null },
    });

    if (!staff) {
      return errorResponse("AUTH_006", "员工账号不存在", 401);
    }

    // ── Re-fetch all assigned stores for response ──
    const storeAssignments = await prisma.staffStore.findMany({
      where: { staffId: authContext.staffId },
      include: { store: { select: { id: true, name: true } } },
    });
    const stores: StoreSummary[] = storeAssignments.map((a) => ({
      id: a.store.id,
      name: a.store.name,
    }));

    // ── Sign new JWT with updated storeId ──
    const token = await new SignJWT({
      staffId: staff.id,
      role: staff.role,
      storeId,
      phone: staff.phone,
      name: staff.name,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(JWT_EXPIRY)
      .sign(new TextEncoder().encode(JWT_SECRET));

    console.log(
      `[auth] Switch-store: staff ${staff.name} (${staff.username})` +
        ` — old store: ${authContext.storeId || "(none)"} → new store: ${storeId}`
    );

    const response = successResponse({
      token,
      expiresIn: JWT_EXPIRY,
      user: {
        id: staff.id,
        username: staff.username,
        phone: staff.phone,
        name: staff.name,
        role: staff.role,
        stores,
      },
    });

    response.cookies.set("auth-token", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[auth] Switch-store error:", error);
    return errorResponse(
      STORE_SWITCH_ERRORS.SWITCH_FAILED,
      "切换门店失败，请稍后重试",
      500
    );
  }
}
