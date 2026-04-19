import { ROBOT_SESSION_ERRORS } from "@zhyj/shared";

type SessionRuleResult = { allowed: boolean; code?: string; reason?: string };

function reject(code: string, reason: string): SessionRuleResult {
  return { allowed: false, code, reason };
}

export async function canStartSession(
  tx: any,
  appointmentId: string,
  staffId: string,
  storeId: string
): Promise<SessionRuleResult> {
  const appointment = await tx.appointment.findUnique({
    where: { id: appointmentId, storeId, deletedAt: null },
  });
  if (!appointment)
    return reject(ROBOT_SESSION_ERRORS.APPOINTMENT_NOT_FOUND, "预约不存在");
  if (appointment.status !== "verified")
    return reject(
      ROBOT_SESSION_ERRORS.APPOINTMENT_NOT_VERIFIED,
      "预约尚未核销"
    );

  const existingSession = await tx.robotSession.findFirst({
    where: { appointmentId, status: { in: ["active", "paused"] } },
  });
  if (existingSession)
    return reject(ROBOT_SESSION_ERRORS.SESSION_EXISTS, "该预约已有进行中的理疗会话");

  return { allowed: true };
}

export async function canStopSession(
  tx: any,
  sessionId: string,
  storeId: string
): Promise<SessionRuleResult> {
  const session = await tx.robotSession.findUnique({
    where: { id: sessionId, storeId },
  });
  if (!session)
    return reject(ROBOT_SESSION_ERRORS.SESSION_NOT_FOUND, "理疗会话不存在");
  if (session.status === "completed")
    return reject(ROBOT_SESSION_ERRORS.INVALID_STATUS, "会话已结束");
  return { allowed: true };
}

export async function getSessionForAppointment(
  tx: any,
  appointmentId: string
): Promise<any> {
  return tx.robotSession.findFirst({
    where: { appointmentId, status: { in: ["active", "paused"] } },
  });
}
