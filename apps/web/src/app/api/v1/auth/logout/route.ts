import { successResponse } from "@/lib/api-response";

export async function POST() {
  const response = successResponse({ message: "已退出登录" });
  response.cookies.set("auth-token", "", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
