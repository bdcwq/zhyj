import { NextRequest } from "next/server";
import { exportMonitoringQuerySchema, EXPORT_ERRORS } from "@zhyj/shared";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { streamCsv } from "@/lib/csv-stream";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return Response.json(
        { code: EXPORT_ERRORS.INVALID_PARAMS, message: "未授权" },
        { status: 401 }
      );
    }
    const roleGuard = requireRole(ctx, ["admin", "store_manager", "staff"], request.url);
    if (roleGuard) return roleGuard;

    const { searchParams } = new URL(request.url);
    const query = exportMonitoringQuerySchema.safeParse({
      residentId: searchParams.get("residentId") || undefined,
    });

    if (!query.success) {
      return Response.json(
        { code: EXPORT_ERRORS.INVALID_PARAMS, message: query.error.errors[0].message },
        { status: 400 }
      );
    }

    const { residentId } = query.data;

    const where: Record<string, unknown> = {
      storeId: ctx.storeId,
      deletedAt: null,
    };
    if (residentId) where.residentId = residentId;

    const headers = ["居民姓名", "分数", "监测日期", "体质类型"];
    const today = new Date().toISOString().slice(0, 10);

    async function* rows() {
      const records = await prisma.monitoringRecord.findMany({
        where,
        include: {
          resident: { select: { name: true } },
        },
        orderBy: { monitoringDate: "desc" },
      });

      for (const r of records) {
        yield [
          r.resident?.name ?? "",
          String(r.score ?? ""),
          r.monitoringDate.toISOString().slice(0, 10),
          r.constitutionType ?? "",
        ];
      }

      console.log(`[export/monitoring] Exported ${records.length} records`);
    }

    const stream = streamCsv(headers, rows());

    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="monitoring_${today}.csv"`,
      },
    });
  } catch (error) {
    console.error("[export/monitoring] Export error:", error);
    return Response.json(
      { code: EXPORT_ERRORS.GENERATION_FAILED, message: "导出监测数据失败" },
      { status: 500 }
    );
  }
}
