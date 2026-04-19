import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { JWT_EXPIRY } from "@zhyj/shared";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || "dev-secret-change-in-production";
  return new TextEncoder().encode(secret);
}

export async function signToken(payload: Record<string, unknown>): Promise<string> {
  const secret = getJwtSecret();
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<Record<string, unknown> | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface AuthContext {
  staffId?: string;
  residentId?: string;
  role?: string;
  storeId: string;
}

export async function getAuthContext(request: Request): Promise<AuthContext | null> {
  // Try cookie first (web dashboard)
  const cookieHeader = request.headers.get("cookie");
  let token: string | null = null;

  if (cookieHeader) {
    const match = cookieHeader.match(/auth-token=([^;]+)/);
    if (match) token = match[1];
  }

  // Try Authorization header (Mini Program / API)
  if (!token) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  return {
    staffId: payload.staffId as string | undefined,
    residentId: payload.residentId as string | undefined,
    role: payload.role as string | undefined,
    storeId: (payload.storeId as string) || "",
  };
}
