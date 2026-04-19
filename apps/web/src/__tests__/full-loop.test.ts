import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isBookingAllowed } from "@/lib/appointment-rules";
import { canVerifyAppointment, countMonthlyNoShows, checkNoShowPenalty } from "@/lib/verification-rules";
import { canStartSession, canStopSession } from "@/lib/robot-rules";
import { startSession, stopSession, getSessionStatus, resetMock } from "@/lib/robot-mock-adapter";
import { NO_SHOW_LIMIT } from "@zhyj/shared";
import type { PrismaClient } from "@prisma/client";

// ── Helpers ──

const STORE_ID = "store-001";
const NOW = new Date("2026-04-10T10:00:00Z");

function createMockPrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  return {
    resident: {
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
    appointment: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
    robotSession: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    monitoringRecord: {
      count: vi.fn().mockResolvedValue(0),
    },
    verification: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

// ── Full Loop Integration Tests ──

describe("Full business loop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    resetMock();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMock();
  });

  it("happy path: book → verify → start session → stop session → mock adapter lifecycle", async () => {
    const prisma = createMockPrisma({
      resident: {
        findUnique: vi.fn().mockResolvedValue({
          id: "res-001",
          storeId: STORE_ID,
          deletedAt: null,
        }),
        count: vi.fn().mockResolvedValue(1), // has monitoring records
      },
      appointment: {
        findUnique: vi.fn().mockImplementation((args: unknown) => {
          const a = args as { where: { id: string } };
          if (a.where.id === "apt-001") {
            // Initially booked, later verified
            return Promise.resolve({
              id: "apt-001",
              status: "booked",
              residentId: "res-001",
              storeId: STORE_ID,
              deletedAt: null,
            });
          }
          return Promise.resolve(null);
        }),
        findFirst: vi.fn().mockResolvedValue(null), // no active robot session
        count: vi.fn().mockResolvedValue(0), // under 15-day limit, no no-shows
      },
      robotSession: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      monitoringRecord: {
        count: vi.fn().mockResolvedValue(1), // has monitoring records
      },
      verification: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    });

    // Step 1: Booking allowed
    const bookingResult = await isBookingAllowed(prisma, {
      residentId: "res-001",
      storeId: STORE_ID,
      scheduledAt: NOW,
    });
    expect(bookingResult.allowed).toBe(true);

    // Step 2: Verification allowed (booked status)
    const verifyResult = await canVerifyAppointment(prisma, "apt-001", "staff-001", STORE_ID);
    expect(verifyResult.allowed).toBe(true);

    // Step 3: Session start (appointment is booked — verify rules check status)
    // For the start session check, appointment needs to be verified
    // Re-mock to return verified status
    (prisma.appointment.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "apt-001",
      status: "verified",
      residentId: "res-001",
      storeId: STORE_ID,
      deletedAt: null,
    });

    const startResult = await canStartSession(prisma, "apt-001", "staff-001", STORE_ID);
    expect(startResult.allowed).toBe(true);

    // Step 4: Stop session
    (prisma.robotSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "rs-001",
      status: "active",
    });
    (prisma.robotSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "rs-001",
      status: "active",
      storeId: STORE_ID,
    });
    const stopResult = await canStopSession(prisma, "rs-001", STORE_ID);
    expect(stopResult.allowed).toBe(true);

    // Step 5: Mock adapter lifecycle
    startSession("apt-001", "routine-default");
    const status = getSessionStatus("apt-001");
    expect(status).toBeTruthy();
    expect(status!.status).toBe("active");
    expect(status!.progress).toBe(0);

    const stopped = stopSession("apt-001");
    expect(stopped!.status).toBe("completed");
    expect(stopped!.progress).toBe(100);
  });

  it("no-show penalty blocks booking before monitoring check", async () => {
    const prisma = createMockPrisma({
      resident: {
        findUnique: vi.fn().mockResolvedValue({
          id: "res-001",
          storeId: STORE_ID,
          deletedAt: null,
        }),
        count: vi.fn().mockImplementation((args: unknown) => {
          const a = args as { where: { residentId?: string } };
          if (a.where?.residentId === "res-001") return Promise.resolve(1); // monitored
          return Promise.resolve(0);
        }),
      },
      appointment: {
        count: vi.fn().mockImplementation((args: unknown) => {
          const a = args as { where: { status?: string } };
          if (a.where?.status === "no_show") return Promise.resolve(NO_SHOW_LIMIT + 1);
          return Promise.resolve(0);
        }),
      },
    });

    // No-show penalty check should be step 2 (after resident exists, before monitoring)
    // The orchestrator should short-circuit on the penalty
    const result = await isBookingAllowed(prisma, {
      residentId: "res-001",
      storeId: STORE_ID,
      scheduledAt: NOW,
    });
    expect(result.allowed).toBe(false);
  });

  it("session start rejected when appointment not verified", async () => {
    const prisma = createMockPrisma({
      appointment: {
        findUnique: vi.fn().mockResolvedValue({
          id: "apt-001",
          status: "booked", // not verified
          storeId: STORE_ID,
          deletedAt: null,
        }),
      },
      robotSession: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    });

    const result = await canStartSession(prisma, "apt-001", "staff-001", STORE_ID);
    expect(result.allowed).toBe(false);
  });

  it("session stop rejected when session already completed", async () => {
    const prisma = createMockPrisma({
      robotSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: "rs-001",
          status: "completed", // already done
        }),
      },
    });

    const result = await canStopSession(prisma, "rs-001", STORE_ID);
    expect(result.allowed).toBe(false);
  });
});
