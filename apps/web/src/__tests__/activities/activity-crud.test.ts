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
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    activityRegistration: {
      updateMany: vi.fn(),
      groupBy: vi.fn(),
    },
    staffStore: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn((args: unknown[]) => Promise.all(args)),
  },
}));

vi.mock("@/lib/auth", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn().mockReturnValue(null),
}));

import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { GET, POST } from "../../app/api/v1/activities/route";
import { GET as getDetail, PUT } from "../../app/api/v1/activities/[id]/route";
import { PATCH as cancelActivity } from "../../app/api/v1/activities/[id]/cancel/route";

const mockGetAuthContext = vi.mocked(getAuthContext);
const mockRequireRole = vi.mocked(requireRole);

// Import NextRequest from the mock (vi.mock hoists above)
import { NextRequest } from "next/server";

function createRequest(url: string, options?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3000"), options);
}

function createStaffContext(role = "admin", storeId = "store1") {
  return {
    staffId: "staff1",
    residentId: null,
    role,
    storeId,
  };
}

function createResidentContext(storeId = "store1") {
  return {
    staffId: null,
    residentId: "resident1",
    role: "resident",
    storeId,
  };
}

// ══════════════════════════════════════════════════════════════════
//  Activity CRUD — Unit Tests
// ══════════════════════════════════════════════════════════════════

