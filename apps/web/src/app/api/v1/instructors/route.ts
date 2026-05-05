import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { INSTRUCTOR_ERRORS } from "@zhyj/shared";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);

    const searchParams = request.nextUrl.searchParams;

    // Simple list (no pagination) — for activity form dropdown
    const isSimpleList = searchParams.get("simple") === "true";
    if (isSimpleList) {
      const where: Record<string, unknown> = {
        storeId: ctx.storeId,
        deletedAt: null,
        status: "active",
      };
      const instructors = await prisma.instructor.findMany({
        where,
        select: { id: true, name: true, specialty: true },
        orderBy: { name: "asc" },
      });
      return successResponse(instructors);
    }

    // Management list with pagination
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 20), 1), 100);
    const offset = Math.max(Number(searchParams.get("offset") || 0), 0);
    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") || undefined;

    const where: Record<string, unknown> = { storeId: ctx.storeId, deletedAt: null };
    if (search) where.name = { contains: search, mode: "insensitive" };
    if (status) where.status = status;

    const [records, total] = await Promise.all([
      prisma.instructor.findMany({
        where,
        include: { _count: { select: { activities: true } } },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.instructor.count({ where }),
    ]);

    console.log(`[instructors] Listed ${records.length} (total=${total})`);
    return successResponse({ records, total, limit, offset });
  } catch (error) {
    console.error("[instructors] List error:", error);
    return errorResponse(INSTRUCTOR_ERRORS.NOT_FOUND, "获取老师列表失败", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return errorResponse("AUTH_006", "未授权", 401);
    const roleGuard = requireRole(ctx, ["admin", "store_manager"], request.url);
    if (roleGuard) return roleGuard;

    const body = await request.json();
    const { name, specialty, bio, phone } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return errorResponse(INSTRUCTOR_ERRORS.VALIDATION_ERROR, "姓名不能为空", 400);
    }

    const instructor = await prisma.instructor.create({
      data: {
        name: name.trim(),
        specialty: specialty?.trim() || undefined,
        bio: bio?.trim() || undefined,
        phone: phone?.trim() || undefined,
        storeId: ctx.storeId,
      },
    });

    console.log(`[instructors] Created: id=${instructor.id}, name=${name}`);
    return successResponse(instructor, 201);
  } catch (error) {
    console.error("[instructors] Create error:", error);
    return errorResponse(INSTRUCTOR_ERRORS.CREATE_FAILED, "创建授课老师失败", 500);
  }
}
