"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  CalendarCheck,
  UserPlus,
  CalendarX,
  Users,
  Eye,
} from "lucide-react";
import { STAFF_ROLES } from "@zhyj/shared";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ErrorBanner } from "@/components/error-banner";

/* ─── Types ─── */

interface OverviewStats {
  monitoringCount: number;
  appointmentCount: number;
  completedCount: number;
  noShowCount: number;
  newResidentsCount: number;
  cancelledCount: number;
}

/* ─── Component ─── */

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const role = user?.role;
  const isStaff = role === STAFF_ROLES.STAFF;
  const isAdmin =
    role === STAFF_ROLES.ADMIN || role === STAFF_ROLES.STORE_MANAGER;

  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ── Fetch overview ── */
  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/statistics/overview", {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error?.message ?? `请求失败 (${res.status})`
        );
      }
      const json = await res.json();
      if (json.success && json.data) {
        setStats(json.data as OverviewStats);
      } else {
        throw new Error(json?.error?.message ?? "获取数据失败");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "获取统计数据失败"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;

    // Staff redirect: no access to stats overview, go to monitoring
    if (isStaff) {
      router.replace("/monitoring");
      return;
    }

    // Admin/store_manager: fetch overview
    if (isAdmin) {
      fetchOverview();
    }
  }, [authLoading, isStaff, isAdmin, fetchOverview, router]);

  /* ── Loading gate ── */
  if (authLoading || isStaff) {
    return (
      <div className="space-y-6">
        <PageHeader title="仪表盘" description="加载中…" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <StatCard key={i} label="" value="" loading />
          ))}
        </div>
      </div>
    );
  }

  /* ── Render ── */
  return (
    <div className="space-y-6">
      <PageHeader
        title="仪表盘"
        description="今日运营数据概览"
      />

      {error && <ErrorBanner message={error} onRetry={fetchOverview} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StatCard
          label="监测记录"
          value={stats?.monitoringCount ?? 0}
          icon={<Activity className="h-4 w-4" />}
          color="text-apple-blue"
          loading={loading}
        />
        <StatCard
          label="预约总数"
          value={stats?.appointmentCount ?? 0}
          icon={<CalendarCheck className="h-4 w-4" />}
          color="text-apple-green"
          loading={loading}
        />
        <StatCard
          label="已完成"
          value={stats?.completedCount ?? 0}
          icon={<CalendarCheck className="h-4 w-4" />}
          color="text-apple-success"
          loading={loading}
        />
        <StatCard
          label="爽约"
          value={stats?.noShowCount ?? 0}
          icon={<CalendarX className="h-4 w-4" />}
          color="text-apple-warning"
          loading={loading}
        />
        <StatCard
          label="新增居民"
          value={stats?.newResidentsCount ?? 0}
          icon={<UserPlus className="h-4 w-4" />}
          color="text-apple-indigo"
          loading={loading}
        />
        <StatCard
          label="已取消"
          value={stats?.cancelledCount ?? 0}
          icon={<CalendarX className="h-4 w-4" />}
          color="text-apple-error"
          loading={loading}
        />
      </div>

      {/* Quick-action cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => router.push("/monitoring")}
          className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-accent"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-apple-blue/10 text-apple-blue">
            <Eye className="h-5 w-5" />
          </div>
          <div className="text-left">
            <p className="font-medium text-foreground">监测记录</p>
            <p className="text-sm text-muted-foreground">
              查看今日监测详情
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => router.push("/residents-management")}
          className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-accent"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-apple-green/10 text-apple-green">
            <Users className="h-5 w-5" />
          </div>
          <div className="text-left">
            <p className="font-medium text-foreground">居民管理</p>
            <p className="text-sm text-muted-foreground">
              管理在住居民信息
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
