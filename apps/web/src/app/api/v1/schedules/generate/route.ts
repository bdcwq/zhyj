import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { SCHEDULE_ERRORS } from "@zhyj/shared";
import { generateScheduleSchema, type ShiftDefinition } from "@zhyj/shared";

// ── POST /api/v1/schedules/generate — Generate weekly schedules from template ──

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const body = await request.json();

    // Zod validation
    const parsed = generateScheduleSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return errorResponse(
        SCHEDULE_ERRORS.INVALID_PARAMS,
        firstError?.message || "参数验证失败",
        400,
      );
    }

    const { templateId, weekStartDate } = parsed.data;

    // Validate weekStartDate is Monday (JS getDay: 0=Sun, 1=Mon)
    const monday = new Date(weekStartDate + "T00:00:00");
    if (monday.getDay() !== 1) {
      return errorResponse(
        SCHEDULE_ERRORS.INVALID_PARAMS,
        "周开始日期必须是周一",
        400,
      );
    }

    // Load template
    const template = await prisma.shiftTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template || template.deletedAt) {
      return errorResponse(
        SCHEDULE_ERRORS.TEMPLATE_NOT_FOUND,
        "轮班模板不存在或已删除",
        404,
      );
    }

    // Store manager: can only use templates from own store
    const storeId = ctx.role === "store_manager" ? ctx.storeId : template.storeId;
    if (template.storeId !== storeId) {
      return errorResponse(
        SCHEDULE_ERRORS.INVALID_PARAMS,
        "无权使用该门店的模板",
        403,
      );
    }

    // Parse JSON fields
    let shifts: ShiftDefinition[];
    let effectiveDays: number[];
    try {
      shifts = JSON.parse(template.shifts) as ShiftDefinition[];
      effectiveDays = JSON.parse(template.effectiveDays) as number[];
    } catch {
      return errorResponse(
        SCHEDULE_ERRORS.INVALID_PARAMS,
        "模板数据格式异常",
        400,
      );
    }

    // Get all staff for the store
    const staffStores = await prisma.staffStore.findMany({
      where: { storeId },
      include: { staff: true },
    });

    if (staffStores.length === 0) {
      return errorResponse(
        SCHEDULE_ERRORS.NO_AVAILABLE_STAFF,
        "该门店暂无员工，无法生成排班",
        400,
      );
    }

    // Generation algorithm
    const effectiveDaySet = new Set(effectiveDays);
    const created: Prisma.PrismaPromise<unknown>[] = [];
    const conflicts: {
      date: string;
      shiftType: string;
      needed: number;
      available: number;
    }[] = [];

    for (let day = 0; day < 7; day++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + day);
      const isoWeekday = day + 1;

      // Skip days not in effectiveDays
      if (!effectiveDaySet.has(isoWeekday)) continue;

      const dateStr = date.toISOString().split("T")[0];
      const startOfDay = new Date(dateStr + "T00:00:00");
      const endOfDay = new Date(dateStr + "T23:59:59.999");

      for (const shift of shifts) {
        // Query existing schedules for this store/date to find already-assigned staff
        const existing = await prisma.schedule.findMany({
          where: {
            storeId,
            date: { gte: startOfDay, lte: endOfDay },
            status: "scheduled",
          },
          select: { staffId: true },
        });

        const assignedStaffIds = new Set(
          existing.map((s: { staffId: string }) => s.staffId),
        );
        const available = staffStores.filter(
          (ss) => !assignedStaffIds.has(ss.staffId),
        );

        if (available.length < shift.requiredStaff) {
          conflicts.push({
            date: dateStr,
            shiftType: shift.type,
            needed: shift.requiredStaff,
            available: available.length,
          });
        }

        // Assign up to requiredStaff from available
        const assignCount = Math.min(shift.requiredStaff, available.length);
        for (let i = 0; i < assignCount; i++) {
          created.push(
            prisma.schedule.create({
              data: {
                date: startOfDay,
                staffId: available[i].staffId,
                storeId,
                shiftType: shift.type,
                startTime: shift.startTime,
                endTime: shift.endTime,
                status: "scheduled",
                templateId: template.id,
              },
            }),
          );
        }
      }
    }

    // Batch create all schedules in a transaction
    let createdCount = 0;
    try {
      const results = await prisma.$transaction(created);
      createdCount = results.length;
    } catch (error) {
      // Handle Prisma unique constraint violation (P2002)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        console.error(
          `[schedule] Unique constraint violation during generation: templateId=${templateId}`,
          error,
        );
        return errorResponse(
          SCHEDULE_ERRORS.CONFLICT_DETECTED,
          "排班冲突：部分员工在同一时段已有排班",
          409,
        );
      }
      console.error("[schedule] Transaction failed:", error);
      return errorResponse(
        SCHEDULE_ERRORS.GENERATE_FAILED,
        "生成排班失败",
        500,
      );
    }

    const weekEnd = new Date(monday);
    weekEnd.setDate(monday.getDate() + 6);
    const weekRange = `${weekStartDate} ~ ${weekEnd.toISOString().split("T")[0]}`;

    console.log(
      `[schedule] Generated ${createdCount} schedules: templateId=${templateId}, ` +
        `week=${weekRange}, conflicts=${conflicts.length}`,
    );

    return successResponse({
      created: createdCount,
      conflicts,
      templateName: template.name,
    });
  } catch (error) {
    console.error("[schedule] Generate error:", error);
    return errorResponse(
      SCHEDULE_ERRORS.GENERATE_FAILED,
      "生成排班失败",
      500,
    );
  }
}
