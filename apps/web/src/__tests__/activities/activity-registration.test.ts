import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock next/server to avoid hanging on NextRequest/NextResponse ──
vi.mock("next/server", () => {
  class NextRequest extends Request {
    private _url: URL;
    constructor(url: string | URL, init?: RequestInit) {
      super(url, init);
      this._url = new URL(url instanceof URL ? url.href : url);
    }
    get nextUrl() {
      return this._url;
    }
  }
  class NextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
        ...init,
      }) as unknown as NextResponse;
    }
  }
  return { NextRequest, NextResponse };
});

// ── Mock dependencies before importing route handlers ──
vi.mock("@/lib/db", () => ({
  prisma: {
    activity: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    activityRegistration: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: any) => Promise<any>) => fn({})),
  },
}));

vi.mock("@/lib/auth", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn().mockReturnValue(null),
}));

import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import {
  isRegistrationAllowed,
  checkInRules,
  countMonthlyActivityNoShows,
} from "@/lib/activity-rules";
import { POST as registerRoute } from "../../app/api/v1/activities/[id]/register/route";
import { POST as checkInRoute } from "../../app/api/v1/activities/[id]/check-in/route";
import { GET as myRegistrationsRoute } from "../../app/api/v1/activities/my-registrations/route";

const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ──

function createRequest(url: string, options?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3000"), options);
}

function createStaffContext(role = "admin", storeId = "store1") {
  return { staffId: "staff1", residentId: null, role, storeId };
}

function createResidentContext(storeId = "store1") {
  return { staffId: null, residentId: "resident1", role: "resident", storeId };
}

/** Future date string for activity dates */
function futureDate(days = 30) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Past date string for activity dates */
function pastDate(days = 1) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

// ══════════════════════════════════════════════════════════════════
//  Rule function tests
// ══════════════════════════════════════════════════════════════════

