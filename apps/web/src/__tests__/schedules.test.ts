import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock next/server to avoid hanging on NextRequest/NextResponse ──
vi.mock("next/server", () => {
  class NextRequest extends Request {
    private _url: URL;
    constructor(url: string, init?: RequestInit) {
      super(url, init);
      this._url = new URL(url);
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
    shiftTemplate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    schedule: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    staffStore: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn().mockReturnValue(null),
}));

// Suppress console output in tests
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

// Import mocked modules
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { NextRequest } from "next/server";

// Template routes
import { GET as TEMPLATE_LIST, POST as TEMPLATE_CREATE } from "@/app/api/v1/schedules/templates/route";
import {
  GET as TEMPLATE_GET,
  PUT as TEMPLATE_UPDATE,
  DELETE as TEMPLATE_DELETE,
} from "@/app/api/v1/schedules/templates/[id]/route";

// Schedule routes
import { GET as SCHEDULE_LIST } from "@/app/api/v1/schedules/route";
import { POST as SCHEDULE_GENERATE } from "@/app/api/v1/schedules/generate/route";
import { PUT as SCHEDULE_UPDATE, DELETE as SCHEDULE_CANCEL } from "@/app/api/v1/schedules/[id]/route";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

// ── Helper to create a mock request ──
function createRequest(url: string, options?: RequestInit): any {
  return new NextRequest(url, options);
}

// ── Helper contexts ──
const adminCtx = { staffId: "admin-1", role: "admin", storeId: "store-1" };
const managerCtx = { staffId: "mgr-1", role: "store_manager", storeId: "store-2" };

// ── Sample data ──
const sampleTemplate = {
  id: "tpl-1",
  name: "标准周排班",
  storeId: "store-1",
  shifts: JSON.stringify([{ type: "morning", startTime: "08:00", endTime: "12:00", requiredStaff: 2 }]),
  effectiveDays: JSON.stringify([1, 2, 3, 4, 5]),
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const sampleSchedule = {
  id: "sch-1",
  date: new Date("2026-04-27"),
  staffId: "staff-1",
  storeId: "store-1",
  shiftType: "morning",
  startTime: "08:00",
  endTime: "12:00",
  status: "scheduled",
  templateId: "tpl-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  staff: { id: "staff-1", name: "张三", phone: "13800000000" },
};

beforeEach(() => {
  vi.clearAllMocks();
  (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(null);
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/schedules/templates — List templates
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/schedules/templates", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await TEMPLATE_LIST(createRequest("http://localhost/api/v1/schedules/templates") as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not authorized", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "staff", storeId: "store-1" });
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await TEMPLATE_LIST(createRequest("http://localhost/api/v1/schedules/templates") as any);
    expect(res.status).toBe(403);
  });

  it("returns paginated list of templates", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleTemplate]);
    (mockPrisma.shiftTemplate.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await TEMPLATE_LIST(createRequest("http://localhost/api/v1/schedules/templates") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.records).toHaveLength(1);
    expect(body.data.total).toBe(1);
    // Verify JSON fields are parsed
    expect(body.data.records[0].shifts).toEqual([{ type: "morning", startTime: "08:00", endTime: "12:00", requiredStaff: 2 }]);
    expect(body.data.records[0].effectiveDays).toEqual([1, 2, 3, 4, 5]);
  });

  it("store_manager scoped to their own store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.shiftTemplate.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.shiftTemplate.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await TEMPLATE_LIST(createRequest("http://localhost/api/v1/schedules/templates") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.shiftTemplate.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.storeId).toBe("store-2");
    expect(findManyCall.where.deletedAt).toBeNull();
  });

  it("filters by search term", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleTemplate]);
    (mockPrisma.shiftTemplate.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await TEMPLATE_LIST(createRequest("http://localhost/api/v1/schedules/templates?search=标准") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.shiftTemplate.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.name).toEqual({ contains: "标准", mode: "insensitive" });
  });

  it("filters out soft-deleted templates", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.shiftTemplate.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await TEMPLATE_LIST(createRequest("http://localhost/api/v1/schedules/templates") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.shiftTemplate.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.deletedAt).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/v1/schedules/templates — Create template
// ══════════════════════════════════════════════════════════════════════
describe("POST /api/v1/schedules/templates", () => {
  const validBody = {
    name: "新排班模板",
    shifts: [{ type: "morning", startTime: "08:00", endTime: "12:00", requiredStaff: 2 }],
    effectiveDays: [1, 2, 3, 4, 5],
  };

  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await TEMPLATE_CREATE(createRequest("http://localhost/api/v1/schedules/templates", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not authorized", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "staff", storeId: "store-1" });
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await TEMPLATE_CREATE(createRequest("http://localhost/api/v1/schedules/templates", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is empty", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await TEMPLATE_CREATE(createRequest("http://localhost/api/v1/schedules/templates", {
      method: "POST",
      body: JSON.stringify({ name: "", shifts: validBody.shifts, effectiveDays: validBody.effectiveDays }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_002");
  });

  it("returns 400 when shifts is empty array", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await TEMPLATE_CREATE(createRequest("http://localhost/api/v1/schedules/templates", {
      method: "POST",
      body: JSON.stringify({ name: "测试", shifts: [], effectiveDays: [1] }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_002");
  });

  it("returns 400 when effectiveDays is empty array", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await TEMPLATE_CREATE(createRequest("http://localhost/api/v1/schedules/templates", {
      method: "POST",
      body: JSON.stringify({ name: "测试", shifts: validBody.shifts, effectiveDays: [] }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_002");
  });

  it("returns 400 for invalid time format", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await TEMPLATE_CREATE(createRequest("http://localhost/api/v1/schedules/templates", {
      method: "POST",
      body: JSON.stringify({
        name: "测试",
        shifts: [{ type: "morning", startTime: "invalid", endTime: "12:00", requiredStaff: 1 }],
        effectiveDays: [1],
      }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_002");
  });

  it("creates template successfully (201)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleTemplate);

    const res = await TEMPLATE_CREATE(createRequest("http://localhost/api/v1/schedules/templates", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("标准周排班");

    // Verify shifts/effectiveDays were JSON.stringify'd before create
    const createCall = (mockPrisma.shiftTemplate.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(createCall.data.name).toBe("新排班模板");
    expect(createCall.data.shifts).toBe(JSON.stringify(validBody.shifts));
    expect(createCall.data.effectiveDays).toBe(JSON.stringify(validBody.effectiveDays));
    expect(createCall.data.storeId).toBe("store-1");
  });

  it("store_manager creates template with their storeId", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.shiftTemplate.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleTemplate,
      storeId: "store-2",
    });

    const res = await TEMPLATE_CREATE(createRequest("http://localhost/api/v1/schedules/templates", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(201);

    const createCall = (mockPrisma.shiftTemplate.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(createCall.data.storeId).toBe("store-2");
  });

  it("returns 500 on DB error", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB connection lost"));

    const res = await TEMPLATE_CREATE(createRequest("http://localhost/api/v1/schedules/templates", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_003");
  });
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/schedules/templates/[id] — Get template detail
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/schedules/templates/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await TEMPLATE_GET(createRequest("http://localhost/api/v1/schedules/templates/tpl-1") as any, {
      params: Promise.resolve({ id: "tpl-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent template", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await TEMPLATE_GET(createRequest("http://localhost/api/v1/schedules/templates/nonexistent") as any, {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_001");
  });

  it("returns 404 for soft-deleted template", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleTemplate,
      deletedAt: new Date("2025-01-01"),
    });

    const res = await TEMPLATE_GET(createRequest("http://localhost/api/v1/schedules/templates/tpl-1") as any, {
      params: Promise.resolve({ id: "tpl-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns template detail with parsed JSON fields (200)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleTemplate);

    const res = await TEMPLATE_GET(createRequest("http://localhost/api/v1/schedules/templates/tpl-1") as any, {
      params: Promise.resolve({ id: "tpl-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.shifts).toEqual([{ type: "morning", startTime: "08:00", endTime: "12:00", requiredStaff: 2 }]);
    expect(body.data.effectiveDays).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns 404 when store_manager accesses another store's template", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.shiftTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleTemplate);

    const res = await TEMPLATE_GET(createRequest("http://localhost/api/v1/schedules/templates/tpl-1") as any, {
      params: Promise.resolve({ id: "tpl-1" }),
    });

    // Template storeId is "store-1", manager storeId is "store-2"
    expect(res.status).toBe(404);
  });
});

// ══════════════════════════════════════════════════════════════════════
// PUT /api/v1/schedules/templates/[id] — Update template
// ══════════════════════════════════════════════════════════════════════
describe("PUT /api/v1/schedules/templates/[id]", () => {
  const validUpdate = { name: "更新后的模板" };

  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await TEMPLATE_UPDATE(createRequest("http://localhost/api/v1/schedules/templates/tpl-1", {
      method: "PUT",
      body: JSON.stringify(validUpdate),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "tpl-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent template", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await TEMPLATE_UPDATE(createRequest("http://localhost/api/v1/schedules/templates/nonexistent", {
      method: "PUT",
      body: JSON.stringify(validUpdate),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "nonexistent" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_001");
  });

  it("returns 404 when store_manager updates another store's template", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.shiftTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleTemplate);

    const res = await TEMPLATE_UPDATE(createRequest("http://localhost/api/v1/schedules/templates/tpl-1", {
      method: "PUT",
      body: JSON.stringify(validUpdate),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "tpl-1" }) });
    expect(res.status).toBe(404);
  });

  it("updates template name successfully (200)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleTemplate);
    (mockPrisma.shiftTemplate.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleTemplate,
      name: "更新后的模板",
    });

    const res = await TEMPLATE_UPDATE(createRequest("http://localhost/api/v1/schedules/templates/tpl-1", {
      method: "PUT",
      body: JSON.stringify(validUpdate),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "tpl-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("更新后的模板");
  });

  it("updates template shifts and JSON.stringify's them", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleTemplate);
    (mockPrisma.shiftTemplate.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleTemplate,
      shifts: JSON.stringify([{ type: "evening", startTime: "18:00", endTime: "22:00", requiredStaff: 1 }]),
    });

    const newShifts = [{ type: "evening", startTime: "18:00", endTime: "22:00", requiredStaff: 1 }];
    const res = await TEMPLATE_UPDATE(createRequest("http://localhost/api/v1/schedules/templates/tpl-1", {
      method: "PUT",
      body: JSON.stringify({ shifts: newShifts }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "tpl-1" }) });

    expect(res.status).toBe(200);

    const updateCall = (mockPrisma.shiftTemplate.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(updateCall.data.shifts).toBe(JSON.stringify(newShifts));
  });

  it("returns 400 for invalid params", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleTemplate);

    const res = await TEMPLATE_UPDATE(createRequest("http://localhost/api/v1/schedules/templates/tpl-1", {
      method: "PUT",
      body: JSON.stringify({ shifts: "not-an-array" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "tpl-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_002");
  });
});

// ══════════════════════════════════════════════════════════════════════
// DELETE /api/v1/schedules/templates/[id] — Soft-delete (admin only)
// ══════════════════════════════════════════════════════════════════════
describe("DELETE /api/v1/schedules/templates/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await TEMPLATE_DELETE(createRequest("http://localhost/api/v1/schedules/templates/tpl-1", {
      method: "DELETE",
    }) as any, { params: Promise.resolve({ id: "tpl-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when store_manager tries to delete", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await TEMPLATE_DELETE(createRequest("http://localhost/api/v1/schedules/templates/tpl-1", {
      method: "DELETE",
    }) as any, { params: Promise.resolve({ id: "tpl-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent template", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await TEMPLATE_DELETE(createRequest("http://localhost/api/v1/schedules/templates/nonexistent", {
      method: "DELETE",
    }) as any, { params: Promise.resolve({ id: "nonexistent" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_001");
  });

  it("soft-deletes template successfully (200)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleTemplate);
    (mockPrisma.shiftTemplate.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleTemplate,
      deletedAt: new Date(),
    });

    const res = await TEMPLATE_DELETE(createRequest("http://localhost/api/v1/schedules/templates/tpl-1", {
      method: "DELETE",
    }) as any, { params: Promise.resolve({ id: "tpl-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify soft-delete sets deletedAt
    const updateCall = (mockPrisma.shiftTemplate.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
  });
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/schedules — List schedules
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/schedules", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await SCHEDULE_LIST(createRequest("http://localhost/api/v1/schedules") as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not authorized", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "staff", storeId: "store-1" });
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await SCHEDULE_LIST(createRequest("http://localhost/api/v1/schedules") as any);
    expect(res.status).toBe(403);
  });

  it("returns paginated list with date/staff/status filters", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleSchedule]);
    (mockPrisma.schedule.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const url = "http://localhost/api/v1/schedules?dateFrom=2026-04-27&dateTo=2026-05-03&staffId=staff-1&status=scheduled";
    const res = await SCHEDULE_LIST(createRequest(url) as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.records).toHaveLength(1);
    expect(body.data.total).toBe(1);

    // Verify filters passed to prisma
    const findManyCall = (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.date.gte).toBeInstanceOf(Date);
    expect(findManyCall.where.date.lte).toBeInstanceOf(Date);
    expect(findManyCall.where.staffId).toBe("staff-1");
    expect(findManyCall.where.status).toBe("scheduled");
  });

  it("store_manager scoped to their own store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.schedule.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await SCHEDULE_LIST(createRequest("http://localhost/api/v1/schedules") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.storeId).toBe("store-2");
  });

  it("returns 400 for invalid params", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await SCHEDULE_LIST(createRequest("http://localhost/api/v1/schedules?limit=abc") as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_002");
  });
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/v1/schedules/generate — Generate weekly schedules
// ══════════════════════════════════════════════════════════════════════
describe("POST /api/v1/schedules/generate", () => {
  const mondayBody = {
    templateId: "tpl-1",
    weekStartDate: "2026-04-27", // Monday
  };

  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await SCHEDULE_GENERATE(createRequest("http://localhost/api/v1/schedules/generate", {
      method: "POST",
      body: JSON.stringify(mondayBody),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not authorized", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "staff", storeId: "store-1" });
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await SCHEDULE_GENERATE(createRequest("http://localhost/api/v1/schedules/generate", {
      method: "POST",
      body: JSON.stringify(mondayBody),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid params", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await SCHEDULE_GENERATE(createRequest("http://localhost/api/v1/schedules/generate", {
      method: "POST",
      body: JSON.stringify({ templateId: "", weekStartDate: "invalid" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_002");
  });

  it("returns 400 when weekStartDate is not Monday", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    // 2026-04-28 is a Tuesday
    const res = await SCHEDULE_GENERATE(createRequest("http://localhost/api/v1/schedules/generate", {
      method: "POST",
      body: JSON.stringify({ templateId: "tpl-1", weekStartDate: "2026-04-28" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_002");
    expect(body.error.message).toContain("周一");
  });

  it("returns 404 when template not found", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await SCHEDULE_GENERATE(createRequest("http://localhost/api/v1/schedules/generate", {
      method: "POST",
      body: JSON.stringify(mondayBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_001");
  });

  it("returns 404 when template is soft-deleted", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleTemplate,
      deletedAt: new Date(),
    });

    const res = await SCHEDULE_GENERATE(createRequest("http://localhost/api/v1/schedules/generate", {
      method: "POST",
      body: JSON.stringify(mondayBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(404);
  });

  it("returns 400 when no available staff for store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleTemplate);
    (mockPrisma.staffStore.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await SCHEDULE_GENERATE(createRequest("http://localhost/api/v1/schedules/generate", {
      method: "POST",
      body: JSON.stringify(mondayBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_009");
  });

  it("returns 403 when store_manager uses another store's template", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.shiftTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleTemplate);

    const res = await SCHEDULE_GENERATE(createRequest("http://localhost/api/v1/schedules/generate", {
      method: "POST",
      body: JSON.stringify(mondayBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_002");
  });

  it("generates schedules successfully with conflicts", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleTemplate);
    (mockPrisma.staffStore.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { staffId: "staff-1", storeId: "store-1", staff: { id: "staff-1", name: "张三" } },
      { staffId: "staff-2", storeId: "store-1", staff: { id: "staff-2", name: "李四" } },
    ]);
    // Each day: staff-2 already assigned → only 1 available for shift requiring 2 → conflict
    // Engine calls findMany once per shift per effectiveDay (5 days × 1 shift = 5 calls)
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { staffId: "staff-2" }, // staff-2 already assigned
    ]);
    (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([
      // 5 days × 1 assigned staff = 5 created
      ...Array(5).fill({ id: "sch-new" }),
    ]);

    const res = await SCHEDULE_GENERATE(createRequest("http://localhost/api/v1/schedules/generate", {
      method: "POST",
      body: JSON.stringify(mondayBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // 5 effective days, each has 1 conflict (need 2, only 1 available)
    expect(body.data.created).toBe(5);
    expect(body.data.conflicts).toHaveLength(5);
    expect(body.data.conflicts[0].shiftType).toBe("morning");
    expect(body.data.conflicts[0].needed).toBe(2);
    expect(body.data.conflicts[0].available).toBe(1);
    expect(body.data.templateName).toBe("标准周排班");
  });

  it("skips non-effective days (weekend)", async () => {
    // Template with effectiveDays [1,2,3,4,5] — Saturday/Sunday should be skipped
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleTemplate);
    (mockPrisma.staffStore.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { staffId: "staff-1", storeId: "store-1", staff: { id: "staff-1", name: "张三" } },
    ]);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "sch-mon" }, { id: "sch-tue" }, { id: "sch-wed" }, { id: "sch-thu" }, { id: "sch-fri" },
    ]);

    const res = await SCHEDULE_GENERATE(createRequest("http://localhost/api/v1/schedules/generate", {
      method: "POST",
      body: JSON.stringify(mondayBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    // effectiveDays=[1,2,3,4,5], 1 shift per day, 1 requiredStaff → 5 schedules
    expect(body.data.created).toBe(5);
  });

  it("handles Prisma unique constraint violation (P2002)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.shiftTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleTemplate);
    (mockPrisma.staffStore.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { staffId: "staff-1", storeId: "store-1", staff: { id: "staff-1", name: "张三" } },
    ]);
    (mockPrisma.schedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    // Dynamically import Prisma to construct the error with the correct class
    const { Prisma } = await import("@prisma/client");
    const p2002Error = new Prisma.PrismaClientKnownRequestError("Unique constraint", { code: "P2002", clientVersion: "0.0.0" });
    (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockRejectedValue(p2002Error);

    const res = await SCHEDULE_GENERATE(createRequest("http://localhost/api/v1/schedules/generate", {
      method: "POST",
      body: JSON.stringify(mondayBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_006");
  });
});

// ══════════════════════════════════════════════════════════════════════
// PUT /api/v1/schedules/[id] — Update schedule
// ══════════════════════════════════════════════════════════════════════
describe("PUT /api/v1/schedules/[id]", () => {
  const validUpdate = { staffId: "staff-2" };

  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await SCHEDULE_UPDATE(createRequest("http://localhost/api/v1/schedules/sch-1", {
      method: "PUT",
      body: JSON.stringify(validUpdate),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "sch-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent schedule", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.schedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await SCHEDULE_UPDATE(createRequest("http://localhost/api/v1/schedules/nonexistent", {
      method: "PUT",
      body: JSON.stringify(validUpdate),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "nonexistent" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_008");
  });

  it("returns 404 when store_manager updates another store's schedule", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.schedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleSchedule);

    const res = await SCHEDULE_UPDATE(createRequest("http://localhost/api/v1/schedules/sch-1", {
      method: "PUT",
      body: JSON.stringify(validUpdate),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "sch-1" }) });
    expect(res.status).toBe(404);
  });

  it("detects conflict when target staff already has a shift", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.schedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleSchedule);
    (mockPrisma.schedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "sch-other",
      staffId: "staff-2",
      date: new Date("2026-04-27"),
      shiftType: "morning",
      status: "scheduled",
    });

    const res = await SCHEDULE_UPDATE(createRequest("http://localhost/api/v1/schedules/sch-1", {
      method: "PUT",
      body: JSON.stringify({ staffId: "staff-2" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "sch-1" }) });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_006");
  });

  it("updates schedule successfully (200)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.schedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleSchedule);
    // No conflict — findFirst returns null
    (mockPrisma.schedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.schedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleSchedule,
      staffId: "staff-2",
      staff: { id: "staff-2", name: "李四", phone: "13800000001" },
    });

    const res = await SCHEDULE_UPDATE(createRequest("http://localhost/api/v1/schedules/sch-1", {
      method: "PUT",
      body: JSON.stringify({ staffId: "staff-2" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "sch-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.staffId).toBe("staff-2");
  });

  it("allows updating same staff (no conflict check)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.schedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleSchedule);
    (mockPrisma.schedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleSchedule,
      startTime: "09:00",
      staff: { id: "staff-1", name: "张三", phone: "13800000000" },
    });

    // Updating startTime without changing staffId — no conflict check needed
    const res = await SCHEDULE_UPDATE(createRequest("http://localhost/api/v1/schedules/sch-1", {
      method: "PUT",
      body: JSON.stringify({ startTime: "09:00" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "sch-1" }) });

    expect(res.status).toBe(200);
    // findFirst (conflict check) should NOT have been called
    expect(mockPrisma.schedule.findFirst).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid params", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await SCHEDULE_UPDATE(createRequest("http://localhost/api/v1/schedules/sch-1", {
      method: "PUT",
      body: JSON.stringify({ startTime: "invalid" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "sch-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_002");
  });
});

// ══════════════════════════════════════════════════════════════════════
// DELETE /api/v1/schedules/[id] — Cancel schedule
// ══════════════════════════════════════════════════════════════════════
describe("DELETE /api/v1/schedules/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await SCHEDULE_CANCEL(createRequest("http://localhost/api/v1/schedules/sch-1", {
      method: "DELETE",
    }) as any, { params: Promise.resolve({ id: "sch-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent schedule", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.schedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await SCHEDULE_CANCEL(createRequest("http://localhost/api/v1/schedules/nonexistent", {
      method: "DELETE",
    }) as any, { params: Promise.resolve({ id: "nonexistent" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("SCHEDULE_008");
  });

  it("returns 404 when store_manager cancels another store's schedule", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.schedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleSchedule);

    const res = await SCHEDULE_CANCEL(createRequest("http://localhost/api/v1/schedules/sch-1", {
      method: "DELETE",
    }) as any, { params: Promise.resolve({ id: "sch-1" }) });
    expect(res.status).toBe(404);
  });

  it("cancels schedule successfully (status=cancelled)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.schedule.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleSchedule);
    (mockPrisma.schedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleSchedule,
      status: "cancelled",
      staff: { id: "staff-1", name: "张三", phone: "13800000000" },
    });

    const res = await SCHEDULE_CANCEL(createRequest("http://localhost/api/v1/schedules/sch-1", {
      method: "DELETE",
    }) as any, { params: Promise.resolve({ id: "sch-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("cancelled");

    // Verify update was called with status: "cancelled"
    const updateCall = (mockPrisma.schedule.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(updateCall.data.status).toBe("cancelled");
  });
});
