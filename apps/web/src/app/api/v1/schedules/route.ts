import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { SCHEDULE_ERRORS } from "@zhyj/shared";
import { scheduleListQuerySchema } from "@zhyj/shared";

// ── GET /api/v1/schedules — List schedules with filters/pagination ──

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const { searchParams } = new URL(request.url);
    const raw = Object.fromEntries(searchParams.entries());
    const parsed = scheduleListQuerySchema.safeParse(raw);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return errorResponse(
        SCHEDULE_ERRORS.INVALID_PARAMS,
        firstError?.message || "参数验证失败",
        400,
      );
    }

    const { limit, offset, dateFrom, dateTo, staffId, status } = parsed.data;

    // Build where clause
    const where: Record<string, unknown> = {};

    // Store manager: only see their own store's schedules
    if (ctx.role === "store_manager") {
      where.storeId = ctx.storeId;
    }

    // Date range filters
    if (dateFrom) {
      where.date = { ...(where.date as Record<string, unknown>), gte: new Date(dateFrom) };
    }
    if (dateTo) {
      where.date = { ...(where.date as Record<string, unknown>), lte: new Date(dateTo) };
    }

    // Staff filter
    if (staffId) {
      where.staffId = staffId;
    }

    // Status filter
    if (status) {
      where.status = status;
    }

    const [records, total] = await Promise.all([
      prisma.schedule.findMany({
        where,
        include: {
          staff: {
            select: { id: true, name: true, phone: true },
          },
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        take: limit,
        skip: offset,
      }),
      prisma.schedule.count({ where }),
    ]);

    console.log(
      `[schedule] Listed ${records.length} schedules (total: ${total})` +
        (dateFrom ? `, from=${dateFrom}` : "") +
        (dateTo ? `, to=${dateTo}` : "") +
        (staffId ? `, staffId=${staffId}` : "") +
        (status ? `, status=${status}` : ""),
    );

    return successResponse({ records, total, limit, offset });
  } catch (error) {
    console.error("[schedule] List error:", error);
    return errorResponse(SCHEDULE_ERRORS.CREATE_FAILED, "获取排班列表失败", 500);
  }
}
