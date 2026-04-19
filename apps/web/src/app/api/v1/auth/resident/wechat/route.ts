import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { wechatLoginSchema, JWT_EXPIRY } from "@zhyj/shared";
import type { StoreSummary } from "@zhyj/shared";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = wechatLoginSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("AUTH_005", parsed.error.errors[0].message, 400);
    }

    const { code } = parsed.data;

    // Dev mode: mock openid
    const openid = `mock_openid_${code}`;
    console.log(`[DEV WECHAT] Mock openid for code: ${code}`);

    // Get the first store as default
    const store = await prisma.store.findFirst({ where: { deletedAt: null } });
    if (!store) {
      return errorResponse("AUTH_006", "系统配置错误，请联系管理员", 500);
    }

    // Find or create resident (no storeId on resident model)
    const resident = await prisma.resident.upsert({
      where: { wechatOpenid: openid },
      update: {},
      create: {
        wechatOpenid: openid,
        name: `微信用户_${code.slice(-4)}`,
        phone: `wx_${code.slice(-4)}`,
        registrationSource: "wechat",
      },
    });

    // Atomically create ResidentStore binding (idempotent)
    await prisma.residentStore.upsert({
      where: {
        residentId_storeId: {
          residentId: resident.id,
          storeId: store.id,
        },
      },
      create: {
        residentId: resident.id,
        storeId: store.id,
      },
      update: {},
    });

    // Fetch all stores bound to this resident via residentStores relation
    const residentWithStores = await prisma.resident.findUnique({
      where: { id: resident.id },
      include: { residentStores: { include: { store: { select: { id: true, name: true } } } } },
    });
    const stores: StoreSummary[] = (residentWithStores?.residentStores ?? []).map((a) => ({
      id: a.store.id,
      name: a.store.name,
    }));

    // Use the default store for the JWT
    const activeStoreId = store.id;

    const token = await new SignJWT({
      residentId: resident.id,
      storeId: activeStoreId,
      phone: resident.phone,
      name: resident.name,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(JWT_EXPIRY)
      .sign(new TextEncoder().encode(JWT_SECRET));

    // Return token in response body (Mini Program manages storage)
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
      resident: {
        id: resident.id,
        name: resident.name,
      },
    });
  } catch (error) {
    console.error("[auth] WeChat login error:", error);
    return errorResponse("AUTH_006", "登录失败，请稍后重试", 500);
  }
}
