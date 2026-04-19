import { ROBOT_ROUTINES } from './robot-routines';

type Session = {
  appointmentId: string;
  routine: string;
  status: "active" | "paused" | "completed" | "error";
  progress: number;
  startedAt: Date;
  completedAt?: Date;
};

const sessions = new Map<string, Session>();
const intervals = new Map<string, ReturnType<typeof setInterval>>();

export function startSession(
  appointmentId: string,
  routine: string = "default"
): Session {
  const session: Session = {
    appointmentId,
    routine,
    status: "active",
    progress: 0,
    startedAt: new Date(),
  };
  sessions.set(appointmentId, session);

  // Simulate progress: increment 2% every 5s, stop at 100%
  const interval = setInterval(() => {
    const s = sessions.get(appointmentId);
    if (!s || s.status !== "active") {
      clearInterval(intervals.get(appointmentId));
      return;
    }
    s.progress = Math.min(s.progress + 2, 100);
    if (s.progress >= 100) {
      s.status = "completed";
      s.completedAt = new Date();
      clearInterval(interval);
    }
  }, 5000);
  intervals.set(appointmentId, interval);

  return session;
}

export function stopSession(appointmentId: string): Session | null {
  const session = sessions.get(appointmentId);
  if (!session) return null;

  clearInterval(intervals.get(appointmentId));
  session.status = "completed";
  session.progress = 100;
  session.completedAt = new Date();
  return session;
}

export function getSessionStatus(appointmentId: string): Session | null {
  return sessions.get(appointmentId) ?? null;
}

export function listRoutines() {
  return ROBOT_ROUTINES.map((r) => ({
    id: r.id,
    name: r.name,
    duration: r.duration,
  }));
}

export function resetMock(): void {
  for (const interval of intervals.values()) {
    clearInterval(interval);
  }
  sessions.clear();
  intervals.clear();
}
