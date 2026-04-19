import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { notificationService } from "@/lib/notification";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    // Check appointment exists and belongs to store
    const appointment = await prisma.appointment.findFirst({
      where: { id, storeId: ctx.storeId, deletedAt: null },
    });

    if (!appointment) {
      return errorResponse("VERIFICATION_001", "预约不存在", 404);
    }

    // Check status is booked or confirmed
    if (!["booked", "confirmed"].includes(appointment.status)) {
      if (appointment.status === "verified") {
        const existingVerification = await prisma.verification.findFirst({
          where: { appointmentId: id },
        });
        if (existingVerification) {
          return successResponse({
            appointment,
            verification: existingVerification,
            message: "预约已核销",
          });
        }
      }
      return errorResponse(
        "VERIFICATION_003",
        `预约状态为"${appointment.status}"，无法核销`,
        400
      );
    }

    // Check if already verified
    const existingVerification = await prisma.verification.findFirst({
      where: { appointmentId: id },
    });

    if (existingVerification) {
      if (appointment.status !== "verified") {
        await prisma.appointment.update({
          where: { id },
          data: { status: "verified" },
        });
      }
      return successResponse({
        appointment: { ...appointment, status: "verified" },
        verification: existingVerification,
        message: "预约已核销",
      });
    }

    // Create verification record
    const verification = await prisma.verification.create({
      data: {
        appointmentId: id,
        verifiedBy: ctx.staffId!,
        verifiedAt: new Date(),
        storeId: ctx.storeId,
      },
    });

    // Update appointment status
    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: { status: "verified" },
    });

    console.log(`[verification] Verified appointment ${id} by staff ${ctx.staffId}`);

    // ── Campaign completion check ──
    // After verifying, check if this resident has a pending CampaignParticipation.
    // If so, complete it and send a reward notification to the referrer.
    try {
      const pendingParticipation = await prisma.campaignParticipation.findFirst({
        where: {
          refereeId: appointment.residentId,
          status: "pending",
          storeId: ctx.storeId,
        },
        include: { campaign: true },
      });

      if (pendingParticipation) {
        await prisma.campaignParticipation.updateMany({
          where: {
            campaignId: pendingParticipation.campaignId,
            refereeId: appointment.residentId,
            status: "pending",
          },
          data: {
            status: "completed",
            completedAt: new Date(),
          },
        });

        console.log(
          `[campaign] Participation completed: campaign=${pendingParticipation.campaignId}, referee=${appointment.residentId}`
        );

        // Send campaign reward notification to the referrer
        await notificationService.send({
          recipientType: "resident",
          recipientId: pendingParticipation.referrerId,
          type: "campaign_reward",
          title: "推荐奖励",
          content: `您推荐的好友已完成首次预约，您获得了1次额外预约奖励（不受15天限制）`,
          storeId: ctx.storeId,
          channel: "console",
        });

        console.log(
          `[campaign] Reward notification sent to referrer=${pendingParticipation.referrerId}`
        );
      }
    } catch (campaignError) {
      // Don't fail the verification if campaign processing fails
      console.error(
        `[campaign] Error processing campaign completion for appointment ${id}:`,
        campaignError
      );
    }

    return successResponse({
      appointment: updatedAppointment,
      verification,
    });
  } catch (error) {
    console.error("[verification] Verify error:", error);
    return errorResponse("VERIFICATION_005", "核销失败", 500);
  }
}
