import { NextRequest } from "next/server";
import { exportAppointmentsQuerySchema, EXPORT_ERRORS } from "@zhyj/shared";
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
    const query = exportAppointmentsQuerySchema.safeParse({
      residentId: searchParams.get("residentId") || undefined,
      status: searchParams.get("status") || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
    });

    if (!query.success) {
      return Response.json(
        { code: EXPORT_ERRORS.INVALID_PARAMS, message: query.error.errors[0].message },
        { status: 400 }
      );
    }

    const { residentId, status, dateFrom, dateTo } = query.data;

    const where: Record<string, unknown> = {
      storeId: ctx.storeId,
      deletedAt: null,
    };

    if (residentId) where.residentId = residentId;
    if (status) where.status = status;
    if (dateFrom) where.scheduledAt = { ...(where.scheduledAt as Record<string, unknown>), gte: new Date(dateFrom) };
    if (dateTo) {
      const end = new Date(dateTo);
      end.setUTCHours(23, 59, 59, 999);
      where.scheduledAt = { ...(where.scheduledAt as Record<string, unknown>), lte: end };
    }

    const headers = ["居民姓名", "预约时间", "状态", "房间", "设备", "操作员"];
    const today = new Date().toISOString().slice(0, 10);

    async function* rows() {
      const records = await prisma.appointment.findMany({
        where,
        include: {
          resident: { select: { name: true } },
          room: { select: { name: true } },
          machine: { select: { name: true } },
          staff: { select: { name: true } },
        },
        orderBy: { scheduledAt: "desc" },
      });

      for (const r of records) {
        yield [
          r.resident?.name ?? "",
          r.scheduledAt.toISOString().slice(0, 19).replace("T", " "),
          r.status ?? "",
          r.room?.name ?? "",
          r.machine?.name ?? "",
          r.staff?.name ?? "",
        ];
      }

      console.log(`[export/appointments] Exported ${records.length} records`);
    }

    const stream = streamCsv(headers, rows());

    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="appointments_${today}.csv"`,
      },
    });
  } catch (error) {
    console.error("[export/appointments] Export error:", error);
    return Response.json(
      { code: EXPORT_ERRORS.GENERATION_FAILED, message: "导出预约数据失败" },
      { status: 500 }
    );
  }
}
