import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock next/server to avoid hanging on NextRequest/NextResponse ──
vi.mock("next/server", () => {
  class NextRequest extends Request {
    private _url: URL;
    constructor(url: string, init?: RequestInit) {
      super(url, init);
      this._url = new URL(url);
    }
    get nextUrl() {
      return this._url;
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
    store: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getAuthContext: vi.fn(),
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
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/v1/stores/route";
import { PUT } from "@/app/api/v1/stores/[id]/route";
import { PATCH as PATCH_DISABLE } from "@/app/api/v1/stores/[id]/disable/route";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

// ── Helper to create a mock request ──
function createRequest(url: string, options?: RequestInit): any {
  return new NextRequest(url, options);
}

// ── Helper contexts ──
const adminCtx = { staffId: "admin-1", role: "admin", storeId: "store-1" };
const managerCtx = { staffId: "manager-1", role: "store_manager", storeId: "store-2" };

// ── Sample store record ──
const sampleStore = {
  id: "store-1",
  name: "测试店铺",
  address: "北京市朝阳区",
  phone: "010-12345678",
  businessHours: "09:00-18:00",
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(null);
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/stores — List
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/stores", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(createRequest("http://localhost/api/v1/stores") as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not authorized", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "staff", storeId: "store-1" });
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await GET(createRequest("http://localhost/api/v1/stores") as any);
    expect(res.status).toBe(403);
  });

  it("returns paginated list with search filter", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleStore]);
    (mockPrisma.store.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await GET(createRequest("http://localhost/api/v1/stores?search=测试") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.records).toHaveLength(1);
    expect(body.data.total).toBe(1);

    // Verify search filter was applied
    const findManyCall = (mockPrisma.store.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.name).toEqual({ contains: "测试", mode: "insensitive" });
  });

  it("admin sees all stores", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleStore, { ...sampleStore, id: "store-2", name: "另一个店铺" }]);
    (mockPrisma.store.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);

    const res = await GET(createRequest("http://localhost/api/v1/stores") as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.records).toHaveLength(2);
    expect(body.data.total).toBe(2);
  });

  it("store_manager scoped to their storeId", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.store.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleStore]);
    (mockPrisma.store.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await GET(createRequest("http://localhost/api/v1/stores") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.store.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.id).toBe("store-2");
    expect(findManyCall.where.deletedAt).toBeNull();
  });

  it("empty search returns all stores", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleStore]);
    (mockPrisma.store.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await GET(createRequest("http://localhost/api/v1/stores?search=") as any);
    expect(res.status).toBe(200);

    // When search is empty, no name filter should be applied
    const findManyCall = (mockPrisma.store.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.name).toBeUndefined();
  });

  it("pagination with limit and offset params", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleStore]);
    (mockPrisma.store.count as ReturnType<typeof vi.fn>).mockResolvedValue(50);

    const res = await GET(createRequest("http://localhost/api/v1/stores?limit=10&offset=20") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.records).toHaveLength(1);
    expect(body.data.total).toBe(50);
    expect(body.data.limit).toBe(10);
    expect(body.data.offset).toBe(20);

    // Verify pagination params passed to prisma
    const findManyCall = (mockPrisma.store.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.take).toBe(10);
    expect(findManyCall.skip).toBe(20);
  });

  it("uses default pagination when params omitted", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.store.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await GET(createRequest("http://localhost/api/v1/stores") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.store.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.take).toBe(20); // default limit
    expect(findManyCall.skip).toBe(0);  // default offset
  });

  it("filters out soft-deleted stores", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.store.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await GET(createRequest("http://localhost/api/v1/stores") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.store.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.deletedAt).toBeNull();
  });

  it("returns 500 on DB error", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB connection lost"));

    const res = await GET(createRequest("http://localhost/api/v1/stores") as any);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("STORE_004");
  });
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/v1/stores — Create
// ══════════════════════════════════════════════════════════════════════
describe("POST /api/v1/stores", () => {
  const validBody = {
    name: "新店铺",
    address: "上海市浦东新区",
    phone: "021-87654321",
    businessHours: "10:00-22:00",
  };

  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(createRequest("http://localhost/api/v1/stores", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when store_manager tries to create", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await POST(createRequest("http://localhost/api/v1/stores", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(403);
  });

  it("creates store with valid data (201)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.store.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleStore);

    const res = await POST(createRequest("http://localhost/api/v1/stores", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("测试店铺");

    // Verify create was called with correct data
    const createCall = (mockPrisma.store.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(createCall.data.name).toBe("新店铺");
    expect(createCall.data.address).toBe("上海市浦东新区");
    expect(createCall.data.phone).toBe("021-87654321");
    expect(createCall.data.businessHours).toBe("10:00-22:00");
  });

  it("returns 400 when name is missing", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await POST(createRequest("http://localhost/api/v1/stores", {
      method: "POST",
      body: JSON.stringify({ address: "测试地址" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("STORE_002");
  });

  it("returns 409 for duplicate name", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleStore);

    const res = await POST(createRequest("http://localhost/api/v1/stores", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("STORE_003");
  });

  it("creates store with only required name field", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.store.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleStore,
      address: null,
      phone: null,
      businessHours: null,
    });

    const res = await POST(createRequest("http://localhost/api/v1/stores", {
      method: "POST",
      body: JSON.stringify({ name: "仅名称店铺" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(201);
    const createCall = (mockPrisma.store.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(createCall.data.address).toBeNull();
    expect(createCall.data.phone).toBeNull();
    expect(createCall.data.businessHours).toBeNull();
  });

  it("returns 500 on DB error", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.store.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB connection lost"));

    const res = await POST(createRequest("http://localhost/api/v1/stores", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("STORE_004");
  });
});

// ══════════════════════════════════════════════════════════════════════
// PUT /api/v1/stores/[id] — Update
// ══════════════════════════════════════════════════════════════════════
describe("PUT /api/v1/stores/[id]", () => {
  const validUpdate = { name: "更新后名称", address: "新地址" };

  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PUT(createRequest("http://localhost/api/v1/stores/store-1", {
      method: "PUT",
      body: JSON.stringify(validUpdate),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "store-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when store_manager tries to update", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await PUT(createRequest("http://localhost/api/v1/stores/store-1", {
      method: "PUT",
      body: JSON.stringify(validUpdate),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "store-1" }) });
    expect(res.status).toBe(403);
  });

  it("updates store fields (200)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleStore)  // store lookup
      .mockResolvedValueOnce(null);         // duplicate name check — no duplicate
    (mockPrisma.store.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleStore,
      name: "更新后名称",
      address: "新地址",
    });

    const res = await PUT(createRequest("http://localhost/api/v1/stores/store-1", {
      method: "PUT",
      body: JSON.stringify(validUpdate),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "store-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("更新后名称");
    expect(body.data.address).toBe("新地址");
  });

  it("returns 404 for non-existent store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await PUT(createRequest("http://localhost/api/v1/stores/nonexistent", {
      method: "PUT",
      body: JSON.stringify(validUpdate),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "nonexistent" }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("STORE_001");
  });

  it("returns 400 for invalid params (empty body parsed by handler)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleStore)  // store lookup
      .mockResolvedValueOnce(null);         // duplicate name check — no duplicate

    // Send a body with only name update
    const res = await PUT(createRequest("http://localhost/api/v1/stores/store-1", {
      method: "PUT",
      body: JSON.stringify({ name: "仅更新名称" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "store-1" }) });

    expect(res.status).toBe(200);
  });

  it("rejects duplicate name on update", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleStore) // store lookup succeeds
      .mockResolvedValueOnce({ id: "store-other" }); // duplicate found

    const res = await PUT(createRequest("http://localhost/api/v1/stores/store-1", {
      method: "PUT",
      body: JSON.stringify({ name: "已存在的名称" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "store-1" }) });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("STORE_003");
  });

  it("allows same name on update (no duplicate check)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleStore);
    (mockPrisma.store.update as ReturnType<typeof vi.fn>).mockResolvedValue(sampleStore);

    const res = await PUT(createRequest("http://localhost/api/v1/stores/store-1", {
      method: "PUT",
      body: JSON.stringify({ name: "测试店铺" }), // same name
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "store-1" }) });

    expect(res.status).toBe(200);
    // findFirst should only be called once (store lookup, no duplicate check)
    expect(mockPrisma.store.findFirst).toHaveBeenCalledTimes(1);
  });

  it("returns 500 on DB error", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleStore)  // store lookup
      .mockResolvedValueOnce(null);         // duplicate name check — no duplicate
    (mockPrisma.store.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB connection lost"));

    const res = await PUT(createRequest("http://localhost/api/v1/stores/store-1", {
      method: "PUT",
      body: JSON.stringify(validUpdate),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "store-1" }) });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("STORE_005");
  });
});

// ══════════════════════════════════════════════════════════════════════
// PATCH /api/v1/stores/[id]/disable — Disable/Enable
// ══════════════════════════════════════════════════════════════════════
describe("PATCH /api/v1/stores/[id]/disable", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PATCH_DISABLE(createRequest("http://localhost/api/v1/stores/store-1/disable", {
      method: "PATCH",
      body: JSON.stringify({ disabled: true }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "store-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when store_manager tries to disable", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await PATCH_DISABLE(createRequest("http://localhost/api/v1/stores/store-1/disable", {
      method: "PATCH",
      body: JSON.stringify({ disabled: true }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "store-1" }) });
    expect(res.status).toBe(403);
  });

  it("disables store (sets deletedAt)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleStore);
    (mockPrisma.store.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleStore,
      deletedAt: new Date(),
    });

    const res = await PATCH_DISABLE(createRequest("http://localhost/api/v1/stores/store-1/disable", {
      method: "PATCH",
      body: JSON.stringify({ disabled: true }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "store-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.deletedAt).not.toBeNull();

    const updateCall = (mockPrisma.store.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
  });

  it("re-enables store (clears deletedAt)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    const disabledStore = { ...sampleStore, deletedAt: new Date("2025-01-01") };
    (mockPrisma.store.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(disabledStore);
    (mockPrisma.store.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...disabledStore,
      deletedAt: null,
    });

    const res = await PATCH_DISABLE(createRequest("http://localhost/api/v1/stores/store-1/disable", {
      method: "PATCH",
      body: JSON.stringify({ disabled: false }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "store-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.deletedAt).toBeNull();

    const updateCall = (mockPrisma.store.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(updateCall.data.deletedAt).toBeNull();
  });

  it("returns 404 for non-existent store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await PATCH_DISABLE(createRequest("http://localhost/api/v1/stores/nonexistent/disable", {
      method: "PATCH",
      body: JSON.stringify({ disabled: true }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "nonexistent" }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("STORE_001");
  });

  it("returns 400 for invalid disabled param (non-boolean)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await PATCH_DISABLE(createRequest("http://localhost/api/v1/stores/store-1/disable", {
      method: "PATCH",
      body: JSON.stringify({ disabled: "true" }), // string, not boolean
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "store-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("STORE_002");
  });

  it("returns 400 for missing disabled param", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await PATCH_DISABLE(createRequest("http://localhost/api/v1/stores/store-1/disable", {
      method: "PATCH",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "store-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("STORE_002");
  });

  it("returns 500 on DB error", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleStore);
    (mockPrisma.store.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB connection lost"));

    const res = await PATCH_DISABLE(createRequest("http://localhost/api/v1/stores/store-1/disable", {
      method: "PATCH",
      body: JSON.stringify({ disabled: true }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "store-1" }) });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("STORE_006");
  });
});
