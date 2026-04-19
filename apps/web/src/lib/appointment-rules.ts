import { APPOINTMENT_ERRORS } from "@zhyj/shared";
import { checkNoShowPenalty } from "./verification-rules";
import { checkCampaignBonus } from "./campaign-rules";

type RuleResult = { allowed: boolean; code?: string; reason?: string };

function reject(code: string, reason: string): RuleResult {
  return { allowed: false, code, reason };
}

export async function checkResidentExists(
  tx: any,
  residentId: string,
  storeId: string
): Promise<RuleResult> {
  const resident = await tx.resident.findUnique({
    where: { id: residentId, storeId, deletedAt: null },
  });
  if (!resident) return reject(APPOINTMENT_ERRORS.INVALID_RESIDENT, "居民不存在");
  return { allowed: true };
}

export async function checkResidentMonitored(
  tx: any,
  residentId: string
): Promise<RuleResult> {
  const count = await tx.monitoringRecord.count({
    where: { residentId, deletedAt: null },
  });
  if (count === 0)
    return reject(
      APPOINTMENT_ERRORS.NOT_MONITORED,
      "该居民尚未进行体质监测，请先完成监测后再预约"
    );
  return { allowed: true };
}

export async function check15DayLimit(
  tx: any,
  residentId: string
): Promise<RuleResult> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fifteenDaysAgoStart = new Date(startOfDay);
  fifteenDaysAgoStart.setDate(fifteenDaysAgoStart.getDate() - 15);
  const endOfToday = new Date(startOfDay);
  endOfToday.setDate(endOfToday.getDate() + 1);
  endOfToday.setMilliseconds(-1);

  const count = await tx.appointment.count({
    where: {
      residentId,
      scheduledAt: { gte: fifteenDaysAgoStart, lte: endOfToday },
      status: { notIn: ["cancelled", "no_show"] },
      deletedAt: null,
    },
  });
  if (count > 0)
    return reject(
      APPOINTMENT_ERRORS.FIFTEEN_DAY_LIMIT,
      "15天内已有预约记录，请15天后再预约"
    );
  return { allowed: true };
}

export async function checkMachineAvailability(
  tx: any,
  machineId: string,
  scheduledAt: Date
): Promise<RuleResult> {
  if (!machineId) return { allowed: true };

  const thirtyMinBefore = new Date(scheduledAt.getTime() - 30 * 60 * 1000);
  const thirtyMinAfter = new Date(scheduledAt.getTime() + 30 * 60 * 1000);

  const conflict = await tx.appointment.findFirst({
    where: {
      machineId,
      scheduledAt: { gte: thirtyMinBefore, lte: thirtyMinAfter },
      status: { notIn: ["cancelled", "no_show"] },
      deletedAt: null,
    },
  });
  if (conflict)
    return reject(APPOINTMENT_ERRORS.SLOT_TAKEN, "该时间段内该设备已被预约");
  return { allowed: true };
}

export async function isBookingAllowed(
  tx: any,
  data: {
    residentId: string;
    storeId: string;
    machineId?: string;
    scheduledAt: Date;
  }
): Promise<RuleResult> {
  // Step 1: Resident exists
  const r1 = await checkResidentExists(tx, data.residentId, data.storeId);
  if (!r1.allowed) return r1;

  // Step 2: No-show penalty
  const r2 = await checkNoShowPenalty(tx, data.residentId);
  if (!r2.allowed) return r2;

  // Step 3: Monitored
  const r3 = await checkResidentMonitored(tx, data.residentId);
  if (!r3.allowed) return r3;

  // Step 4: 15-day limit (campaign bonus bypasses this)
  const r4 = await check15DayLimit(tx, data.residentId);
  if (!r4.allowed) {
    // Check if resident has campaign bonus that bypasses the 15-day limit
    const campaignCheck = await checkCampaignBonus(tx, data.residentId, data.storeId);
    const bonus = campaignCheck.bonusCount ?? 0;
    if (bonus <= 0) {
      return r4; // No bonus — enforce 15-day limit
    }
    console.log(`[campaign] Bonus bypass: resident=${data.residentId}, bonus=${bonus}`);
  }

  // Step 5: Machine availability (skip if no machineId)
  if (data.machineId) {
    const r5 = await checkMachineAvailability(tx, data.machineId, data.scheduledAt);
    if (!r5.allowed) return r5;
  }

  return { allowed: true };
}
