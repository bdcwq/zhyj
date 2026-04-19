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
    room: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    machine: {
      updateMany: vi.fn(),
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

// Suppress console output in tests
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

// Import mocked modules
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/v1/rooms/route";
import { GET as getRoomById, PATCH, DELETE } from "@/app/api/v1/rooms/[id]/route";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

// ── Helper to create a mock request ──
function createRequest(url: string, options?: RequestInit): any {
  return new NextRequest(url, options);
}

// ── Helper contexts ──
const adminCtx = { staffId: "admin-1", role: "admin", storeId: "store-1" };
const managerCtx = { staffId: "manager-1", role: "store_manager", storeId: "store-1" };

// ── Sample room record ──
const sampleRoom = {
  id: "room-1",
  name: "Room A",
  capacity: 5,
  storeId: "store-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  _count: { machines: 2 },
};

beforeEach(() => {
  vi.clearAllMocks();
  (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(null);
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/rooms — List
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/rooms", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(createRequest("http://localhost/api/v1/rooms") as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not authorized", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "staff", storeId: "store-1" });
    (requireRole as ReturnType<typeof vi.fn>).mockReturnValue(
      new Response(JSON.stringify({ success: false, error: { code: "PERMISSION_001" } }), { status: 403 })
    );
    const res = await GET(createRequest("http://localhost/api/v1/rooms") as any);
    expect(res.status).toBe(403);
  });

  it("lists rooms without pagination (backward compatible)", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.room.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleRoom]);

    const res = await GET(createRequest("http://localhost/api/v1/rooms") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]._count.machines).toBe(2);
  });

  it("lists rooms with search filter", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.room.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleRoom]);

    const res = await GET(createRequest("http://localhost/api/v1/rooms?search=Room+A") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.room.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.name).toEqual({ contains: "Room A", mode: "insensitive" });
  });

  it("lists rooms with pagination", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.room.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleRoom]);
    (mockPrisma.room.count as ReturnType<typeof vi.fn>).mockResolvedValue(25);

    const res = await GET(createRequest("http://localhost/api/v1/rooms?limit=10&offset=10") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.records).toHaveLength(1);
    expect(body.data.total).toBe(25);
    expect(body.data.page).toBe(2);
    expect(body.data.pageSize).toBe(10);
  });

  it("filters by storeId from auth context", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.room.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET(createRequest("http://localhost/api/v1/rooms") as any);
    expect(res.status).toBe(200);

    const findManyCall = (mockPrisma.room.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(findManyCall.where.storeId).toBe("store-1");
    expect(findManyCall.where.deletedAt).toBeNull();
  });

  it("returns empty array for search with no results", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.room.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await GET(createRequest("http://localhost/api/v1/rooms?search=nonexistent") as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/v1/rooms — Create
// ══════════════════════════════════════════════════════════════════════
describe("POST /api/v1/rooms", () => {
  const validBody = { name: "New Room", capacity: 5 };

  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(createRequest("http://localhost/api/v1/rooms", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);
    expect(res.status).toBe(401);
  });

  it("creates a room with valid data", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.room.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleRoom);

    const res = await POST(createRequest("http://localhost/api/v1/rooms", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Room A");

    // Verify create was called with storeId from auth context
    const createCall = (mockPrisma.room.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(createCall.data.storeId).toBe("store-1");
  });

  it("rejects duplicate room name within the same store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleRoom);

    const res = await POST(createRequest("http://localhost/api/v1/rooms", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("ROOM_006");
  });

  it("rejects missing required fields", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await POST(createRequest("http://localhost/api/v1/rooms", {
      method: "POST",
      body: JSON.stringify({}), // missing name and capacity
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("ROOM_002");
  });

  it("rejects empty name", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await POST(createRequest("http://localhost/api/v1/rooms", {
      method: "POST",
      body: JSON.stringify({ name: "", capacity: 5 }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
  });

  it("rejects negative capacity", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await POST(createRequest("http://localhost/api/v1/rooms", {
      method: "POST",
      body: JSON.stringify({ name: "Test", capacity: -1 }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
  });

  it("rejects non-numeric capacity", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);

    const res = await POST(createRequest("http://localhost/api/v1/rooms", {
      method: "POST",
      body: JSON.stringify({ name: "Test", capacity: "abc" }),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(400);
  });

  it("store_manager can create room scoped to their store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockPrisma.room.create as ReturnType<typeof vi.fn>).mockResolvedValue(sampleRoom);

    const res = await POST(createRequest("http://localhost/api/v1/rooms", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    }) as any);

    expect(res.status).toBe(201);
    const createCall = (mockPrisma.room.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(createCall.data.storeId).toBe("store-1");
  });
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/v1/rooms/[id] — Single room
// ══════════════════════════════════════════════════════════════════════
describe("GET /api/v1/rooms/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await getRoomById(createRequest("http://localhost/api/v1/rooms/room-1") as any, {
      params: Promise.resolve({ id: "room-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns single room with machine count", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleRoom);

    const res = await getRoomById(createRequest("http://localhost/api/v1/rooms/room-1") as any, {
      params: Promise.resolve({ id: "room-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("room-1");
    expect(body.data._count.machines).toBe(2);
  });

  it("returns 404 for non-existent room", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await getRoomById(createRequest("http://localhost/api/v1/rooms/nonexistent") as any, {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("ROOM_001");
  });

  it("store_manager cannot access room from other store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null); // not found because different store

    const res = await getRoomById(createRequest("http://localhost/api/v1/rooms/room-other") as any, {
      params: Promise.resolve({ id: "room-other" }),
    });

    expect(res.status).toBe(404);
  });
});

// ══════════════════════════════════════════════════════════════════════
// PATCH /api/v1/rooms/[id] — Update
// ══════════════════════════════════════════════════════════════════════
describe("PATCH /api/v1/rooms/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PATCH(createRequest("http://localhost/api/v1/rooms/room-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "room-1" }) });
    expect(res.status).toBe(401);
  });

  it("updates room name", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleRoom) // lookup
      .mockResolvedValueOnce(null); // duplicate name check — no duplicate
    (mockPrisma.room.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleRoom,
      name: "Updated Room",
    });

    const res = await PATCH(createRequest("http://localhost/api/v1/rooms/room-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated Room" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "room-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Updated Room");
  });

  it("updates room capacity only", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleRoom);
    (mockPrisma.room.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...sampleRoom,
      capacity: 10,
    });

    const res = await PATCH(createRequest("http://localhost/api/v1/rooms/room-1", {
      method: "PATCH",
      body: JSON.stringify({ capacity: 10 }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "room-1" }) });

    expect(res.status).toBe(200);

    // Verify update was called with only capacity
    const updateCall = (mockPrisma.room.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(updateCall.data.capacity).toBe(10);
    expect(updateCall.data.name).toBeUndefined();
  });

  it("rejects duplicate name on update", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleRoom) // room lookup
      .mockResolvedValueOnce({ id: "other-room" }); // duplicate found

    const res = await PATCH(createRequest("http://localhost/api/v1/rooms/room-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Other Room" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "room-1" }) });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("ROOM_006");
  });

  it("returns 404 for non-existent room", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await PATCH(createRequest("http://localhost/api/v1/rooms/nonexistent", {
      method: "PATCH",
      body: JSON.stringify({ name: "Test" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "nonexistent" }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("ROOM_001");
  });

  it("allows same name (no change) on update", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleRoom);
    (mockPrisma.room.update as ReturnType<typeof vi.fn>).mockResolvedValue(sampleRoom);

    // Same name as existing — should not trigger uniqueness check
    const res = await PATCH(createRequest("http://localhost/api/v1/rooms/room-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Room A" }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "room-1" }) });

    expect(res.status).toBe(200);
    // findFirst should only be called once (the room lookup, not duplicate check)
    expect(mockPrisma.room.findFirst).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid capacity on update", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleRoom);

    const res = await PATCH(createRequest("http://localhost/api/v1/rooms/room-1", {
      method: "PATCH",
      body: JSON.stringify({ capacity: 0 }),
      headers: { "Content-Type": "application/json" },
    }) as any, { params: Promise.resolve({ id: "room-1" }) });

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════
// DELETE /api/v1/rooms/[id] — Soft-delete with cascade
// ══════════════════════════════════════════════════════════════════════
describe("DELETE /api/v1/rooms/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await DELETE(createRequest("http://localhost/api/v1/rooms/room-1") as any, {
      params: Promise.resolve({ id: "room-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("soft-deletes room and cascades to machines", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleRoom);
    (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([
      { count: 3 }, // machines soft-deleted
      { id: "room-1", deletedAt: new Date() }, // room soft-deleted
    ]);

    const res = await DELETE(createRequest("http://localhost/api/v1/rooms/room-1") as any, {
      params: Promise.resolve({ id: "room-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);

    // Verify transaction was called with cascade delete operations
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    const txArgs = (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mock.calls[0][0] as any[];
    expect(txArgs).toHaveLength(2); // machine updateMany + room update
  });

  it("returns 404 for non-existent room", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await DELETE(createRequest("http://localhost/api/v1/rooms/nonexistent") as any, {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("ROOM_001");
  });

  it("cascades soft-delete to room with 0 machines", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(adminCtx);
    const emptyRoom = { ...sampleRoom, _count: { machines: 0 } };
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(emptyRoom);
    (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([
      { count: 0 }, // no machines to delete
      { id: "room-1", deletedAt: new Date() },
    ]);

    const res = await DELETE(createRequest("http://localhost/api/v1/rooms/room-1") as any, {
      params: Promise.resolve({ id: "room-1" }),
    });

    expect(res.status).toBe(200);
  });

  it("store_manager cannot delete room from other store", async () => {
    (getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(managerCtx);
    (mockPrisma.room.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null); // not found

    const res = await DELETE(createRequest("http://localhost/api/v1/rooms/room-other") as any, {
      params: Promise.resolve({ id: "room-other" }),
    });

    expect(res.status).toBe(404);
  });
});
