import { NextRequest } from "next/server";
import {
  activityListQuerySchema,
  createActivitySchema,
  ACTIVITY_ERRORS,
} from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);

    const { searchParams } = new URL(request.url);
    const raw = {
      date: searchParams.get("date") || undefined,
      type: searchParams.get("type") || undefined,
      status: searchParams.get("status") || undefined,
      limit: searchParams.get("limit") || undefined,
      offset: searchParams.get("offset") || undefined,
    };

    const parsed = activityListQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(
        ACTIVITY_ERRORS.OPERATION_FAILED,
        parsed.error.errors[0].message,
        400
      );
    }

    const { date, type, status, limit, offset } = parsed.data;

    // Build where clause — residents only see published activities
    const where: Record<string, unknown> = {
      storeId: ctx.storeId,
      deletedAt: null,
    };

    // Residents can only see published activities
    if (ctx.residentId && !ctx.staffId) {
      where.status = "published";
    }

    if (type) where.type = type;
    if (status && !ctx.residentId) where.status = status;
    if (date) {
      where.activityDate = new Date(date);
    }

    // Backward-compatible pagination: if no limit/offset, return plain array
    if (limit === undefined) {
      const records = await prisma.activity.findMany({
        where,
        orderBy: [{ activityDate: "asc" }, { startTime: "asc" }],
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          customType: true,
          activityDate: true,
          startTime: true,
          endTime: true,
          maxCapacity: true,
          currentCapacity: true,
          liveStreamUrl: true,
          status: true,
          instructorId: true,
          instructor: { select: { id: true, name: true } },
        },
      });
      return successResponse(records);
    }

    const [records, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        orderBy: [{ activityDate: "asc" }, { startTime: "asc" }],
        take: limit,
        skip: offset,
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          customType: true,
          activityDate: true,
          startTime: true,
          endTime: true,
          maxCapacity: true,
          currentCapacity: true,
          liveStreamUrl: true,
          status: true,
          instructorId: true,
          instructor: { select: { id: true, name: true } },
        },
      }),
      prisma.activity.count({ where }),
    ]);

    return successResponse({ records, total, limit, offset });
  } catch (error) {
    console.error("[activity] List error:", error);
    return errorResponse(ACTIVITY_ERRORS.OPERATION_FAILED, "获取活动列表失败", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const body = await request.json();
    const parsed = createActivitySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        ACTIVITY_ERRORS.OPERATION_FAILED,
        parsed.error.errors[0].message,
        400
      );
    }

    const {
      name,
      description,
      type,
      customType,
      activityDate,
      startTime,
      endTime,
      maxCapacity,
      liveStreamUrl,
      instructorId,
    } = parsed.data;

    // Validate instructor belongs to store if provided
    if (instructorId) {
      const instructor = await prisma.instructor.findFirst({
        where: { id: instructorId, storeId: ctx.storeId, deletedAt: null, status: "active" },
      });
      if (!instructor) {
        return errorResponse(
          ACTIVITY_ERRORS.OPERATION_FAILED,
          "该老师不存在或不在当前门店",
          400
        );
      }
    }

    const activity = await prisma.activity.create({
      data: {
        name,
        description,
        type,
        customType: type === "custom" ? customType : undefined,
        storeId: ctx.storeId,
        activityDate: new Date(activityDate),
        startTime,
        endTime,
        maxCapacity,
        liveStreamUrl: liveStreamUrl || undefined,
        status: "draft",
        instructorId: instructorId || undefined,
      },
    });

    console.log(
      `[activity] Created: ${activity.id} "${name}" (${type})`
    );

    return successResponse(activity, 201);
  } catch (error) {
    console.error("[activity] Create error:", error);
    return errorResponse(ACTIVITY_ERRORS.OPERATION_FAILED, "创建活动失败", 500);
  }
}
