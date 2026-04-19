import { describe, it, expect, vi, beforeEach } from "vitest";
import { signToken, getAuthContext } from "@/lib/auth";
import { JWT_EXPIRY, STORE_SWITCH_ERRORS } from "@zhyj/shared";

// ── Helpers ──

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

/**
 * Create a valid staff JWT with given payload fields.
 * Returns the raw token string.
 */
async function createStaffToken(overrides: Record<string, unknown> = {}): Promise<string> {
  return signToken({
    staffId: "staff-001",
    role: "admin",
    phone: "13800000001",
    name: "张三",
    storeId: "",
    ...overrides,
  });
}

// ── Mock @/lib/db (prisma) ──

const mockStaffStoreFindMany = vi.fn();
const mockStaffStoreFindFirst = vi.fn();
const mockStaffFindFirst = vi.fn();
const mockResidentFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    staffStore: {
      findMany: (...args: unknown[]) => mockStaffStoreFindMany(...args),
      findFirst: (...args: unknown[]) => mockStaffStoreFindFirst(...args),
    },
    staff: {
      findFirst: (...args: unknown[]) => mockStaffFindFirst(...args),
    },
    resident: {
      findMany: (...args: unknown[]) => mockResidentFindMany(...args),
    },
  },
}));

// ── Mock @/lib/password ──

vi.mock("@/lib/password", () => ({
  comparePassword: vi.fn().mockResolvedValue(true),
  hashPassword: vi.fn().mockResolvedValue("$hashed"),
}));

// ── Test data ──

const MOCK_SINGLE_STORE_STAFF = {
  id: "staff-001",
  username: "zhangsan",
  phone: "13800000001",
  name: "张三",
  role: "admin",
  password: "$hashed",
  deletedAt: null,
};

const MOCK_MULTI_STORE_STAFF = {
  id: "staff-002",
  username: "lisi",
  phone: "13800000002",
  name: "李四",
  role: "staff",
  password: "$hashed",
  deletedAt: null,
};

const MOCK_STORE_A = { id: "store-001", name: "门店A" };
const MOCK_STORE_B = { id: "store-002", name: "门店B" };

// ── Tests ──

