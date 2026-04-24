import { NextRequest } from "next/server";
import { exportResidentsQuerySchema, EXPORT_ERRORS } from "@zhyj/shared";
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
    const query = exportResidentsQuerySchema.safeParse({
      search: searchParams.get("search") || undefined,
    });

    if (!query.success) {
      return Response.json(
        { code: EXPORT_ERRORS.INVALID_PARAMS, message: query.error.errors[0].message },
        { status: 400 }
      );
    }

    const { search } = query.data;

    const baseWhere = {
      residentStores: { some: { storeId: ctx.storeId } },
      deletedAt: null as null,
    };

    const where = search
      ? {
          ...baseWhere,
          OR: [{ name: { contains: search } }, { phone: { contains: search } }],
        }
      : baseWhere;

    const headers = ["姓名", "手机号", "注册来源", "门店名称", "注册时间"];
    const today = new Date().toISOString().slice(0, 10);

    async function* rows() {
      const records = await prisma.resident.findMany({
        where,
        select: {
          name: true,
          phone: true,
          registrationSource: true,
          createdAt: true,
          residentStores: {
            include: { store: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      for (const r of records) {
        const storeName = r.residentStores[0]?.store?.name ?? "";
        yield [
          r.name ?? "",
          r.phone ?? "",
          r.registrationSource ?? "",
          storeName,
          r.createdAt.toISOString().slice(0, 10),
        ];
      }

      console.log(`[export/residents] Exported ${records.length} records`);
    }

    const stream = streamCsv(headers, rows());

    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="residents_${today}.csv"`,
      },
    });
  } catch (error) {
    console.error("[export/residents] Export error:", error);
    return Response.json(
      { code: EXPORT_ERRORS.GENERATION_FAILED, message: "导出居民数据失败" },
      { status: 500 }
    );
  }
}
