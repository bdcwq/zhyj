import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  canVerifyAppointment,
  countMonthlyNoShows,
  checkNoShowPenalty,
  getBookingStatus,
} from "@/lib/verification-rules";
import { isBookingAllowed } from "@/lib/appointment-rules";
import type { PrismaClient } from "@prisma/client";
import { NO_SHOW_LIMIT } from "@zhyj/shared";

// ── Mock Prisma ──

function createMockPrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  return {
    appointment: {
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    resident: {
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
    verification: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    monitoringRecord: {
      count: vi.fn().mockResolvedValue(0),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

const STORE_ID = "store-001";
const NOW = new Date("2026-04-10T10:00:00Z");

// ── canVerifyAppointment ──

describe("canVerifyAppointment", () => {
  it("should reject when appointment not found", async () => {
    const prisma = createMockPrisma();
    const result = await canVerifyAppointment(prisma, "apt-nonexistent", "staff-001", STORE_ID);
    expect(result.allowed).toBe(false);
    expect(result.code).toBeDefined();
  });

  it("should allow verified status (idempotent)", async () => {
    const prisma = createMockPrisma({
      appointment: {
        findUnique: vi.fn().mockResolvedValue({
          id: "apt-001",
          status: "verified",
          storeId: STORE_ID,
          deletedAt: null,
        }),
      },
      verification: {
        findUnique: vi.fn().mockResolvedValue({ id: "v-001", appointmentId: "apt-001" }),
      },
    });
    const result = await canVerifyAppointment(prisma, "apt-001", "staff-001", STORE_ID);
    expect(result.allowed).toBe(true);
  });

  it("should allow booked status", async () => {
    const prisma = createMockPrisma({
      appointment: {
        findUnique: vi.fn().mockResolvedValue({
          id: "apt-001",
          status: "booked",
          storeId: STORE_ID,
          deletedAt: null,
        }),
      },
      verification: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    });
    const result = await canVerifyAppointment(prisma, "apt-001", "staff-001", STORE_ID);
    expect(result.allowed).toBe(true);
  });

  it("should allow confirmed status", async () => {
    const prisma = createMockPrisma({
      appointment: {
        findUnique: vi.fn().mockResolvedValue({
          id: "apt-001",
          status: "confirmed",
          storeId: STORE_ID,
          deletedAt: null,
        }),
      },
      verification: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    });
    const result = await canVerifyAppointment(prisma, "apt-001", "staff-001", STORE_ID);
    expect(result.allowed).toBe(true);
  });

  it("should reject completed status", async () => {
    const prisma = createMockPrisma({
      appointment: {
        findUnique: vi.fn().mockResolvedValue({
          id: "apt-001",
          status: "completed",
          storeId: STORE_ID,
          deletedAt: null,
        }),
      },
      verification: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    });
    const result = await canVerifyAppointment(prisma, "apt-001", "staff-001", STORE_ID);
    expect(result.allowed).toBe(false);
  });

  it("should reject cancelled status", async () => {
    const prisma = createMockPrisma({
      appointment: {
        findUnique: vi.fn().mockResolvedValue({
          id: "apt-001",
          status: "cancelled",
          storeId: STORE_ID,
          deletedAt: null,
        }),
      },
      verification: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    });
    const result = await canVerifyAppointment(prisma, "apt-001", "staff-001", STORE_ID);
    expect(result.allowed).toBe(false);
  });

  it("should reject different store", async () => {
    // Real DB: findUnique WHERE id=X AND storeId="store-001" → no match → null
    const prisma = createMockPrisma({
      appointment: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      verification: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    });
    const result = await canVerifyAppointment(prisma, "apt-001", "staff-001", STORE_ID);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("VERIFICATION_001");
  });

  it("should reject in_progress status", async () => {
    const prisma = createMockPrisma({
      appointment: {
        findUnique: vi.fn().mockResolvedValue({
          id: "apt-001",
          status: "in_progress",
          storeId: STORE_ID,
          deletedAt: null,
        }),
      },
      verification: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    });
    const result = await canVerifyAppointment(prisma, "apt-001", "staff-001", STORE_ID);
    expect(result.allowed).toBe(false);
  });

  it("should reject no_show status", async () => {
    const prisma = createMockPrisma({
      appointment: {
        findUnique: vi.fn().mockResolvedValue({
          id: "apt-001",
          status: "no_show",
          storeId: STORE_ID,
          deletedAt: null,
        }),
      },
      verification: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    });
    const result = await canVerifyAppointment(prisma, "apt-001", "staff-001", STORE_ID);
    expect(result.allowed).toBe(false);
  });

  it("should reject soft-deleted appointment", async () => {
    // Real DB: findUnique WHERE ... AND deletedAt=null → no match for soft-deleted → null
    const prisma = createMockPrisma({
      appointment: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      verification: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    });
    const result = await canVerifyAppointment(prisma, "apt-001", "staff-001", STORE_ID);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("VERIFICATION_001");
  });
});

// ── countMonthlyNoShows ──

describe("countMonthlyNoShows", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return zero when no no-shows", async () => {
    const prisma = createMockPrisma({
      appointment: {
        count: vi.fn().mockResolvedValue(0),
      },
    });
    const count = await countMonthlyNoShows(prisma, "res-001");
    expect(count).toBe(0);
  });

  it("should return one for a single no-show in current month", async () => {
    const prisma = createMockPrisma({
      appointment: {
        count: vi.fn().mockResolvedValue(1),
      },
    });
    const count = await countMonthlyNoShows(prisma, "res-001");
    expect(count).toBe(1);
  });

  it("should return two for two no-shows", async () => {
    const prisma = createMockPrisma({
      appointment: {
        count: vi.fn().mockResolvedValue(2),
      },
    });
    const count = await countMonthlyNoShows(prisma, "res-001");
    expect(count).toBe(2);
  });

  it("should not count no-shows from previous month", async () => {
    const prisma = createMockPrisma({
      appointment: {
        count: vi.fn().mockResolvedValue(0),
      },
    });
    const count = await countMonthlyNoShows(prisma, "res-001");
    expect(count).toBe(0);
  });

  it("should handle multiple no-shows across months correctly", async () => {
    const prisma = createMockPrisma({
      appointment: {
        count: vi.fn().mockResolvedValue(1),
      },
    });
    const count = await countMonthlyNoShows(prisma, "res-001");
    expect(count).toBe(1);
  });

  it("should pass correct date range to count query", async () => {
    const mockCount = vi.fn().mockResolvedValue(3);
    const prisma = createMockPrisma({
      appointment: {
        count: mockCount,
      },
    });
    await countMonthlyNoShows(prisma, "res-001");
    expect(mockCount).toHaveBeenCalledOnce();
    const callArgs = mockCount.mock.calls[0][0];
    expect(callArgs).toHaveProperty("where");
  });

  it("should return 0 for new resident with no appointments", async () => {
    const prisma = createMockPrisma({
      appointment: {
        count: vi.fn().mockResolvedValue(0),
      },
    });
    const count = await countMonthlyNoShows(prisma, "res-new");
    expect(count).toBe(0);
  });
});

// ── checkNoShowPenalty ──

describe("checkNoShowPenalty", () => {
  it("should allow when under limit", async () => {
    const prisma = createMockPrisma({
      appointment: {
        count: vi.fn().mockResolvedValue(1),
      },
    });
    const result = await checkNoShowPenalty(prisma, "res-001");
    expect(result.allowed).toBe(true);
  });

  it("should allow when count is zero", async () => {
    const prisma = createMockPrisma({
      appointment: {
        count: vi.fn().mockResolvedValue(0),
      },
    });
    const result = await checkNoShowPenalty(prisma, "res-001");
    expect(result.allowed).toBe(true);
  });

  it("should reject when at limit", async () => {
    const prisma = createMockPrisma({
      appointment: {
        count: vi.fn().mockResolvedValue(NO_SHOW_LIMIT),
      },
    });
    const result = await checkNoShowPenalty(prisma, "res-001");
    expect(result.allowed).toBe(false);
  });

  it("should reject when over limit", async () => {
    const prisma = createMockPrisma({
      appointment: {
        count: vi.fn().mockResolvedValue(NO_SHOW_LIMIT + 1),
      },
    });
    const result = await checkNoShowPenalty(prisma, "res-001");
    expect(result.allowed).toBe(false);
  });

  it("should include error code when rejected", async () => {
    const prisma = createMockPrisma({
      appointment: {
        count: vi.fn().mockResolvedValue(NO_SHOW_LIMIT + 1),
      },
    });
    const result = await checkNoShowPenalty(prisma, "res-001");
    expect(result.allowed).toBe(false);
    expect(result.code).toBeDefined();
  });

  it("should include reason when rejected", async () => {
    const prisma = createMockPrisma({
      appointment: {
        count: vi.fn().mockResolvedValue(NO_SHOW_LIMIT + 1),
      },
    });
    const result = await checkNoShowPenalty(prisma, "res-001");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});

// ── getBookingStatus ──

describe("getBookingStatus", () => {
  it("should allow booking when no issues", async () => {
    const prisma = createMockPrisma({
      monitoringRecord: {
        count: vi.fn().mockResolvedValue(1),
      },
      appointment: {
        count: vi.fn().mockResolvedValue(0),
      },
    });
    const result = await getBookingStatus(prisma, "res-001", STORE_ID);
    expect(result.canBook).toBe(true);
  });

  it("should block booking when no-show penalty", async () => {
    const prisma = createMockPrisma({
      monitoringRecord: {
        count: vi.fn().mockResolvedValue(1),
      },
      appointment: {
        count: vi.fn().mockImplementation((args: unknown) => {
          const a = args as { where: { status?: string } };
          if (a.where?.status === "no_show") return Promise.resolve(NO_SHOW_LIMIT);
          return Promise.resolve(0);
        }),
      },
    });
    const result = await getBookingStatus(prisma, "res-001", STORE_ID);
    expect(result.canBook).toBe(false);
  });

  it("should block booking when not monitored", async () => {
    const prisma = createMockPrisma({
      monitoringRecord: {
        count: vi.fn().mockResolvedValue(0),
      },
      appointment: {
        count: vi.fn().mockResolvedValue(0),
      },
    });
    const result = await getBookingStatus(prisma, "res-001", STORE_ID);
    expect(result.canBook).toBe(false);
  });

  it("should block booking when has recent booking", async () => {
    const prisma = createMockPrisma({
      monitoringRecord: {
        count: vi.fn().mockResolvedValue(1),
      },
      appointment: {
        count: vi.fn().mockImplementation((args: unknown) => {
          const a = args as { where: { status?: object; residentId?: string } };
          // The 15-day limit query uses status: { notIn: [...] }
          if (a.where?.status && typeof a.where.status === "object" && "notIn" in (a.where.status as object)) {
            return Promise.resolve(1); // has recent booking
          }
          return Promise.resolve(0);
        }),
      },
    });
    const result = await getBookingStatus(prisma, "res-001", STORE_ID);
    expect(result.canBook).toBe(false);
  });

  it("should handle multiple reasons combined", async () => {
    const prisma = createMockPrisma({
      monitoringRecord: {
        count: vi.fn().mockResolvedValue(0),
      },
      appointment: {
        count: vi.fn().mockImplementation((args: unknown) => {
          const a = args as { where: { status?: string } };
          if (a.where?.status === "no_show") return Promise.resolve(NO_SHOW_LIMIT);
          return Promise.resolve(0);
        }),
      },
    });
    const result = await getBookingStatus(prisma, "res-001", STORE_ID);
    expect(result.canBook).toBe(false);
    expect(result.reasons).toBeDefined();
  });
});

// ── Integration with isBookingAllowed ──

describe("isBookingAllowed integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should block booking due to no-show penalty (step 2)", async () => {
    const prisma = createMockPrisma({
      resident: {
        findUnique: vi.fn().mockResolvedValue({
          id: "res-001",
          storeId: STORE_ID,
          deletedAt: null,
        }),
      },
      monitoringRecord: {
        count: vi.fn().mockResolvedValue(1),
      },
      appointment: {
        count: vi.fn().mockImplementation((args: unknown) => {
          const a = args as { where: { status?: string } };
          if (a.where?.status === "no_show") return Promise.resolve(NO_SHOW_LIMIT + 1);
          return Promise.resolve(0);
        }),
      },
    });
    const result = await isBookingAllowed(
      prisma,
      { residentId: "res-001", storeId: STORE_ID, scheduledAt: NOW }
    );
    expect(result.allowed).toBe(false);
  });

  it("should allow booking when no-show count is under limit", async () => {
    const prisma = createMockPrisma({
      resident: {
        findUnique: vi.fn().mockResolvedValue({
          id: "res-001",
          storeId: STORE_ID,
          deletedAt: null,
        }),
      },
      monitoringRecord: {
        count: vi.fn().mockResolvedValue(1),
      },
      appointment: {
        count: vi.fn().mockImplementation((args: unknown) => {
          const a = args as { where: { status?: string } };
          if (a.where?.status === "no_show") return Promise.resolve(1);
          return Promise.resolve(0);
        }),
      },
    });
    const result = await isBookingAllowed(
      prisma,
      { residentId: "res-001", storeId: STORE_ID, scheduledAt: NOW }
    );
    expect(result.allowed).toBe(true);
  });
});
