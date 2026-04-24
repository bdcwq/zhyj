import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { staffPasswordLoginSchema, staffSmsLoginSchema, DEV_SMS_CODE, JWT_EXPIRY } from "@zhyj/shared";
import type { StoreSummary } from "@zhyj/shared";
import { prisma } from "@/lib/db";
import { comparePassword } from "@/lib/password";
import { successResponse, errorResponse } from "@/lib/api-response";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

async function getStaffStores(staffId: string): Promise<StoreSummary[]> {
  const assignments = await prisma.staffStore.findMany({
    where: { staffId },
    include: { store: { select: { id: true, name: true } } },
  });
  return assignments.map((a: { store: { id: string; name: string } }) => ({ id: a.store.id, name: a.store.name }));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const isSmsLogin = "phone" in body && "code" in body;

    let staff: {
      id: string;
      username: string;
      phone: string;
      name: string;
      role: string;
      password: string;
    } | null = null;

    if (isSmsLogin) {
      // ── SMS login ──
      const parsed = staffSmsLoginSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse("AUTH_005", parsed.error.errors[0].message, 400);
      }

      const { phone, code } = parsed.data;

      staff = await prisma.staff.findFirst({
        where: { phone, deletedAt: null },
      });

      if (!staff) {
        return errorResponse("AUTH_002", "用户不存在", 404);
      }

      if (code !== DEV_SMS_CODE) {
        return errorResponse("AUTH_003", "验证码错误", 400);
      }
    } else {
      // ── Password login ──
      const parsed = staffPasswordLoginSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse("AUTH_005", parsed.error.errors[0].message, 400);
      }

      const { username, password } = parsed.data;

      staff = await prisma.staff.findFirst({
        where: { username, deletedAt: null },
      });

      if (!staff) {
        return errorResponse("AUTH_001", "用户名或密码错误", 401);
      }

      const valid = await comparePassword(password, staff.password);
      if (!valid) {
        return errorResponse("AUTH_001", "用户名或密码错误", 401);
      }
    }

    // ── Common: build JWT with store selection logic ──
    const stores = await getStaffStores(staff!.id);
    const selectedStoreId = stores.length === 1 ? stores[0].id : "";

    const token = await new SignJWT({
      staffId: staff!.id,
      role: staff!.role,
      storeId: selectedStoreId,
      phone: staff!.phone,
      name: staff!.name,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(JWT_EXPIRY)
      .sign(new TextEncoder().encode(JWT_SECRET));

    console.log(
      `[auth] Staff login success: ${staff!.name} (${staff!.username})` +
        ` — stores: [${stores.map((s) => s.name).join(", ")}]` +
        (selectedStoreId ? ` — auto-selected: ${selectedStoreId}` : " — awaiting store selection")
    );

    const response = successResponse({
      token,
      expiresIn: JWT_EXPIRY,
      user: {
        id: staff!.id,
        username: staff!.username,
        phone: staff!.phone,
        name: staff!.name,
        role: staff!.role,
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
    console.error("[auth] Staff login error:", error);
    return errorResponse("AUTH_006", "登录失败，请稍后重试", 500);
  }
}
