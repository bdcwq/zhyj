import { describe, it, expect, vi } from "vitest";
import { signToken, verifyToken, hashPassword, comparePassword, getAuthContext } from "@/lib/auth";

describe("JWT utilities", () => {
  it("should sign and verify a staff token", async () => {
    const token = await signToken({ staffId: "s1", role: "admin", storeId: "store1" });
    const payload = await verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.staffId).toBe("s1");
    expect(payload!.role).toBe("admin");
    expect(payload!.storeId).toBe("store1");
  });

  it("should sign and verify a resident token", async () => {
    const token = await signToken({ residentId: "r1", storeId: "store1" });
    const payload = await verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.residentId).toBe("r1");
  });

  it("should reject an expired token", async () => {
    const secret = new TextEncoder().encode("test-secret");
    const { SignJWT } = await import("jose");
    const expiredToken = await new SignJWT({ staffId: "s1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("0s")
      .sign(secret);
    // Wait a moment for expiration
    await new Promise((r) => setTimeout(r, 100));
    const payload = await verifyToken(expiredToken);
    expect(payload).toBeNull();
  });

  it("should return null for invalid token", async () => {
    const payload = await verifyToken("invalid.token.here");
    expect(payload).toBeNull();
  });

  it("should reject token with wrong secret", async () => {
    const secret = new TextEncoder().encode("wrong-secret");
    const { SignJWT } = await import("jose");
    const token = await new SignJWT({ staffId: "s1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);
    const payload = await verifyToken(token);
    expect(payload).toBeNull();
  });

  it("should hash and compare password", async () => {
    const hash = await hashPassword("password123");
    const result = await comparePassword("password123", hash);
    expect(result).toBe(true);
  });

  it("should reject wrong password", async () => {
    const hash = await hashPassword("password123");
    const result = await comparePassword("wrongpassword", hash);
    expect(result).toBe(false);
  });

  it("should produce different hashes for same password", async () => {
    const hash1 = await hashPassword("samepassword");
    const hash2 = await hashPassword("samepassword");
    expect(hash1).not.toBe(hash2);
    expect(await comparePassword("samepassword", hash1)).toBe(true);
    expect(await comparePassword("samepassword", hash2)).toBe(true);
  });

  it("should handle empty string password", async () => {
    const hash = await hashPassword("");
    expect(hash).toBeDefined();
    expect(hash.length).toBeGreaterThan(0);
  });
});

describe("getAuthContext", () => {
  it("should return null for missing cookie and header", async () => {
    const request = new Request("http://localhost:3000/api/test");
    const ctx = await getAuthContext(request);
    expect(ctx).toBeNull();
  });

  it("should return null for invalid token in cookie", async () => {
    const request = new Request("http://localhost:3000/api/test", {
      headers: { Cookie: "auth-token=invalid.token" },
    });
    const ctx = await getAuthContext(request);
    expect(ctx).toBeNull();
  });
});

describe("Multi-store JWT support", () => {
  it("should sign and verify token with empty storeId", async () => {
    const token = await signToken({ staffId: "s1", role: "admin", storeId: "" });
    const payload = await verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.staffId).toBe("s1");
    expect(payload!.storeId).toBe("");
  });

  it("should sign and verify token with multiple stores in payload", async () => {
    const stores = [
      { id: "store1", name: "门店A" },
      { id: "store2", name: "门店B" },
    ];
    const token = await signToken({
      staffId: "s1",
      role: "admin",
      storeId: "",
      stores,
    });
    const payload = await verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.staffId).toBe("s1");
    expect(payload!.storeId).toBe("");
    expect(payload!.stores).toEqual(stores);
  });

  it("getAuthContext should return empty storeId when not in payload", async () => {
    // Simulate a token signed without storeId (legacy / not-yet-selected state)
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-in-production");
    const { SignJWT } = await import("jose");
    const token = await new SignJWT({ staffId: "s1", role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

    const request = new Request("http://localhost:3000/api/test", {
      headers: { Cookie: `auth-token=${token}` },
    });
    const ctx = await getAuthContext(request);
    expect(ctx).not.toBeNull();
    expect(ctx!.staffId).toBe("s1");
    expect(ctx!.storeId).toBe("");
  });

  it("getAuthContext should return storeId when present in payload", async () => {
    const token = await signToken({ staffId: "s1", role: "admin", storeId: "store1" });
    const request = new Request("http://localhost:3000/api/test", {
      headers: { Cookie: `auth-token=${token}` },
    });
    const ctx = await getAuthContext(request);
    expect(ctx).not.toBeNull();
    expect(ctx!.storeId).toBe("store1");
  });
});
