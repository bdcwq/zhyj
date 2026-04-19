import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/v1/statistics/appointments/route";
import { NextRequest } from "next/server";

// ── Mocks ──

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
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

import { prisma } from "@/lib/db";

const STORE_ID = "store-test-001";

function makeRequest(url: string): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`);
}

describe("GET /api/v1/statistics/appointments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/v1/statistics/appointments"));
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
  });

  it("should return appointment status breakdown", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    const mockData = [
      { date: "2026-04-10", booked: 3, verified: 2, completed: 5, cancelled: 1, noShow: 1 },
      { date: "2026-04-11", booked: 1, verified: 1, completed: 3, cancelled: 0, noShow: 0 },
    ];
    (prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const res = await GET(makeRequest("/api/v1/statistics/appointments?period=daily&dateFrom=2026-04-01&dateTo=2026-04-30"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.records).toHaveLength(2);
    expect(json.data.records[0]).toHaveProperty("booked");
    expect(json.data.records[0]).toHaveProperty("verified");
    expect(json.data.records[0]).toHaveProperty("completed");
    expect(json.data.records[0]).toHaveProperty("cancelled");
    expect(json.data.records[0]).toHaveProperty("noShow");
  });

  it("should support weekly period", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    (prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([
      { date: "2026-W15", booked: 10, verified: 8, completed: 20, cancelled: 2, noShow: 1 },
    ]);

    const res = await GET(makeRequest("/api/v1/statistics/appointments?period=weekly"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.records).toHaveLength(1);
  });

  it("should return STAT_001 for missing period", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    const res = await GET(makeRequest("/api/v1/statistics/appointments"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("STAT_001");
  });

  it("should return empty records when no appointments", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    (prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET(makeRequest("/api/v1/statistics/appointments?period=daily"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.records).toEqual([]);
  });

  it("should return STAT_002 on DB error", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    (prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const res = await GET(makeRequest("/api/v1/statistics/appointments?period=daily"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe("STAT_002");
  });
});
