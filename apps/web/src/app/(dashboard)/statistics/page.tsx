"use client";

import { useState, useEffect, useCallback } from "react";

const fetchWithAuth = (url: string) =>
  fetch(url, { credentials: "include" });

// ── Types ──

interface OverviewData {
  monitoringCount: number;
  appointmentCount: number;
  completedCount: number;
  noShowCount: number;
  newResidentsCount: number;
  cancelledCount: number;
}

interface MonitoringRecord {
  date: string;
  count: number;
  avgScore: number;
}

interface AppointmentRecord {
  date: string;
  booked: number;
  verified: number;
  completed: number;
  cancelled: number;
  noShow: number;
}

interface ResidentRecord {
  date: string;
  newCount: number;
  totalCount: number;
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

const STATUS_COLORS: Record<string, string> = {
  booked: "#94a3b8",
  verified: "#60a5fa",
  completed: "#34d399",
  cancelled: "#f87171",
  noShow: "#fbbf24",
};

const STATUS_LABELS: Record<string, string> = {
  booked: "已预约",
  verified: "已核销",
  completed: "已完成",
  cancelled: "已取消",
  noShow: "爽约",
};

// ── Component ──

export default function StatisticsPage() {
  const [period, setPeriod] = useState<Period>("daily");
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today());
  const [overviewDate, setOverviewDate] = useState(today());

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [monitoring, setMonitoring] = useState<MonitoringRecord[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [residents, setResidents] = useState<ResidentRecord[]>([]);

  const [loading, setLoading] = useState(true);
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

      const [overviewRes, monRes, apptRes, resRes] = await Promise.all([
        fetchWithAuth(`/api/v1/statistics/overview?date=${overviewDate}`),
        fetchWithAuth(`/api/v1/statistics/monitoring?${params}`),
        fetchWithAuth(`/api/v1/statistics/appointments?${params}`),
        fetchWithAuth(`/api/v1/statistics/residents?${params}`),
      ]);

      // Check for auth errors
      if (overviewRes.status === 401) {
        window.location.href = "/login";
        return;
      }

      const [overviewJson, monJson, apptJson, resJson] = await Promise.all([
        overviewRes.json(),
        monRes.json(),
        apptRes.json(),
        resRes.json(),
      ]);

      if (overviewJson.success) setOverview(overviewJson.data);
      if (monJson.success) setMonitoring(monJson.data?.records || []);
      if (apptJson.success) setAppointments(apptJson.data?.records || []);
      if (resJson.success) setResidents(resJson.data?.records || []);

      if (!overviewJson.success || !monJson.success || !apptJson.success || !resJson.success) {
        const msgs = [overviewJson, monJson, apptJson, resJson]
          .filter((j) => !j.success)
          .map((j) => j.error?.message)
          .filter(Boolean);
        if (msgs.length) setError(msgs.join("; "));
      }
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [period, dateFrom, dateTo, overviewDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Overview cards ──

  const overviewCards = overview
    ? [
        { label: "监测次数", value: overview.monitoringCount, color: "text-blue-600" },
        { label: "预约总数", value: overview.appointmentCount, color: "text-violet-600" },
        { label: "已完成", value: overview.completedCount, color: "text-emerald-600" },
        { label: "爽约", value: overview.noShowCount, color: "text-amber-600" },
        { label: "新居民", value: overview.newResidentsCount, color: "text-cyan-600" },
        { label: "已取消", value: overview.cancelledCount, color: "text-red-500" },
      ]
    : [];

  // ── Period tabs ──

  const periods: Period[] = ["daily", "weekly", "monthly"];

  // ── Render ──

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">数据统计</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">概览日期</label>
          <input
            type="date"
            value={overviewDate}
            onChange={(e) => setOverviewDate(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {overviewCards.map((card) => (
          <div key={card.label} className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className={`mt-1 text-2xl font-bold ${card.color}`}>
              {loading ? "—" : card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="inline-flex items-center rounded-lg bg-gray-100 p-1">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-all ${
                period === p
                  ? "bg-white text-gray-900 shadow"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <label htmlFor="dateFrom">从</label>
          <input
            id="dateFrom"
            type="date"
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1"
          />
          <label htmlFor="dateTo">至</label>
          <input
            id="dateTo"
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
          {loading ? "加载中..." : "刷新"}
        </button>
      </div>

      {/* Charts grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          加载数据中...
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Monitoring chart */}
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-semibold">监测趋势</h3>
            {monitoring.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">暂无监测数据</p>
            ) : (
              <MonitoringChart data={monitoring} period={period} />
            )}
          </div>

          {/* Appointments chart */}
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-semibold">预约统计</h3>
            {appointments.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">暂无预约数据</p>
            ) : (
              <AppointmentsChart data={appointments} period={period} />
            )}
          </div>

          {/* Residents chart — full width */}
          <div className="rounded-xl border bg-white p-5 shadow-sm lg:col-span-2">
            <h3 className="mb-4 font-semibold">居民趋势</h3>
            {residents.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">暂无居民数据</p>
            ) : (
              <ResidentsChart data={residents} period={period} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Chart sub-components (lazy recharts import boundary) ──

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

function MonitoringChart({
  data,
  period,
}: {
  data: MonitoringRecord[];
  period: Period;
}) {
  const label = period === "daily" ? "日期" : period === "weekly" ? "周" : "月";
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="count" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="score" orientation="right" tick={{ fontSize: 11 }} domain={[0, 100]} />
        <Tooltip />
        <Legend />
        <Bar yAxisId="count" dataKey="count" name="监测次数" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        <Line
          yAxisId="score"
          type="monotone"
          dataKey="avgScore"
          name="平均评分"
          stroke="#f59e0b"
          strokeWidth={2}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function AppointmentsChart({
  data,
  period,
}: {
  data: AppointmentRecord[];
  period: Period;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        {(["booked", "verified", "completed", "cancelled", "noShow"] as const).map((key) => (
          <Bar
            key={key}
            dataKey={key}
            name={STATUS_LABELS[key]}
            stackId="a"
            fill={STATUS_COLORS[key]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function ResidentsChart({
  data,
  period,
}: {
  data: ResidentRecord[];
  period: Period;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Line
          type="monotone"
          dataKey="newCount"
          name="新增居民"
          stroke="#06b6d4"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="totalCount"
          name="累计居民"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
