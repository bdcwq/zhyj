import { NextRequest } from "next/server";
import { createMonitoringRecordSchema } from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager", "staff"], request.url);
    if (roleGuard) return roleGuard;

    const body = await request.json();
    const parsed = createMonitoringRecordSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("AUTH_005", parsed.error.errors[0].message, 400);
    }

    const { residentId, score, monitoringDate, constitutionType } = parsed.data;

    // Verify resident exists in store
    const resident = await prisma.resident.findFirst({
      where: { id: residentId, residentStores: { some: { storeId: ctx.storeId } }, deletedAt: null },
    });

    if (!resident) {
      return errorResponse("MONITORING_001", "居民不存在", 404);
    }

    const record = await prisma.monitoringRecord.create({
      data: {
        residentId,
        score,
        monitoringDate: new Date(monitoringDate),
        constitutionType,
        storeId: ctx.storeId,
      },
      include: {
        resident: { select: { id: true, name: true, phone: true } },
      },
    });

    console.log(`[monitoring] Created record ${record.id} for resident ${residentId}`);

    return successResponse(record, 201);
  } catch (error) {
    console.error("[monitoring] Create error:", error);
    return errorResponse("MONITORING_004", "创建监测记录失败", 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager", "staff"], request.url);
    if (roleGuard) return roleGuard;

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const residentId = searchParams.get("residentId") || undefined;

    const where: Record<string, unknown> = {
      storeId: ctx.storeId,
      deletedAt: null,
    };
    if (residentId) {
      where.residentId = residentId;
    }

    const [records, total] = await Promise.all([
      prisma.monitoringRecord.findMany({
        where,
        include: {
          resident: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { monitoringDate: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.monitoringRecord.count({ where }),
    ]);

    console.log(`[monitoring] Listed ${records.length} records (total: ${total})`);

    return successResponse({ records, total, limit, offset });
  } catch (error) {
    console.error("[monitoring] List error:", error);
    return errorResponse("MONITORING_004", "获取监测记录失败", 500);
  }
}
