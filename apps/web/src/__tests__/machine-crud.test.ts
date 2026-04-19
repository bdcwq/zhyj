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
    machine: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    room: {
      findFirst: vi.fn(),
    },
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
import { GET, POST } from "@/app/api/v1/machines/route";
import { GET as getMachineById, PATCH, DELETE } from "@/app/api/v1/machines/[id]/route";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

// ── Helper to create a mock request ──
function createRequest(url: string, options?: RequestInit): any {
  return new NextRequest(url, options);
}

// ── Helper contexts ──
const adminCtx = { staffId: "admin-1", role: "admin", storeId: "store-1" };
const managerCtx = { staffId: "manager-1", role: "store_manager", storeId: "store-1" };

// ── Sample machine record ──
const sampleMachine = {
  id: "machine-1",
  name: "Device A",
  storeId: "store-1",
  roomId: "room-1",
  status: "available",
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  room: { id: "room-1", name: "Room A" },
};

const sampleMachineNoRoom = {
  ...sampleMachine,
  roomId: null,
  room: null,
};

// ── Sample room record (for validation) ──
const sampleRoom = {
  id: "room-1",
  name: "Room A",
  storeId: "store-1",
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(null);
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/machines — List
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/machines", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(createRequest("http://localhost/api/v1/machines") as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not authorized", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "staff", storeId: "store-1" });
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await GET(createRequest("http://localhost/api/v1/machines") as any);
    expect(res.status).toBe(403);
  });

  it("lists machines without pagination (backward compatible)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleMachine]);

    const res = await GET(createRequest("http://localhost/api/v1/machines") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].room).toEqual({ id: "room-1", name: "Room A" });
  });

  it("lists machines with roomId filter", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleMachine]);

    const res = await GET(createRequest("http://localhost/api/v1/machines?roomId=room-1") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.machine.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.roomId).toBe("room-1");
  });

  it("lists machines with status filter", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleMachine]);

    const res = await GET(createRequest("http://localhost/api/v1/machines?status=available") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.machine.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.status).toBe("available");
  });

  it("lists machines with pagination", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleMachine]);
    (mockPrisma.machine.count as ReturnType<typeof vi.fn>).mockResolvedValue(30);

    const res = await GET(createRequest("http://localhost/api/v1/machines?limit=10&offset=10") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.records).toHaveLength(1);
    expect(body.data.total).toBe(30);
    expect(body.data.page).toBe(2);
    expect(body.data.pageSize).toBe(10);
  });

  it("lists machines with combined pagination and filters", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleMachine]);
    (mockPrisma.machine.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);

    const res = await GET(createRequest("http://localhost/api/v1/machines?limit=10&offset=0&roomId=room-1&status=maintenance") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.machine.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.roomId).toBe("room-1");
    expect(findManyCall.where.status).toBe("maintenance");
    expect(findManyCall.where.storeId).toBe("store-1");
    expect(findManyCall.where.deletedAt).toBeNull();
  });

  it("filters by storeId from auth context", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.machine.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET(createRequest("http://localhost/api/v1/machines") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.machine.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.storeId).toBe("store-1");
    expect(findManyCall.where.deletedAt).toBeNull();
  });

  it("returns empty array for filters with no results", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET(createRequest("http://localhost/api/v1/machines?roomId=nonexistent") as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(0);
  });

  it("handles pagination beyond results", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockPrisma.machine.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);

    const res = await GET(createRequest("http://localhost/api/v1/machines?limit=10&offset=100") as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.records).toHaveLength(0);
    expect(body.data.total).toBe(5);
  });

  it("includes room relation in response", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleMachine]);

    const res = await GET(createRequest("http://localhost/api/v1/machines") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.machine.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.include.room).toEqual({ select: { id: true, name: true } });
  });
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/v1/machines — Create
// ══════════════════════════════════════════════════════════════════════
describe("POST /api/v1/machines", () => {
  const validBody = { name: "New Device" };

  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(createRequest("http://localhost/api/v1/machines", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(401);
  });

  it("creates a machine without roomId (unassigned)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleMachineNoRoom);

    const res = await POST(createRequest("http://localhost/api/v1/machines", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Device A");

    // Verify create was called with storeId from auth context
    const createCall = (mockPrisma.machine.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(createCall.data.storeId).toBe("store-1");
    expect(createCall.data.roomId).toBeNull();
    expect(createCall.data.status).toBe("available");

    // Verify room validation was NOT called (no roomId)
    expect(mockPrisma.room.findFirst).not.toHaveBeenCalled();
  });

  it("creates a machine with roomId", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleRoom);
    (mockPrisma.machine.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleMachine);

    const res = await POST(createRequest("http://localhost/api/v1/machines", {
      method: "POST",
      body: JSON.stringify({ name: "New Device", roomId: "room-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify room validation was called
    const roomCall = (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(roomCall.where.id).toBe("room-1");
    expect(roomCall.where.storeId).toBe("store-1");

    // Verify create was called with roomId
    const createCall = (mockPrisma.machine.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(createCall.data.roomId).toBe("room-1");
  });

  it("creates a machine with custom status", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleMachineNoRoom,
      status: "maintenance",
    });

    const res = await POST(createRequest("http://localhost/api/v1/machines", {
      method: "POST",
      body: JSON.stringify({ name: "New Device", status: "maintenance" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(201);
    const createCall = (mockPrisma.machine.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(createCall.data.status).toBe("maintenance");
  });

  it("rejects non-existent roomId", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(createRequest("http://localhost/api/v1/machines", {
      method: "POST",
      body: JSON.stringify({ name: "New Device", roomId: "nonexistent-room" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("MACHINE_006");
  });

  it("rejects roomId from different store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    // Room exists but belongs to different store — findFirst returns null due to storeId filter
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(createRequest("http://localhost/api/v1/machines", {
      method: "POST",
      body: JSON.stringify({ name: "New Device", roomId: "room-other-store" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("MACHINE_006");
  });

  it("rejects missing required fields", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await POST(createRequest("http://localhost/api/v1/machines", {
      method: "POST",
      body: JSON.stringify({}), // missing name
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("MACHINE_002");
  });

  it("rejects empty name", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await POST(createRequest("http://localhost/api/v1/machines", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
  });

  it("rejects invalid status", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await POST(createRequest("http://localhost/api/v1/machines", {
      method: "POST",
      body: JSON.stringify({ name: "New Device", status: "invalid_status" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
  });

  it("store_manager can create machine scoped to their store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.machine.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleMachineNoRoom);

    const res = await POST(createRequest("http://localhost/api/v1/machines", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(201);
    const createCall = (mockPrisma.machine.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(createCall.data.storeId).toBe("store-1");
  });
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/machines/[id] — Single machine
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/machines/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await getMachineById(createRequest("http://localhost/api/v1/machines/machine-1") as any, {
      params: Promise.resolve({ id: "machine-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns single machine with room info", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleMachine);

    const res = await getMachineById(createRequest("http://localhost/api/v1/machines/machine-1") as any, {
      params: Promise.resolve({ id: "machine-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("machine-1");
    expect(body.data.room).toEqual({ id: "room-1", name: "Room A" });
  });

  it("returns single machine without room (unassigned)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleMachineNoRoom);

    const res = await getMachineById(createRequest("http://localhost/api/v1/machines/machine-2") as any, {
      params: Promise.resolve({ id: "machine-2" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.room).toBeNull();
  });

  it("returns 404 for non-existent machine", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await getMachineById(createRequest("http://localhost/api/v1/machines/nonexistent") as any, {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("MACHINE_001");
  });

  it("store_manager cannot access machine from other store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.machine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null); // not found because different store

    const res = await getMachineById(createRequest("http://localhost/api/v1/machines/machine-other") as any, {
      params: Promise.resolve({ id: "machine-other" }),
    });

    expect(res.status).toBe(404);
  });
});

// ══════════════════════════════════════════════════════════════════════
// PATCH /api/v1/machines/[id] — Update
// ══════════════════════════════════════════════════════════════════════
describe("PATCH /api/v1/machines/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PATCH(createRequest("http://localhost/api/v1/machines/machine-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "machine-1" }) });
    expect(res.status).toBe(401);
  });

  it("updates machine name", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleMachine);
    (mockPrisma.machine.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleMachine,
      name: "Updated Device",
    });

    const res = await PATCH(createRequest("http://localhost/api/v1/machines/machine-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated Device" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "machine-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Updated Device");
  });

  it("updates machine status", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleMachine);
    (mockPrisma.machine.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleMachine,
      status: "maintenance",
    });

    const res = await PATCH(createRequest("http://localhost/api/v1/machines/machine-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "maintenance" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "machine-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("maintenance");
  });

  it("updates machine roomId (assigning to room)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleMachineNoRoom);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleRoom);
    (mockPrisma.machine.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleMachineNoRoom,
      roomId: "room-1",
      room: { id: "room-1", name: "Room A" },
    });

    const res = await PATCH(createRequest("http://localhost/api/v1/machines/machine-1", {
      method: "PATCH",
      body: JSON.stringify({ roomId: "room-1" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "machine-1" }) });

    expect(res.status).toBe(200);

    // Verify room validation was called
    expect(mockPrisma.room.findFirst).toHaveBeenCalledWith({
      where: { id: "room-1", storeId: "store-1", deletedAt: null },
    });
  });

  it("clears roomId (unassigning from room)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleMachine);
    (mockPrisma.machine.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleMachine,
      roomId: null,
      room: null,
    });

    const res = await PATCH(createRequest("http://localhost/api/v1/machines/machine-1", {
      method: "PATCH",
      body: JSON.stringify({ roomId: null }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "machine-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.roomId).toBeNull();

    // Verify room validation was NOT called (roomId is null, not being assigned)
    expect(mockPrisma.room.findFirst).not.toHaveBeenCalled();
  });

  it("rejects non-existent roomId on update", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleMachine);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await PATCH(createRequest("http://localhost/api/v1/machines/machine-1", {
      method: "PATCH",
      body: JSON.stringify({ roomId: "nonexistent-room" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "machine-1" }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("MACHINE_006");
  });

  it("rejects roomId from different store on update", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleMachine);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await PATCH(createRequest("http://localhost/api/v1/machines/machine-1", {
      method: "PATCH",
      body: JSON.stringify({ roomId: "room-other-store" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "machine-1" }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("MACHINE_006");
  });

  it("returns 404 for non-existent machine", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await PATCH(createRequest("http://localhost/api/v1/machines/nonexistent", {
      method: "PATCH",
      body: JSON.stringify({ name: "Test" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "nonexistent" }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("MACHINE_001");
  });

  it("rejects invalid status on update", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleMachine);

    const res = await PATCH(createRequest("http://localhost/api/v1/machines/machine-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "invalid" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "machine-1" }) });

    expect(res.status).toBe(400);
  });

  it("store_manager cannot update machine from other store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.machine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null); // not found

    const res = await PATCH(createRequest("http://localhost/api/v1/machines/machine-other", {
      method: "PATCH",
      body: JSON.stringify({ name: "Hacked" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "machine-other" }) });

    expect(res.status).toBe(404);
  });
});

// ══════════════════════════════════════════════════════════════════════
// DELETE /api/v1/machines/[id] — Soft-delete
// ══════════════════════════════════════════════════════════════════════
describe("DELETE /api/v1/machines/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await DELETE(createRequest("http://localhost/api/v1/machines/machine-1") as any, {
      params: Promise.resolve({ id: "machine-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("soft-deletes a machine", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleMachine);
    (mockPrisma.machine.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleMachine,
      deletedAt: new Date(),
    });

    const res = await DELETE(createRequest("http://localhost/api/v1/machines/machine-1") as any, {
      params: Promise.resolve({ id: "machine-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
    expect(body.data.id).toBe("machine-1");

    // Verify soft-delete was called
    const updateCall = (mockPrisma.machine.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
  });

  it("returns 404 for non-existent machine", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.machine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await DELETE(createRequest("http://localhost/api/v1/machines/nonexistent") as any, {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("MACHINE_001");
  });

  it("store_manager cannot delete machine from other store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.machine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null); // not found

    const res = await DELETE(createRequest("http://localhost/api/v1/machines/machine-other") as any, {
      params: Promise.resolve({ id: "machine-other" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 403 when role is not authorized", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "staff", storeId: "store-1" });
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await DELETE(createRequest("http://localhost/api/v1/machines/machine-1") as any, {
      params: Promise.resolve({ id: "machine-1" }),
    });
    expect(res.status).toBe(403);
  });
});
