import { prisma } from "@/lib/db";
import { notificationService } from "@/lib/notification";

// ── Reminder types ──

type ReminderType = "appointment_reminder" | "no_show_warning";

interface ReminderCandidate {
  appointmentId: string;
  residentId: string;
  scheduledAt: Date;
  storeId: string;
}

// ── Scan functions ──

/**
 * Find appointments scheduled for tomorrow that need a day-before reminder.
 * Includes appointments with status: booked, confirmed, verified (not cancelled/no_show).
 */
async function scanDayBeforeReminders(): Promise<ReminderCandidate[]> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const start = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);

  const appointments = await prisma.appointment.findMany({
    where: {
      scheduledAt: { gte: start, lte: end },
      status: { in: ["booked", "confirmed", "verified"] },
      deletedAt: null,
    },
    select: {
      id: true,
      residentId: true,
      scheduledAt: true,
      storeId: true,
    },
  });

  return appointments.map((a) => ({
    appointmentId: a.id,
    residentId: a.residentId,
    scheduledAt: a.scheduledAt,
    storeId: a.storeId,
  }));
}

/**
 * Find appointments starting within 20 minutes that haven't been verified.
 * These are candidates for a no-show warning.
 */
async function scanNoShowWarnings(): Promise<ReminderCandidate[]> {
  const now = new Date();
  const twentyMinFromNow = new Date(now.getTime() + 20 * 60 * 1000);

  const appointments = await prisma.appointment.findMany({
    where: {
      scheduledAt: { gte: now, lte: twentyMinFromNow },
      status: { in: ["booked", "confirmed"] }, // verified appointments already checked in
      deletedAt: null,
    },
    select: {
      id: true,
      residentId: true,
      scheduledAt: true,
      storeId: true,
    },
  });

  return appointments.map((a) => ({
    appointmentId: a.id,
    residentId: a.residentId,
    scheduledAt: a.scheduledAt,
    storeId: a.storeId,
  }));
}

// ── Send logic ──

async function sendReminder(
  candidate: ReminderCandidate,
  type: ReminderType,
  channel: string
): Promise<void> {
  const scheduledDate = candidate.scheduledAt.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  let title: string;
  let content: string;

  if (type === "appointment_reminder") {
    title = "预约提醒";
    content = `您有一个预约：${scheduledDate}，请准时到达。`;
  } else {
    title = "即将开始提醒";
    content = `您的预约将在20分钟内开始（${scheduledDate}），请尽快到达。`;
  }

  // Use appointmentId as part of the notification title for idempotency
  // The NotificationService idempotency checks (recipientType, recipientId, type, title)
  // We include appointmentId in the title to make each appointment's reminder unique
  const idempotentTitle = `[${candidate.appointmentId.slice(0, 8)}] ${title}`;

  await notificationService.send({
    recipientType: "resident",
    recipientId: candidate.residentId,
    type,
    title: idempotentTitle,
    content,
    channel,
    storeId: candidate.storeId,
  });
}

// ── ReminderScheduler ──

export class ReminderScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private channel: string;

  constructor(channel: string = "console") {
    this.channel = channel;
  }

  /**
   * Run a single scan of all reminder types.
   * Can be called manually for testing or one-off execution.
   */
  async scan(): Promise<{ dayBefore: number; noShowWarning: number }> {
    const dayBeforeCandidates = await scanDayBeforeReminders();
    const noShowCandidates = await scanNoShowWarnings();

    let dayBeforeSent = 0;
    let noShowWarningSent = 0;

    // Send day-before reminders
    for (const candidate of dayBeforeCandidates) {
      try {
        await sendReminder(candidate, "appointment_reminder", this.channel);
        dayBeforeSent++;
      } catch (err) {
        console.error(
          `[reminder] Failed to send day-before reminder for ${candidate.appointmentId}:`,
          err
        );
      }
    }

    // Send no-show warnings
    for (const candidate of noShowCandidates) {
      try {
        await sendReminder(candidate, "no_show_warning", this.channel);
        noShowWarningSent++;
      } catch (err) {
        console.error(
          `[reminder] Failed to send no-show warning for ${candidate.appointmentId}:`,
          err
        );
      }
    }

    console.log(
      `[reminder] Scan complete: ${dayBeforeSent} day-before, ${noShowWarningSent} no-show warnings`
    );

    return { dayBefore: dayBeforeSent, noShowWarning: noShowWarningSent };
  }

  /**
   * Start the reminder scheduler with a given interval.
   * @param intervalMs Scan interval in milliseconds (default: 60000 = 1 minute)
   */
  start(intervalMs: number = 60_000): void {
    if (this.intervalId) {
      console.log("[reminder] Scheduler already running");
      return;
    }

    console.log(`[reminder] Scheduler started (interval: ${intervalMs}ms, channel: ${this.channel})`);

    // Run immediately on start
    this.scan().catch((err) => console.error("[reminder] Initial scan error:", err));

    this.intervalId = setInterval(() => {
      this.scan().catch((err) => console.error("[reminder] Scan error:", err));
    }, intervalMs);
  }

  /**
   * Stop the reminder scheduler.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[reminder] Scheduler stopped");
    }
  }

  /**
   * Check if the scheduler is running.
   */
  isRunning(): boolean {
    return this.intervalId !== null;
  }
}

// Singleton instance for app-wide usage
export const reminderScheduler = new ReminderScheduler();
