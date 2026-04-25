import { prisma } from "@/lib/db";
import { notificationService } from "@/lib/notification";

// ── Types ──

type ReminderType = "activity_reminder" | "activity_cancelled";

interface ActivityReminderCandidate {
  activityId: string;
  activityName: string;
  residentId: string;
  activityDate: Date;
  startTime: string;
  storeId: string;
}

// ── Scan functions ──

/**
 * Find activities scheduled for tomorrow that need a day-before reminder.
 * Only includes published activities with active registrations (status = "registered").
 */
async function scanActivityReminders(): Promise<ActivityReminderCandidate[]> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const start = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);

  const activities = await prisma.activity.findMany({
    where: {
      activityDate: { gte: start, lte: end },
      status: "published",
      deletedAt: null,
      registrations: {
        some: {
          status: "registered",
        },
      },
    },
    select: {
      id: true,
      name: true,
      activityDate: true,
      startTime: true,
      storeId: true,
      registrations: {
        where: { status: "registered" },
        select: { residentId: true },
      },
    },
  });

  const candidates: ActivityReminderCandidate[] = [];
  for (const activity of activities) {
    for (const reg of activity.registrations) {
      candidates.push({
        activityId: activity.id,
        activityName: activity.name,
        residentId: reg.residentId,
        activityDate: activity.activityDate,
        startTime: activity.startTime,
        storeId: activity.storeId,
      });
    }
  }

  return candidates;
}

// ── Send logic ──

async function sendActivityReminder(
  candidate: ActivityReminderCandidate,
  channel: string
): Promise<void> {
  const dateStr = candidate.activityDate.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
  });

  const idempotentTitle = `[${candidate.activityId.slice(0, 8)}] 活动提醒`;

  const content = `您报名的"${candidate.activityName}"将于明天（${dateStr} ${candidate.startTime}）开始，请准时参加。`;

  await notificationService.send({
    recipientType: "resident",
    recipientId: candidate.residentId,
    type: "activity_reminder",
    title: idempotentTitle,
    content,
    channel,
    storeId: candidate.storeId,
  });
}

// ── ActivityReminderScheduler ──

export class ActivityReminderScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private channel: string;

  constructor(channel: string = "console") {
    this.channel = channel;
  }

  /**
   * Run a single scan for activity reminders.
   * Can be called manually for testing or one-off execution.
   */
  async scan(): Promise<number> {
    const candidates = await scanActivityReminders();

    let sentCount = 0;

    for (const candidate of candidates) {
      try {
        await sendActivityReminder(candidate, this.channel);
        sentCount++;
      } catch (err) {
        console.error(
          `[activity-reminder] Failed to send reminder for activity ${candidate.activityId} to resident ${candidate.residentId}:`,
          err
        );
      }
    }

    console.log(
      `[activity-reminder] Scan complete: ${sentCount}/${candidates.length} reminders sent`
    );

    return sentCount;
  }

  /**
   * Start the activity reminder scheduler with a given interval.
   * @param intervalMs Scan interval in milliseconds (default: 60000 = 1 minute)
   */
  start(intervalMs: number = 60_000): void {
    if (this.intervalId) {
      console.log("[activity-reminder] Scheduler already running");
      return;
    }

    console.log(`[activity-reminder] Scheduler started (interval: ${intervalMs}ms, channel: ${this.channel})`);

    // Run immediately on start
    this.scan().catch((err) => console.error("[activity-reminder] Initial scan error:", err));

    this.intervalId = setInterval(() => {
      this.scan().catch((err) => console.error("[activity-reminder] Scan error:", err));
    }, intervalMs);
  }

  /**
   * Stop the activity reminder scheduler.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[activity-reminder] Scheduler stopped");
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
export const activityReminderScheduler = new ActivityReminderScheduler();
