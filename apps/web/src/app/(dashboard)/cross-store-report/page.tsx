"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { StatCard } from "@/components/stat-card";
import { PageHeader } from "@/components/page-header";
import { ErrorBanner } from "@/components/error-banner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// ── Apple chart color constants ──

const APPLE_BLUE = "#0071e3";
const APPLE_GREEN = "#34C759";
const APPLE_ORANGE = "#FF9F0A";
const APPLE_RED = "#FF3B30";
const APPLE_PURPLE = "#AF52DE";
const APPLE_CYAN = "#5AC8FA";
const CARTESIAN_STROKE = "#e5e5e5";

const STORE_COLORS = [
  APPLE_BLUE,
  APPLE_GREEN,
  APPLE_ORANGE,
  APPLE_RED,
  APPLE_PURPLE,
  APPLE_CYAN,
  "#FF6482",
  "#BF5AF2",
];

// ── Types ──

interface StoreMetric {
  storeId: string;
  storeName: string;
  monitoringCount: number;
  avgScore: number | null;
  booked: number;
  completed: number;
  no_show: number;
  cancelled: number;
  newResidentsCount: number;
  staffCount: number;
  date?: string;
}

interface CrossStoreResponse {
  success: boolean;
  data: {
    stores: StoreMetric[];
    period: string;
    dateFrom: string;
    dateTo: string;
  };
  error?: { code: string; message: string };
}

type Period = "daily" | "weekly" | "monthly";

// ── Helpers ──

function today() {
  return new Date().toISOString().split("T")[0];
}

function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split("T")[0];
}

const PERIOD_LABELS: Record<Period, string> = {
  daily: "日",
  weekly: "周",
  monthly: "月",
};

// ── Component ──

export default function CrossStoreReportPage() {
  const { user, loading: authLoading } = useAuth();
  const role = user?.role;

  const [period, setPeriod] = useState<Period>("daily");
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today());
  const [reportData, setReportData] = useState<StoreMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        period,
        dateFrom,
        dateTo,
      }).toString();

      const res = await fetch(`/api/v1/statistics/cross-store?${params}`, {
        credentials: "include",
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (res.status === 403) {
        setError("权限不足：仅管理员可查看跨店报表");
        setLoading(false);
        return;
      }

      const json: CrossStoreResponse = await res.json();

      if (json.success) {
        setReportData(json.data.stores);
      } else {
        setError(json.error?.message || "获取数据失败");
      }
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [period, dateFrom, dateTo]);

  useEffect(() => {
    if (!authLoading && role === "admin") {
      loadData();
    }
  }, [loadData, authLoading, role]);

  // ── Derived overview ──

  const overview = reportData.reduce(
    (acc, s) => ({
      totalStores: acc.totalStores + 1,
      totalMonitoring: acc.totalMonitoring + (s.monitoringCount || 0),
      totalAppointments: acc.totalAppointments + (s.booked || 0),
      totalNewResidents: acc.totalNewResidents + (s.newResidentsCount || 0),
    }),
    { totalStores: 0, totalMonitoring: 0, totalAppointments: 0, totalNewResidents: 0 }
  );

  // ── Chart data: one row per store ──

  const chartData = reportData.map((s) => ({
    name: s.storeName,
    监测次数: s.monitoringCount || 0,
    预约数: s.booked || 0,
    完成数: s.completed || 0,
    新居民: s.newResidentsCount || 0,
  }));

  // ── Stacked bar data for appointment status ──

  const statusData = reportData.map((s) => ({
    name: s.storeName,
    已预约: s.booked || 0,
    已完成: s.completed || 0,
    爽约: s.no_show || 0,
    已取消: s.cancelled || 0,
  }));

  // ── Auth guard ──

  if (authLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="h-10 w-full bg-muted rounded" />
        <div className="h-64 w-full bg-muted rounded" />
      </div>
    );
  }

  if (role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <svg className="h-16 w-16 text-muted-foreground/30 mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
        <h3 className="text-lg font-semibold text-muted-foreground mb-2">权限不足</h3>
        <p className="text-sm text-muted-foreground/60">仅管理员可查看跨店汇总报表</p>
      </div>
    );
  }

  // ── Render ──

  return (
    <div className="space-y-6">
      <PageHeader title="跨店汇总报表" />

      {/* Error banner */}
      {error && <ErrorBanner message={error} onRetry={loadData} />}

      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="店铺总数" value={overview.totalStores} color="text-primary" loading={loading} />
        <StatCard label="总监测次数" value={overview.totalMonitoring} color="text-apple-success" loading={loading} />
        <StatCard label="总预约数" value={overview.totalAppointments} color="text-apple-purple" loading={loading} />
        <StatCard label="总新居民" value={overview.totalNewResidents} color="text-apple-cyan" loading={loading} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="inline-flex items-center rounded-lg bg-muted p-1">
          {(["daily", "weekly", "monthly"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-all ${
                period === p ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <label htmlFor="cs-dateFrom">从</label>
          <input
            id="cs-dateFrom"
            type="date"
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-border px-2 py-1"
          />
          <label htmlFor="cs-dateTo">至</label>
          <input
            id="cs-dateTo"
            type="date"
            value={dateTo}
            min={dateFrom}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-border px-2 py-1"
          />
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "加载中..." : "查询"}
        </button>
      </div>

      {/* Charts */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          加载数据中...
        </div>
      ) : reportData.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm text-muted-foreground/60">暂无数据</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Store comparison bar chart */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-4 font-semibold text-foreground">各店铺对比</h3>
            {chartData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground/60">暂无数据</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CARTESIAN_STROKE} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="监测次数" fill={APPLE_BLUE} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="预约数" fill={APPLE_PURPLE} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="完成数" fill={APPLE_GREEN} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="新居民" fill={APPLE_ORANGE} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Appointment status stacked bar chart */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-4 font-semibold text-foreground">预约状态分布</h3>
            {statusData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground/60">暂无数据</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={statusData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CARTESIAN_STROKE} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="已预约" stackId="a" fill={APPLE_BLUE} />
                  <Bar dataKey="已完成" stackId="a" fill={APPLE_GREEN} />
                  <Bar dataKey="爽约" stackId="a" fill={APPLE_ORANGE} />
                  <Bar dataKey="已取消" stackId="a" fill={APPLE_RED} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Per-store detail table */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
            <h3 className="mb-4 font-semibold text-foreground">各店铺详情</h3>
            {reportData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground/60">暂无数据</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">店铺</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">员工数</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">监测次数</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">平均评分</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">预约数</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">完成数</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">爽约</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">新居民</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {reportData.map((store) => (
                      <tr key={store.storeId} className="hover:bg-muted/30 transition-colors">
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">{store.storeName}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground">{store.staffCount}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground">{store.monitoringCount}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground">
                          {store.avgScore !== null ? store.avgScore.toFixed(1) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground">{store.booked}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground">{store.completed}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground">{store.no_show}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground">{store.newResidentsCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
