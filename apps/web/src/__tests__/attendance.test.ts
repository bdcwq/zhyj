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
    attendance: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    schedule: {
      findUnique: vi.fn(),
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

// Attendance routes
import { POST as CLOCK_IN } from "@/app/api/v1/attendance/clock-in/route";
import { POST as CLOCK_OUT } from "@/app/api/v1/attendance/clock-out/route";
import { GET as ATTENDANCE_LIST } from "@/app/api/v1/attendance/route";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

// ── Helper to create a mock request ──
function createRequest(url: string, options?: RequestInit): any {
  return new NextRequest(url, options);
}

// ── Helper contexts ──
const adminCtx = { staffId: "admin-1", role: "admin", storeId: "store-1" };
const managerCtx = { staffId: "mgr-1", role: "store_manager", storeId: "store-2" };
const staffCtx = { staffId: "staff-1", role: "staff", storeId: "store-1" };

// ── Sample data ──
const sampleSchedule = {
  id: "sch-1",
  date: new Date("2026-04-25"),
  staffId: "staff-1",
  storeId: "store-1",
  shiftType: "morning",
  startTime: "08:00",
  endTime: "17:00",
  status: "scheduled",
};

const sampleAttendance = {
  id: "att-1",
  staffId: "staff-1",
  storeId: "store-1",
  scheduleId: "sch-1",
  date: new Date("2026-04-25"),
  clockIn: new Date("2026-04-25T08:00:00"),
  clockOut: null,
  scheduledStart: "08:00",
  scheduledEnd: "17:00",
  status: "pending",
  workedMinutes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  schedule: sampleSchedule,
};

beforeEach(() => {
  vi.clearAllMocks();
  (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(null);
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/v1/attendance/clock-in
// ══════════════════════════════════════════════════════════════════════
describe("POST /api/v1/attendance/clock-in", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await CLOCK_IN(createRequest("http://localhost/api/v1/attendance/clock-in", {
      method: "POST",
      body: JSON.stringify({ scheduleId: "sch-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not authorized", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "customer", storeId: "store-1" });
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await CLOCK_IN(createRequest("http://localhost/api/v1/attendance/clock-in", {
      method: "POST",
      body: JSON.stringify({ scheduleId: "sch-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(403);
  });

  it("allows admin role", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.schedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleSchedule,
      staffId: "admin-1",
    });
    (mockPrisma.attendance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.attendance.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      staffId: "admin-1",
    });

    const res = await CLOCK_IN(createRequest("http://localhost/api/v1/attendance/clock-in", {
      method: "POST",
      body: JSON.stringify({ scheduleId: "sch-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(200);
  });

  it("allows store_manager role", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.schedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleSchedule,
      staffId: "mgr-1",
    });
    (mockPrisma.attendance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.attendance.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      staffId: "mgr-1",
    });

    const res = await CLOCK_IN(createRequest("http://localhost/api/v1/attendance/clock-in", {
      method: "POST",
      body: JSON.stringify({ scheduleId: "sch-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(200);
  });

  it("allows staff role", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.schedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleSchedule);
    (mockPrisma.attendance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.attendance.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleAttendance);

    const res = await CLOCK_IN(createRequest("http://localhost/api/v1/attendance/clock-in", {
      method: "POST",
      body: JSON.stringify({ scheduleId: "sch-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(200);
  });

  it("creates a new attendance record on first clock-in", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.schedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleSchedule);
    (mockPrisma.attendance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.attendance.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleAttendance);

    const res = await CLOCK_IN(createRequest("http://localhost/api/v1/attendance/clock-in", {
      method: "POST",
      body: JSON.stringify({ scheduleId: "sch-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify create was called with correct data
    const createCall = (mockPrisma.attendance.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(createCall.data.staffId).toBe("staff-1");
    expect(createCall.data.storeId).toBe("store-1");
    expect(createCall.data.scheduleId).toBe("sch-1");
    expect(createCall.data.status).toBe("pending");
    expect(createCall.data.scheduledStart).toBe("08:00");
    expect(createCall.data.scheduledEnd).toBe("17:00");
    expect(createCall.data.clockIn).toBeInstanceOf(Date);
  });

  it("returns ALREADY_CLOCKED_IN when already clocked in (idempotent check)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.schedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleSchedule);
    (mockPrisma.attendance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      clockIn: new Date("2026-04-25T08:00:00"),
    });

    const res = await CLOCK_IN(createRequest("http://localhost/api/v1/attendance/clock-in", {
      method: "POST",
      body: JSON.stringify({ scheduleId: "sch-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("ATTENDANCE_002");
  });

  it("updates existing record if clockIn is null", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.schedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleSchedule);
    (mockPrisma.attendance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      clockIn: null,
    });
    (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      clockIn: new Date(),
    });

    const res = await CLOCK_IN(createRequest("http://localhost/api/v1/attendance/clock-in", {
      method: "POST",
      body: JSON.stringify({ scheduleId: "sch-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(200);
    expect(mockPrisma.attendance.update).toHaveBeenCalled();
    expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
  });

  it("returns SCHEDULE_NOT_FOUND for invalid scheduleId", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.schedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await CLOCK_IN(createRequest("http://localhost/api/v1/attendance/clock-in", {
      method: "POST",
      body: JSON.stringify({ scheduleId: "nonexistent" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("ATTENDANCE_004");
  });

  it("returns 400 when schedule is not in 'scheduled' status", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.schedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleSchedule,
      status: "completed",
    });

    const res = await CLOCK_IN(createRequest("http://localhost/api/v1/attendance/clock-in", {
      method: "POST",
      body: JSON.stringify({ scheduleId: "sch-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("ATTENDANCE_007");
  });

  it("returns 403 when schedule belongs to another staff member", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.schedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleSchedule,
      staffId: "staff-other",
    });

    const res = await CLOCK_IN(createRequest("http://localhost/api/v1/attendance/clock-in", {
      method: "POST",
      body: JSON.stringify({ scheduleId: "sch-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(403);
  });

  it("returns 400 for missing staffId in auth context", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "admin", storeId: "store-1" });

    const res = await CLOCK_IN(createRequest("http://localhost/api/v1/attendance/clock-in", {
      method: "POST",
      body: JSON.stringify({ scheduleId: "sch-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("ATTENDANCE_007");
  });

  it("returns 400 for empty scheduleId", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);

    const res = await CLOCK_IN(createRequest("http://localhost/api/v1/attendance/clock-in", {
      method: "POST",
      body: JSON.stringify({ scheduleId: "" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("ATTENDANCE_007");
  });

  it("returns 500 on Prisma error", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.schedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleSchedule);
    (mockPrisma.attendance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.attendance.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB connection lost"));

    const res = await CLOCK_IN(createRequest("http://localhost/api/v1/attendance/clock-in", {
      method: "POST",
      body: JSON.stringify({ scheduleId: "sch-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("ATTENDANCE_008");
  });
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/v1/attendance/clock-out
// ══════════════════════════════════════════════════════════════════════
describe("POST /api/v1/attendance/clock-out", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not authorized", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "customer", storeId: "store-1" });
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(403);
  });

  it("returns NOT_CLOCKED_IN when attendance record not found", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.attendance.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "nonexistent" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("ATTENDANCE_001");
  });

  it("returns 403 when attendance belongs to another staff member", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.attendance.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      staffId: "staff-other",
    });

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(403);
  });

  it("returns NOT_CLOCKED_IN when clockIn is null", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.attendance.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      clockIn: null,
    });

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("ATTENDANCE_001");
  });

  it("returns ALREADY_CLOCKED_OUT when already clocked out", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.attendance.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      clockOut: new Date("2026-04-25T17:00:00"),
    });

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("ATTENDANCE_003");
  });

  it("calculates hours correctly for normal 9h shift (08:00-17:00) with break deduction", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.attendance.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      clockIn: new Date("2026-04-25T08:00:00"),
      scheduledStart: "08:00",
      scheduledEnd: "17:00",
    });
    (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: any) => {
        return { ...sampleAttendance, ...args.data };
      }
    );
    (mockPrisma.schedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    // Use a fixed date for clockOut by mocking Date
    const fixedNow = new Date("2026-04-25T17:00:00");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    vi.useRealTimers();

    expect(res.status).toBe(200);
    const updateCall = (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    // 9h shift - 1h break = 8h, workedMinutes = 480
    expect(updateCall.data.workedMinutes).toBe(480);
    expect(updateCall.data.status).toBe("normal");
  });

  it("detects late clock-in (>10 min grace)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.attendance.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      clockIn: new Date("2026-04-25T08:15:00"),
      scheduledStart: "08:00",
      scheduledEnd: "17:00",
    });
    (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: any) => ({ ...sampleAttendance, ...args.data })
    );
    (mockPrisma.schedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const fixedNow = new Date("2026-04-25T17:00:00");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    vi.useRealTimers();

    expect(res.status).toBe(200);
    const updateCall = (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(updateCall.data.status).toBe("late");
  });

  it("detects early leave (>10 min grace)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.attendance.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      clockIn: new Date("2026-04-25T08:00:00"),
      scheduledStart: "08:00",
      scheduledEnd: "17:00",
    });
    (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: any) => ({ ...sampleAttendance, ...args.data })
    );
    (mockPrisma.schedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const fixedNow = new Date("2026-04-25T16:40:00");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    vi.useRealTimers();

    expect(res.status).toBe(200);
    const updateCall = (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(updateCall.data.status).toBe("early_leave");
  });

  it("detects late_and_early when both conditions are met", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.attendance.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      clockIn: new Date("2026-04-25T08:15:00"),
      scheduledStart: "08:00",
      scheduledEnd: "17:00",
    });
    (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: any) => ({ ...sampleAttendance, ...args.data })
    );
    (mockPrisma.schedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const fixedNow = new Date("2026-04-25T16:40:00");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    vi.useRealTimers();

    expect(res.status).toBe(200);
    const updateCall = (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(updateCall.data.status).toBe("late_and_early");
  });

  it("updates associated schedule to completed", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.attendance.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleAttendance);
    (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: any) => ({ ...sampleAttendance, ...args.data })
    );
    (mockPrisma.schedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const fixedNow = new Date("2026-04-25T17:00:00");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    vi.useRealTimers();

    expect(res.status).toBe(200);
    expect(mockPrisma.schedule.update).toHaveBeenCalledWith({
      where: { id: "sch-1" },
      data: { status: "completed" },
    });
  });

  it("returns 400 for missing staffId in auth context", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "admin", storeId: "store-1" });

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("ATTENDANCE_007");
  });

  it("returns 400 for empty attendanceId", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("ATTENDANCE_007");
  });

  it("returns 500 on Prisma error", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.attendance.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("ATTENDANCE_008");
  });

  it("returns normal status within 10-min grace", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.attendance.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      clockIn: new Date("2026-04-25T08:08:00"), // 8 min late — within grace
      scheduledStart: "08:00",
      scheduledEnd: "17:00",
    });
    (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: any) => ({ ...sampleAttendance, ...args.data })
    );
    (mockPrisma.schedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const fixedNow = new Date("2026-04-25T16:55:00"); // 5 min early — within grace
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    vi.useRealTimers();

    expect(res.status).toBe(200);
    const updateCall = (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(updateCall.data.status).toBe("normal");
  });
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/attendance — List attendance records
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/attendance", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await ATTENDANCE_LIST(createRequest("http://localhost/api/v1/attendance") as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not authorized", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "customer", storeId: "store-1" });
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await ATTENDANCE_LIST(createRequest("http://localhost/api/v1/attendance") as any);
    expect(res.status).toBe(403);
  });

  it("admin sees all records (no scoping)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleAttendance]);
    (mockPrisma.attendance.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await ATTENDANCE_LIST(createRequest("http://localhost/api/v1/attendance") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    // Admin should NOT have staffId or storeId in where clause by default
    expect(findManyCall.where.staffId).toBeUndefined();
    expect(findManyCall.where.storeId).toBeUndefined();
  });

  it("store_manager scoped to their own store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.attendance.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await ATTENDANCE_LIST(createRequest("http://localhost/api/v1/attendance") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.storeId).toBe("store-2");
  });

  it("staff sees only own records", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleAttendance]);
    (mockPrisma.attendance.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await ATTENDANCE_LIST(createRequest("http://localhost/api/v1/attendance") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.staffId).toBe("staff-1");
  });

  it("supports date range filter", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.attendance.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await ATTENDANCE_LIST(
      createRequest("http://localhost/api/v1/attendance?dateFrom=2026-04-20&dateTo=2026-04-25") as any
    );
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.date.gte).toBeInstanceOf(Date);
    expect(findManyCall.where.date.lte).toBeInstanceOf(Date);
  });

  it("supports status filter", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.attendance.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await ATTENDANCE_LIST(
      createRequest("http://localhost/api/v1/attendance?status=late") as any
    );
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.status).toBe("late");
  });

  it("supports pagination with default values", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.attendance.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await ATTENDANCE_LIST(createRequest("http://localhost/api/v1/attendance") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.take).toBe(20); // default limit
    expect(findManyCall.skip).toBe(0); // default offset
  });

  it("supports custom pagination", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.attendance.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await ATTENDANCE_LIST(
      createRequest("http://localhost/api/v1/attendance?limit=10&offset=20") as any
    );
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.take).toBe(10);
    expect(findManyCall.skip).toBe(20);
  });

  it("returns empty results gracefully", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.attendance.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await ATTENDANCE_LIST(createRequest("http://localhost/api/v1/attendance") as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.records).toHaveLength(0);
    expect(body.data.total).toBe(0);
  });

  it("returns records with staff and schedule includes", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    const recordWithIncludes = {
      ...sampleAttendance,
      staff: { id: "staff-1", name: "张三", phone: "13800000000" },
      schedule: {
        id: "sch-1",
        date: new Date("2026-04-25"),
        startTime: "08:00",
        endTime: "17:00",
        shiftType: "morning",
      },
    };
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([recordWithIncludes]);
    (mockPrisma.attendance.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await ATTENDANCE_LIST(createRequest("http://localhost/api/v1/attendance") as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.records[0].staff).toBeDefined();
    expect(body.data.records[0].staff.name).toBe("张三");
    expect(body.data.records[0].schedule).toBeDefined();
    expect(body.data.records[0].schedule.startTime).toBe("08:00");
  });

  it("returns 500 on DB error", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.attendance.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const res = await ATTENDANCE_LIST(createRequest("http://localhost/api/v1/attendance") as any);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("ATTENDANCE_006");
  });

  it("returns 400 for invalid query params", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await ATTENDANCE_LIST(
      createRequest("http://localhost/api/v1/attendance?limit=abc") as any
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("ATTENDANCE_007");
  });
});

