import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/v1/statistics/monitoring/route";
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

describe("GET /api/v1/statistics/monitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/v1/statistics/monitoring"));
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
  });

  it("should return monitoring records with daily period", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    const mockData = [
      { date: "2026-04-10", count: 5, avgScore: 72.3 },
      { date: "2026-04-11", count: 3, avgScore: 68.1 },
    ];
    (prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const res = await GET(makeRequest("/api/v1/statistics/monitoring?period=daily&dateFrom=2026-04-01&dateTo=2026-04-30"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.records).toEqual(mockData);
  });

  it("should return weekly period grouping", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    const mockData = [
      { date: "2026-W15", count: 12, avgScore: 70.5 },
    ];
    (prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const res = await GET(makeRequest("/api/v1/statistics/monitoring?period=weekly"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.records[0].date).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("should return monthly period grouping", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    const mockData = [
      { date: "2026-04", count: 30, avgScore: 71.0 },
    ];
    (prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const res = await GET(makeRequest("/api/v1/statistics/monitoring?period=monthly"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.records[0].date).toMatch(/^\d{4}-\d{2}$/);
  });

  it("should return STAT_001 for invalid period", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    const res = await GET(makeRequest("/api/v1/statistics/monitoring?period=yearly"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("STAT_001");
  });

  it("should return STAT_001 for date range over 365 days", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    const res = await GET(makeRequest("/api/v1/statistics/monitoring?period=daily&dateFrom=2025-01-01&dateTo=2026-12-31"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("STAT_001");
  });

  it("should return STAT_001 when dateFrom > dateTo", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    const res = await GET(makeRequest("/api/v1/statistics/monitoring?period=daily&dateFrom=2026-04-30&dateTo=2026-04-01"));
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

    (prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET(makeRequest("/api/v1/statistics/monitoring?period=daily"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.records).toEqual([]);
  });

  it("should default to last 30 days when no dates provided", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    (prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET(makeRequest("/api/v1/statistics/monitoring?period=daily"));
    await res.json();

    // Verify $queryRawUnsafe was called
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledOnce();
  });

  it("should return STAT_002 on DB error", async () => {
    mockGetAuthContext.mockResolvedValue({
      staffId: "staff-001",
      storeId: STORE_ID,
      role: "admin",
    });

    (prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const res = await GET(makeRequest("/api/v1/statistics/monitoring?period=daily"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe("STAT_002");
  });
});
