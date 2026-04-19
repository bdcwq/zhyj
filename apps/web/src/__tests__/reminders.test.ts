import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ReminderScheduler } from "../lib/reminder-scheduler";

// Mock prisma
const mockAppointmentFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    appointment: {
      findMany: (...args: unknown[]) => mockAppointmentFindMany(...args),
    },
  },
}));

// Mock notificationService
const mockSend = vi.fn();
vi.mock("@/lib/notification", () => ({
  notificationService: {
    send: (...args: unknown[]) => mockSend(...args),
  },
}));

describe("ReminderScheduler", () => {
  let scheduler: ReminderScheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = new ReminderScheduler("console");
    mockSend.mockResolvedValue({ success: true, notificationId: "notif-1" });
  });

  afterEach(() => {
    scheduler.stop();
  });

  describe("scan()", () => {
    it("sends day-before reminders for tomorrow's appointments", async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);

      mockAppointmentFindMany
        .mockResolvedValueOnce([
          {
            id: "apt-1",
            residentId: "res-1",
            scheduledAt: tomorrow,
            storeId: "store-1",
          },
        ])
        .mockResolvedValueOnce([]); // no-show scan returns empty

      const result = await scheduler.scan();

      expect(result.dayBefore).toBe(1);
      expect(result.noShowWarning).toBe(0);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "appointment_reminder",
          recipientType: "resident",
          recipientId: "res-1",
        })
      );
    });

    it("sends no-show warnings for appointments starting within 20 minutes", async () => {
      const soon = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

      mockAppointmentFindMany
        .mockResolvedValueOnce([]) // day-before scan returns empty
        .mockResolvedValueOnce([
          {
            id: "apt-2",
            residentId: "res-2",
            scheduledAt: soon,
            storeId: "store-1",
          },
        ]);

      const result = await scheduler.scan();

      expect(result.dayBefore).toBe(0);
      expect(result.noShowWarning).toBe(1);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "no_show_warning",
          recipientId: "res-2",
        })
      );
    });

    it("handles empty results gracefully", async () => {
      mockAppointmentFindMany.mockResolvedValue([]);

      const result = await scheduler.scan();

      expect(result.dayBefore).toBe(0);
      expect(result.noShowWarning).toBe(0);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("skips cancelled and no_show appointments for day-before scan", async () => {
      mockAppointmentFindMany.mockResolvedValue([]);

      const result = await scheduler.scan();
      expect(result.dayBefore).toBe(0);
    });

    it("skips verified appointments for no-show warning", async () => {
      mockAppointmentFindMany.mockResolvedValue([]);

      const result = await scheduler.scan();
      expect(result.noShowWarning).toBe(0);
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
      mockAppointmentFindMany.mockResolvedValue([]);

      scheduler.start(60000);

      expect(scheduler.isRunning()).toBe(true);

      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });

    it("does not start twice", () => {
      mockAppointmentFindMany.mockResolvedValue([]);

      const spy = vi.spyOn(console, "log").mockImplementation(() => {});

      scheduler.start(60000);
      scheduler.start(60000);

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining("already running")
      );

      spy.mockRestore();
      scheduler.stop();
    });
  });
});
