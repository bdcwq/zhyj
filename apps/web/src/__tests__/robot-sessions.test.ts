import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  canStartSession,
  canStopSession,
  getSessionForAppointment,
} from "@/lib/robot-rules";
import {
  startSession,
  stopSession,
  getSessionStatus,
  listRoutines,
  resetMock,
} from "@/lib/robot-mock-adapter";
import { ROBOT_SESSION_ERRORS } from "@zhyj/shared";
import type { PrismaClient } from "@prisma/client";

// ── Mock Prisma ──

function createMockPrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  return {
    appointment: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    robotSession: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

const STORE_ID = "store-001";

// ── canStartSession ──

describe("canStartSession", () => {
  it("should reject when appointment not found", async () => {
    const prisma = createMockPrisma();
    const result = await canStartSession(prisma, "apt-nonexistent", "staff-001", STORE_ID);
    expect(result.allowed).toBe(false);
    expect(result.code).toBeDefined();
  });

  it("should reject when appointment not verified", async () => {
    const prisma = createMockPrisma({
      appointment: {
        findUnique: vi.fn().mockResolvedValue({
          id: "apt-001",
          status: "booked",
          storeId: STORE_ID,
          deletedAt: null,
        }),
      },
    });
    const result = await canStartSession(prisma, "apt-001", "staff-001", STORE_ID);
    expect(result.allowed).toBe(false);
  });

  it("should reject confirmed status", async () => {
    const prisma = createMockPrisma({
      appointment: {
        findUnique: vi.fn().mockResolvedValue({
          id: "apt-001",
          status: "confirmed",
          storeId: STORE_ID,
          deletedAt: null,
        }),
      },
    });
    const result = await canStartSession(prisma, "apt-001", "staff-001", STORE_ID);
    expect(result.allowed).toBe(false);
  });

  it("should reject when active session exists", async () => {
    const prisma = createMockPrisma({
      appointment: {
        findUnique: vi.fn().mockResolvedValue({
          id: "apt-001",
          status: "verified",
          storeId: STORE_ID,
          deletedAt: null,
        }),
      },
      robotSession: {
        findFirst: vi.fn().mockResolvedValue({
          id: "rs-001",
          status: "active",
        }),
      },
    });
    const result = await canStartSession(prisma, "apt-001", "staff-001", STORE_ID);
    expect(result.allowed).toBe(false);
  });

  it("should reject when paused session exists", async () => {
    const prisma = createMockPrisma({
      appointment: {
        findUnique: vi.fn().mockResolvedValue({
          id: "apt-001",
          status: "verified",
          storeId: STORE_ID,
          deletedAt: null,
        }),
      },
      robotSession: {
        findFirst: vi.fn().mockResolvedValue({
          id: "rs-001",
          status: "paused",
        }),
      },
    });
    const result = await canStartSession(prisma, "apt-001", "staff-001", STORE_ID);
    expect(result.allowed).toBe(false);
  });

  it("should allow verified with no existing session", async () => {
    const prisma = createMockPrisma({
      appointment: {
        findUnique: vi.fn().mockResolvedValue({
          id: "apt-001",
          status: "verified",
          storeId: STORE_ID,
          deletedAt: null,
        }),
      },
      robotSession: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    const result = await canStartSession(prisma, "apt-001", "staff-001", STORE_ID);
    expect(result.allowed).toBe(true);
  });

  it("should reject storeId scoping", async () => {
    // Real DB: findUnique WHERE id="apt-001" AND storeId="store-001" → no match → null
    const prisma = createMockPrisma();
    const result = await canStartSession(prisma, "apt-001", "staff-001", STORE_ID);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("ROBOT_001");
  });
});

// ── canStopSession ──

describe("canStopSession", () => {
  it("should reject when session not found", async () => {
    const prisma = createMockPrisma();
    const result = await canStopSession(prisma, "rs-nonexistent", STORE_ID);
    expect(result.allowed).toBe(false);
  });

  it("should reject when already completed", async () => {
    const prisma = createMockPrisma({
      robotSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: "rs-001",
          status: "completed",
        }),
      },
    });
    const result = await canStopSession(prisma, "rs-001", STORE_ID);
    expect(result.allowed).toBe(false);
  });

  it("should allow active session", async () => {
    const prisma = createMockPrisma({
      robotSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: "rs-001",
          status: "active",
        }),
      },
    });
    const result = await canStopSession(prisma, "rs-001", STORE_ID);
    expect(result.allowed).toBe(true);
  });

  it("should allow paused session", async () => {
    const prisma = createMockPrisma({
      robotSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: "rs-001",
          status: "paused",
        }),
      },
    });
    const result = await canStopSession(prisma, "rs-001", STORE_ID);
    expect(result.allowed).toBe(true);
  });
});

// ── getSessionForAppointment ──

describe("getSessionForAppointment", () => {
  it("should return active session", async () => {
    const session = { id: "rs-001", status: "active" };
    const prisma = createMockPrisma({
      robotSession: {
        findFirst: vi.fn().mockResolvedValue(session),
      },
    });
    const result = await getSessionForAppointment(prisma, "apt-001");
    expect(result).toEqual(session);
  });

  it("should return null when none exists", async () => {
    const prisma = createMockPrisma({
      robotSession: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    const result = await getSessionForAppointment(prisma, "apt-001");
    expect(result).toBeNull();
  });
});

// ── Mock Adapter ──

describe("Mock Adapter", () => {
  beforeEach(() => {
    resetMock();
  });

  afterEach(() => {
    resetMock();
  });

  it("startSession creates a running entry", () => {
    const session = startSession("apt-001", "routine-a");
    expect(session).toBeTruthy();
    expect(session.appointmentId).toBe("apt-001");
    expect(session.status).toBe("active");
    expect(session.routine).toBe("routine-a");
    expect(session.progress).toBe(0);
  });

  it("stopSession sets idle/100%", () => {
    startSession("apt-002");
    const stopped = stopSession("apt-002");
    expect(stopped).toBeTruthy();
    expect(stopped!.status).toBe("completed");
    expect(stopped!.progress).toBe(100);
  });

  it("getSessionStatus returns current state", () => {
    startSession("apt-003", "routine-b");
    const status = getSessionStatus("apt-003");
    expect(status).toBeTruthy();
    expect(status!.appointmentId).toBe("apt-003");
    expect(status!.status).toBe("active");
  });

  it("getSessionStatus returns null for unknown session", () => {
    const status = getSessionStatus("apt-unknown");
    expect(status).toBeNull();
  });

  it("listRoutines returns array with required fields", () => {
    const routines = listRoutines();
    expect(Array.isArray(routines)).toBe(true);
    expect(routines.length).toBeGreaterThan(0);
    for (const routine of routines) {
      expect(routine).toHaveProperty("id");
      expect(routine).toHaveProperty("name");
      expect(routine).toHaveProperty("duration");
    }
  });

  it("resetMock clears all sessions", () => {
    startSession("apt-004");
    startSession("apt-005");
    resetMock();
    expect(getSessionStatus("apt-004")).toBeNull();
    expect(getSessionStatus("apt-005")).toBeNull();
  });
});

// ── Constants ──

describe("ROBOT_SESSION_ERRORS constants", () => {
  const expectedCodes = [
    "ROBOT_001",
    "ROBOT_002",
    "ROBOT_003",
    "ROBOT_004",
    "ROBOT_005",
    "ROBOT_006",
  ];

  expectedCodes.forEach((code) => {
    it(`should contain ${code}`, () => {
      const values = Object.values(ROBOT_SESSION_ERRORS);
      expect(values).toContain(code);
    });
  });
});
