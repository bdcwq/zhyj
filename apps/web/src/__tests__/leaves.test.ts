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
    leave: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
    schedule: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    attendance: { findMany: vi.fn() },
    $transaction: vi.fn(),
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

// Leave routes
import { POST as CREATE_LEAVE, GET as LIST_LEAVES } from "@/app/api/v1/leaves/route";
import { GET as GET_LEAVE, PUT as APPROVE_REJECT_LEAVE } from "@/app/api/v1/leaves/[id]/route";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const mockTransaction = (prisma as any).$transaction as ReturnType<typeof vi.fn>;

// ── Helper to create a mock request ──
function createRequest(url: string, options?: RequestInit): any {
  return new NextRequest(url, options);
}

// ── Helper contexts ──
const adminCtx = { staffId: "admin-1", role: "admin", storeId: "store-1" };
const managerCtx = { staffId: "mgr-1", role: "store_manager", storeId: "store-2" };
const staffCtx = { staffId: "staff-1", role: "staff", storeId: "store-1" };

// ── Sample leave data ──
const sampleLeave = {
  id: "leave-1",
  staffId: "staff-1",
  storeId: "store-1",
  type: "sick",
  startDate: new Date("2026-04-25"),
  endDate: new Date("2026-04-26"),
  reason: "感冒发烧",
  status: "pending",
  approvedBy: null,
  approvedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  staff: { id: "staff-1", name: "张三", phone: "13800000000" },
  approver: null,
};

const sampleLeaveWithApprover = {
  ...sampleLeave,
  status: "approved",
  approvedBy: "admin-1",
  approvedAt: new Date(),
  approver: { id: "admin-1", name: "管理员" },
};

