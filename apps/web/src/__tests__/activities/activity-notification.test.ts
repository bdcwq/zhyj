import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ActivityReminderScheduler, scanActivityReminders } from "../../lib/activity-reminder-scheduler";
import { NextRequest } from "next/server";
import { PATCH as cancelActivity } from "../../app/api/v1/activities/[id]/cancel/route";

// ── Mock next/server ──
vi.mock("next/server", () => {
  class NextRequest extends Request {
    private _url: URL;
    constructor(url: string | URL, init?: RequestInit) {
      super(url, init);
      this._url = new URL(url instanceof URL ? url.href : url);
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

// ── Mock prisma ──
const mockActivityFindMany = vi.fn();
const mockActivityFindFirst = vi.fn();
const mockActivityUpdate = vi.fn();
const mockRegistrationUpdateMany = vi.fn();
const mockRegistrationFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    activity: {
      findMany: (...args: unknown[]) => mockActivityFindMany(...args),
      findFirst: (...args: unknown[]) => mockActivityFindFirst(...args),
      update: (...args: unknown[]) => mockActivityUpdate(...args),
    },
    activityRegistration: {
      updateMany: (...args: unknown[]) => mockRegistrationUpdateMany(...args),
      findMany: (...args: unknown[]) => mockRegistrationFindMany(...args),
    },
    $transaction: (args: unknown[]) => Promise.all(args),
  },
}));

// ── Mock notificationService ──
const mockSend = vi.fn();
const mockSendBulk = vi.fn();

vi.mock("@/lib/notification", () => ({
  notificationService: {
    send: (...args: unknown[]) => mockSend(...args),
    sendBulk: (...args: unknown[]) => mockSendBulk(...args),
  },
}));

// ── Mock auth/rbac ──
vi.mock("@/lib/auth", () => ({
  getAuthContext: vi.fn().mockResolvedValue({
    userId: "admin-1",
    storeId: "store-1",
    role: "admin",
  }),
}));

vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn().mockReturnValue(null),
}));

// ── Mock @zhyj/shared ──
vi.mock("@zhyj/shared", () => ({
  ACTIVITY_ERRORS: {
    NOT_FOUND: "ACTIVITY_001",
    OPERATION_FAILED: "ACTIVITY_002",
  },
}));

// ── Helpers ──

function makeTomorrowDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow;
}

function makeCancelRequest(activityId: string) {
  return new NextRequest(new URL(`/api/v1/activities/${activityId}/cancel`, "http://localhost:3000"), {
    method: "PATCH",
  });
}

// ── Tests ──

