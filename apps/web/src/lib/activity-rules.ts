import {
  ACTIVITY_ERRORS,
  ACTIVITY_NO_SHOW_LIMIT,
} from "@zhyj/shared";

type RuleResult = { allowed: boolean; code?: string; reason?: string };

function reject(code: string, reason: string): RuleResult {
  return { allowed: false, code, reason };
}

export async function isRegistrationAllowed(
  tx: any,
  residentId: string,
  activityId: string,
  storeId: string
): Promise<RuleResult> {
  // 1. Activity exists and belongs to store
  const activity = await tx.activity.findUnique({
    where: { id: activityId, storeId, deletedAt: null },
  });
  if (!activity) return reject(ACTIVITY_ERRORS.NOT_FOUND, "活动不存在");

  // 2. Activity status is published
  if (activity.status !== "published") {
    return reject(ACTIVITY_ERRORS.NOT_PUBLISHED, "活动未发布");
  }

  // 3. Activity not cancelled
  if (activity.status === "cancelled") {
    return reject(ACTIVITY_ERRORS.CANCELLED, "活动已取消");
  }

  // 4. Registration deadline: activity date hasn't passed
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const activityDate = new Date(activity.activityDate);
  activityDate.setHours(0, 0, 0, 0);
  if (activityDate < today) {
    return reject(ACTIVITY_ERRORS.REGISTRATION_CLOSED, "活动日期已过，无法报名");
  }

  // 5. No existing active registration
  const existing = await tx.activityRegistration.findUnique({
    where: { activityId_residentId: { activityId, residentId } },
  });
  if (existing && existing.status === "registered") {
    return reject(ACTIVITY_ERRORS.ALREADY_REGISTERED, "已报名该活动");
  }

  // 6. Monthly no-show count < limit
  const noShowCount = await countMonthlyActivityNoShows(tx, residentId);
  if (noShowCount >= ACTIVITY_NO_SHOW_LIMIT) {
    return reject(
      ACTIVITY_ERRORS.NO_SHOW_LIMIT,
      `本月爽约次数已达${ACTIVITY_NO_SHOW_LIMIT}次，暂时无法报名`
    );
  }

  // Note: capacity check (ACTIVITY_001) is done atomically in the route handler
  return { allowed: true };
}

export async function checkInRules(
  tx: any,
  residentId: string,
  activityId: string,
  storeId: string
): Promise<RuleResult> {
  const registration = await tx.activityRegistration.findUnique({
    where: { activityId_residentId: { activityId, residentId } },
  });

  if (!registration) {
    return reject(ACTIVITY_ERRORS.NOT_REGISTERED, "未报名该活动");
  }

  // Idempotent: already checked in
  if (registration.status === "checked_in") {
    return { allowed: true };
  }

  // Only registered users can check in
  if (registration.status !== "registered") {
    return reject(ACTIVITY_ERRORS.NOT_REGISTERED, "当前状态不允许签到");
  }

  return { allowed: true };
}

export async function countMonthlyActivityNoShows(
  tx: any,
  residentId: string
): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return tx.activityRegistration.count({
    where: {
      residentId,
      status: "no_show",
      createdAt: { gte: startOfMonth, lt: endOfMonth },
    },
  });
}
