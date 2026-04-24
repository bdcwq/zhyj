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
    if (!authContext?.residentId) {
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

    // ── Verify store is assigned to this resident ──
    const assignment = await prisma.residentStore.findFirst({
      where: { residentId: authContext.residentId, storeId },
    });

    if (!assignment) {
      console.warn(
        JSON.stringify({
          event: "store-switch-denied",
          residentId: authContext.residentId,
          requestedStoreId: storeId,
          endpoint: "/api/v1/auth/resident/switch-store",
        })
      );
      return errorResponse(
        STORE_SWITCH_ERRORS.STORE_NOT_ASSIGNED,
        "该门店未绑定当前居民",
        403
      );
    }

    // ── Re-fetch resident info for JWT payload ──
    const resident = await prisma.resident.findFirst({
      where: { id: authContext.residentId, deletedAt: null },
    });

    if (!resident) {
      return errorResponse("AUTH_006", "居民账号不存在", 401);
    }

    // ── Re-fetch all bound stores for response ──
    const storeAssignments = await prisma.residentStore.findMany({
      where: { residentId: authContext.residentId },
      include: { store: { select: { id: true, name: true } } },
    });
    const stores: StoreSummary[] = storeAssignments.map((a: { store: { id: string; name: string } }) => ({
      id: a.store.id,
      name: a.store.name,
    }));

    // ── Sign new JWT with updated storeId ──
    const token = await new SignJWT({
      residentId: resident.id,
      storeId,
      phone: resident.phone,
      name: resident.name,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(JWT_EXPIRY)
      .sign(new TextEncoder().encode(JWT_SECRET));

    // ── Log the switch action (structured) ──
    console.log(
      JSON.stringify({
        event: "resident-store-switch",
        residentId: authContext.residentId,
        oldStoreId: authContext.storeId,
        newStoreId: storeId,
      })
    );

    // Return token in response body — Mini Program uses Bearer token, NOT cookies
    return successResponse({
      token,
      expiresIn: JWT_EXPIRY,
      user: {
        id: resident.id,
        phone: resident.phone,
        name: resident.name,
        registrationSource: resident.registrationSource,
        stores,
      },
    });
  } catch (error) {
    console.error("[auth] Resident switch-store error:", error);
    return errorResponse(
      STORE_SWITCH_ERRORS.SWITCH_FAILED,
      "切换门店失败，请稍后重试",
      500
    );
  }
}
