import { ROBOT_ROUTINES } from "./robot-routines";

interface MockSession {
  appointmentId: string;
  routine: string;
  status: "running" | "paused" | "idle";
  progress: number;
  startedAt: number;
  intervalId?: ReturnType<typeof setInterval>;
}

const sessions = new Map<string, MockSession>();

export function startSession(
  sessionId: string,
  appointmentId: string,
  routine: string = "default"
): void {
  console.log(
    `[robot-session] mock startSession ${sessionId} routine=${routine}`
  );
  const session: MockSession = {
    appointmentId,
    routine,
    status: "running",
    progress: 0,
    startedAt: Date.now(),
  };
  sessions.set(sessionId, session);

  session.intervalId = setInterval(() => {
    session.progress = Math.min(100, session.progress + 2);
    if (session.progress >= 100) {
      session.status = "idle";
      if (session.intervalId) clearInterval(session.intervalId);
    }
  }, 5000);
}

export function stopSession(sessionId: string): void {
  console.log(`[robot-session] mock stopSession ${sessionId}`);
  const session = sessions.get(sessionId);
  if (session) {
    if (session.intervalId) clearInterval(session.intervalId);
    session.status = "idle";
    session.progress = 100;
  }
}

export function getSessionStatus(
  sessionId: string
): { status: string; progress: number; routine: string } | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  return {
    status: session.status,
    progress: session.progress,
    routine: session.routine,
  };
}

export function listRoutines() {
  return ROBOT_ROUTINES;
}

export function resetMock(): void {
  console.log("[robot-session] mock adapter reset");
  for (const session of sessions.values()) {
    if (session.intervalId) clearInterval(session.intervalId);
  }
  sessions.clear();
}
