import { NextRequest } from "next/server";
import { campaignListQuerySchema, createCampaignSchema } from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { CAMPAIGN_ERRORS } from "@zhyj/shared";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { searchParams } = new URL(request.url);
    const raw = {
      limit: searchParams.get("limit") || undefined,
      offset: searchParams.get("offset") || undefined,
      status: searchParams.get("status") || undefined,
      type: searchParams.get("type") || undefined,
    };

    const parsed = campaignListQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(CAMPAIGN_ERRORS.VALIDATION_ERROR, parsed.error.errors[0].message, 400);
    }

    const { limit, offset, status, type } = parsed.data;

    const where: Record<string, unknown> = { storeId: ctx.storeId, deletedAt: null };
    if (status) where.status = status;
    if (type) where.type = type;

    const [records, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma.campaign.count({ where }),
    ]);

    return successResponse({ records, total, limit, offset });
  } catch (error) {
    console.error("[campaign] List error:", error);
    return errorResponse(CAMPAIGN_ERRORS.VALIDATION_ERROR, "获取活动列表失败", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const body = await request.json();
    const parsed = createCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(CAMPAIGN_ERRORS.VALIDATION_ERROR, parsed.error.errors[0].message, 400);
    }

    const { name, type, rules, startDate, endDate, priority } = parsed.data;

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end <= start) {
      return errorResponse(CAMPAIGN_ERRORS.VALIDATION_ERROR, "结束日期必须晚于开始日期", 400);
    }

    const campaign = await prisma.campaign.create({
      data: {
        name,
        type,
        rules: JSON.stringify(rules),
        startDate: start,
        endDate: end,
        priority,
        storeId: ctx.storeId,
      },
    });

    console.log(`[campaign] Created: ${campaign.id} "${name}" (${type}, priority ${priority})`);

    return successResponse(campaign, 201);
  } catch (error) {
    console.error("[campaign] Create error:", error);
    return errorResponse(CAMPAIGN_ERRORS.CREATE_FAILED, "创建活动失败", 500);
  }
}
