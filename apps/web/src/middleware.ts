import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { STAFF_ROLES } from "@zhyj/shared";

const MANAGEMENT_PATHS = [
  "/statistics",
  "/staff",
  "/rooms",
  "/devices",
  "/residents-management",
  "/campaigns",
  "/notifications",
];

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  const payload = await verifyToken(token);
  if (!payload) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Staff with no store selected → redirect to store selection page
  if (payload.staffId && !(payload.storeId as string)) {
    const selectStoreUrl = new URL("/select-store", request.url);
    return NextResponse.redirect(selectStoreUrl);
  }

  // Role-based page guard: staff cannot access management pages
  const role = (payload.role as string) || "";
  const pathname = request.nextUrl.pathname;

  if (
    role === STAFF_ROLES.STAFF &&
    MANAGEMENT_PATHS.some((path) => pathname.startsWith(path))
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Set decoded headers for downstream API routes
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-staff-id", (payload.staffId as string) || "");
  requestHeaders.set("x-resident-id", (payload.residentId as string) || "");
  requestHeaders.set("x-role", (payload.role as string) || "");
  requestHeaders.set("x-store-id", (payload.storeId as string) || "");

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!login|select-store|api|_next/static|_next/image|favicon.ico).*)"],
};
