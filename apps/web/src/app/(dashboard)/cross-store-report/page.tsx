"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
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

const STORE_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
];

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
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="h-10 w-full bg-gray-200 rounded" />
        <div className="h-64 w-full bg-gray-200 rounded" />
      </div>
    );
  }

  if (role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <svg className="h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
        <h3 className="text-lg font-semibold text-gray-600 mb-2">权限不足</h3>
        <p className="text-sm text-gray-400">仅管理员可查看跨店汇总报表</p>
      </div>
    );
  }

  // ── Render ──

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">跨店汇总报表</h2>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button type="button" onClick={loadData} className="ml-2 underline hover:no-underline">
            重试
          </button>
        </div>
      )}

      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">店铺总数</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{loading ? "—" : overview.totalStores}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">总监测次数</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{loading ? "—" : overview.totalMonitoring}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">总预约数</p>
          <p className="mt-1 text-2xl font-bold text-violet-600">{loading ? "—" : overview.totalAppointments}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">总新居民</p>
          <p className="mt-1 text-2xl font-bold text-cyan-600">{loading ? "—" : overview.totalNewResidents}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="inline-flex items-center rounded-lg bg-gray-100 p-1">
          {(["daily", "weekly", "monthly"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-all ${
                period === p ? "bg-white text-gray-900 shadow" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <label htmlFor="cs-dateFrom">从</label>
          <input
            id="cs-dateFrom"
            type="date"
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1"
          />
          <label htmlFor="cs-dateTo">至</label>
          <input
            id="cs-dateTo"
            type="date"
            value={dateTo}
            min={dateFrom}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1"
          />
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "加载中..." : "查询"}
        </button>
      </div>

      {/* Charts */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          加载数据中...
        </div>
      ) : reportData.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm text-gray-400">暂无数据</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Store comparison bar chart */}
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-semibold text-gray-900">各店铺对比</h3>
            {chartData.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">暂无数据</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="监测次数" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="预约数" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="完成数" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="新居民" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Appointment status stacked bar chart */}
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-semibold text-gray-900">预约状态分布</h3>
            {statusData.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">暂无数据</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={statusData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="已预约" stackId="a" fill="#60a5fa" />
                  <Bar dataKey="已完成" stackId="a" fill="#34d399" />
                  <Bar dataKey="爽约" stackId="a" fill="#fbbf24" />
                  <Bar dataKey="已取消" stackId="a" fill="#f87171" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Per-store detail table */}
          <div className="rounded-xl border bg-white p-5 shadow-sm lg:col-span-2">
            <h3 className="mb-4 font-semibold text-gray-900">各店铺详情</h3>
            {reportData.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">暂无数据</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">店铺</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">员工数</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">监测次数</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">平均评分</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">预约数</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">完成数</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">爽约</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">新居民</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reportData.map((store) => (
                      <tr key={store.storeId} className="hover:bg-gray-50 transition-colors">
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">{store.storeName}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">{store.staffCount}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">{store.monitoringCount}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">
                          {store.avgScore !== null ? store.avgScore.toFixed(1) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">{store.booked}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">{store.completed}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">{store.no_show}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">{store.newResidentsCount}</td>
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
