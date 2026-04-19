import { prisma } from "@/lib/db";

// ── Channel adapter interface ──

export interface NotificationPayload {
  recipientType: "staff" | "resident";
  recipientId: string;
  type: string;
  title: string;
  content: string;
  storeId: string;
}

export interface NotificationChannel {
  name: string;
  send(payload: NotificationPayload): Promise<{ success: boolean; error?: string }>;
}

// ── Console channel (dev) ──

export class ConsoleChannel implements NotificationChannel {
  name = "console";

  async send(payload: NotificationPayload): Promise<{ success: boolean; error?: string }> {
    console.log(
      `[notification] 📨 ${payload.type} → ${payload.recipientType}:${payload.recipientId} | ${payload.title}\n` +
      `  ${payload.content}`
    );
    return { success: true };
  }
}

// ── WeChat channel (stub for production) ──

export class WeChatChannel implements NotificationChannel {
  name = "wechat";

  async send(payload: NotificationPayload): Promise<{ success: boolean; error?: string }> {
    // TODO: Integrate WeChat subscription message API
    // For now, log and return success
    console.log(
      `[notification] 📱 [WeChat stub] ${payload.type} → ${payload.recipientType}:${payload.recipientId} | ${payload.title}`
    );
    return { success: true };
  }
}

// ── Channel registry ──

const channels: Record<string, NotificationChannel> = {
  console: new ConsoleChannel(),
  wechat: new WeChatChannel(),
};

export function getChannel(name: string): NotificationChannel {
  const channel = channels[name];
  if (!channel) {
    throw new Error(`Unknown notification channel: ${name}`);
  }
  return channel;
}

// ── NotificationService ──

const IDEMPOTENCY_WINDOW_MS = 60_000; // 1 minute

export class NotificationService {
  /**
   * Send a notification to a single recipient.
   * Includes idempotency check: skips if same notification was sent within the last minute.
   */
  async send(payload: NotificationPayload & { channel?: string }): Promise<{
    success: boolean;
    notificationId?: string;
    error?: string;
  }> {
    const channelName = payload.channel || "console";
    const channel = getChannel(channelName);

    // Idempotency check: skip if sent within the last minute
    const recentNotification = await prisma.notification.findFirst({
      where: {
        recipientType: payload.recipientType,
        recipientId: payload.recipientId,
        type: payload.type,
        title: payload.title,
        createdAt: { gte: new Date(Date.now() - IDEMPOTENCY_WINDOW_MS) },
      },
    });

    if (recentNotification) {
      console.log(
        `[notification] ⏭️  Skipping duplicate: ${payload.type} to ${payload.recipientType}:${payload.recipientId} (sent ${recentNotification.createdAt.toISOString()})`
      );
      return { success: true, notificationId: recentNotification.id };
    }

    // Create notification record
    const notification = await prisma.notification.create({
      data: {
        type: payload.type,
        recipientType: payload.recipientType,
        recipientId: payload.recipientId,
        title: payload.title,
        content: payload.content,
        status: "pending",
        channel: channelName,
        storeId: payload.storeId,
      },
    });

    // Send via channel
    try {
      const result = await channel.send(payload);

      if (result.success) {
        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: "sent", sentAt: new Date() },
        });

        console.log(
          `[notification] ✅ ${channelName}: ${notification.id} ${payload.type} → ${payload.recipientType}:${payload.recipientId}`
        );

        return { success: true, notificationId: notification.id };
      } else {
        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: "failed", error: result.error || "Channel send failed" },
        });

        console.error(
          `[notification] ❌ ${channelName}: ${notification.id} failed: ${result.error}`
        );

        return { success: false, notificationId: notification.id, error: result.error };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: "failed", error: errorMessage },
      });

      console.error(
        `[notification] ❌ ${channelName}: ${notification.id} error: ${errorMessage}`
      );

      return { success: false, notificationId: notification.id, error: errorMessage };
    }
  }

  /**
   * Send notifications to multiple recipients.
   * Returns results for each recipient.
   */
  async sendBulk(
    payloads: Array<NotificationPayload & { channel?: string }>
  ): Promise<Array<{ success: boolean; notificationId?: string; error?: string }>> {
    return Promise.all(payloads.map((p) => this.send(p)));
  }
}

// Singleton instance
export const notificationService = new NotificationService();
