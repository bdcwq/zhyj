import { prisma } from "@/lib/db";

type RuleResult = { allowed: boolean; code?: string; reason?: string; bonusCount?: number };

/**
 * Check if a resident has active campaign bonuses that grant extra appointments.
 * Returns the number of bonus appointments available (which bypass the 15-day limit).
 */
export async function checkCampaignBonus(
  tx: any,
  residentId: string,
  storeId: string
): Promise<RuleResult> {
  const now = new Date();

  // Find all active campaigns for this store
  const activeCampaigns = await tx.campaign.findMany({
    where: {
      storeId,
      status: "active",
      startDate: { lte: now },
      endDate: { gte: now },
      deletedAt: null,
    },
    orderBy: { priority: "desc" },
  });

  if (activeCampaigns.length === 0) {
    return { allowed: true, bonusCount: 0 };
  }

  // Check if this resident was referred (is a referrer) in any active campaign
  // and has pending participations that grant bonus appointments
  let totalBonus = 0;

  for (const campaign of activeCampaigns) {
    let rules: { bonusAppointments?: number; rewardCondition?: string };
    try {
      rules = JSON.parse(campaign.rules);
    } catch {
      continue;
    }

    const bonusPerReferral = rules.bonusAppointments || 1;

    // Count completed referrals where this resident is the referrer
    const completedReferrals = await tx.campaignParticipation.count({
      where: {
        campaignId: campaign.id,
        referrerId: residentId,
        status: "completed",
      },
    });

    // Count pending referrals too (not yet completed)
    const pendingReferrals = await tx.campaignParticipation.count({
      where: {
        campaignId: campaign.id,
        referrerId: residentId,
        status: "pending",
      },
    });

    totalBonus += completedReferrals * bonusPerReferral;
    // Note: pending referrals don't grant bonuses until completed
  }

  return { allowed: true, bonusCount: totalBonus };
}

/**
 * Check if a resident has used their bonus appointments for a given campaign.
 * Returns the remaining bonus count.
 */
export async function getRemainingBonus(
  tx: any,
  residentId: string,
  storeId: string
): Promise<number> {
  const { bonusCount = 0 } = await checkCampaignBonus(tx, residentId, storeId);
  if (bonusCount === 0) return 0;

  // Count how many appointments the resident has that were created
  // after their first bonus-earning referral was completed.
  // For simplicity: count non-cancelled appointments in the current 15-day window
  // and subtract from bonus count.
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fifteenDaysAgoStart = new Date(startOfDay);
  fifteenDaysAgoStart.setDate(fifteenDaysAgoStart.getDate() - 15);
  const endOfToday = new Date(startOfDay);
  endOfToday.setDate(endOfToday.getDate() + 1);
  endOfToday.setMilliseconds(-1);

  const usedInWindow = await tx.appointment.count({
    where: {
      residentId,
      scheduledAt: { gte: fifteenDaysAgoStart, lte: endOfToday },
      status: { notIn: ["cancelled", "no_show"] },
      deletedAt: null,
    },
  });

  return Math.max(0, bonusCount - usedInWindow);
}

/**
 * Find the highest-priority active campaign for a store.
 */
export async function getActiveCampaign(
  tx: any,
  storeId: string
): Promise<any | null> {
  const now = new Date();
  return tx.campaign.findFirst({
    where: {
      storeId,
      status: "active",
      startDate: { lte: now },
      endDate: { gte: now },
      deletedAt: null,
    },
    orderBy: { priority: "desc" },
  });
}

/**
 * Mark a participation as completed (called when referee's first appointment is verified).
 */
export async function completeParticipation(
  tx: any,
  campaignId: string,
  refereeId: string
): Promise<void> {
  await tx.campaignParticipation.updateMany({
    where: {
      campaignId,
      refereeId,
      status: "pending",
    },
    data: {
      status: "completed",
      completedAt: new Date(),
    },
  });
  console.log(`[campaign] Participation completed: campaign=${campaignId}, referee=${refereeId}`);
}