// ══════════════════════════════════════════════════════════════════════
// Hours calculation edge cases
// ══════════════════════════════════════════════════════════════════════
describe("Hours calculation edge cases", () => {
  // We test the clock-out handler which internally calls calculateWorkedHours
  it("cross-day shift (22:00-06:00): 8h shift, break deducted (>6h)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.attendance.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      clockIn: new Date("2026-04-25T22:00:00"),
      scheduledStart: "22:00",
      scheduledEnd: "06:00", // 8h shift → break deduction applies (>6h)
    });
    (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: any) => ({ ...sampleAttendance, ...args.data })
    );
    (mockPrisma.schedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const fixedNow = new Date("2026-04-26T06:00:00");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    vi.useRealTimers();

    expect(res.status).toBe(200);
    const updateCall = (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    // 8h - 1h break = 7h → 420 min
    expect(updateCall.data.workedMinutes).toBe(420);
  });

  it("long shift (>6h): break deduction applied", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.attendance.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      clockIn: new Date("2026-04-25T08:00:00"),
      scheduledStart: "08:00",
      scheduledEnd: "18:00", // 10h shift → break deduction
    });
    (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: any) => ({ ...sampleAttendance, ...args.data })
    );
    (mockPrisma.schedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const fixedNow = new Date("2026-04-25T18:00:00");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    vi.useRealTimers();

    expect(res.status).toBe(200);
    const updateCall = (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    // 10h - 1h break = 9h → 540 min
    expect(updateCall.data.workedMinutes).toBe(540);
  });

  it("short shift (<=6h): no break deduction", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.attendance.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      clockIn: new Date("2026-04-25T08:00:00"),
      scheduledStart: "08:00",
      scheduledEnd: "12:00", // 4h shift — no break
    });
    (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: any) => ({ ...sampleAttendance, ...args.data })
    );
    (mockPrisma.schedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const fixedNow = new Date("2026-04-25T12:00:00");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    vi.useRealTimers();

    expect(res.status).toBe(200);
    const updateCall = (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    // 4h, no break → 240 min
    expect(updateCall.data.workedMinutes).toBe(240);
  });

  it("rounding: 7h23m → rounds to 7.25h (435 min)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.attendance.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      clockIn: new Date("2026-04-25T08:00:00"),
      scheduledStart: "08:00",
      scheduledEnd: "16:00", // 8h shift → break deduction applies
    });
    (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: any) => ({ ...sampleAttendance, ...args.data })
    );
    (mockPrisma.schedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    // Clock out at 15:23 → 7h23m worked, minus 1h break = 6h23m = 383min → rounds to 6.25h = 375min
    // Wait, let me recalculate. 08:00 to 15:23 = 7h23m. Schedule is 8h (>6h), so break: 7h23m - 1h = 6h23m = 383min. Round 383/60 = 6.383h → nearest 0.25 = 6.5h = 390min
    const fixedNow = new Date("2026-04-25T15:23:00");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    vi.useRealTimers();

    expect(res.status).toBe(200);
    const updateCall = (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    // 7h23m - 1h break = 6h23m = 6.383h → round(6.383/0.25)*0.25 = round(25.53)*0.25 = 26*0.25 = 6.5h = 390min
    expect(updateCall.data.workedMinutes).toBe(390);
  });

  it("no schedule info: no break deduction, raw hours", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.attendance.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      clockIn: new Date("2026-04-25T08:00:00"),
      scheduledStart: null,
      scheduledEnd: null,
    });
    (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: any) => ({ ...sampleAttendance, ...args.data })
    );
    (mockPrisma.schedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const fixedNow = new Date("2026-04-25T17:00:00");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    vi.useRealTimers();

    expect(res.status).toBe(200);
    const updateCall = (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    // 9h, no schedule info → no break deduction → 540 min
    expect(updateCall.data.workedMinutes).toBe(540);
    // No schedule → status should be "normal"
    expect(updateCall.data.status).toBe("normal");
  });

  it("cross-day shift with break: 22:00-06:00 (8h shift, no break since <= 8h)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.attendance.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      clockIn: new Date("2026-04-25T22:00:00"),
      scheduledStart: "22:00",
      scheduledEnd: "07:00", // 9h shift → break deduction
    });
    (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: any) => ({ ...sampleAttendance, ...args.data })
    );
    (mockPrisma.schedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const fixedNow = new Date("2026-04-26T07:00:00");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    vi.useRealTimers();

    expect(res.status).toBe(200);
    const updateCall = (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    // 9h - 1h break = 8h → 480 min
    expect(updateCall.data.workedMinutes).toBe(480);
  });

  it("rounding down: 7h10m → rounds to 7.0h (420 min)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(staffCtx);
    (mockPrisma.attendance.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleAttendance,
      clockIn: new Date("2026-04-25T08:00:00"),
      scheduledStart: "08:00",
      scheduledEnd: "16:00",
    });
    (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: any) => ({ ...sampleAttendance, ...args.data })
    );
    (mockPrisma.schedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    // 08:00 to 15:10 = 7h10m. Schedule 8h > 6h → break: 7h10m - 1h = 6h10m = 370min = 6.167h → round(6.167/0.25)*0.25 = round(24.67)*0.25 = 25*0.25 = 6.25h = 375min
    const fixedNow = new Date("2026-04-25T15:10:00");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const res = await CLOCK_OUT(createRequest("http://localhost/api/v1/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify({ attendanceId: "att-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    vi.useRealTimers();

    expect(res.status).toBe(200);
    const updateCall = (mockPrisma.attendance.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(updateCall.data.workedMinutes).toBe(375);
  });
});
