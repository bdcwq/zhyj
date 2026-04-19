import { NextRequest } from "next/server";
import { updateCampaignSchema } from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { CAMPAIGN_ERRORS } from "@zhyj/shared";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    const campaign = await prisma.campaign.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
      include: {
        _count: { select: { participations: true } },
      },
    });

    if (!campaign) {
      return errorResponse(CAMPAIGN_ERRORS.NOT_FOUND, "活动不存在", 404);
    }

    return successResponse({
      ...campaign,
      participationCount: campaign._count.participations,
    });
  } catch (error) {
    console.error("[campaign] Get error:", error);
    return errorResponse(CAMPAIGN_ERRORS.VALIDATION_ERROR, "获取活动失败", 500);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    const existing = await prisma.campaign.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
    });
    if (!existing) {
      return errorResponse(CAMPAIGN_ERRORS.NOT_FOUND, "活动不存在", 404);
    }

    const body = await request.json();
    const parsed = updateCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(CAMPAIGN_ERRORS.VALIDATION_ERROR, parsed.error.errors[0].message, 400);
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.type !== undefined) data.type = parsed.data.type;
    if (parsed.data.rules !== undefined) data.rules = JSON.stringify(parsed.data.rules);
    if (parsed.data.startDate !== undefined) data.startDate = new Date(parsed.data.startDate);
    if (parsed.data.endDate !== undefined) data.endDate = new Date(parsed.data.endDate);
    if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
    if (parsed.data.status !== undefined) data.status = parsed.data.status;

    const campaign = await prisma.campaign.update({
      where: { id },
      data,
    });

    console.log(`[campaign] Updated: ${id}`);

    return successResponse(campaign);
  } catch (error) {
    console.error("[campaign] Update error:", error);
    return errorResponse(CAMPAIGN_ERRORS.UPDATE_FAILED, "更新活动失败", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    const existing = await prisma.campaign.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
    });
    if (!existing) {
      return errorResponse(CAMPAIGN_ERRORS.NOT_FOUND, "活动不存在", 404);
    }

    await prisma.campaign.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    console.log(`[campaign] Deleted: ${id}`);

    return successResponse({ id });
  } catch (error) {
    console.error("[campaign] Delete error:", error);
    return errorResponse(CAMPAIGN_ERRORS.DELETE_FAILED, "删除活动失败", 500);
  }
}