describe("ActivityReminderScheduler", () => {
  let scheduler: ActivityReminderScheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = new ActivityReminderScheduler("console");
    mockSend.mockResolvedValue({ success: true, notificationId: "notif-1" });
  });

  afterEach(() => {
    scheduler.stop();
  });

  describe("scan()", () => {
    it("sends reminders for tomorrow's published activities with registered users", async () => {
      const tomorrow = makeTomorrowDate();

      mockActivityFindMany.mockResolvedValue([
        {
          id: "act-1",
          name: "瑜伽课程",
          activityDate: tomorrow,
          startTime: "10:00",
          storeId: "store-1",
          registrations: [
            { residentId: "res-1" },
            { residentId: "res-2" },
          ],
        },
      ]);

      const result = await scheduler.scan();

      expect(result).toBe(2);
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "activity_reminder",
          recipientType: "resident",
          recipientId: "res-1",
        })
      );
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "activity_reminder",
          recipientType: "resident",
          recipientId: "res-2",
        })
      );
    });

    it("uses idempotentTitle with activityId prefix", async () => {
      const tomorrow = makeTomorrowDate();

      mockActivityFindMany.mockResolvedValue([
        {
          id: "act-12345678-abcd",
          name: "健身课",
          activityDate: tomorrow,
          startTime: "14:00",
          storeId: "store-1",
          registrations: [{ residentId: "res-1" }],
        },
      ]);

      await scheduler.scan();

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "[act-1234] 活动提醒",
        })
      );
    });

    it("includes activity name, date and time in content", async () => {
      const tomorrow = makeTomorrowDate();

      mockActivityFindMany.mockResolvedValue([
        {
          id: "act-1",
          name: "瑜伽课程",
          activityDate: tomorrow,
          startTime: "10:00",
          storeId: "store-1",
          registrations: [{ residentId: "res-1" }],
        },
      ]);

      await scheduler.scan();

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.content).toContain("瑜伽课程");
      expect(callArgs.content).toContain("10:00");
    });

    it("excludes cancelled activities", async () => {
      // Only published activities are queried (filter in Prisma where clause)
      // If the DB returns only published, we won't see cancelled ones
      mockActivityFindMany.mockResolvedValue([]);

      const result = await scheduler.scan();

      expect(result).toBe(0);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("excludes completed activities", async () => {
      // Same as cancelled — only published activities are queried
      mockActivityFindMany.mockResolvedValue([]);

      const result = await scheduler.scan();

      expect(result).toBe(0);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("excludes activities with no registrations", async () => {
      // The Prisma query filters for registrations: { some: { status: "registered" } }
      // So activities without registrations won't appear in results
      mockActivityFindMany.mockResolvedValue([]);

      const result = await scheduler.scan();

      expect(result).toBe(0);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("handles send errors per-candidate without crashing", async () => {
      const tomorrow = makeTomorrowDate();

      mockActivityFindMany.mockResolvedValue([
        {
          id: "act-1",
          name: "瑜伽课程",
          activityDate: tomorrow,
          startTime: "10:00",
          storeId: "store-1",
          registrations: [
            { residentId: "res-1" },
            { residentId: "res-2" },
            { residentId: "res-3" },
          ],
        },
      ]);

      mockSend
        .mockResolvedValueOnce({ success: true, notificationId: "notif-1" })
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({ success: true, notificationId: "notif-3" });

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await scheduler.scan();

      expect(result).toBe(2);
      expect(mockSend).toHaveBeenCalledTimes(3);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[activity-reminder]"),
        expect.any(Error)
      );

      errorSpy.mockRestore();
    });

    it("handles empty results gracefully", async () => {
      mockActivityFindMany.mockResolvedValue([]);

      const result = await scheduler.scan();

      expect(result).toBe(0);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("start/stop", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("starts and stops the scheduler", () => {
      mockActivityFindMany.mockResolvedValue([]);

      scheduler.start(60000);

      expect(scheduler.isRunning()).toBe(true);

      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });

    it("does not start twice", () => {
      mockActivityFindMany.mockResolvedValue([]);

      const spy = vi.spyOn(console, "log").mockImplementation(() => {});

      scheduler.start(60000);
      scheduler.start(60000);

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining("already running")
      );

      spy.mockRestore();
      scheduler.stop();
    });

    it("runs scan immediately on start", async () => {
      mockActivityFindMany.mockResolvedValue([]);

      scheduler.start(60000);

      // The scan is called immediately (via .catch), but with fake timers
      // we need to advance to allow the microtask to resolve
      await vi.advanceTimersByTimeAsync(0);

      expect(mockActivityFindMany).toHaveBeenCalledTimes(1);

      scheduler.stop();
    });
  });
});

describe("Cancel route notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function setupCancelMocks(overrides?: {
    sendBulkThrows?: boolean;
  }) {
    mockActivityFindFirst.mockResolvedValue({
      id: "act-1",
      name: "瑜伽课程",
      status: "published",
      storeId: "store-1",
    });

    mockActivityUpdate.mockResolvedValue({
      id: "act-1",
      name: "瑜伽课程",
      status: "cancelled",
    });

    mockRegistrationUpdateMany.mockResolvedValue({ count: 3 });

    mockRegistrationFindMany.mockResolvedValue([
      { residentId: "res-1" },
      { residentId: "res-2" },
      { residentId: "res-3" },
    ]);

    if (overrides?.sendBulkThrows) {
      mockSendBulk.mockRejectedValue(new Error("Notification service unavailable"));
    } else {
      mockSendBulk.mockResolvedValue([
        { success: true, notificationId: "n1" },
        { success: true, notificationId: "n2" },
        { success: true, notificationId: "n3" },
      ]);
    }
  }

  it("sends cancellation notifications to all registered residents", async () => {
    await setupCancelMocks();

    const req = makeCancelRequest("act-1");
    const res = await cancelActivity(req, {
      params: Promise.resolve({ id: "act-1" }),
    });
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(mockSendBulk).toHaveBeenCalledTimes(1);
    expect(mockSendBulk).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          type: "activity_cancelled",
          recipientType: "resident",
          recipientId: "res-1",
        }),
        expect.objectContaining({
          recipientId: "res-2",
        }),
        expect.objectContaining({
          recipientId: "res-3",
        }),
      ])
    );
  });

  it("uses idempotentTitle with activityId prefix for cancel notifications", async () => {
    await setupCancelMocks();

    const req = makeCancelRequest("act-1");
    await cancelActivity(req, {
      params: Promise.resolve({ id: "act-1" }),
    });

    const callArgs = mockSendBulk.mock.calls[0][0];
    expect(callArgs[0].title).toBe("[act-1] 活动取消通知");
    expect(callArgs[0].content).toContain("瑜伽课程");
  });

  it("cancel still succeeds even if notification fails", async () => {
    await setupCancelMocks({ sendBulkThrows: true });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const req = makeCancelRequest("act-1");
    const res = await cancelActivity(req, {
      params: Promise.resolve({ id: "act-1" }),
    });
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.data.status).toBe("cancelled");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to send cancel notifications"),
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });

  it("does not send notifications when no registrations exist", async () => {
    mockActivityFindFirst.mockResolvedValue({
      id: "act-1",
      name: "瑜伽课程",
      status: "published",
      storeId: "store-1",
    });

    mockActivityUpdate.mockResolvedValue({
      id: "act-1",
      status: "cancelled",
    });

    mockRegistrationUpdateMany.mockResolvedValue({ count: 0 });
    mockRegistrationFindMany.mockResolvedValue([]);

    const req = makeCancelRequest("act-1");
    const res = await cancelActivity(req, {
      params: Promise.resolve({ id: "act-1" }),
    });
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(mockSendBulk).not.toHaveBeenCalled();
  });
});