describe("activity-rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isRegistrationAllowed", () => {
    it("returns ACTIVITY_010 when activity not found", async () => {
      vi.mocked(prisma.activity.findUnique).mockResolvedValue(null);

      const result = await isRegistrationAllowed(
        prisma,
        "resident1",
        "act1",
        "store1"
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe("ACTIVITY_010");
    });

    it("returns ACTIVITY_003 when activity is cancelled", async () => {
      vi.mocked(prisma.activity.findUnique).mockResolvedValue({
        id: "act1",
        status: "cancelled",
        activityDate: futureDate(),
      } as any);

      const result = await isRegistrationAllowed(
        prisma,
        "resident1",
        "act1",
        "store1"
      );
      // cancelled !== published, so NOT_PUBLISHED check fires first
      expect(result.allowed).toBe(false);
      expect(result.code).toBe("ACTIVITY_003");
    });

    it("returns ACTIVITY_003 when activity is draft", async () => {
      vi.mocked(prisma.activity.findUnique).mockResolvedValue({
        id: "act1",
        status: "draft",
        activityDate: futureDate(),
      } as any);

      const result = await isRegistrationAllowed(
        prisma,
        "resident1",
        "act1",
        "store1"
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe("ACTIVITY_003");
    });

    it("returns ACTIVITY_004 when activity date has passed", async () => {
      vi.mocked(prisma.activity.findUnique).mockResolvedValue({
        id: "act1",
        status: "published",
        activityDate: pastDate(2),
      } as any);

      const result = await isRegistrationAllowed(
        prisma,
        "resident1",
        "act1",
        "store1"
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe("ACTIVITY_004");
    });

    it("returns ACTIVITY_005 when already registered", async () => {
      vi.mocked(prisma.activity.findUnique).mockResolvedValue({
        id: "act1",
        status: "published",
        activityDate: futureDate(),
      } as any);
      vi.mocked(prisma.activityRegistration.findUnique).mockResolvedValue({
        activityId: "act1",
        residentId: "resident1",
        status: "registered",
      } as any);

      const result = await isRegistrationAllowed(
        prisma,
        "resident1",
        "act1",
        "store1"
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe("ACTIVITY_005");
    });

    it("returns ACTIVITY_006 when monthly no-show limit reached", async () => {
      vi.mocked(prisma.activity.findUnique).mockResolvedValue({
        id: "act1",
        status: "published",
        activityDate: futureDate(),
      } as any);
      vi.mocked(prisma.activityRegistration.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.activityRegistration.count).mockResolvedValue(2);

      const result = await isRegistrationAllowed(
        prisma,
        "resident1",
        "act1",
        "store1"
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe("ACTIVITY_006");
    });

    it("returns allowed=true when all checks pass", async () => {
      vi.mocked(prisma.activity.findUnique).mockResolvedValue({
        id: "act1",
        status: "published",
        activityDate: futureDate(),
      } as any);
      vi.mocked(prisma.activityRegistration.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.activityRegistration.count).mockResolvedValue(0);

      const result = await isRegistrationAllowed(
        prisma,
        "resident1",
        "act1",
        "store1"
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe("checkInRules", () => {
    it("returns ACTIVITY_007 when registration not found", async () => {
      vi.mocked(prisma.activityRegistration.findUnique).mockResolvedValue(null);

      const result = await checkInRules(
        prisma,
        "resident1",
        "act1",
        "store1"
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe("ACTIVITY_007");
    });

    it("returns ACTIVITY_007 when registration is cancelled", async () => {
      vi.mocked(prisma.activityRegistration.findUnique).mockResolvedValue({
        activityId: "act1",
        residentId: "resident1",
        status: "cancelled",
      } as any);

      const result = await checkInRules(
        prisma,
        "resident1",
        "act1",
        "store1"
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe("ACTIVITY_007");
    });

    it("returns ACTIVITY_007 when registration is no_show", async () => {
      vi.mocked(prisma.activityRegistration.findUnique).mockResolvedValue({
        activityId: "act1",
        residentId: "resident1",
        status: "no_show",
      } as any);

      const result = await checkInRules(
        prisma,
        "resident1",
        "act1",
        "store1"
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe("ACTIVITY_007");
    });

    it("returns allowed=true when already checked in (idempotent)", async () => {
      vi.mocked(prisma.activityRegistration.findUnique).mockResolvedValue({
        activityId: "act1",
        residentId: "resident1",
        status: "checked_in",
      } as any);

      const result = await checkInRules(
        prisma,
        "resident1",
        "act1",
        "store1"
      );
      expect(result.allowed).toBe(true);
    });

    it("returns allowed=true when status is registered", async () => {
      vi.mocked(prisma.activityRegistration.findUnique).mockResolvedValue({
        activityId: "act1",
        residentId: "resident1",
        status: "registered",
      } as any);

      const result = await checkInRules(
        prisma,
        "resident1",
        "act1",
        "store1"
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe("countMonthlyActivityNoShows", () => {
    it("returns correct count", async () => {
      vi.mocked(prisma.activityRegistration.count).mockResolvedValue(1);

      const count = await countMonthlyActivityNoShows(prisma, "resident1");
      expect(count).toBe(1);
      expect(prisma.activityRegistration.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            residentId: "resident1",
            status: "no_show",
          }),
        })
      );
    });

    it("returns 0 when no no-show records", async () => {
      vi.mocked(prisma.activityRegistration.count).mockResolvedValue(0);

      const count = await countMonthlyActivityNoShows(prisma, "resident1");
      expect(count).toBe(0);
    });

    it("correctly scopes to current month", async () => {
      vi.mocked(prisma.activityRegistration.count).mockResolvedValue(0);

      await countMonthlyActivityNoShows(prisma, "resident1");

      const callArgs = vi.mocked(prisma.activityRegistration.count).mock.calls[0][0];
      const where = callArgs.where;
      // Verify date range is scoped to current month
      expect(where.createdAt.gte).toBeInstanceOf(Date);
      expect(where.createdAt.lt).toBeInstanceOf(Date);
      const start = where.createdAt.gte as Date;
      const end = where.createdAt.lt as Date;
      // start should be 1st of current month
      expect(start.getDate()).toBe(1);
      expect(start.getHours()).toBe(0);
      // end should be 1st of next month
      expect(end.getDate()).toBe(1);
      expect(end.getHours()).toBe(0);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
//  POST /register
// ══════════════════════════════════════════════════════════════════

describe("POST /register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(createResidentContext());
  });

  it("happy path — resident registers, returns 201", async () => {
    // Pre-check: isRegistrationAllowed passes
    vi.mocked(prisma.activity.findUnique).mockResolvedValue({
      id: "act1",
      status: "published",
      activityDate: futureDate(),
    } as any);
    vi.mocked(prisma.activityRegistration.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.activityRegistration.count).mockResolvedValue(0);

    // Transaction: capacity check + create
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const mockTx = {
        activity: {
          findUnique: vi.fn().mockResolvedValue({
            currentCapacity: 5,
            maxCapacity: 20,
            status: "published",
          }),
          update: vi.fn().mockResolvedValue({ id: "act1" }),
        },
        activityRegistration: {
          create: vi.fn().mockResolvedValue({
            id: "reg1",
            activityId: "act1",
            residentId: "resident1",
            status: "registered",
          }),
        },
      };
      return fn(mockTx);
    });

    const req = createRequest("http://localhost:3000/api/v1/activities/act1/register", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await registerRoute(req, {
      params: Promise.resolve({ id: "act1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.status).toBe("registered");
  });

  it("staff registers on behalf of resident", async () => {
    mockGetAuthContext.mockResolvedValue(createStaffContext());

    vi.mocked(prisma.activity.findUnique).mockResolvedValue({
      id: "act1",
      status: "published",
      activityDate: futureDate(),
    } as any);
    vi.mocked(prisma.activityRegistration.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.activityRegistration.count).mockResolvedValue(0);

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const mockTx = {
        activity: {
          findUnique: vi.fn().mockResolvedValue({
            currentCapacity: 0,
            maxCapacity: 10,
            status: "published",
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        activityRegistration: {
          create: vi.fn().mockResolvedValue({
            id: "reg2",
            activityId: "act1",
            residentId: "resident2",
            status: "registered",
          }),
        },
      };
      return fn(mockTx);
    });

    const req = createRequest("http://localhost:3000/api/v1/activities/act1/register", {
      method: "POST",
      body: JSON.stringify({ residentId: "resident2" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await registerRoute(req, {
      params: Promise.resolve({ id: "act1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.data.residentId).toBe("resident2");
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/v1/activities/act1/register", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await registerRoute(req, {
      params: Promise.resolve({ id: "act1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns ACTIVITY_010 when activity not found", async () => {
    vi.mocked(prisma.activity.findUnique).mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/v1/activities/act1/register", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await registerRoute(req, {
      params: Promise.resolve({ id: "act1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("ACTIVITY_010");
  });

  it("returns ACTIVITY_003 when activity is cancelled", async () => {
    vi.mocked(prisma.activity.findUnique).mockResolvedValue({
      id: "act1",
      status: "cancelled",
      activityDate: futureDate(),
    } as any);

    const req = createRequest("http://localhost:3000/api/v1/activities/act1/register", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await registerRoute(req, {
      params: Promise.resolve({ id: "act1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("ACTIVITY_003");
  });

  it("returns ACTIVITY_003 when activity is draft", async () => {
    vi.mocked(prisma.activity.findUnique).mockResolvedValue({
      id: "act1",
      status: "draft",
      activityDate: futureDate(),
    } as any);

    const req = createRequest("http://localhost:3000/api/v1/activities/act1/register", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await registerRoute(req, {
      params: Promise.resolve({ id: "act1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("ACTIVITY_003");
  });

  it("returns ACTIVITY_004 when registration deadline passed", async () => {
    vi.mocked(prisma.activity.findUnique).mockResolvedValue({
      id: "act1",
      status: "published",
      activityDate: pastDate(2),
    } as any);

    const req = createRequest("http://localhost:3000/api/v1/activities/act1/register", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await registerRoute(req, {
      params: Promise.resolve({ id: "act1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("ACTIVITY_004");
  });

  it("returns ACTIVITY_005 when already registered", async () => {
    vi.mocked(prisma.activity.findUnique).mockResolvedValue({
      id: "act1",
      status: "published",
      activityDate: futureDate(),
    } as any);
    vi.mocked(prisma.activityRegistration.findUnique).mockResolvedValue({
      activityId: "act1",
      residentId: "resident1",
      status: "registered",
    } as any);

    const req = createRequest("http://localhost:3000/api/v1/activities/act1/register", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await registerRoute(req, {
      params: Promise.resolve({ id: "act1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("ACTIVITY_005");
  });

  it("returns ACTIVITY_006 when no-show limit reached", async () => {
    vi.mocked(prisma.activity.findUnique).mockResolvedValue({
      id: "act1",
      status: "published",
      activityDate: futureDate(),
    } as any);
    vi.mocked(prisma.activityRegistration.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.activityRegistration.count).mockResolvedValue(2);

    const req = createRequest("http://localhost:3000/api/v1/activities/act1/register", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await registerRoute(req, {
      params: Promise.resolve({ id: "act1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("ACTIVITY_006");
  });

  it("returns ACTIVITY_001 when capacity full (transaction rejects)", async () => {
    // Pre-check passes
    vi.mocked(prisma.activity.findUnique).mockResolvedValue({
      id: "act1",
      status: "published",
      activityDate: futureDate(),
    } as any);
    vi.mocked(prisma.activityRegistration.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.activityRegistration.count).mockResolvedValue(0);

    // Transaction: capacity full
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const mockTx = {
        activity: {
          findUnique: vi.fn().mockResolvedValue({
            currentCapacity: 20,
            maxCapacity: 20,
            status: "published",
          }),
          update: vi.fn(),
        },
        activityRegistration: { create: vi.fn() },
      };
      return fn(mockTx);
    });

    const req = createRequest("http://localhost:3000/api/v1/activities/act1/register", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await registerRoute(req, {
      params: Promise.resolve({ id: "act1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("ACTIVITY_001");
  });

  it("returns ACTIVITY_003 when activity status changed inside transaction", async () => {
    // Pre-check passes (published)
    vi.mocked(prisma.activity.findUnique).mockResolvedValue({
      id: "act1",
      status: "published",
      activityDate: futureDate(),
    } as any);
    vi.mocked(prisma.activityRegistration.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.activityRegistration.count).mockResolvedValue(0);

    // Transaction: status changed to draft (race condition)
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const mockTx = {
        activity: {
          findUnique: vi.fn().mockResolvedValue({
            currentCapacity: 5,
            maxCapacity: 20,
            status: "draft", // changed between pre-check and transaction
          }),
          update: vi.fn(),
        },
        activityRegistration: { create: vi.fn() },
      };
      return fn(mockTx);
    });

    const req = createRequest("http://localhost:3000/api/v1/activities/act1/register", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await registerRoute(req, {
      params: Promise.resolve({ id: "act1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("ACTIVITY_003");
  });

  it("staff auth without residentId in body → 400", async () => {
    mockGetAuthContext.mockResolvedValue(createStaffContext());

    const req = createRequest("http://localhost:3000/api/v1/activities/act1/register", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await registerRoute(req, {
      params: Promise.resolve({ id: "act1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("ACTIVITY_012");
  });
});

// ══════════════════════════════════════════════════════════════════
//  POST /check-in
// ══════════════════════════════════════════════════════════════════

describe("POST /check-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(createResidentContext());
  });

  it("happy path — resident checks in, returns 200", async () => {
    vi.mocked(prisma.activityRegistration.findUnique)
      .mockResolvedValueOnce({
        activityId: "act1",
        residentId: "resident1",
        status: "registered",
      } as any)
      .mockResolvedValueOnce({
        id: "reg1",
        activityId: "act1",
        residentId: "resident1",
        status: "registered",
      } as any);

    vi.mocked(prisma.activityRegistration.update).mockResolvedValue({
      id: "reg1",
      activityId: "act1",
      residentId: "resident1",
      status: "checked_in",
      checkedInAt: new Date(),
    } as any);

    const req = createRequest("http://localhost:3000/api/v1/activities/act1/check-in", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await checkInRoute(req, {
      params: Promise.resolve({ id: "act1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("staff checks in on behalf of resident", async () => {
    mockGetAuthContext.mockResolvedValue(createStaffContext());

    vi.mocked(prisma.activityRegistration.findUnique)
      .mockResolvedValueOnce({
        activityId: "act1",
        residentId: "resident2",
        status: "registered",
      } as any)
      .mockResolvedValueOnce({
        id: "reg2",
        activityId: "act1",
        residentId: "resident2",
        status: "registered",
      } as any);

    vi.mocked(prisma.activityRegistration.update).mockResolvedValue({
      id: "reg2",
      status: "checked_in",
    } as any);

    const req = createRequest("http://localhost:3000/api/v1/activities/act1/check-in", {
      method: "POST",
      body: JSON.stringify({ residentId: "resident2" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await checkInRoute(req, {
      params: Promise.resolve({ id: "act1" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns ACTIVITY_007 when not registered", async () => {
    vi.mocked(prisma.activityRegistration.findUnique).mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/v1/activities/act1/check-in", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await checkInRoute(req, {
      params: Promise.resolve({ id: "act1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("ACTIVITY_007");
  });

  it("returns 200 when already checked in (idempotent)", async () => {
    // checkInRules returns allowed=true for checked_in
    vi.mocked(prisma.activityRegistration.findUnique)
      .mockResolvedValueOnce({
        activityId: "act1",
        residentId: "resident1",
        status: "checked_in",
      } as any)
      .mockResolvedValueOnce({
        id: "reg1",
        activityId: "act1",
        residentId: "resident1",
        status: "checked_in",
        checkedInAt: new Date(),
      } as any);

    const req = createRequest("http://localhost:3000/api/v1/activities/act1/check-in", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await checkInRoute(req, {
      params: Promise.resolve({ id: "act1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // Should NOT call update since already checked in
    expect(prisma.activityRegistration.update).not.toHaveBeenCalled();
  });

  it("returns ACTIVITY_007 when registration is cancelled", async () => {
    vi.mocked(prisma.activityRegistration.findUnique).mockResolvedValue({
      activityId: "act1",
      residentId: "resident1",
      status: "cancelled",
    } as any);

    const req = createRequest("http://localhost:3000/api/v1/activities/act1/check-in", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await checkInRoute(req, {
      params: Promise.resolve({ id: "act1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("ACTIVITY_007");
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const req = createRequest("http://localhost:3000/api/v1/activities/act1/check-in", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await checkInRoute(req, {
      params: Promise.resolve({ id: "act1" }),
    });
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════
//  GET /my-registrations
// ══════════════════════════════════════════════════════════════════

describe("GET /my-registrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(createResidentContext());
  });

  it("returns resident's registrations", async () => {
    const mockRegistrations = [
      {
        id: "reg1",
        status: "registered",
        registeredAt: new Date(),
        activity: {
          id: "act1",
          name: "瑜伽课程",
          type: "course",
          activityDate: futureDate(),
        },
      },
    ];
    vi.mocked(prisma.activityRegistration.findMany).mockResolvedValue(mockRegistrations as any);
    vi.mocked(prisma.activityRegistration.count).mockResolvedValue(1);

    const req = createRequest(
      "http://localhost:3000/api/v1/activities/my-registrations"
    );
    const res = await myRegistrationsRoute(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.records).toHaveLength(1);
    expect(data.data.records[0].activity.name).toBe("瑜伽课程");
  });

  it("returns empty list when no registrations", async () => {
    vi.mocked(prisma.activityRegistration.findMany).mockResolvedValue([]);
    vi.mocked(prisma.activityRegistration.count).mockResolvedValue(0);

    const req = createRequest(
      "http://localhost:3000/api/v1/activities/my-registrations"
    );
    const res = await myRegistrationsRoute(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.records).toHaveLength(0);
    expect(data.data.total).toBe(0);
  });

  it("filters by status", async () => {
    vi.mocked(prisma.activityRegistration.findMany).mockResolvedValue([]);
    vi.mocked(prisma.activityRegistration.count).mockResolvedValue(0);

    const req = createRequest(
      "http://localhost:3000/api/v1/activities/my-registrations?status=checked_in"
    );
    const res = await myRegistrationsRoute(req);

    expect(res.status).toBe(200);
    const callArgs = vi.mocked(prisma.activityRegistration.findMany).mock.calls[0][0];
    expect(callArgs.where.status).toBe("checked_in");
  });

  it("supports pagination (limit/offset)", async () => {
    vi.mocked(prisma.activityRegistration.findMany).mockResolvedValue([]);
    vi.mocked(prisma.activityRegistration.count).mockResolvedValue(50);

    const req = createRequest(
      "http://localhost:3000/api/v1/activities/my-registrations?limit=10&offset=20"
    );
    const res = await myRegistrationsRoute(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.limit).toBe(10);
    expect(data.data.offset).toBe(20);
    expect(data.data.total).toBe(50);

    const callArgs = vi.mocked(prisma.activityRegistration.findMany).mock.calls[0][0];
    expect(callArgs.take).toBe(10);
    expect(callArgs.skip).toBe(20);
  });

  it("returns 403 when staff tries to access (no residentId)", async () => {
    mockGetAuthContext.mockResolvedValue(createStaffContext());

    const req = createRequest(
      "http://localhost:3000/api/v1/activities/my-registrations"
    );
    const res = await myRegistrationsRoute(req);
    const data = await res.json();

    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const req = createRequest(
      "http://localhost:3000/api/v1/activities/my-registrations"
    );
    const res = await myRegistrationsRoute(req);
    expect(res.status).toBe(401);
  });
});
