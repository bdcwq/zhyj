import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { SCHEDULE_ERRORS } from "@zhyj/shared";
import { updateTemplateSchema } from "@zhyj/shared";

// ── GET /api/v1/schedules/templates/[id] — Get template detail ──

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    const template = await prisma.shiftTemplate.findUnique({
      where: { id },
    });

    if (!template || template.deletedAt) {
      return errorResponse(SCHEDULE_ERRORS.TEMPLATE_NOT_FOUND, "轮班模板不存在", 404);
    }

    // Store manager: can only view their own store's templates
    if (ctx.role === "store_manager" && template.storeId !== ctx.storeId) {
      return errorResponse(SCHEDULE_ERRORS.TEMPLATE_NOT_FOUND, "轮班模板不存在", 404);
    }

    const response = {
      ...template,
      shifts: JSON.parse(template.shifts),
      effectiveDays: JSON.parse(template.effectiveDays),
    };

    console.log(`[schedule-template] Fetched template: id=${id}`);

    return successResponse(response);
  } catch (error) {
    console.error("[schedule-template] Get error:", error);
    return errorResponse(SCHEDULE_ERRORS.UPDATE_FAILED, "获取轮班模板失败", 500);
  }
}

// ── PUT /api/v1/schedules/templates/[id] — Update template ──

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    // Check template exists and is active
    const existing = await prisma.shiftTemplate.findUnique({
      where: { id },
    });

    if (!existing || existing.deletedAt) {
      return errorResponse(SCHEDULE_ERRORS.TEMPLATE_NOT_FOUND, "轮班模板不存在", 404);
    }

    // Store manager: can only update their own store's templates
    if (ctx.role === "store_manager" && existing.storeId !== ctx.storeId) {
      return errorResponse(SCHEDULE_ERRORS.TEMPLATE_NOT_FOUND, "轮班模板不存在", 404);
    }

    const body = await request.json();

    // Zod validation (partial)
    const parsed = updateTemplateSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return errorResponse(
        SCHEDULE_ERRORS.INVALID_PARAMS,
        firstError?.message || "参数验证失败",
        400,
      );
    }

    const { name, shifts, effectiveDays } = parsed.data;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (shifts !== undefined) updateData.shifts = JSON.stringify(shifts);
    if (effectiveDays !== undefined) updateData.effectiveDays = JSON.stringify(effectiveDays);

    const updated = await prisma.shiftTemplate.update({
      where: { id },
      data: updateData,
    });

    const response = {
      ...updated,
      shifts: JSON.parse(updated.shifts),
      effectiveDays: JSON.parse(updated.effectiveDays),
    };

    console.log(`[schedule-template] Updated template: id=${id}`);

    return successResponse(response);
  } catch (error) {
    console.error("[schedule-template] Update error:", error);
    return errorResponse(SCHEDULE_ERRORS.UPDATE_FAILED, "更新轮班模板失败", 500);
  }
}

// ── DELETE /api/v1/schedules/templates/[id] — Soft-delete template (admin only) ──

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin"], request.url);
    if (roleGuard) return roleGuard;

    const { id } = await params;

    // Check template exists and is active
    const existing = await prisma.shiftTemplate.findUnique({
      where: { id },
    });

    if (!existing || existing.deletedAt) {
      return errorResponse(SCHEDULE_ERRORS.TEMPLATE_NOT_FOUND, "轮班模板不存在", 404);
    }

    await prisma.shiftTemplate.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    console.log(`[schedule-template] Deleted template: id=${id}`);

    return successResponse({ id });
  } catch (error) {
    console.error("[schedule-template] Delete error:", error);
    return errorResponse(SCHEDULE_ERRORS.DELETE_FAILED, "删除轮班模板失败", 500);
  }
}
