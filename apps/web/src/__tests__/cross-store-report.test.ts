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
vi.mock("@/lib/db", () => ({
  prisma: {
    store: {
      findMany: vi.fn(),
    },
    monitoringRecord: {
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    appointment: {
      groupBy: vi.fn(),
    },
    resident: {
      count: vi.fn(),
    },
    staffStore: {
      count: vi.fn(),
    },
    $queryRaw: vi.fn(),
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

// Cross-store report route
import { GET as CROSS_STORE_REPORT } from "@/app/api/v1/statistics/cross-store/route";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

// ── Helper to create a mock request ──
function createRequest(url: string, options?: RequestInit): any {
  return new NextRequest(url, options);
}

// ── Helper contexts ──
const adminCtx = { staffId: "admin-1", role: "admin", storeId: "store-1" };
const managerCtx = { staffId: "mgr-1", role: "store_manager", storeId: "store-2" };
const staffCtx = { staffId: "staff-1", role: "staff", storeId: "store-1" };

const mockStores = [
  { id: "store-1", name: "旗舰店" },
  { id: "store-2", name: "分店A" },
];

beforeEach(() => {
  vi.clearAllMocks();
  (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(null);
  (mockPrisma.store.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockStores);
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/statistics/cross-store — Authentication & RBAC
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/statistics/cross-store — Authentication & RBAC", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await CROSS_STORE_REPORT(createRequest("http://localhost/api/v1/statistics/cross-store") as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("AUTH_006");
  });

  it("returns 403 for non-admin roles (store_manager)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await CROSS_STORE_REPORT(createRequest("http://localhost/api/v1/statistics/cross-store") as any);
    expect(res.status).toBe(403);
  });

  it("returns 403 for staff role", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await CROSS_STORE_REPORT(createRequest("http://localhost/api/v1/statistics/cross-store") as any);
    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/statistics/cross-store — Validation
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/statistics/cross-store — Validation", () => {
  it("returns STAT_001 for invalid period value", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    const res = await CROSS_STORE_REPORT(
      createRequest("http://localhost/api/v1/statistics/cross-store?period=yearly") as any
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("STAT_001");
  });

  it("returns STAT_001 for invalid date format", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    const res = await CROSS_STORE_REPORT(
      createRequest("http://localhost/api/v1/statistics/cross-store?dateFrom=not-a-date") as any
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("STAT_001");
  });

  it("returns STAT_001 when dateFrom is after dateTo", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    const res = await CROSS_STORE_REPORT(
      createRequest("http://localhost/api/v1/statistics/cross-store?dateFrom=2026-04-30&dateTo=2026-04-01") as any
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("STAT_001");
  });

  it("returns STAT_001 for date range exceeding 365 days", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    const res = await CROSS_STORE_REPORT(
      createRequest("http://localhost/api/v1/statistics/cross-store?dateFrom=2024-01-01&dateTo=2026-04-01") as any
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("STAT_001");
  });

  it("returns STAT_001 for invalid metric value", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    const res = await CROSS_STORE_REPORT(
      createRequest("http://localhost/api/v1/statistics/cross-store?metric=invalid") as any
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("STAT_001");
  });
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/statistics/cross-store — Overview metric (default)
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/statistics/cross-store — Overview metric", () => {
  it("returns per-store metrics for multiple stores", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    // First store (旗舰店)
    (mockPrisma.monitoringRecord.count as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(5);
    (mockPrisma.monitoringRecord.aggregate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ _avg: { score: 85.5 } })
      .mockResolvedValueOnce({ _avg: { score: null } });
    (mockPrisma.appointment.groupBy as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { status: "booked", _count: 20 },
        { status: "completed", _count: 15 },
        { status: "no_show", _count: 3 },
        { status: "cancelled", _count: 2 },
      ])
      .mockResolvedValueOnce([
        { status: "booked", _count: 8 },
        { status: "completed", _count: 6 },
      ]);
    (mockPrisma.resident.count as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3);
    (mockPrisma.staffStore.count as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(8);

    const res = await CROSS_STORE_REPORT(
      createRequest(
        "http://localhost/api/v1/statistics/cross-store?dateFrom=2026-04-01&dateTo=2026-04-30"
      ) as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.stores).toHaveLength(2);

    // Verify first store
    const store1 = body.data.stores[0];
    expect(store1.storeId).toBe("store-1");
    expect(store1.storeName).toBe("旗舰店");
    expect(store1.monitoringCount).toBe(10);
    expect(store1.avgScore).toBe(85.5);
    expect(store1.booked).toBe(20);
    expect(store1.completed).toBe(15);
    expect(store1.no_show).toBe(3);
    expect(store1.cancelled).toBe(2);
    expect(store1.newResidentsCount).toBe(5);
    expect(store1.staffCount).toBe(12);

    // Verify second store
    const store2 = body.data.stores[1];
    expect(store2.storeId).toBe("store-2");
    expect(store2.storeName).toBe("分店A");
    expect(store2.monitoringCount).toBe(5);
    expect(store2.avgScore).toBeNull();
    expect(store2.newResidentsCount).toBe(3);
    expect(store2.staffCount).toBe(8);

    // Verify response metadata
    expect(body.data.period).toBe("daily");
    expect(body.data.dateFrom).toBe("2026-04-01");
    expect(body.data.dateTo).toBe("2026-04-30");
  });

  it("returns empty array when no stores exist", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await CROSS_STORE_REPORT(
      createRequest("http://localhost/api/v1/statistics/cross-store") as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.stores).toHaveLength(0);
  });

  it("handles single store with no data", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "store-1", name: "旗舰店" },
    ]);
    (mockPrisma.monitoringRecord.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.monitoringRecord.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _avg: { score: null } });
    (mockPrisma.appointment.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.resident.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.staffStore.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await CROSS_STORE_REPORT(
      createRequest("http://localhost/api/v1/statistics/cross-store") as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const store = body.data.stores[0];
    expect(store.monitoringCount).toBe(0);
    expect(store.avgScore).toBeNull();
    expect(store.booked).toBe(0);
    expect(store.completed).toBe(0);
    expect(store.no_show).toBe(0);
    expect(store.cancelled).toBe(0);
    expect(store.newResidentsCount).toBe(0);
    expect(store.staffCount).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/statistics/cross-store — Period-based queries
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/statistics/cross-store — Period-based queries", () => {
  it("returns time-series data for appointments metric with daily period", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
      { storeId: "store-1", date: "2026-04-01", booked: 5, completed: 3, noShow: 1, cancelled: 0 },
      { storeId: "store-1", date: "2026-04-02", booked: 4, completed: 4, noShow: 0, cancelled: 1 },
      { storeId: "store-2", date: "2026-04-01", booked: 3, completed: 2, noShow: 0, cancelled: 0 },
    ]);

    const res = await CROSS_STORE_REPORT(
      createRequest(
        "http://localhost/api/v1/statistics/cross-store?metric=appointments&period=daily&dateFrom=2026-04-01&dateTo=2026-04-30"
      ) as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.stores).toHaveLength(3);
    expect(body.data.stores[0].storeId).toBe("store-1");
    expect(body.data.stores[0].storeName).toBe("旗舰店");
    expect(body.data.stores[0].date).toBe("2026-04-01");
    expect(body.data.stores[0].booked).toBe(5);
    expect(body.data.period).toBe("daily");
  });

  it("returns weekly period data for monitoring metric", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
      { storeId: "store-1", date: "2026-W14", booked: 10, completed: 82, noShow: 0, cancelled: 0 },
    ]);

    const res = await CROSS_STORE_REPORT(
      createRequest(
        "http://localhost/api/v1/statistics/cross-store?metric=monitoring&period=weekly&dateFrom=2026-04-01&dateTo=2026-04-30"
      ) as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.stores[0]).toHaveProperty("monitoringCount");
    expect(body.data.stores[0]).toHaveProperty("avgScore");
    expect(body.data.stores[0].monitoringCount).toBe(10);
  });

  it("returns monthly period data for residents metric", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
      { storeId: "store-1", date: "2026-04", booked: 7, completed: 0, noShow: 0, cancelled: 0 },
      { storeId: "store-2", date: "2026-04", booked: 4, completed: 0, noShow: 0, cancelled: 0 },
    ]);

    const res = await CROSS_STORE_REPORT(
      createRequest(
        "http://localhost/api/v1/statistics/cross-store?metric=residents&period=monthly&dateFrom=2026-04-01&dateTo=2026-04-30"
      ) as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.stores).toHaveLength(2);
    expect(body.data.stores[0]).toHaveProperty("newResidentsCount");
    expect(body.data.stores[0].newResidentsCount).toBe(7);
  });
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/statistics/cross-store — Error handling
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/statistics/cross-store — Error handling", () => {
  it("returns STAT_002 on query failure", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.store.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB connection lost"));

    const res = await CROSS_STORE_REPORT(
      createRequest("http://localhost/api/v1/statistics/cross-store") as any
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("STAT_002");
  });
});
