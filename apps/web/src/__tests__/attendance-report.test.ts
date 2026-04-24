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
    attendance: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    schedule: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    leave: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    staff: {
      findMany: vi.fn(),
      count: vi.fn(),
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

// Attendance report route
import { GET as ATTENDANCE_REPORT } from "@/app/api/v1/attendance/report/route";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

// ── Helper to create a mock request ──
function createRequest(url: string, options?: RequestInit): any {
  return new NextRequest(url, options);
}

// ── Helper contexts ──
const adminCtx = { staffId: "admin-1", role: "admin", storeId: "store-1" };
const managerCtx = { staffId: "mgr-1", role: "store_manager", storeId: "store-2" };
const staffCtx = { staffId: "staff-1", role: "staff", storeId: "store-1" };

beforeEach(() => {
  vi.clearAllMocks();
  (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(null);
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/attendance/report — Monthly aggregation
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/attendance/report — Monthly aggregation", () => {
  it("calculates correct presentDays from normal status", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "staff-1", name: "张三" },
    ]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { status: "normal", workedMinutes: 480 },
      { status: "normal", workedMinutes: 480 },
      { status: "normal", workedMinutes: 480 },
    ]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "sch-1" },
      { id: "sch-2" },
      { id: "sch-3" },
    ]);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04") as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.records[0].presentDays).toBe(3);
  });

  it("calculates correct lateDays from late and late_and_early status", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "staff-1", name: "张三" },
    ]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { status: "late", workedMinutes: 450 },
      { status: "late_and_early", workedMinutes: 420 },
    ]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "sch-1" },
      { id: "sch-2" },
    ]);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04") as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.records[0].lateDays).toBe(2);
  });

  it("calculates correct earlyLeaveDays from early_leave and late_and_early status", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "staff-1", name: "张三" },
    ]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { status: "early_leave", workedMinutes: 420 },
      { status: "late_and_early", workedMinutes: 390 },
      { status: "early_leave", workedMinutes: 420 },
    ]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "sch-1" },
      { id: "sch-2" },
      { id: "sch-3" },
    ]);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04") as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.records[0].earlyLeaveDays).toBe(3);
  });

  it("calculates correct totalHours sum from workedMinutes", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "staff-1", name: "张三" },
    ]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { status: "normal", workedMinutes: 480 }, // 8h
      { status: "normal", workedMinutes: 450 }, // 7.5h
      { status: "late", workedMinutes: 420 },   // 7h
    ]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "sch-1" },
      { id: "sch-2" },
      { id: "sch-3" },
    ]);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04") as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // 480/60 + 450/60 + 420/60 = 8 + 7.5 + 7 = 22.5
    expect(body.data.records[0].totalHours).toBe(22.5);
  });

  it("counts leaveDays from approved Leave records", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "staff-1", name: "张三" },
    ]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04") as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.records[0].leaveDays).toBe(3);
  });

  it("calculates absentDays = scheduled shifts with no attendance", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "staff-1", name: "张三" },
    ]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]) // First call: attendance records for counts
      .mockResolvedValueOnce([  // Second call: attendance with scheduleId for absent check
        { scheduleId: "sch-1" },
      ]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "sch-1" },
      { id: "sch-2" },
      { id: "sch-3" },
    ]);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04") as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // 3 scheduled, 1 has attendance → 2 absent
    expect(body.data.records[0].absentDays).toBe(2);
  });

  it("handles null workedMinutes in totalHours calculation", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "staff-1", name: "张三" },
    ]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { status: "normal", workedMinutes: 480 },
      { status: "pending", workedMinutes: null },
    ]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "sch-1" },
      { id: "sch-2" },
    ]);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04") as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Only 480 min counted → 8h
    expect(body.data.records[0].totalHours).toBe(8);
  });
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/attendance/report — RBAC scoping
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/attendance/report — RBAC scoping", () => {
  it("staff sees own report only (staffId filter)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "staff-1", name: "张三" },
    ]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04") as any
    );
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.id).toBe("staff-1");
  });

  it("store_manager scoped to own store via staffStores", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04") as any
    );
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.staffStores).toEqual({
      some: { storeId: "store-2" },
    });
  });

  it("admin sees all staff (no scope filter by default)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "staff-1", name: "张三" },
      { id: "staff-2", name: "李四" },
    ]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04") as any
    );
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    // Admin should only have deletedAt filter, no store/staff scoping
    expect(findManyCall.where.id).toBeUndefined();
    expect(findManyCall.where.staffStores).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/attendance/report — Month parsing
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/attendance/report — Month parsing", () => {
  it("parses valid YYYY-MM to correct first and last day", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "staff-1", name: "张三" },
    ]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: any) => {
        const gte = args.where.date.gte;
        const lte = args.where.date.lte;
        // Verify date boundaries for 2026-04
        expect(gte.getTime()).toBe(new Date("2026-04-01T00:00:00").getTime());
        expect(lte.getTime()).toBe(new Date("2026-04-30T23:59:59.999").getTime());
        return [];
      }
    );
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04") as any
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid month format (non-YYYY-MM)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026/04") as any
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("ATTENDANCE_007");
  });

  it("handles month boundary correctly (2026-01 = Jan 1 to Jan 31)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "staff-1", name: "张三" },
    ]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: any) => {
        const gte = args.where.date.gte;
        const lte = args.where.date.lte;
        expect(gte.getTime()).toBe(new Date("2026-01-01T00:00:00").getTime());
        expect(lte.getTime()).toBe(new Date("2026-01-31T23:59:59.999").getTime());
        return [];
      }
    );
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-01") as any
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 for missing month parameter", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report") as any
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("ATTENDANCE_007");
  });
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/attendance/report — Empty data
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/attendance/report — Empty data", () => {
  it("returns all zeros when no attendance records", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "staff-1", name: "张三" },
    ]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04") as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const summary = body.data.records[0];
    expect(summary.presentDays).toBe(0);
    expect(summary.lateDays).toBe(0);
    expect(summary.earlyLeaveDays).toBe(0);
    expect(summary.leaveDays).toBe(0);
    expect(summary.absentDays).toBe(0);
    expect(summary.totalHours).toBe(0);
  });

  it("returns absentDays=0 when no schedules exist", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "staff-1", name: "张三" },
    ]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04") as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.records[0].absentDays).toBe(0);
  });

  it("returns empty records when no staff match filters", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04") as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.records).toHaveLength(0);
    expect(body.data.total).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/attendance/report — Filters
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/attendance/report — Filters", () => {
  it("staffId filter narrows results", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "staff-1", name: "张三" },
    ]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04&staffId=staff-1") as any
    );
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.id).toBe("staff-1");
  });

  it("storeId filter applied for admin", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04&storeId=store-1") as any
    );
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.staffStores).toEqual({
      some: { storeId: "store-1" },
    });
  });

  it("supports pagination with defaults", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04") as any
    );
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.take).toBe(20);
    expect(findManyCall.skip).toBe(0);
  });

  it("supports custom pagination", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04&limit=5&offset=10") as any
    );
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.take).toBe(5);
    expect(findManyCall.skip).toBe(10);
  });

  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04") as any
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not authorized", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "customer", storeId: "store-1" });
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04") as any
    );
    expect(res.status).toBe(403);
  });

  it("returns 500 on DB error", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04") as any
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("LEAVE_006");
  });

  it("returns response with correct structure (records, total, limit, offset)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "staff-1", name: "张三" },
    ]);
    (mockPrisma.staff.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.leave.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await ATTENDANCE_REPORT(
      createRequest("http://localhost/api/v1/attendance/report?month=2026-04") as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("records");
    expect(body.data).toHaveProperty("total");
    expect(body.data).toHaveProperty("limit");
    expect(body.data).toHaveProperty("offset");
    expect(body.data.records[0]).toHaveProperty("staffId");
    expect(body.data.records[0]).toHaveProperty("staffName");
    expect(body.data.records[0]).toHaveProperty("presentDays");
    expect(body.data.records[0]).toHaveProperty("lateDays");
    expect(body.data.records[0]).toHaveProperty("earlyLeaveDays");
    expect(body.data.records[0]).toHaveProperty("leaveDays");
    expect(body.data.records[0]).toHaveProperty("absentDays");
    expect(body.data.records[0]).toHaveProperty("totalHours");
  });
});
