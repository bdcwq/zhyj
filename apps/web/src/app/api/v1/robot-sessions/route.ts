import { NextRequest } from "next/server";
import {
  createRobotSessionSchema,
  robotSessionListQuerySchema,
} from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { canStartSession } from "@/lib/robot-rules";
import { startSession } from "@/lib/mock-robot-adapter";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager", "staff"], request.url);
    if (roleGuard) return roleGuard;

    // Staff-only
    if (!ctx.staffId) {
      return errorResponse("AUTH_006", "仅工作人员可操作", 403);
    }

    const body = await request.json();
    const parsed = createRobotSessionSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("AUTH_005", parsed.error.errors[0].message, 400);
    }

    const { appointmentId, routine } = parsed.data;

    // Check rules
    const ruleResult = await canStartSession(
      prisma,
      appointmentId,
      ctx.staffId || "",
      ctx.storeId
    );

    if (!ruleResult.allowed) {
      return errorResponse(
        ruleResult.code || "ROBOT_006",
        ruleResult.reason || "无法启动机器人会话",
        400
      );
    }

    // Create session in transaction
    const session = await prisma.$transaction(async (tx: any) => {
      const newSession = await tx.robotSession.create({
        data: {
          appointmentId,
          routine: routine || null,
          status: "active",
          startedAt: new Date(),
          storeId: ctx.storeId,
        },
        include: {
          appointment: {
            include: {
              resident: { select: { id: true, name: true, phone: true } },
            },
          },
        },
      });

      // Update appointment to in_progress
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: "in_progress" },
      });

      return newSession;
    });

    // Start mock session
    startSession(session.id, appointmentId, routine || "default");

    console.log(
      `[robot-session] Started session ${session.id} for appointment ${appointmentId}`
    );

    return successResponse(session, 201);
  } catch (error) {
    console.error("[robot-session] Create error:", error);
    return errorResponse("ROBOT_006", "创建机器人会话失败", 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager", "staff"], request.url);
    if (roleGuard) return roleGuard;

    // Staff-only
    if (!ctx.staffId) {
      return errorResponse("AUTH_006", "仅工作人员可查看", 403);
    }

    const { searchParams } = new URL(request.url);
    const query = robotSessionListQuerySchema.safeParse({
      limit: searchParams.get("limit") || "20",
      offset: searchParams.get("offset") || "0",
      status: searchParams.get("status") || undefined,
      residentId: searchParams.get("residentId") || undefined,
    });

    if (!query.success) {
      return errorResponse("AUTH_005", query.error.errors[0].message, 400);
    }

    const { limit, offset, status, residentId } = query.data;

    const where: Record<string, unknown> = {
      storeId: ctx.storeId,
    };

    if (status) where.status = status;
    if (residentId) {
      where.appointment = { residentId };
    }

    const [records, total] = await Promise.all([
      prisma.robotSession.findMany({
        where,
        include: {
          appointment: {
            include: {
              resident: { select: { id: true, name: true, phone: true } },
            },
          },
        },
        orderBy: { startedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.robotSession.count({ where }),
    ]);

    console.log(
      `[robot-session] Listed ${records.length} sessions (total: ${total})`
    );

    return successResponse({ records, total, limit, offset });
  } catch (error) {
    console.error("[robot-session] List error:", error);
    return errorResponse("ROBOT_006", "获取机器人会话列表失败", 500);
  }
}