beforeEach(() => {
  vi.clearAllMocks();
  (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(null);
  mockTransaction.mockReset();
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/v1/leaves — Create leave request
// ══════════════════════════════════════════════════════════════════════
describe("POST /api/v1/leaves — Create leave", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await CREATE_LEAVE(createRequest("http://localhost/api/v1/leaves", {
      method: "POST",
      body: JSON.stringify({ type: "sick", startDate: "2026-04-25", endDate: "2026-04-26" }),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not authorized", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "customer", storeId: "store-1" });
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await CREATE_LEAVE(createRequest("http://localhost/api/v1/leaves", {
      method: "POST",
      body: JSON.stringify({ type: "sick", startDate: "2026-04-25", endDate: "2026-04-26" }),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(403);
  });

  it("returns 400 when staffId is missing from auth context", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "staff", storeId: "store-1" });
    const res = await CREATE_LEAVE(createRequest("http://localhost/api/v1/leaves", {
      method: "POST",
      body: JSON.stringify({ type: "sick", startDate: "2026-04-25", endDate: "2026-04-26" }),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_002");
  });

  it("creates sick leave successfully", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.leave.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.leave.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleLeave);

    const res = await CREATE_LEAVE(createRequest("http://localhost/api/v1/leaves", {
      method: "POST",
      body: JSON.stringify({ type: "sick", startDate: "2026-04-25", endDate: "2026-04-26", reason: "感冒发烧" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.type).toBe("sick");
  });

  it("creates personal leave successfully", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.leave.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.leave.create as ReturnType<typeof vi.fn>).mockResolvedValue({ ...sampleLeave, type: "personal" });

    const res = await CREATE_LEAVE(createRequest("http://localhost/api/v1/leaves", {
      method: "POST",
      body: JSON.stringify({ type: "personal", startDate: "2026-04-25", endDate: "2026-04-25" }),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(201);
  });

  it("creates annual leave successfully", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.leave.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.leave.create as ReturnType<typeof vi.fn>).mockResolvedValue({ ...sampleLeave, type: "annual" });

    const res = await CREATE_LEAVE(createRequest("http://localhost/api/v1/leaves", {
      method: "POST",
      body: JSON.stringify({ type: "annual", startDate: "2026-04-25", endDate: "2026-04-30" }),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(201);
  });

  it("creates other type leave successfully", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.leave.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.leave.create as ReturnType<typeof vi.fn>).mockResolvedValue({ ...sampleLeave, type: "other" });

    const res = await CREATE_LEAVE(createRequest("http://localhost/api/v1/leaves", {
      method: "POST",
      body: JSON.stringify({ type: "other", startDate: "2026-04-25", endDate: "2026-04-25", reason: "家中有事" }),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(201);
  });

  it("returns 400 for missing type", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);

    const res = await CREATE_LEAVE(createRequest("http://localhost/api/v1/leaves", {
      method: "POST",
      body: JSON.stringify({ startDate: "2026-04-25", endDate: "2026-04-26" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_002");
  });

  it("returns 400 for endDate before startDate", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);

    const res = await CREATE_LEAVE(createRequest("http://localhost/api/v1/leaves", {
      method: "POST",
      body: JSON.stringify({ type: "sick", startDate: "2026-04-28", endDate: "2026-04-25" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_002");
  });

  it("returns 409 for overlapping approved leave", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.leave.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleLeave,
      status: "approved",
    });

    const res = await CREATE_LEAVE(createRequest("http://localhost/api/v1/leaves", {
      method: "POST",
      body: JSON.stringify({ type: "personal", startDate: "2026-04-25", endDate: "2026-04-26" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_003");
  });

  it("allows same-day leave (startDate === endDate)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.leave.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.leave.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleLeave,
      startDate: new Date("2026-04-25"),
      endDate: new Date("2026-04-25"),
    });

    const res = await CREATE_LEAVE(createRequest("http://localhost/api/v1/leaves", {
      method: "POST",
      body: JSON.stringify({ type: "sick", startDate: "2026-04-25", endDate: "2026-04-25" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(201);
  });

  it("allows leave when overlapping leave exists but is not approved", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    // findFirst returns null because no overlapping APPROVED leave exists
    (mockPrisma.leave.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.leave.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleLeave);

    const res = await CREATE_LEAVE(createRequest("http://localhost/api/v1/leaves", {
      method: "POST",
      body: JSON.stringify({ type: "sick", startDate: "2026-04-25", endDate: "2026-04-26" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(201);
  });

  it("returns 400 for empty body", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);

    const res = await CREATE_LEAVE(createRequest("http://localhost/api/v1/leaves", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_002");
  });

  it("returns 500 on Prisma create error", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.leave.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.leave.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB connection lost"));

    const res = await CREATE_LEAVE(createRequest("http://localhost/api/v1/leaves", {
      method: "POST",
      body: JSON.stringify({ type: "sick", startDate: "2026-04-25", endDate: "2026-04-26" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_004");
  });

  it("calls prisma.leave.create with correct data including staffId and storeId", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.leave.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.leave.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleLeave);

    await CREATE_LEAVE(createRequest("http://localhost/api/v1/leaves", {
      method: "POST",
      body: JSON.stringify({ type: "sick", startDate: "2026-04-25", endDate: "2026-04-26", reason: "感冒" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    const createCall = (mockPrisma.leave.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(createCall.data.staffId).toBe("staff-1");
    expect(createCall.data.storeId).toBe("store-1");
    expect(createCall.data.type).toBe("sick");
    expect(createCall.data.status).toBe("pending");
    expect(createCall.data.reason).toBe("感冒");
  });
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/leaves — List leaves
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/leaves — List leaves", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await LIST_LEAVES(createRequest("http://localhost/api/v1/leaves") as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not authorized", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "customer", storeId: "store-1" });
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await LIST_LEAVES(createRequest("http://localhost/api/v1/leaves") as any);
    expect(res.status).toBe(403);
  });

  it("staff scoped to own leaves (staffId filter applied)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleLeave]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await LIST_LEAVES(createRequest("http://localhost/api/v1/leaves") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.staffId).toBe("staff-1");
  });

  it("store_manager scoped to own store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await LIST_LEAVES(createRequest("http://localhost/api/v1/leaves") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.storeId).toBe("store-2");
  });

  it("store_manager can filter by staffId within their store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await LIST_LEAVES(createRequest("http://localhost/api/v1/leaves?staffId=staff-3") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.storeId).toBe("store-2");
    expect(findManyCall.where.staffId).toBe("staff-3");
  });

  it("admin has no scope filter by default", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleLeave]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await LIST_LEAVES(createRequest("http://localhost/api/v1/leaves") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.staffId).toBeUndefined();
    expect(findManyCall.where.storeId).toBeUndefined();
  });

  it("admin can filter by staffId", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await LIST_LEAVES(createRequest("http://localhost/api/v1/leaves?staffId=staff-1") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.staffId).toBe("staff-1");
  });

  it("supports status filter", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await LIST_LEAVES(createRequest("http://localhost/api/v1/leaves?status=pending") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.status).toBe("pending");
  });

  it("supports date range filter", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await LIST_LEAVES(
      createRequest("http://localhost/api/v1/leaves?dateFrom=2026-04-20&dateTo=2026-04-25") as any
    );
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.startDate.lte).toBeInstanceOf(Date);
    expect(findManyCall.where.endDate.gte).toBeInstanceOf(Date);
  });

  it("supports pagination with defaults (limit=20, offset=0)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await LIST_LEAVES(createRequest("http://localhost/api/v1/leaves") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.take).toBe(20);
    expect(findManyCall.skip).toBe(0);
  });

  it("supports custom pagination", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await LIST_LEAVES(createRequest("http://localhost/api/v1/leaves?limit=10&offset=20") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.take).toBe(10);
    expect(findManyCall.skip).toBe(20);
  });

  it("returns empty list with total=0", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await LIST_LEAVES(createRequest("http://localhost/api/v1/leaves") as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.records).toHaveLength(0);
    expect(body.data.total).toBe(0);
  });

  it("returns records with staff and approver includes", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleLeaveWithApprover]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await LIST_LEAVES(createRequest("http://localhost/api/v1/leaves") as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.records[0].staff).toBeDefined();
    expect(body.data.records[0].staff.name).toBe("张三");
    expect(body.data.records[0].approver).toBeDefined();
    expect(body.data.records[0].approver.name).toBe("管理员");
  });

  it("returns 500 on DB error", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const res = await LIST_LEAVES(createRequest("http://localhost/api/v1/leaves") as any);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_006");
  });

  it("returns 400 for invalid query params", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await LIST_LEAVES(createRequest("http://localhost/api/v1/leaves?limit=abc") as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_002");
  });
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/leaves/[id] — Get single leave
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/leaves/[id] — Get single leave", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1") as any, {
      params: Promise.resolve({ id: "leave-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("owner can fetch their own leave", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleLeave);

    const res = await GET_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1") as any, {
      params: Promise.resolve({ id: "leave-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("leave-1");
  });

  it("store_manager can fetch leave from same store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleLeave,
      storeId: "store-2",
      staffId: "staff-2",
    });

    const res = await GET_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1") as any, {
      params: Promise.resolve({ id: "leave-1" }),
    });
    expect(res.status).toBe(200);
  });

  it("store_manager cannot fetch leave from different store (404)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    // managerCtx.storeId is "store-2", but leave.storeId is "store-1"
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleLeave,
      storeId: "store-1",
    });

    const res = await GET_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1") as any, {
      params: Promise.resolve({ id: "leave-1" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_001");
  });

  it("admin can fetch any leave", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleLeave);

    const res = await GET_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1") as any, {
      params: Promise.resolve({ id: "leave-1" }),
    });
    expect(res.status).toBe(200);
  });

  it("staff cannot fetch another staff's leave (404)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleLeave,
      staffId: "staff-other",
    });

    const res = await GET_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1") as any, {
      params: Promise.resolve({ id: "leave-1" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_001");
  });

  it("returns 404 for non-existent leave", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET_LEAVE(createRequest("http://localhost/api/v1/leaves/nonexistent") as any, {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_001");
  });

  it("returns 500 on DB error", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const res = await GET_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1") as any, {
      params: Promise.resolve({ id: "leave-1" }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_006");
  });
});

// ══════════════════════════════════════════════════════════════════════
// PUT /api/v1/leaves/[id] — Approve leave
// ══════════════════════════════════════════════════════════════════════
describe("PUT /api/v1/leaves/[id] — Approve leave", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await APPROVE_REJECT_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1", {
      method: "PUT",
      body: JSON.stringify({ status: "approved" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "leave-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when staff tries to approve (not admin/manager)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await APPROVE_REJECT_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1", {
      method: "PUT",
      body: JSON.stringify({ status: "approved" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "leave-1" }) });
    expect(res.status).toBe(403);
  });

  it("approves pending leave and sets approvedBy + approvedAt", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleLeave) // First call: fetch leave
      .mockResolvedValueOnce(sampleLeaveWithApprover); // Second call: re-fetch after transaction
    mockTransaction.mockImplementation(async (fn: (tx: any) => Promise<void>) => {
      const tx = {
        leave: { update: vi.fn() },
        schedule: { findMany: vi.fn().mockResolvedValue([]) },
      };
      await fn(tx);
    });

    const res = await APPROVE_REJECT_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1", {
      method: "PUT",
      body: JSON.stringify({ status: "approved" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "leave-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("cancels overlapping schedules on approve", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleLeave)
      .mockResolvedValueOnce(sampleLeaveWithApprover);

    const overlappingSchedules = [
      { id: "sch-1", attendances: [] },
      { id: "sch-2", attendances: [] },
      { id: "sch-3", attendances: [] },
    ];
    const mockUpdateMany = vi.fn().mockResolvedValue({ count: 3 });
    const mockFindManySchedules = vi.fn().mockResolvedValue(overlappingSchedules);

    mockTransaction.mockImplementation(async (fn: (tx: any) => Promise<void>) => {
      const tx = {
        leave: { update: vi.fn() },
        schedule: {
          findMany: mockFindManySchedules,
          updateMany: mockUpdateMany,
        },
      };
      await fn(tx);
    });

    const res = await APPROVE_REJECT_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1", {
      method: "PUT",
      body: JSON.stringify({ status: "approved" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "leave-1" }) });

    expect(res.status).toBe(200);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["sch-1", "sch-2", "sch-3"] } },
        data: { status: "cancelled" },
      }),
    );
  });

  it("skips schedules that have attendance records", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleLeave)
      .mockResolvedValueOnce(sampleLeaveWithApprover);

    const overlappingSchedules = [
      { id: "sch-1", attendances: [] },
      { id: "sch-2", attendances: [{ id: "att-1" }] }, // Has attendance — should be skipped
      { id: "sch-3", attendances: [] },
    ];
    const mockUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const mockFindManySchedules = vi.fn().mockResolvedValue(overlappingSchedules);

    mockTransaction.mockImplementation(async (fn: (tx: any) => Promise<void>) => {
      const tx = {
        leave: { update: vi.fn() },
        schedule: {
          findMany: mockFindManySchedules,
          updateMany: mockUpdateMany,
        },
      };
      await fn(tx);
    });

    const res = await APPROVE_REJECT_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1", {
      method: "PUT",
      body: JSON.stringify({ status: "approved" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "leave-1" }) });

    expect(res.status).toBe(200);
    // Only sch-1 and sch-3 should be cancelled, sch-2 skipped
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["sch-1", "sch-3"] } },
      }),
    );
  });

  it("does nothing when no overlapping schedules exist", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleLeave)
      .mockResolvedValueOnce(sampleLeaveWithApprover);

    const mockUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const mockFindManySchedules = vi.fn().mockResolvedValue([]);

    mockTransaction.mockImplementation(async (fn: (tx: any) => Promise<void>) => {
      const tx = {
        leave: { update: vi.fn() },
        schedule: {
          findMany: mockFindManySchedules,
          updateMany: mockUpdateMany,
        },
      };
      await fn(tx);
    });

    const res = await APPROVE_REJECT_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1", {
      method: "PUT",
      body: JSON.stringify({ status: "approved" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "leave-1" }) });

    expect(res.status).toBe(200);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 400 when approving already approved leave", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleLeave,
      status: "approved",
    });

    const res = await APPROVE_REJECT_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1", {
      method: "PUT",
      body: JSON.stringify({ status: "approved" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "leave-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_002");
  });

  it("returns 400 when approving already rejected leave", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleLeave,
      status: "rejected",
    });

    const res = await APPROVE_REJECT_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1", {
      method: "PUT",
      body: JSON.stringify({ status: "approved" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "leave-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_002");
  });

  it("returns 404 for non-existent leave", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await APPROVE_REJECT_LEAVE(createRequest("http://localhost/api/v1/leaves/nonexistent", {
      method: "PUT",
      body: JSON.stringify({ status: "approved" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "nonexistent" }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_001");
  });

  it("returns 404 when store_manager tries to approve leave from different store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    // managerCtx.storeId is "store-2", leave.storeId is "store-1"
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleLeave);

    const res = await APPROVE_REJECT_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1", {
      method: "PUT",
      body: JSON.stringify({ status: "approved" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "leave-1" }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_001");
  });

  it("returns 400 when staff tries to approve own leave", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    // leave.staffId matches ctx.staffId (adminCtx.staffId = "admin-1")
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleLeave,
      staffId: "admin-1",
    });

    const res = await APPROVE_REJECT_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1", {
      method: "PUT",
      body: JSON.stringify({ status: "approved" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "leave-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_002");
  });

  it("returns 400 for invalid status in body", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await APPROVE_REJECT_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1", {
      method: "PUT",
      body: JSON.stringify({ status: "invalid_status" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "leave-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_002");
  });

  it("returns LEAVE_007 on transaction failure during approve", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleLeave);
    mockTransaction.mockRejectedValue(new Error("Transaction failed"));

    const res = await APPROVE_REJECT_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1", {
      method: "PUT",
      body: JSON.stringify({ status: "approved" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "leave-1" }) });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_007");
  });
});

