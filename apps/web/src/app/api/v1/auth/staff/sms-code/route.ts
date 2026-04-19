import { NextRequest } from "next/server";
import { smsCodeRequestSchema } from "@zhyj/shared";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = smsCodeRequestSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("AUTH_005", parsed.error.errors[0].message, 400);
    }

    const { phone } = parsed.data;

    // Dev mode: log and return success without sending SMS
    console.log(`[DEV SMS] Code: 123456 for phone: ${phone}`);

    return successResponse({ message: "验证码已发送" });
  } catch (error) {
    console.error("[auth] SMS code request error:", error);
    return errorResponse("AUTH_006", "发送验证码失败，请稍后重试", 500);
  }
}
