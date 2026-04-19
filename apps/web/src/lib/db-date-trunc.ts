import { Prisma } from "@prisma/client";

/**
 * Database-agnostic date truncation for raw SQL queries.
 * Returns SQL expression and the Prisma.sql fragment for GROUP BY.
 *
 * @param column - The SQL column expression (e.g. 'r."createdAt"')
 * @param period - 'daily' | 'weekly' | 'monthly'
 */
export function dbDateTrunc(
  column: string,
  period: string
): { select: Prisma.Sql; groupBy: Prisma.Sql } {
  // Detect database provider from env
  // DATABASE_URL starts with "file:" for SQLite, "postgres" for PostgreSQL
  const isPostgres =
    process.env.DATABASE_URL?.startsWith("postgres") === true;

  if (isPostgres) {
    const fmtMap: Record<string, string> = {
      daily: "YYYY-MM-DD",
      weekly: "IYYY-IW",
      monthly: "YYYY-MM",
    };
    const fmt = fmtMap[period] || "YYYY-MM-DD";
    return {
      select: Prisma.sql`TO_CHAR(${Prisma.raw(column)}, ${fmt})`,
      groupBy: Prisma.sql`TO_CHAR(${Prisma.raw(column)}, ${fmt})`,
    };
  }

  // SQLite fallback
  const fmtMap: Record<string, string> = {
    daily: "%Y-%m-%d",
    weekly: "%Y-W%W",
    monthly: "%Y-%m",
  };
  const fmt = fmtMap[period] || "%Y-%m-%d";
  return {
    select: Prisma.sql`strftime(${fmt}, ${Prisma.raw(column)})`,
    groupBy: Prisma.sql`strftime(${fmt}, ${Prisma.raw(column)})`,
  };
}
