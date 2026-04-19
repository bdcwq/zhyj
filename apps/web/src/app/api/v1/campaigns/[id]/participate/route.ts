import { NextRequest } from "next/server";
import { participateCampaignSchema } from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { CAMPAIGN_ERRORS } from "@zhyj/shared";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { id: campaignId } = await params;
    const body = await request.json();
    const parsed = participateCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(CAMPAIGN_ERRORS.VALIDATION_ERROR, parsed.error.errors[0].message, 400);
    }

    const { refereeId } = parsed.data;
    const referrerId = ctx.staffId || ctx.residentId;
    if (!referrerId) {
      return errorResponse(CAMPAIGN_ERRORS.VALIDATION_ERROR, "无法确定推荐人身份", 401);
    }

    // Check campaign exists and is active
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, storeId: ctx.storeId, deletedAt: null },
    });

    if (!campaign) {
      return errorResponse(CAMPAIGN_ERRORS.NOT_FOUND, "活动不存在", 404);
    }

    if (campaign.status !== "active") {
      return errorResponse(CAMPAIGN_ERRORS.NOT_ACTIVE, "活动未激活", 400);
    }

    const now = new Date();
    if (now < campaign.startDate || now > campaign.endDate) {
      return errorResponse(CAMPAIGN_ERRORS.NOT_ACTIVE, "活动不在有效期内", 400);
    }

    // Validate referrer exists as a resident in this store
    const referrer = await prisma.resident.findFirst({
      where: { id: referrerId, residentStores: { some: { storeId: ctx.storeId } }, deletedAt: null },
    });
    if (!referrer) {
      return errorResponse(CAMPAIGN_ERRORS.VALIDATION_ERROR, "推荐人不存在", 400);
    }

    // Check referee exists in this store
    const referee = await prisma.resident.findFirst({
      where: { id: refereeId, residentStores: { some: { storeId: ctx.storeId } }, deletedAt: null },
    });
    if (!referee) {
      return errorResponse(CAMPAIGN_ERRORS.VALIDATION_ERROR, "被推荐人不存在", 400);
    }

    // Prevent self-referral
    if (referrerId === refereeId) {
      return errorResponse(CAMPAIGN_ERRORS.VALIDATION_ERROR, "不能自我推荐", 400);
    }

    // Check for duplicate participation
    const existing = await prisma.campaignParticipation.findUnique({
      where: {
        campaignId_refereeId: { campaignId, refereeId },
      },
    });

    if (existing) {
      return errorResponse(CAMPAIGN_ERRORS.ALREADY_PARTICIPATING, "该居民已参与此活动", 400);
    }

    // Create participation
    const participation = await prisma.campaignParticipation.create({
      data: {
        campaignId,
        referrerId,
        refereeId,
        storeId: ctx.storeId,
      },
    });

    console.log(
      `[campaign] Participation created: campaign=${campaignId}, referrer=${referrerId}, referee=${refereeId}`
    );

    return successResponse(participation, 201);
  } catch (error) {
    console.error("[campaign] Participate error:", error);
    return errorResponse(CAMPAIGN_ERRORS.PARTICIPATE_FAILED, "参与活动失败", 500);
  }
}