describe("Activity CRUD API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(createStaffContext());
    mockRequireRole.mockReturnValue(null);
  });

  // ── POST /api/v1/activities ──

  describe("POST /api/v1/activities (Create)", () => {
    it("admin can create activity", async () => {
      const mockActivity = {
        id: "act1",
        name: "瑜伽课程",
        type: "course",
        storeId: "store1",
        activityDate: new Date("2026-05-01"),
        startTime: "09:00",
        endTime: "10:00",
        maxCapacity: 20,
        currentCapacity: 0,
        status: "draft",
      };
      vi.mocked(prisma.activity.create).mockResolvedValue(mockActivity);

      const req = createRequest("http://localhost:3000/api/v1/activities", {
        method: "POST",
        body: JSON.stringify({
          name: "瑜伽课程",
          type: "course",
          activityDate: "2026-05-01",
          startTime: "09:00",
          endTime: "10:00",
          maxCapacity: 20,
        }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe("瑜伽课程");
      expect(data.data.status).toBe("draft");
    });

    it("store_manager can create activity", async () => {
      mockGetAuthContext.mockResolvedValue(createStaffContext("store_manager"));

      const mockActivity = {
        id: "act2",
        name: "八段锦",
        type: "exercise",
        storeId: "store1",
        activityDate: new Date("2026-05-01"),
        startTime: "10:00",
        endTime: "11:00",
        maxCapacity: 30,
        currentCapacity: 0,
        status: "draft",
      };
      vi.mocked(prisma.activity.create).mockResolvedValue(mockActivity);

      const req = createRequest("http://localhost:3000/api/v1/activities", {
        method: "POST",
        body: JSON.stringify({
          name: "八段锦",
          type: "exercise",
          activityDate: "2026-05-01",
          startTime: "10:00",
          endTime: "11:00",
          maxCapacity: 30,
        }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
    });

    it("staff cannot create activity (403)", async () => {
      mockGetAuthContext.mockResolvedValue(createStaffContext("staff"));
      mockRequireRole.mockReturnValue(
        new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001", message: "权限不足" } }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      );

      const req = createRequest("http://localhost:3000/api/v1/activities", {
        method: "POST",
        body: JSON.stringify({
          name: "Test",
          type: "course",
          activityDate: "2026-05-01",
          startTime: "09:00",
          endTime: "10:00",
          maxCapacity: 20,
        }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("rejects missing required fields", async () => {
      const req = createRequest("http://localhost:3000/api/v1/activities", {
        method: "POST",
        body: JSON.stringify({ name: "瑜伽" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("ACTIVITY_012");
    });

    it("rejects endTime before startTime", async () => {
      const req = createRequest("http://localhost:3000/api/v1/activities", {
        method: "POST",
        body: JSON.stringify({
          name: "瑜伽",
          type: "course",
          activityDate: "2026-05-01",
          startTime: "10:00",
          endTime: "09:00",
          maxCapacity: 20,
        }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.message).toContain("结束时间");
    });

    it("rejects custom type without customType field", async () => {
      const req = createRequest("http://localhost:3000/api/v1/activities", {
        method: "POST",
        body: JSON.stringify({
          name: "特殊活动",
          type: "custom",
          activityDate: "2026-05-01",
          startTime: "09:00",
          endTime: "10:00",
          maxCapacity: 20,
        }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("allows custom type with customType field", async () => {
      const mockActivity = {
        id: "act3",
        name: "特殊活动",
        type: "custom",
        customType: "企业团建",
        storeId: "store1",
        activityDate: new Date("2026-05-01"),
        startTime: "09:00",
        endTime: "10:00",
        maxCapacity: 20,
        currentCapacity: 0,
        status: "draft",
      };
      vi.mocked(prisma.activity.create).mockResolvedValue(mockActivity);

      const req = createRequest("http://localhost:3000/api/v1/activities", {
        method: "POST",
        body: JSON.stringify({
          name: "特殊活动",
          type: "custom",
          customType: "企业团建",
          activityDate: "2026-05-01",
          startTime: "09:00",
          endTime: "10:00",
          maxCapacity: 20,
        }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
    });

    it("validates instructor belongs to store", async () => {
      vi.mocked(prisma.staffStore.findFirst).mockResolvedValue(null);

      const req = createRequest("http://localhost:3000/api/v1/activities", {
        method: "POST",
        body: JSON.stringify({
          name: "瑜伽",
          type: "course",
          activityDate: "2026-05-01",
          startTime: "09:00",
          endTime: "10:00",
          maxCapacity: 20,
          instructorId: "instructor-not-in-store",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.message).toContain("不属于当前门店");
    });

    it("unauthorized returns 401", async () => {
      mockGetAuthContext.mockResolvedValue(null);

      const req = createRequest("http://localhost:3000/api/v1/activities", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  // ── GET /api/v1/activities ──

  describe("GET /api/v1/activities (List)", () => {
    it("staff sees all statuses", async () => {
      vi.mocked(prisma.activity.findMany).mockResolvedValue([
        { id: "act1", name: "Draft Activity", status: "draft" },
        { id: "act2", name: "Published Activity", status: "published" },
      ]);

      const req = createRequest("http://localhost:3000/api/v1/activities");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(2);
    });

    it("resident only sees published activities", async () => {
      mockGetAuthContext.mockResolvedValue(createResidentContext());
      vi.mocked(prisma.activity.findMany).mockResolvedValue([
        { id: "act1", name: "Published", status: "published" },
      ]);

      const req = createRequest("http://localhost:3000/api/v1/activities");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(1);
    });

    it("supports date filter", async () => {
      vi.mocked(prisma.activity.findMany).mockResolvedValue([]);
      vi.mocked(prisma.activity.count).mockResolvedValue(0);

      const req = createRequest(
        "http://localhost:3000/api/v1/activities?date=2026-05-01&limit=20&offset=0"
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      // Verify where clause includes activityDate
      const callArgs = vi.mocked(prisma.activity.findMany).mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.where).toBeDefined();
    });

    it("supports type filter", async () => {
      vi.mocked(prisma.activity.findMany).mockResolvedValue([]);
      vi.mocked(prisma.activity.count).mockResolvedValue(0);

      const req = createRequest(
        "http://localhost:3000/api/v1/activities?type=course&limit=20&offset=0"
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
    });

    it("supports status filter for staff", async () => {
      vi.mocked(prisma.activity.findMany).mockResolvedValue([]);
      vi.mocked(prisma.activity.count).mockResolvedValue(0);

      const req = createRequest(
        "http://localhost:3000/api/v1/activities?status=draft&limit=20&offset=0"
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
    });

    it("pagination returns correct format", async () => {
      vi.mocked(prisma.activity.findMany).mockResolvedValue([]);
      vi.mocked(prisma.activity.count).mockResolvedValue(5);

      const req = createRequest(
        "http://localhost:3000/api/v1/activities?limit=10&offset=0"
      );
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data.records).toEqual([]);
      expect(data.data.total).toBe(5);
      expect(data.data.limit).toBe(10);
      expect(data.data.offset).toBe(0);
    });

    it("returns plain array without pagination params", async () => {
      vi.mocked(prisma.activity.findMany).mockResolvedValue([
        { id: "act1", name: "Activity" },
      ]);

      const req = createRequest("http://localhost:3000/api/v1/activities");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  // ── GET /api/v1/activities/[id] ──

  describe("GET /api/v1/activities/[id] (Detail)", () => {
    it("returns activity detail with registration stats", async () => {
      vi.mocked(prisma.activity.findFirst).mockResolvedValue({
        id: "act1",
        name: "瑜伽课程",
        type: "course",
        status: "published",
        storeId: "store1",
        _count: { registrations: 15 },
      } as never);

      vi.mocked(prisma.activityRegistration.groupBy).mockResolvedValue([
        { status: "registered", _count: { status: 10 } },
        { status: "checked_in", _count: { status: 4 } },
        { status: "no_show", _count: { status: 1 } },
      ] as never);

      const req = createRequest(
        "http://localhost:3000/api/v1/activities/act1"
      );
      const res = await getDetail(req, { params: Promise.resolve({ id: "act1" }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data.registrationCount).toBe(15);
      expect(data.data.checkedInCount).toBe(4);
      expect(data.data.noShowCount).toBe(1);
    });

    it("returns 404 for non-existent activity", async () => {
      vi.mocked(prisma.activity.findFirst).mockResolvedValue(null);

      const req = createRequest(
        "http://localhost:3000/api/v1/activities/nonexistent"
      );
      const res = await getDetail(req, { params: Promise.resolve({ id: "nonexistent" }) });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error.code).toBe("ACTIVITY_010");
    });

    it("resident cannot see draft activity (404)", async () => {
      mockGetAuthContext.mockResolvedValue(createResidentContext());
      vi.mocked(prisma.activity.findFirst).mockResolvedValue({
        id: "act1",
        status: "draft",
        storeId: "store1",
      } as never);

      const req = createRequest(
        "http://localhost:3000/api/v1/activities/act1"
      );
      const res = await getDetail(req, { params: Promise.resolve({ id: "act1" }) });

      expect(res.status).toBe(404);
    });
  });

  // ── PUT /api/v1/activities/[id] ──

  describe("PUT /api/v1/activities/[id] (Update)", () => {
    it("admin can update draft activity", async () => {
      vi.mocked(prisma.activity.findFirst).mockResolvedValue({
        id: "act1",
        status: "draft",
        currentCapacity: 0,
        storeId: "store1",
      } as never);
      vi.mocked(prisma.activity.update).mockResolvedValue({
        id: "act1",
        name: "Updated Name",
        status: "draft",
      });

      const req = createRequest("http://localhost:3000/api/v1/activities/act1", {
        method: "PUT",
        body: JSON.stringify({ name: "Updated Name" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PUT(req, { params: Promise.resolve({ id: "act1" }) });
      expect(res.status).toBe(200);
    });

    it("admin can update published activity", async () => {
      vi.mocked(prisma.activity.findFirst).mockResolvedValue({
        id: "act1",
        status: "published",
        currentCapacity: 5,
        storeId: "store1",
      } as never);
      vi.mocked(prisma.activity.update).mockResolvedValue({
        id: "act1",
        maxCapacity: 25,
      });

      const req = createRequest("http://localhost:3000/api/v1/activities/act1", {
        method: "PUT",
        body: JSON.stringify({ maxCapacity: 25 }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PUT(req, { params: Promise.resolve({ id: "act1" }) });
      expect(res.status).toBe(200);
    });

    it("cannot edit completed activity", async () => {
      vi.mocked(prisma.activity.findFirst).mockResolvedValue({
        id: "act1",
        status: "completed",
        storeId: "store1",
      } as never);

      const req = createRequest("http://localhost:3000/api/v1/activities/act1", {
        method: "PUT",
        body: JSON.stringify({ name: "New Name" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PUT(req, { params: Promise.resolve({ id: "act1" }) });
      expect(res.status).toBe(400);
    });

    it("cannot edit cancelled activity", async () => {
      vi.mocked(prisma.activity.findFirst).mockResolvedValue({
        id: "act1",
        status: "cancelled",
        storeId: "store1",
      } as never);

      const req = createRequest("http://localhost:3000/api/v1/activities/act1", {
        method: "PUT",
        body: JSON.stringify({ name: "New Name" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PUT(req, { params: Promise.resolve({ id: "act1" }) });
      expect(res.status).toBe(400);
    });

    it("maxCapacity cannot be less than currentCapacity", async () => {
      vi.mocked(prisma.activity.findFirst).mockResolvedValue({
        id: "act1",
        status: "draft",
        currentCapacity: 15,
        storeId: "store1",
      } as never);

      const req = createRequest("http://localhost:3000/api/v1/activities/act1", {
        method: "PUT",
        body: JSON.stringify({ maxCapacity: 10 }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PUT(req, { params: Promise.resolve({ id: "act1" }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.message).toContain("已报名人数");
    });

    it("returns 404 for non-existent activity", async () => {
      vi.mocked(prisma.activity.findFirst).mockResolvedValue(null);

      const req = createRequest("http://localhost:3000/api/v1/activities/nonexistent", {
        method: "PUT",
        body: JSON.stringify({ name: "Test" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PUT(req, { params: Promise.resolve({ id: "nonexistent" }) });
      expect(res.status).toBe(404);
    });

    it("staff cannot update activity (403)", async () => {
      mockGetAuthContext.mockResolvedValue(createStaffContext("staff"));
      mockRequireRole.mockReturnValue(
        new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001", message: "权限不足" } }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      );

      const req = createRequest("http://localhost:3000/api/v1/activities/act1", {
        method: "PUT",
        body: JSON.stringify({ name: "Test" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PUT(req, { params: Promise.resolve({ id: "act1" }) });
      expect(res.status).toBe(403);
    });
  });

  // ── PATCH /api/v1/activities/[id]/cancel ──

  describe("PATCH /api/v1/activities/[id]/cancel", () => {
    it("cancels published activity", async () => {
      vi.mocked(prisma.activity.findFirst).mockResolvedValue({
        id: "act1",
        name: "瑜伽课程",
        status: "published",
        storeId: "store1",
      } as never);
      vi.mocked(prisma.activity.update).mockResolvedValue({
        id: "act1",
        name: "瑜伽课程",
        status: "cancelled",
      });
      vi.mocked(prisma.activityRegistration.updateMany).mockResolvedValue({ count: 5 });

      const req = createRequest(
        "http://localhost:3000/api/v1/activities/act1/cancel",
        { method: "PATCH" }
      );

      const res = await cancelActivity(req, {
        params: Promise.resolve({ id: "act1" }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data.status).toBe("cancelled");
      expect(prisma.activityRegistration.updateMany).toHaveBeenCalledWith({
        where: { activityId: "act1", status: { in: ["registered"] } },
        data: { status: "cancelled" },
      });
    });

    it("cannot cancel draft activity", async () => {
      vi.mocked(prisma.activity.findFirst).mockResolvedValue({
        id: "act1",
        status: "draft",
        storeId: "store1",
      } as never);

      const req = createRequest(
        "http://localhost:3000/api/v1/activities/act1/cancel",
        { method: "PATCH" }
      );

      const res = await cancelActivity(req, {
        params: Promise.resolve({ id: "act1" }),
      });
      expect(res.status).toBe(400);
    });

    it("cannot cancel completed activity", async () => {
      vi.mocked(prisma.activity.findFirst).mockResolvedValue({
        id: "act1",
        status: "completed",
        storeId: "store1",
      } as never);

      const req = createRequest(
        "http://localhost:3000/api/v1/activities/act1/cancel",
        { method: "PATCH" }
      );

      const res = await cancelActivity(req, {
        params: Promise.resolve({ id: "act1" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent activity", async () => {
      vi.mocked(prisma.activity.findFirst).mockResolvedValue(null);

      const req = createRequest(
        "http://localhost:3000/api/v1/activities/nonexistent/cancel",
        { method: "PATCH" }
      );

      const res = await cancelActivity(req, {
        params: Promise.resolve({ id: "nonexistent" }),
      });
      expect(res.status).toBe(404);
    });

    it("staff cannot cancel activity (403)", async () => {
      mockGetAuthContext.mockResolvedValue(createStaffContext("staff"));
      mockRequireRole.mockReturnValue(
        new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001", message: "权限不足" } }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      );

      const req = createRequest(
        "http://localhost:3000/api/v1/activities/act1/cancel",
        { method: "PATCH" }
      );

      const res = await cancelActivity(req, {
        params: Promise.resolve({ id: "act1" }),
      });
      expect(res.status).toBe(403);
    });
  });
});
