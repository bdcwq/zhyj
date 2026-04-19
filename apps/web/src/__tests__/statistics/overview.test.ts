import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/v1/statistics/overview/route";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@prisma/client";

// ── Mocks ──

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    monitoringRecord: { count: vi.fn().mockResolvedValue(0) },
    appointment: { count: vi.fn().mockResolvedValue(0) },
    resident: { count: vi.fn().mockResolvedValue(0) },
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/api-response", () => ({
  successResponse: (data: unknown) => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data }),
  }),
  errorResponse: (code: string, message: string, status: number) => ({
    ok: false,
    status,
    json: async () => ({ success: false, error: { code, message } }),
  }),
}));

// Get references to the mocked prisma methods after module initialization
import { prisma } from "@/lib/db";

const STORE_ID = "store-test-001";

function makeRequest(url: string): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`);
}

describe("GET /api/v1/statistics/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/v1/statistics/overview"));
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
  });

  it("should return overview counts for a specific date", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    prisma.monitoringRecord.count.mockResolvedValue(5);
    prisma.appointment.count
      .mockResolvedValueOnce(10) // appointmentCount
      .mockResolvedValueOnce(8)  // completedCount
      .mockResolvedValueOnce(1)  // noShowCount
      .mockResolvedValueOnce(2); // cancelledCount
    prisma.resident.count.mockResolvedValue(3);

    const res = await GET(makeRequest("/api/v1/statistics/overview?date=2026-04-10"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      monitoringCount: 5,
      appointmentCount: 10,
      completedCount: 8,
      noShowCount: 1,
      newResidentsCount: 3,
      cancelledCount: 2,
    });
  });

  it("should use today when no date provided", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    prisma.monitoringRecord.count.mockResolvedValue(0);
    prisma.appointment.count.mockResolvedValue(0);
    prisma.resident.count.mockResolvedValue(0);

    const res = await GET(makeRequest("/api/v1/statistics/overview"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    // Verify the monitoring count was called (proves query executed)
    expect(prisma.monitoringRecord.count).toHaveBeenCalledOnce();
  });

  it("should return STAT_001 for invalid date format", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    const res = await GET(makeRequest("/api/v1/statistics/overview?date=not-a-date"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("STAT_001");
  });

  it("should return zero counts when no data exists", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    prisma.monitoringRecord.count.mockResolvedValue(0);
    prisma.appointment.count.mockResolvedValue(0);
    prisma.resident.count.mockResolvedValue(0);

    const res = await GET(makeRequest("/api/v1/statistics/overview?date=2026-01-01"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.monitoringCount).toBe(0);
    expect(json.data.appointmentCount).toBe(0);
    expect(json.data.completedCount).toBe(0);
    expect(json.data.noShowCount).toBe(0);
    expect(json.data.newResidentsCount).toBe(0);
    expect(json.data.cancelledCount).toBe(0);
  });

  it("should use storeId from auth context", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: "store-specific-123",
      role: "staff",
    });

    prisma.monitoringRecord.count.mockResolvedValue(0);
    prisma.appointment.count.mockResolvedValue(0);
    prisma.resident.count.mockResolvedValue(0);

    const res = await GET(makeRequest("/api/v1/statistics/overview"));
    await res.json();

    // Verify storeId from auth is used in all queries
    const monitoringCall = prisma.monitoringRecord.count.mock.calls[0][0];
    expect(monitoringCall.where.storeId).toBe("store-specific-123");
  });

  it("should return STAT_002 on unexpected error", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    prisma.monitoringRecord.count.mockRejectedValue(new Error("DB connection lost"));

    const res = await GET(makeRequest("/api/v1/statistics/overview"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("STAT_002");
  });
});
