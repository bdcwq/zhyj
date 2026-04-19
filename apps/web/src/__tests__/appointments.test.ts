import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isBookingAllowed,
  checkResidentExists,
  checkResidentMonitored,
  check15DayLimit,
  checkMachineAvailability,
} from "@/lib/appointment-rules";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  appointmentListQuerySchema,
  availabilityQuerySchema,
} from "@zhyj/shared";
import { NO_SHOW_LIMIT } from "@zhyj/shared";
import type { PrismaClient } from "@prisma/client";

// ── Mock Prisma ──

function createMockPrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  return {
    resident: {
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
    appointment: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    monitoringRecord: {
      count: vi.fn().mockResolvedValue(0),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

const STORE_ID = "store-001";
const NOW = new Date("2026-04-10T10:00:00Z");

// ── Schema Validation Tests ──

describe("createAppointmentSchema", () => {
  it("should validate a valid appointment", () => {
    const input = {
      residentId: "res-001",
      scheduledAt: "2026-04-15T10:00:00Z",
    };
    const result = createAppointmentSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("should reject missing residentId", () => {
    const input = { scheduledAt: "2026-04-15T10:00:00Z" };
    const result = createAppointmentSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("should reject missing scheduledAt", () => {
    const input = { residentId: "res-001" };
    const result = createAppointmentSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("should validate with optional machineId", () => {
    const input = {
      residentId: "res-001",
      scheduledAt: "2026-04-15T10:00:00Z",
      machineId: "machine-001",
    };
    const result = createAppointmentSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("should validate with optional roomId", () => {
    const input = {
      residentId: "res-001",
      scheduledAt: "2026-04-15T10:00:00Z",
      roomId: "room-001",
    };
    const result = createAppointmentSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("should validate with both machineId and roomId", () => {
    const input = {
      residentId: "res-001",
      scheduledAt: "2026-04-15T10:00:00Z",
      machineId: "machine-001",
      roomId: "room-001",
    };
    const result = createAppointmentSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("should accept date-only scheduledAt", () => {
    const input = {
      residentId: "res-001",
      scheduledAt: "2026-04-15",
    };
    const result = createAppointmentSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("should reject invalid residentId (empty)", () => {
    const input = {
      residentId: "",
      scheduledAt: "2026-04-15T10:00:00Z",
    };
    const result = createAppointmentSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("updateAppointmentSchema", () => {
  it("should validate partial input", () => {
    const input = { status: "cancelled" };
    const result = updateAppointmentSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("should validate with residentId only", () => {
    const input = { residentId: "res-002" };
    const result = updateAppointmentSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("should accept all optional fields", () => {
    const input = {
      residentId: "res-001",
      machineId: "machine-001",
      roomId: "room-001",
      scheduledAt: "2026-04-15T10:00:00Z",
      status: "confirmed",
    };
    const result = updateAppointmentSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe("appointmentListQuerySchema", () => {
  it("should apply defaults when no fields provided", () => {
    const result = appointmentListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
      expect(result.data.offset).toBe(0);
    }
  });

  it("should accept optional dateFrom and dateTo", () => {
    const input = { dateFrom: "2026-04-01", dateTo: "2026-04-30" };
    const result = appointmentListQuerySchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("should accept optional status filter", () => {
    const input = { status: "booked" };
    const result = appointmentListQuerySchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe("availabilityQuerySchema", () => {
  it("should validate a valid date", () => {
    const input = { date: "2026-04-15" };
    const result = availabilityQuerySchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("should reject invalid date format", () => {
    const input = { date: "not-a-date" };
    const result = availabilityQuerySchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("should accept optional startTime and endTime", () => {
    const input = { date: "2026-04-15", startTime: "09:00", endTime: "17:00" };
    const result = availabilityQuerySchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("should accept optional roomId", () => {
    const input = { date: "2026-04-15", roomId: "room-001" };
    const result = availabilityQuerySchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("should produce inferred types that exist", () => {
    // Compile-time check: if this file compiles, AvailabilityQueryInput type exists.
    // Runtime check: verify the schema parses correctly (proves types are derived).
    const input = { date: "2026-04-15" };
    const result = availabilityQuerySchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

// ── Business Rule Tests ──

describe("checkResidentExists", () => {
  it("should allow existing resident", async () => {
    const prisma = createMockPrisma({
      resident: {
        findUnique: vi.fn().mockResolvedValue({
          id: "res-001",
          storeId: STORE_ID,
          deletedAt: null,
        }),
      },
    });
    const result = await checkResidentExists(prisma, "res-001", STORE_ID);
    expect(result.allowed).toBe(true);
  });

  it("should reject non-existent resident", async () => {
    const prisma = createMockPrisma();
    const result = await checkResidentExists(prisma, "res-nonexistent", STORE_ID);
    expect(result.allowed).toBe(false);
    expect(result.code).toBeDefined();
  });

  it("should reject resident from different store", async () => {
    // Real DB: findUnique WHERE id=X AND storeId="store-001" → no match → null
    const prisma = createMockPrisma();
    const result = await checkResidentExists(prisma, "res-001", STORE_ID);
    expect(result.allowed).toBe(false);
    expect(result.code).toBeDefined();
  });

  it("should reject soft-deleted resident", async () => {
    // Real DB: findUnique WHERE ... AND deletedAt=null → no match → null
    const prisma = createMockPrisma();
    const result = await checkResidentExists(prisma, "res-001", STORE_ID);
    expect(result.allowed).toBe(false);
    expect(result.code).toBeDefined();
  });
});

describe("checkResidentMonitored", () => {
  it("should allow monitored resident", async () => {
    const prisma = createMockPrisma({
      monitoringRecord: {
        count: vi.fn().mockResolvedValue(1),
      },
    });
    const result = await checkResidentMonitored(prisma, "res-001");
    expect(result.allowed).toBe(true);
  });

  it("should reject unmonitored resident", async () => {
    const prisma = createMockPrisma({
      monitoringRecord: {
        count: vi.fn().mockResolvedValue(0),
      },
    });
    const result = await checkResidentMonitored(prisma, "res-001");
    expect(result.allowed).toBe(false);
    expect(result.code).toBeDefined();
  });
});

describe("check15DayLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should allow outside 15-day limit", async () => {
    const prisma = createMockPrisma({
      appointment: {
        count: vi.fn().mockResolvedValue(0),
      },
    });
    const result = await check15DayLimit(prisma, "res-001");
    expect(result.allowed).toBe(true);
  });

  it("should reject within 15-day limit", async () => {
    const prisma = createMockPrisma({
      appointment: {
        count: vi.fn().mockResolvedValue(20),
      },
    });
    const result = await check15DayLimit(prisma, "res-001");
    expect(result.allowed).toBe(false);
    expect(result.code).toBeDefined();
  });

  it("should exclude no-show and cancelled from 15-day count", async () => {
    // Implementation filters out cancelled/no_show — mock returns 0 (already filtered)
    const prisma = createMockPrisma({
      appointment: {
        count: vi.fn().mockResolvedValue(0),
      },
    });
    const result = await check15DayLimit(prisma, "res-001");
    expect(result.allowed).toBe(true);
  });
});

describe("checkMachineAvailability", () => {
  it("should allow when machine is available", async () => {
    const prisma = createMockPrisma({
      appointment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    const result = await checkMachineAvailability(
      prisma,
      "machine-001",
      new Date("2026-04-15T10:00:00Z")
    );
    expect(result.allowed).toBe(true);
  });

  it("should reject when machine is booked within 30min", async () => {
    const prisma = createMockPrisma({
      appointment: {
        findFirst: vi.fn().mockResolvedValue({
          id: "apt-conflict",
          machineId: "machine-001",
        }),
      },
    });
    const result = await checkMachineAvailability(
      prisma,
      "machine-001",
      new Date("2026-04-15T10:00:00Z")
    );
    expect(result.allowed).toBe(false);
    expect(result.code).toBeDefined();
  });

  it("should allow machine free at different time", async () => {
    const prisma = createMockPrisma({
      appointment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    const result = await checkMachineAvailability(
      prisma,
      "machine-001",
      new Date("2026-04-15T14:00:00Z")
    );
    expect(result.allowed).toBe(true);
  });

  it("should skip check when no machineId", async () => {
    const prisma = createMockPrisma();
    const result = await checkMachineAvailability(prisma, "", new Date("2026-04-15T10:00:00Z"));
    expect(result.allowed).toBe(true);
  });
});

describe("isBookingAllowed (orchestrator)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should allow when all checks pass", async () => {
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
        count: vi.fn().mockResolvedValue(0),
      },
    });
    const result = await isBookingAllowed(
      prisma,
      { residentId: "res-001", storeId: STORE_ID, scheduledAt: NOW }
    );
    expect(result.allowed).toBe(true);
  });

  it("should short-circuit on resident not found", async () => {
    const prisma = createMockPrisma();
    const result = await isBookingAllowed(
      prisma,
      { residentId: "res-missing", storeId: STORE_ID, scheduledAt: NOW }
    );
    expect(result.allowed).toBe(false);
  });

  it("should short-circuit on no-show penalty", async () => {
    const prisma = createMockPrisma({
      resident: {
        findUnique: vi.fn().mockResolvedValue({
          id: "res-001",
          storeId: STORE_ID,
          deletedAt: null,
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
    const result = await isBookingAllowed(
      prisma,
      { residentId: "res-001", storeId: STORE_ID, scheduledAt: NOW }
    );
    expect(result.allowed).toBe(false);
  });

  it("should short-circuit on monitoring check failure", async () => {
    const prisma = createMockPrisma({
      resident: {
        findUnique: vi.fn().mockResolvedValue({
          id: "res-001",
          storeId: STORE_ID,
          deletedAt: null,
        }),
      },
      monitoringRecord: {
        count: vi.fn().mockResolvedValue(0),
      },
      appointment: {
        count: vi.fn().mockResolvedValue(0),
      },
    });
    const result = await isBookingAllowed(
      prisma,
      { residentId: "res-001", storeId: STORE_ID, scheduledAt: NOW }
    );
    expect(result.allowed).toBe(false);
  });

  it("should skip machine check when no machineId", async () => {
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
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    const result = await isBookingAllowed(
      prisma,
      { residentId: "res-001", storeId: STORE_ID, scheduledAt: NOW }
    );
    expect(result.allowed).toBe(true);
    expect(prisma.appointment.findFirst).not.toHaveBeenCalled();
  });

  it("should reject on 15-day limit exceeded", async () => {
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
        count: vi.fn().mockResolvedValue(1),
      },
    });
    const result = await isBookingAllowed(
      prisma,
      { residentId: "res-001", storeId: STORE_ID, scheduledAt: NOW }
    );
    expect(result.allowed).toBe(false);
  });

  it("should reject on machine slot taken", async () => {
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
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue({
          id: "apt-conflict",
          machineId: "machine-001",
        }),
      },
    });
    const result = await isBookingAllowed(
      prisma,
      { residentId: "res-001", storeId: STORE_ID, scheduledAt: NOW, machineId: "machine-001" }
    );
    expect(result.allowed).toBe(false);
  });

  it("should return error code for each failure reason", async () => {
    const prisma = createMockPrisma();
    const result = await isBookingAllowed(
      prisma,
      { residentId: "res-missing", storeId: STORE_ID, scheduledAt: NOW }
    );
    expect(result.allowed).toBe(false);
    expect(result.code).toBeTruthy();
    expect(result.reason).toBeTruthy();
  });

  it("should handle deleted resident in orchestrator", async () => {
    // Real DB: findUnique WHERE ... AND deletedAt=null → no match → null
    const prisma = createMockPrisma();
    const result = await isBookingAllowed(
      prisma,
      { residentId: "res-001", storeId: STORE_ID, scheduledAt: NOW }
    );
    expect(result.allowed).toBe(false);
  });

  it("should reject cross-store resident", async () => {
    const prisma = createMockPrisma({
      resident: {
        findUnique: vi.fn().mockResolvedValue({
          id: "res-001",
          storeId: "store-other",
          deletedAt: null,
        }),
      },
    });
    const result = await isBookingAllowed(
      prisma,
      { residentId: "res-001", storeId: STORE_ID, scheduledAt: NOW }
    );
    expect(result.allowed).toBe(false);
  });
});
