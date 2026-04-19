import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireRole, ROLE_ACCESS_LEVELS } from "@/lib/rbac";

describe("requireRole", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns null when role is in allowed list", () => {
    const ctx = { role: "admin", storeId: "store-1" };
    const result = requireRole(ctx, ["admin", "store_manager"], "/api/test");
    expect(result).toBeNull();
  });

  it("returns 403 response when role is not in allowed list", () => {
    const ctx = { role: "staff", storeId: "store-1" };
    const result = requireRole(ctx, ["admin", "store_manager"], "/api/management/test");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("returns 403 when ctx.role is undefined (defensive)", () => {
    const ctx = { role: undefined, storeId: "store-1" } as any;
    const result = requireRole(ctx, ["admin"], "/api/test");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("403 response body has correct error structure", async () => {
    const ctx = { role: "staff", storeId: "store-1" };
    const result = requireRole(ctx, ["admin"], "/api/admin/test");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);

    const body = await result!.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: "PERMISSION_001",
        message: "权限不足",
      },
    });
  });

  it("logs structured warning on permission denial", () => {
    const ctx = { role: "staff", storeId: "store-1" };
    requireRole(ctx, ["admin"], "/api/admin/dashboard");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("[RBAC] Permission denied"),
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("role=staff"),
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("required=[admin]"),
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("endpoint=/api/admin/dashboard"),
    );
  });
});

describe("ROLE_ACCESS_LEVELS", () => {
  it("contains correct entries for all 3 roles", () => {
    expect(ROLE_ACCESS_LEVELS).toEqual({
      admin: ["management", "business"],
      store_manager: ["management", "business"],
      staff: ["business"],
    });
  });

  it("admin has both management and business access", () => {
    expect(ROLE_ACCESS_LEVELS.admin).toContain("management");
    expect(ROLE_ACCESS_LEVELS.admin).toContain("business");
  });

  it("store_manager has both management and business access", () => {
    expect(ROLE_ACCESS_LEVELS.store_manager).toContain("management");
    expect(ROLE_ACCESS_LEVELS.store_manager).toContain("business");
  });

  it("staff only has business access", () => {
    expect(ROLE_ACCESS_LEVELS.staff).toEqual(["business"]);
    expect(ROLE_ACCESS_LEVELS.staff).not.toContain("management");
  });
});
