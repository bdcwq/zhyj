import { describe, it, expect } from "vitest";
import {
  createMonitoringRecordSchema,
  updateMonitoringRecordSchema,
  monitoringHistoryQuerySchema,
} from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { signToken } from "@/lib/auth";

describe("Monitoring schema validation", () => {
  it("should validate a valid create record", () => {
    const result = createMonitoringRecordSchema.safeParse({
      residentId: "r1",
      score: 85,
      monitoringDate: "2024-01-15T10:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid score below 0", () => {
    const result = createMonitoringRecordSchema.safeParse({
      residentId: "r1",
      score: -1,
      monitoringDate: "2024-01-15T10:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid score above 100", () => {
    const result = createMonitoringRecordSchema.safeParse({
      residentId: "r1",
      score: 101,
      monitoringDate: "2024-01-15T10:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty residentId", () => {
    const result = createMonitoringRecordSchema.safeParse({
      residentId: "",
      score: 85,
      monitoringDate: "2024-01-15T10:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing score", () => {
    const result = createMonitoringRecordSchema.safeParse({
      residentId: "r1",
      monitoringDate: "2024-01-15T10:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("should validate update with partial fields", () => {
    const result = updateMonitoringRecordSchema.safeParse({ score: 90 });
    expect(result.success).toBe(true);
  });

  it("should validate history query with defaults", () => {
    const result = monitoringHistoryQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
      expect(result.data.offset).toBe(0);
    }
  });

  it("should validate datetime string", () => {
    const result = createMonitoringRecordSchema.safeParse({
      residentId: "r1",
      score: 85,
      monitoringDate: "2024-01-15T10:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("should validate date string", () => {
    const result = createMonitoringRecordSchema.safeParse({
      residentId: "r1",
      score: 85,
      monitoringDate: "2024-01-15",
    });
    expect(result.success).toBe(true);
  });

  it("should allow optional constitutionType", () => {
    const result = createMonitoringRecordSchema.safeParse({
      residentId: "r1",
      score: 85,
      monitoringDate: "2024-01-15",
      constitutionType: "气虚质",
    });
    expect(result.success).toBe(true);
  });
});

describe("getAuthContext", () => {
  it("should return null when no cookie or header", async () => {
    const req = new Request("http://localhost/api/test");
    const ctx = await getAuthContext(req);
    expect(ctx).toBeNull();
  });

  it("should return null for expired token", async () => {
    const req = new Request("http://localhost/api/test", {
      headers: { Cookie: "auth-token=invalid" },
    });
    const ctx = await getAuthContext(req);
    expect(ctx).toBeNull();
  });

  it("should return null for malformed JWT", async () => {
    const req = new Request("http://localhost/api/test", {
      headers: { Cookie: "auth-token=not-a-jwt" },
    });
    const ctx = await getAuthContext(req);
    expect(ctx).toBeNull();
  });

  it("should return staff context from cookie", async () => {
    const token = await signToken({ staffId: "s1", role: "admin", storeId: "store1" });
    const req = new Request("http://localhost/api/test", {
      headers: { Cookie: `auth-token=${token}` },
    });
    const ctx = await getAuthContext(req);
    expect(ctx).not.toBeNull();
    expect(ctx!.staffId).toBe("s1");
    expect(ctx!.storeId).toBe("store1");
  });

  it("should return resident context from Bearer header", async () => {
    const token = await signToken({ residentId: "r1", storeId: "store1" });
    const req = new Request("http://localhost/api/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ctx = await getAuthContext(req);
    expect(ctx).not.toBeNull();
    expect(ctx!.residentId).toBe("r1");
  });

  it("should prioritize cookie over header", async () => {
    const staffToken = await signToken({ staffId: "s1", storeId: "store1" });
    const residentToken = await signToken({ residentId: "r1", storeId: "store2" });
    const req = new Request("http://localhost/api/test", {
      headers: {
        Cookie: `auth-token=${staffToken}`,
        Authorization: `Bearer ${residentToken}`,
      },
    });
    const ctx = await getAuthContext(req);
    expect(ctx!.staffId).toBe("s1");
  });

  it("should return null for cookie with invalid JWT", async () => {
    const req = new Request("http://localhost/api/test", {
      headers: { Cookie: "auth-token=bad.jwt.value" },
    });
    const ctx = await getAuthContext(req);
    expect(ctx).toBeNull();
  });

  it("should return null for Bearer with no token", async () => {
    const req = new Request("http://localhost/api/test", {
      headers: { Authorization: "Bearer " },
    });
    const ctx = await getAuthContext(req);
    expect(ctx).toBeNull();
  });

  it("should return role for staff", async () => {
    const token = await signToken({ staffId: "s1", role: "staff", storeId: "store1" });
    const req = new Request("http://localhost/api/test", {
      headers: { Cookie: `auth-token=${token}` },
    });
    const ctx = await getAuthContext(req);
    expect(ctx!.role).toBe("staff");
  });

  it("should return staffId for staff", async () => {
    const token = await signToken({ staffId: "abc123", storeId: "store1" });
    const req = new Request("http://localhost/api/test", {
      headers: { Cookie: `auth-token=${token}` },
    });
    const ctx = await getAuthContext(req);
    expect(ctx!.staffId).toBe("abc123");
  });

  it("should return residentId for resident", async () => {
    const token = await signToken({ residentId: "r999", storeId: "store1" });
    const req = new Request("http://localhost/api/test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ctx = await getAuthContext(req);
    expect(ctx!.residentId).toBe("r999");
  });

  it("should handle empty authorization header", async () => {
    const req = new Request("http://localhost/api/test", {
      headers: { Authorization: "" },
    });
    const ctx = await getAuthContext(req);
    expect(ctx).toBeNull();
  });

  it("should handle authorization without Bearer prefix", async () => {
    const token = await signToken({ residentId: "r1" });
    const req = new Request("http://localhost/api/test", {
      headers: { Authorization: `Token ${token}` },
    });
    const ctx = await getAuthContext(req);
    expect(ctx).toBeNull();
  });

  it("should return storeId", async () => {
    const token = await signToken({ staffId: "s1", storeId: "my-store-id" });
    const req = new Request("http://localhost/api/test", {
      headers: { Cookie: `auth-token=${token}` },
    });
    const ctx = await getAuthContext(req);
    expect(ctx!.storeId).toBe("my-store-id");
  });
});
