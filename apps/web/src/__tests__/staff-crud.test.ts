import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock next/server to avoid hanging on NextRequest/NextResponse ──
vi.mock("next/server", () => {
  class NextRequest extends Request {
    constructor(url: string, init?: RequestInit) {
      super(url, init);
    }
  }
  class NextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
        ...init,
      }) as unknown as NextResponse;
    }
  }
  return { NextRequest, NextResponse };
});

// ── Mock dependencies before importing route handlers ──
vi.mock("@/lib/db", () => ({
  prisma: {
    staff: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    staffStore: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    store: {
      count: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({
      staff: {
        create: vi.fn(),
        update: vi.fn(),
      },
      staffStore: {
        createMany: vi.fn(),
        deleteMany: vi.fn(),
      },
    })),
  },
}));

vi.mock("@/lib/auth", () => ({
  getAuthContext: vi.fn(),
  hashPassword: vi.fn().mockResolvedValue("$hashed_password"),
}));

vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn().mockReturnValue(null),
}));

// Suppress console output in tests
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

// Import mocked modules
import { prisma } from "@/lib/db";
import { getAuthContext, hashPassword } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { GET, POST } from "@/app/api/v1/staff/route";
import { PUT } from "@/app/api/v1/staff/[id]/route";
import { PATCH } from "@/app/api/v1/staff/[id]/disable/route";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

// ── Helper to create a mock request ──
function createRequest(url: string, options?: RequestInit): Request {
  return new Request(url, options);
}

// ── Helper: admin context ──
const adminCtx = { staffId: "admin-1", role: "admin", storeId: "store-1" };
// ── Helper: store manager context ──
const managerCtx = { staffId: "manager-1", role: "store_manager", storeId: "store-1" };
// ── Helper: unauthorized (null) ──