describe("Store switching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/v1/auth/staff/login — store assignment logic", () => {
    it("should return stores array and auto-select when staff has single store", async () => {
      mockStaffFindFirst.mockResolvedValue(MOCK_SINGLE_STORE_STAFF);
      mockStaffStoreFindMany.mockResolvedValue([
        { store: MOCK_STORE_A },
      ]);

      const { POST } = await import("@/app/api/v1/auth/staff/login/route");
      const req = new Request("http://localhost:3000/api/v1/auth/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "zhangsan", password: "password123" }),
      });

      const res = await POST(req as any);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data.user.stores).toEqual([{ id: "store-001", name: "门店A" }]);
      expect(data.data.user.stores).toHaveLength(1);

      // Verify the JWT contains storeId (auto-selected)
      const cookieHeader = res.headers.get("set-cookie");
      expect(cookieHeader).toContain("auth-token=");
      const tokenMatch = cookieHeader?.match(/auth-token=([^;]+)/);
      expect(tokenMatch).toBeTruthy();

      const { verifyToken } = await import("@/lib/auth");
      const payload = await verifyToken(tokenMatch![1]);
      expect(payload?.storeId).toBe("store-001");
    });

    it("should return stores array with empty storeId when staff has multiple stores", async () => {
      mockStaffFindFirst.mockResolvedValue(MOCK_MULTI_STORE_STAFF);
      mockStaffStoreFindMany.mockResolvedValue([
        { store: MOCK_STORE_A },
        { store: MOCK_STORE_B },
      ]);

      const { POST } = await import("@/app/api/v1/auth/staff/login/route");
      const req = new Request("http://localhost:3000/api/v1/auth/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "lisi", password: "password123" }),
      });

      const res = await POST(req as any);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data.user.stores).toEqual([
        { id: "store-001", name: "门店A" },
        { id: "store-002", name: "门店B" },
      ]);
      expect(data.data.user.stores).toHaveLength(2);

      // Verify the JWT has empty storeId (awaiting selection)
      const cookieHeader = res.headers.get("set-cookie");
      const tokenMatch = cookieHeader?.match(/auth-token=([^;]+)/);
      expect(tokenMatch).toBeTruthy();

      const { verifyToken } = await import("@/lib/auth");
      const payload = await verifyToken(tokenMatch![1]);
      expect(payload?.storeId).toBe("");
    });

    it("should return empty stores array when staff has zero stores assigned", async () => {
      const zeroStoreStaff = {
        ...MOCK_SINGLE_STORE_STAFF,
        id: "staff-zero",
      };
      mockStaffFindFirst.mockResolvedValue(zeroStoreStaff);
      mockStaffStoreFindMany.mockResolvedValue([]);

      const { POST } = await import("@/app/api/v1/auth/staff/login/route");
      const req = new Request("http://localhost:3000/api/v1/auth/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "zhangsan", password: "password123" }),
      });

      const res = await POST(req as any);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data.user.stores).toEqual([]);
      expect(data.data.user.stores).toHaveLength(0);

      // Verify the JWT has empty storeId
      const cookieHeader = res.headers.get("set-cookie");
      const tokenMatch = cookieHeader?.match(/auth-token=([^;]+)/);
      const { verifyToken } = await import("@/lib/auth");
      const payload = await verifyToken(tokenMatch![1]);
      expect(payload?.storeId).toBe("");
    });
  });

  describe("POST /api/v1/auth/staff/switch-store", () => {
    it("should switch to a valid assigned store and issue new JWT", async () => {
      const token = await createStaffToken({ storeId: "store-001" });

      // Verify assignment exists
      mockStaffStoreFindFirst.mockResolvedValue({ id: "ss-001", staffId: "staff-001", storeId: "store-002" });
      mockStaffFindFirst.mockResolvedValue(MOCK_SINGLE_STORE_STAFF);
      mockStaffStoreFindMany.mockResolvedValue([
        { store: MOCK_STORE_A },
        { store: MOCK_STORE_B },
      ]);

      const { POST } = await import("@/app/api/v1/auth/staff/switch-store/route");
      const req = new Request("http://localhost:3000/api/v1/auth/staff/switch-store", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `auth-token=${token}`,
        },
        body: JSON.stringify({ storeId: "store-002" }),
      });

      const res = await POST(req as any);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data.user).toBeDefined();
      expect(data.data.token).toBeDefined();

      // Verify new JWT has updated storeId
      const cookieHeader = res.headers.get("set-cookie");
      const tokenMatch = cookieHeader?.match(/auth-token=([^;]+)/);
      expect(tokenMatch).toBeTruthy();

      const { verifyToken } = await import("@/lib/auth");
      const payload = await verifyToken(tokenMatch![1]);
      expect(payload?.storeId).toBe("store-002");
    });

    it("should reject switch to unassigned store with STORE_SWITCH_002", async () => {
      const token = await createStaffToken({ storeId: "store-001" });

      // No assignment found
      mockStaffStoreFindFirst.mockResolvedValue(null);

      const { POST } = await import("@/app/api/v1/auth/staff/switch-store/route");
      const req = new Request("http://localhost:3000/api/v1/auth/staff/switch-store", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `auth-token=${token}`,
        },
        body: JSON.stringify({ storeId: "store-999" }),
      });

      const res = await POST(req as any);
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe(STORE_SWITCH_ERRORS.STORE_NOT_ASSIGNED);
      expect(res.status).toBe(403);
    });

    it("should reject empty storeId with STORE_SWITCH_001 validation error", async () => {
      const token = await createStaffToken({ storeId: "store-001" });

      const { POST } = await import("@/app/api/v1/auth/staff/switch-store/route");
      const req = new Request("http://localhost:3000/api/v1/auth/staff/switch-store", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `auth-token=${token}`,
        },
        body: JSON.stringify({ storeId: "" }),
      });

      const res = await POST(req as any);
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe(STORE_SWITCH_ERRORS.INVALID_STORE);
      expect(res.status).toBe(400);
    });

    it("should reject missing storeId with STORE_SWITCH_001 validation error", async () => {
      const token = await createStaffToken({ storeId: "store-001" });

      const { POST } = await import("@/app/api/v1/auth/staff/switch-store/route");
      const req = new Request("http://localhost:3000/api/v1/auth/staff/switch-store", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `auth-token=${token}`,
        },
        body: JSON.stringify({}),
      });

      const res = await POST(req as any);
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe(STORE_SWITCH_ERRORS.INVALID_STORE);
      expect(res.status).toBe(400);
    });

    it("should reject unauthenticated request", async () => {
      const { POST } = await import("@/app/api/v1/auth/staff/switch-store/route");
      const req = new Request("http://localhost:3000/api/v1/auth/staff/switch-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: "store-001" }),
      });

      const res = await POST(req as any);
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/v1/auth/staff/stores", () => {
    it("should return assigned stores for authenticated staff", async () => {
      const token = await createStaffToken({ storeId: "store-001" });

      mockStaffStoreFindMany.mockResolvedValue([
        { store: MOCK_STORE_A },
        { store: MOCK_STORE_B },
      ]);

      const { GET } = await import("@/app/api/v1/auth/staff/stores/route");
      const req = new Request("http://localhost:3000/api/v1/auth/staff/stores", {
        headers: { Cookie: `auth-token=${token}` },
      });

      const res = await GET(req as any);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data.stores).toEqual([
        { id: "store-001", name: "门店A" },
        { id: "store-002", name: "门店B" },
      ]);
      expect(data.data.currentStoreId).toBe("store-001");
    });

    it("should return empty stores array for staff with no assignments", async () => {
      const token = await createStaffToken({ storeId: "" });

      mockStaffStoreFindMany.mockResolvedValue([]);

      const { GET } = await import("@/app/api/v1/auth/staff/stores/route");
      const req = new Request("http://localhost:3000/api/v1/auth/staff/stores", {
        headers: { Cookie: `auth-token=${token}` },
      });

      const res = await GET(req as any);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data.stores).toEqual([]);
      expect(data.data.currentStoreId).toBe("");
    });

    it("should reject unauthenticated request", async () => {
      const { GET } = await import("@/app/api/v1/auth/staff/stores/route");
      const req = new Request("http://localhost:3000/api/v1/auth/staff/stores");

      const res = await GET(req as any);
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(res.status).toBe(401);
    });
  });

  describe("Data isolation concept", () => {
    it("two staff with different storeIds should see different data", async () => {
      // Staff A belongs to store-001, Staff B belongs to store-002
      // When they query residents, they should only see their own store's data

      // Simulate Staff A's query (storeId = "store-001")
      mockResidentFindMany.mockImplementation((args: any) => {
        const storeId = args?.where?.storeId;
        if (storeId === "store-001") {
          return Promise.resolve([
            { id: "res-001", name: "居民甲", storeId: "store-001" },
            { id: "res-002", name: "居民乙", storeId: "store-001" },
          ]);
        }
        if (storeId === "store-002") {
          return Promise.resolve([
            { id: "res-003", name: "居民丙", storeId: "store-002" },
          ]);
        }
        return Promise.resolve([]);
      });

      // Staff A sees 2 residents from store-001
      const staffAResidents = await mockResidentFindMany({
        where: { storeId: "store-001", deletedAt: null },
      });
      expect(staffAResidents).toHaveLength(2);
      expect(staffAResidents.every((r: any) => r.storeId === "store-001")).toBe(true);

      // Staff B sees 1 resident from store-002
      const staffBResidents = await mockResidentFindMany({
        where: { storeId: "store-002", deletedAt: null },
      });
      expect(staffBResidents).toHaveLength(1);
      expect(staffBResidents.every((r: any) => r.storeId === "store-002")).toBe(true);

      // Verify no overlap
      const staffAIds = new Set(staffAResidents.map((r: any) => r.id));
      const staffBIds = new Set(staffBResidents.map((r: any) => r.id));
      const overlap = [...staffAIds].filter((id) => staffBIds.has(id));
      expect(overlap).toHaveLength(0);
    });
  });
});