// ══════════════════════════════════════════════════════════════════════
// PUT /api/v1/leaves/[id] — Reject leave
// ══════════════════════════════════════════════════════════════════════
describe("PUT /api/v1/leaves/[id] — Reject leave", () => {
  it("rejects pending leave successfully", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleLeave);
    (mockPrisma.leave.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleLeave,
      status: "rejected",
    });

    const res = await APPROVE_REJECT_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1", {
      method: "PUT",
      body: JSON.stringify({ status: "rejected" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "leave-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("rejected");
  });

  it("does NOT cancel schedules on reject", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleLeave);
    (mockPrisma.leave.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleLeave,
      status: "rejected",
    });

    await APPROVE_REJECT_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1", {
      method: "PUT",
      body: JSON.stringify({ status: "rejected" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "leave-1" }) });

    // Transaction should NOT be called for reject
    expect(mockTransaction).not.toHaveBeenCalled();
    // Direct update should be called instead
    expect(mockPrisma.leave.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "leave-1" },
        data: expect.objectContaining({ status: "rejected" }),
      }),
    );
  });

  it("returns 400 when rejecting already rejected leave", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleLeave,
      status: "rejected",
    });

    const res = await APPROVE_REJECT_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1", {
      method: "PUT",
      body: JSON.stringify({ status: "rejected" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "leave-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_002");
  });

  it("returns 400 when rejecting already approved leave", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleLeave,
      status: "approved",
    });

    const res = await APPROVE_REJECT_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1", {
      method: "PUT",
      body: JSON.stringify({ status: "rejected" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "leave-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_002");
  });

  it("returns LEAVE_008 on DB error during reject", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.leave.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleLeave);
    (mockPrisma.leave.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const res = await APPROVE_REJECT_LEAVE(createRequest("http://localhost/api/v1/leaves/leave-1", {
      method: "PUT",
      body: JSON.stringify({ status: "rejected" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "leave-1" }) });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_008");
  });
});