// ── Sample staff record ──
const sampleStaff = {
  id: "staff-1",
  username: "john",
  phone: "13800138001",
  name: "John Doe",
  role: "staff",
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  staffStores: [
    { storeId: "store-1", store: { id: "store-1", name: "Store 1" } },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(null);
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/staff — List
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/staff", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(createRequest("http://localhost/api/v1/staff") as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not authorized", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "staff", storeId: "store-1" });
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await GET(createRequest("http://localhost/api/v1/staff") as any);
    expect(res.status).toBe(403);
  });

  it("lists staff with no filters (admin)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleStaff]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await GET(createRequest("http://localhost/api/v1/staff") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.records).toHaveLength(1);
    expect(body.data.total).toBe(1);
    expect(body.data.page).toBe(1);
    expect(body.data.pageSize).toBe(20);
  });

  it("lists staff with search filter", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleStaff]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await GET(createRequest("http://localhost/api/v1/staff?search=john") as any);
    expect(res.status).toBe(200);

    // Verify findMany was called with search in where clause
    const findManyCall = (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.OR).toBeDefined();
    expect(findManyCall.where.OR[0].name.contains).toBe("john");
  });

  it("lists staff with role filter", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await GET(createRequest("http://localhost/api/v1/staff?role=admin") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.role).toBe("admin");
  });

  it("supports pagination", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(50);

    const res = await GET(createRequest("http://localhost/api/v1/staff?page=2&pageSize=10") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.skip).toBe(10);
    expect(findManyCall.take).toBe(10);
  });

  it("store_manager is scoped to their own store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await GET(createRequest("http://localhost/api/v1/staff") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.staffStores.some.storeId).toBe("store-1");
  });
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/v1/staff — Create
// ══════════════════════════════════════════════════════════════════════
describe("POST /api/v1/staff", () => {
  const validBody = {
    username: "newstaff",
    password: "password123",
    phone: "13800138002",
    name: "New Staff",
    role: "staff",
    storeIds: ["store-1"],
  };

  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(createRequest("http://localhost/api/v1/staff", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(401);
  });

  it("creates staff with valid data", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null) // username check
      .mockResolvedValueOnce(null); // phone check
    (mockPrisma.store.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          staff: { create: vi.fn().mockResolvedValue(sampleStaff) },
          staffStore: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
        };
        return fn(tx);
      }
    );
    (mockPrisma.staff.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleStaff);

    const res = await POST(createRequest("http://localhost/api/v1/staff", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(hashPassword).toHaveBeenCalledWith("password123");
  });

  it("rejects duplicate username", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "existing", username: "newstaff" });

    const res = await POST(createRequest("http://localhost/api/v1/staff", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("EMPLOYEE_005");
  });

  it("rejects duplicate phone", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null) // username check passes
      .mockResolvedValueOnce({ id: "existing", phone: "13800138002" }); // phone check fails

    const res = await POST(createRequest("http://localhost/api/v1/staff", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("EMPLOYEE_006");
  });

  it("rejects missing required fields", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await POST(createRequest("http://localhost/api/v1/staff", {
      method: "POST",
      body: JSON.stringify({ username: "test" }), // missing password, phone, name, role
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("EMPLOYEE_007");
  });

  it("store_manager forces store scoping on create", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.staff.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    (mockPrisma.store.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          staff: { create: vi.fn().mockResolvedValue(sampleStaff) },
          staffStore: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
        };
        return fn(tx);
      }
    );
    (mockPrisma.staff.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleStaff);

    // Manager tries to assign to a different store
    const bodyWithOtherStore = { ...validBody, storeIds: ["store-2"] };
    const res = await POST(createRequest("http://localhost/api/v1/staff", {
      method: "POST",
      body: JSON.stringify(bodyWithOtherStore),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(201);
    // Verify store.count was called with manager's store, not store-2
    const countCall = (mockPrisma.store.count as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(countCall.where.id.in).toEqual(["store-1"]);
  });

  it("rejects invalid role", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await POST(createRequest("http://localhost/api/v1/staff", {
      method: "POST",
      body: JSON.stringify({ ...validBody, role: "superadmin" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════
// PUT /api/v1/staff/[id] — Update
// ══════════════════════════════════════════════════════════════════════
describe("PUT /api/v1/staff/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PUT(createRequest("http://localhost/api/v1/staff/staff-1", {
      method: "PUT",
      body: JSON.stringify({ name: "Updated" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "staff-1" }) });
    expect(res.status).toBe(401);
  });

  it("updates staff name", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleStaff,
      staffStores: [{ storeId: "store-1" }],
    });
    (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          staff: { update: vi.fn().mockResolvedValue({ ...sampleStaff, name: "Updated Name" }) },
          staffStore: { deleteMany: vi.fn(), createMany: vi.fn() },
        };
        return fn(tx);
      }
    );
    (mockPrisma.staff.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleStaff,
      name: "Updated Name",
    });

    const res = await PUT(createRequest("http://localhost/api/v1/staff/staff-1", {
      method: "PUT",
      body: JSON.stringify({ name: "Updated Name" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "staff-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("updates staff role", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleStaff,
      staffStores: [{ storeId: "store-1" }],
    });
    (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          staff: { update: vi.fn().mockResolvedValue({ ...sampleStaff, role: "store_manager" }) },
          staffStore: { deleteMany: vi.fn(), createMany: vi.fn() },
        };
        return fn(tx);
      }
    );
    (mockPrisma.staff.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleStaff,
      role: "store_manager",
    });

    const res = await PUT(createRequest("http://localhost/api/v1/staff/staff-1", {
      method: "PUT",
      body: JSON.stringify({ role: "store_manager" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "staff-1" }) });

    expect(res.status).toBe(200);
  });

  it("rejects duplicate phone on update", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ...sampleStaff, staffStores: [{ storeId: "store-1" }] }) // staff lookup
      .mockResolvedValueOnce({ id: "other-staff" }); // phone uniqueness check

    const res = await PUT(createRequest("http://localhost/api/v1/staff/staff-1", {
      method: "PUT",
      body: JSON.stringify({ phone: "13900139000" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "staff-1" }) });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("EMPLOYEE_006");
  });

  it("returns 404 when staff not found", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await PUT(createRequest("http://localhost/api/v1/staff/nonexistent", {
      method: "PUT",
      body: JSON.stringify({ name: "Test" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "nonexistent" }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("EMPLOYEE_001");
  });

  it("store_manager cannot update staff from other store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.staff.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleStaff,
      staffStores: [{ storeId: "store-2" }], // different store
    });

    const res = await PUT(createRequest("http://localhost/api/v1/staff/staff-1", {
      method: "PUT",
      body: JSON.stringify({ name: "Hacked" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "staff-1" }) });

    expect(res.status).toBe(404);
  });

  it("allows same phone (no change) on update", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleStaff,
      staffStores: [{ storeId: "store-1" }],
    });
    (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          staff: { update: vi.fn().mockResolvedValue(sampleStaff) },
          staffStore: { deleteMany: vi.fn(), createMany: vi.fn() },
        };
        return fn(tx);
      }
    );
    (mockPrisma.staff.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleStaff);

    // Same phone as existing — should not trigger uniqueness check
    const res = await PUT(createRequest("http://localhost/api/v1/staff/staff-1", {
      method: "PUT",
      body: JSON.stringify({ phone: sampleStaff.phone }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "staff-1" }) });

    expect(res.status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════════════
// PATCH /api/v1/staff/[id]/disable — Disable/Enable
// ══════════════════════════════════════════════════════════════════════
describe("PATCH /api/v1/staff/[id]/disable", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PATCH(createRequest("http://localhost/api/v1/staff/staff-1/disable", {
      method: "PATCH",
      body: JSON.stringify({ disabled: true }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "staff-1" }) });
    expect(res.status).toBe(401);
  });

  it("disables a staff member", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleStaff,
      staffStores: [{ storeId: "store-1" }],
    });
    (mockPrisma.staff.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleStaff,
      deletedAt: new Date(),
    });

    const res = await PATCH(createRequest("http://localhost/api/v1/staff/staff-1/disable", {
      method: "PATCH",
      body: JSON.stringify({ disabled: true }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "staff-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("re-enables a staff member", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleStaff,
      deletedAt: new Date(),
      staffStores: [{ storeId: "store-1" }],
    });
    (mockPrisma.staff.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleStaff,
      deletedAt: null,
    });

    const res = await PATCH(createRequest("http://localhost/api/v1/staff/staff-1/disable", {
      method: "PATCH",
      body: JSON.stringify({ disabled: false }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "staff-1" }) });

    expect(res.status).toBe(200);
    const updateCall = (mockPrisma.staff.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(updateCall.data.deletedAt).toBeNull();
  });

  it("prevents disabling self", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleStaff,
      staffStores: [{ storeId: "store-1" }],
    });

    const res = await PATCH(createRequest("http://localhost/api/v1/staff/admin-1/disable", {
      method: "PATCH",
      body: JSON.stringify({ disabled: true }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "admin-1" }) }); // same as ctx.staffId

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("EMPLOYEE_004");
  });

  it("returns 404 when staff not found", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await PATCH(createRequest("http://localhost/api/v1/staff/nonexistent/disable", {
      method: "PATCH",
      body: JSON.stringify({ disabled: true }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "nonexistent" }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("EMPLOYEE_001");
  });

  it("rejects invalid disabled parameter", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await PATCH(createRequest("http://localhost/api/v1/staff/staff-1/disable", {
      method: "PATCH",
      body: JSON.stringify({ disabled: "yes" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "staff-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("EMPLOYEE_007");
  });

  it("store_manager cannot disable staff from other store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.staff.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleStaff,
      staffStores: [{ storeId: "store-2" }], // different store
    });

    const res = await PATCH(createRequest("http://localhost/api/v1/staff/staff-1/disable", {
      method: "PATCH",
      body: JSON.stringify({ disabled: true }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "staff-1" }) });

    expect(res.status).toBe(404);
  });
});
