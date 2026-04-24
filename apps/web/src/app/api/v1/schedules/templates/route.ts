import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { SCHEDULE_ERRORS } from "@zhyj/shared";
import { createTemplateSchema } from "@zhyj/shared";

// ── GET /api/v1/schedules/templates — List shift templates ──

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

    // Build where clause
    const where: Record<string, unknown> = { deletedAt: null };

    // Store manager: only see their own store's templates
    if (ctx.role === "store_manager") {
      where.storeId = ctx.storeId;
    }

    // Search by name (case-insensitive)
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const [records, total] = await Promise.all([
      prisma.shiftTemplate.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.shiftTemplate.count({ where }),
    ]);

    // Parse JSON fields for response
    const parsed = records.map((r) => ({
      ...r,
      shifts: JSON.parse(r.shifts),
      effectiveDays: JSON.parse(r.effectiveDays),
    }));

    console.log(`[schedule-template] Listed ${records.length} templates (total: ${total})`);

    return successResponse({ records: parsed, total, limit, offset });
  } catch (error) {
    console.error("[schedule-template] List error:", error);
    return errorResponse(SCHEDULE_ERRORS.CREATE_FAILED, "获取轮班模板列表失败", 500);
  }
}

// ── POST /api/v1/schedules/templates — Create shift template ──

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const body = await request.json();

    // Zod validation
    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return errorResponse(
        SCHEDULE_ERRORS.INVALID_PARAMS,
        firstError?.message || "参数验证失败",
        400,
      );
    }

    const { name, shifts, effectiveDays } = parsed.data;

    const template = await prisma.shiftTemplate.create({
      data: {
        name,
        storeId: ctx.storeId,
        shifts: JSON.stringify(shifts),
        effectiveDays: JSON.stringify(effectiveDays),
      },
    });

    // Parse JSON fields for response
    const response = {
      ...template,
      shifts: JSON.parse(template.shifts),
      effectiveDays: JSON.parse(template.effectiveDays),
    };

    console.log(`[schedule-template] Created template: id=${template.id}, name=${name}`);

    return successResponse(response, 201);
  } catch (error) {
    console.error("[schedule-template] Create error:", error);
    return errorResponse(SCHEDULE_ERRORS.CREATE_FAILED, "创建轮班模板失败", 500);
  }
}
