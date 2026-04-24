import { NextRequest } from "next/server";
import { updateRobotSessionSchema } from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { canStopSession } from "@/lib/robot-rules";
import { stopSession } from "@/lib/mock-robot-adapter";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleUpdate(request, params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleUpdate(request, params);
}

async function handleUpdate(
  request: NextRequest,
  params: Promise<{ id: string }>
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager", "staff"], request.url);
    if (roleGuard) return roleGuard;

    // Staff-only
    if (!ctx.staffId) {
      return errorResponse("AUTH_006", "仅工作人员可操作", 403);
    }

    const { id } = await params;

    const body = await request.json();

    // Support both { status } and { action } formats
    const actionToStatus: Record<string, string> = {
      pause: "paused",
      resume: "in_progress",
      stop: "completed",
    };
    if (body.action && !body.status) {
      body.status = actionToStatus[body.action];
    }

    const parsed = updateRobotSessionSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("AUTH_005", parsed.error.errors[0].message, 400);
    }

    const { status } = parsed.data;

    if (!status) {
      return errorResponse("ROBOT_005", "请指定操作状态", 400);
    }

    // Check rules
    const ruleResult = await canStopSession(prisma, id, ctx.storeId);

    if (!ruleResult.allowed) {
      return errorResponse(
        ruleResult.code || "ROBOT_006",
        ruleResult.reason || "无法执行此操作",
        400
      );
    }

    // Update in transaction
    const session = await prisma.$transaction(async (tx: any) => {
      const updateData: Record<string, unknown> = { status };

      if (status === "completed") {
        updateData.endedAt = new Date();
      }

      const updatedSession = await tx.robotSession.update({
        where: { id },
        data: updateData,
        include: {
          appointment: true,
        },
      });

      // Update appointment status accordingly
      if (status === "completed") {
        await tx.appointment.update({
          where: { id: updatedSession.appointmentId },
          data: { status: "completed" },
        });
      } else if (status === "paused") {
        await tx.appointment.update({
          where: { id: updatedSession.appointmentId },
          data: { status: "confirmed" },
        });
      }

      return updatedSession;
    });

    // Stop mock session
    stopSession(id);

    console.log(
      `[robot-session] Updated session ${id} to status: ${status}`
    );

    return successResponse(session);
  } catch (error) {
    console.error("[robot-session] Update error:", error);
    return errorResponse("ROBOT_006", "更新机器人会话失败", 500);
  }
}
