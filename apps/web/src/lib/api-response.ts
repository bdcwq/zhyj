import { NextResponse } from "next/server";

export function errorResponse(code: string, message: string, status: number = 400) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status }
  );
}

export function successResponse(data: unknown, status: number = 200) {
  return NextResponse.json(
    { success: true, data },
    { status }
  );
}
