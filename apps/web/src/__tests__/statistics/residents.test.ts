import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/v1/statistics/residents/route";
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

describe("GET /api/v1/statistics/residents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/v1/statistics/residents"));
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
  });

  it("should return resident stats with newCount and totalCount", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    // First call: newRecords; second call: totalRecords (cumulative)
    (prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { date: "2026-04-10", newCount: 3 },
        { date: "2026-04-11", newCount: 1 },
      ])
      .mockResolvedValueOnce([
        { date: "2026-04-10", totalCount: 3 },
        { date: "2026-04-11", totalCount: 1 },
      ]);

    const res = await GET(makeRequest("/api/v1/statistics/residents?period=daily&dateFrom=2026-04-01&dateTo=2026-04-30"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.records).toHaveLength(2);
    // Each record should have newCount and totalCount
    for (const record of json.data.records) {
      expect(record).toHaveProperty("date");
      expect(record).toHaveProperty("newCount");
      expect(record).toHaveProperty("totalCount");
    }
  });

  it("should merge new counts with cumulative totals correctly", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    // New residents only on April 10, but cumulative totals exist for both dates
    (prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { date: "2026-04-10", newCount: 5 },
      ])
      .mockResolvedValueOnce([
        { date: "2026-04-09", totalCount: 100 },
        { date: "2026-04-10", totalCount: 5 },
      ]);

    const res = await GET(makeRequest("/api/v1/statistics/residents?period=daily&dateFrom=2026-04-10&dateTo=2026-04-10"));
    const json = await res.json();

    expect(res.status).toBe(200);
    // Should include all dates from both queries merged
    const dates = json.data.records.map((r: { date: string }) => r.date);
    expect(dates).toContain("2026-04-09");
    expect(dates).toContain("2026-04-10");
    // April 9 has no newCount (only in total), should default to 0
    const apr9 = json.data.records.find((r: { date: string }) => r.date === "2026-04-09");
    expect(apr9.newCount).toBe(0);
  });

  it("should return STAT_001 for invalid period", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    const res = await GET(makeRequest("/api/v1/statistics/residents?period=yearly"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("STAT_001");
  });

  it("should return empty records when no data", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    (prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const res = await GET(makeRequest("/api/v1/statistics/residents?period=daily"));
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

    const res = await GET(makeRequest("/api/v1/statistics/residents?period=daily"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe("STAT_002");
  });
});
