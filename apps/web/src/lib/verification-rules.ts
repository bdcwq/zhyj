import { VERIFICATION_ERRORS, NO_SHOW_LIMIT } from "@zhyj/shared";

type RuleResult = { allowed: boolean; code?: string; reason?: string };

function reject(code: string, reason: string): RuleResult {
  return { allowed: false, code, reason };
}

export async function canVerifyAppointment(
  tx: any,
  appointmentId: string,
  storeId: string
): Promise<RuleResult> {
  const appointment = await tx.appointment.findUnique({
    where: { id: appointmentId, storeId, deletedAt: null },
  });
  if (!appointment)
    return reject(VERIFICATION_ERRORS.NOT_FOUND, "预约不存在");

  // Idempotent: already verified
  const existingVerification = await tx.verification.findUnique({
    where: { appointmentId },
  });
  if (existingVerification) return { allowed: true };

  if (!["booked", "confirmed"].includes(appointment.status)) {
    return reject(
      VERIFICATION_ERRORS.INVALID_STATUS,
      "预约状态不允许核销"
    );
  }
  return { allowed: true };
}

export async function markNoShow(
  tx: any,
  appointmentId: string,
  staffId: string,
  storeId: string
): Promise<void> {
  const appointment = await tx.appointment.findUnique({
    where: { id: appointmentId, storeId, deletedAt: null },
  });
  if (!appointment) throw new Error(VERIFICATION_ERRORS.NOT_FOUND);
  if (!["booked", "confirmed"].includes(appointment.status))
    throw new Error(VERIFICATION_ERRORS.INVALID_STATUS);

  await tx.$transaction(async (t: any) => {
    await t.appointment.update({
      where: { id: appointmentId },
      data: {
        status: "no_show",
        noShowCount: { increment: 1 },
        deletedAt: new Date(),
      },
    });
    await t.verification.create({
      data: {
        appointmentId,
        verifiedBy: staffId,
        verifiedAt: new Date(),
        storeId,
      },
    });
  });
}

export async function countMonthlyNoShows(
  tx: any,
  residentId: string
): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return tx.appointment.count({
    where: {
      residentId,
      status: "no_show",
      createdAt: { gte: startOfMonth, lt: endOfMonth },
    },
  });
}

export async function checkNoShowPenalty(
  tx: any,
  residentId: string
): Promise<RuleResult> {
  const count = await countMonthlyNoShows(tx, residentId);
  if (count >= NO_SHOW_LIMIT) {
    return reject(
      VERIFICATION_ERRORS.NO_SHOW_MARKED,
      `本月爽约次数已达${NO_SHOW_LIMIT}次，暂时无法预约`
    );
  }
  return { allowed: true };
}

export async function getBookingStatus(
  tx: any,
  residentId: string,
  storeId: string
): Promise<{ canBook: boolean; reasons: string[] }> {
  const reasons: string[] = [];

  // Check no-show penalty
  const penalty = await checkNoShowPenalty(tx, residentId);
  if (!penalty.allowed && penalty.reason) reasons.push(penalty.reason);

  // Check monitored
  const monitored = await tx.monitoringRecord.count({
    where: { residentId, deletedAt: null },
  });
  if (monitored === 0) reasons.push("尚未进行体质监测");

  // Check 15-day limit
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fifteenDaysAgo = new Date(startOfDay);
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
  const endOfToday = new Date(startOfDay);
  endOfToday.setDate(endOfToday.getDate() + 1);
  endOfToday.setMilliseconds(-1);

  const recentBookings = await tx.appointment.count({
    where: {
      residentId,
      scheduledAt: { gte: fifteenDaysAgo, lte: endOfToday },
      status: { notIn: ["cancelled", "no_show"] },
      deletedAt: null,
    },
  });
  if (recentBookings > 0) reasons.push("15天内已有预约记录");

  return { canBook: reasons.length === 0, reasons };
}
