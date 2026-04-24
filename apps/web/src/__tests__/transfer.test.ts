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

// ── Mock dependencies before importing route handler ──
const mockTx = {
  staffStore: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    staff: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    staffStore: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => fn(mockTx)),
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

// Transfer route
import { POST as TRANSFER } from "@/app/api/v1/staff/[id]/transfer/route";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

// ── Helper to create a mock request ──
function createRequest(
  url: string,
  body?: unknown,
  options?: RequestInit,
): any {
  return new NextRequest(url, {
    method: "POST",
    ...options,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
}

// ── Helper contexts ──
const adminCtx = { staffId: "admin-1", role: "admin", storeId: "store-1" };
const managerCtx = { staffId: "mgr-1", role: "store_manager", storeId: "store-2" };
const staffCtx = { staffId: "staff-1", role: "staff", storeId: "store-1" };

// ── Mock staff data ──
const mockStaff = {
  id: "staff-1",
  name: "张三",
  username: "zhangsan",
  phone: "13800000001",
  role: "staff",
  deletedAt: null,
  staffStores: [
    { staffId: "staff-1", storeId: "store-1" },
    { staffId: "staff-1", storeId: "store-2" },
  ],
};

const mockStaffSingleStore = {
  ...mockStaff,
  staffStores: [{ staffId: "staff-1", storeId: "store-1" }],
};

const mockUpdatedStaff = {
  id: "staff-1",
  username: "zhangsan",
  phone: "13800000001",
  name: "张三",
  role: "staff",
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  staffStores: [
    { storeId: "store-2", store: { id: "store-2", name: "店铺二" } },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(null);
  // Restore $transaction implementation after clearAllMocks resets it
  (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    (fn: any) => fn(mockTx),
  );
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/v1/staff/[id]/transfer — Auth & RBAC
// ══════════════════════════════════════════════════════════════════════
describe("POST /api/v1/staff/[id]/transfer — Auth & RBAC", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await TRANSFER(
      createRequest(
        "http://localhost/api/v1/staff/staff-1/transfer",
        { fromStoreId: "store-1", toStoreId: "store-2" },
      ) as any,
      { params: Promise.resolve({ id: "staff-1" }) } as any,
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("AUTH_006");
  });

  it("returns 403 for store_manager role", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(
        JSON.stringify({
          success: false,
          error: { code: "PERMISSION_001", message: "权限不足" },
        }),
        { status: 403 },
      ),
    );

    const res = await TRANSFER(
      createRequest(
        "http://localhost/api/v1/staff/staff-1/transfer",
        { fromStoreId: "store-1", toStoreId: "store-2" },
      ) as any,
      { params: Promise.resolve({ id: "staff-1" }) } as any,
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 for staff role", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(
        JSON.stringify({
          success: false,
          error: { code: "PERMISSION_001", message: "权限不足" },
        }),
        { status: 403 },
      ),
    );

    const res = await TRANSFER(
      createRequest(
        "http://localhost/api/v1/staff/staff-1/transfer",
        { fromStoreId: "store-1", toStoreId: "store-2" },
      ) as any,
      { params: Promise.resolve({ id: "staff-1" }) } as any,
    );
    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/v1/staff/[id]/transfer — Validation
// ══════════════════════════════════════════════════════════════════════
describe("POST /api/v1/staff/[id]/transfer — Validation", () => {
  it("returns 400 when fromStoreId is missing", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await TRANSFER(
      createRequest(
        "http://localhost/api/v1/staff/staff-1/transfer",
        { toStoreId: "store-2" },
      ) as any,
      { params: Promise.resolve({ id: "staff-1" }) } as any,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("TRANSFER_004");
    expect(body.error.message).toBeTruthy(); // Validation message present
  });

  it("returns 400 when toStoreId is missing", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await TRANSFER(
      createRequest(
        "http://localhost/api/v1/staff/staff-1/transfer",
        { fromStoreId: "store-1" },
      ) as any,
      { params: Promise.resolve({ id: "staff-1" }) } as any,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("TRANSFER_004");
    expect(body.error.message).toBeTruthy(); // Validation message present
  });

  it("returns 400 when fromStoreId and toStoreId are the same", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await TRANSFER(
      createRequest(
        "http://localhost/api/v1/staff/staff-1/transfer",
        { fromStoreId: "store-1", toStoreId: "store-1" },
      ) as any,
      { params: Promise.resolve({ id: "staff-1" }) } as any,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("TRANSFER_004");
    expect(body.error.message).toContain("不能相同");
  });

  it("returns 400 when request body is not valid JSON", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const req = new NextRequest(
      "http://localhost/api/v1/staff/staff-1/transfer",
      {
        method: "POST",
        body: "not-json",
        headers: { "Content-Type": "application/json" },
      },
    );

    const res = await TRANSFER(
      req as any,
      { params: Promise.resolve({ id: "staff-1" }) } as any,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("TRANSFER_004");
  });
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/v1/staff/[id]/transfer — Business logic
// ══════════════════════════════════════════════════════════════════════
describe("POST /api/v1/staff/[id]/transfer — Business logic", () => {
  it("returns 404 when staff not found", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );

    const res = await TRANSFER(
      createRequest(
        "http://localhost/api/v1/staff/staff-1/transfer",
        { fromStoreId: "store-1", toStoreId: "store-2" },
      ) as any,
      { params: Promise.resolve({ id: "staff-1" }) } as any,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("TRANSFER_001");
    expect(body.error.message).toBe("员工不存在");
  });

  it("returns 400 when fromStoreId not in current assignments", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockStaff,
    );

    const res = await TRANSFER(
      createRequest(
        "http://localhost/api/v1/staff/staff-1/transfer",
        { fromStoreId: "store-99", toStoreId: "store-3" },
      ) as any,
      { params: Promise.resolve({ id: "staff-1" }) } as any,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("TRANSFER_002");
    expect(body.error.message).toBe("原店铺未分配给该员工");
  });

  it("returns 400 when staff has only one store (last store protection)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findFirst as ReturnType<
      typeof vi.fn
    >).mockResolvedValue(mockStaffSingleStore);

    const res = await TRANSFER(
      createRequest(
        "http://localhost/api/v1/staff/staff-1/transfer",
        { fromStoreId: "store-1", toStoreId: "store-2" },
      ) as any,
      { params: Promise.resolve({ id: "staff-1" }) } as any,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("TRANSFER_003");
    expect(body.error.message).toBe("员工至少需要保留一个店铺");
  });

  it("successfully transfers staff between stores", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockStaff,
    );
    (mockTx.staffStore.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      { count: 1 },
    );
    (mockTx.staffStore.createMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      { count: 1 },
    );
    (mockPrisma.staff.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockUpdatedStaff,
    );

    const res = await TRANSFER(
      createRequest(
        "http://localhost/api/v1/staff/staff-1/transfer",
        { fromStoreId: "store-1", toStoreId: "store-2" },
      ) as any,
      { params: Promise.resolve({ id: "staff-1" }) } as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe("staff-1");

    // Verify transaction operations were called
    expect(mockTx.staffStore.deleteMany).toHaveBeenCalledWith({
      where: { staffId: "staff-1", storeId: "store-1" },
    });
    expect(mockTx.staffStore.createMany).toHaveBeenCalledWith({
      data: [{ staffId: "staff-1", storeId: "store-2" }],
      skipDuplicates: true,
    });
  });

  it("returns 500 when DB transaction fails", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockStaff,
    );
    (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      () => Promise.reject(new Error("DB connection lost")),
    );

    const res = await TRANSFER(
      createRequest(
        "http://localhost/api/v1/staff/staff-1/transfer",
        { fromStoreId: "store-1", toStoreId: "store-2" },
      ) as any,
      { params: Promise.resolve({ id: "staff-1" }) } as any,
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("TRANSFER_004");
    expect(body.error.message).toBe("调动失败");
  });

  it("uses skipDuplicates when creating new StaffStore record", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockStaff,
    );
    (mockTx.staffStore.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      { count: 1 },
    );
    (mockTx.staffStore.createMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      { count: 1 },
    );
    (mockPrisma.staff.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockUpdatedStaff,
    );

    await TRANSFER(
      createRequest(
        "http://localhost/api/v1/staff/staff-1/transfer",
        { fromStoreId: "store-1", toStoreId: "store-3" },
      ) as any,
      { params: Promise.resolve({ id: "staff-1" }) } as any,
    );

    const createManyCall = (
      mockTx.staffStore.createMany as ReturnType<typeof vi.fn>
    ).mock.calls[0][0] as any;
    expect(createManyCall.skipDuplicates).toBe(true);
  });
});
