"use client";

import { useState, useEffect, useCallback } from "react";
import { StatCard } from "@/components/stat-card";
import { PageHeader } from "@/components/page-header";
import { ErrorBanner } from "@/components/error-banner";
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
  Cell,
} from "recharts";

// ── Apple chart color constants ──

const APPLE_BLUE = "#0071e3";
const APPLE_GREEN = "#34C759";
const APPLE_ORANGE = "#FF9F0A";
const APPLE_RED = "#FF3B30";
const APPLE_PURPLE = "#AF52DE";
const APPLE_CYAN = "#5AC8FA";
const CARTESIAN_STROKE = "#e5e5e5";

// ── Helpers ──

const fetchWithAuth = (url: string) =>
  fetch(url, { credentials: "include" });

function today() {
  return new Date().toISOString().split("T")[0];
}

function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split("T")[0];
}

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

interface ActivityStats {
  activityCount: number;
  totalRegistrations: number;
  checkedInCount: number;
  noShowCount: number;
  checkInRate: number;
  noShowRate: number;
  breakdown: ActivityTypeBreakdown[];
}

interface ActivityTypeBreakdown {
  type: string;
  count: number;
  totalParticipants: number;
}

type Period = "daily" | "weekly" | "monthly";

const PERIOD_LABELS: Record<Period, string> = {
  daily: "日",
  weekly: "周",
  monthly: "月",
};

const STATUS_COLORS: Record<string, string> = {
  booked: "#94a3b8",
  verified: APPLE_BLUE,
  completed: APPLE_GREEN,
  cancelled: APPLE_RED,
  noShow: APPLE_ORANGE,
};

const STATUS_LABELS: Record<string, string> = {
  booked: "已预约",
  verified: "已核销",
  completed: "已完成",
  cancelled: "已取消",
  noShow: "爽约",
};

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  course: "课程",
  exercise: "运动",
  experience: "体验",
  live_stream: "直播",
  custom: "自定义",
};

const ACTIVITY_TYPE_COLORS: Record<string, string> = {
  course: APPLE_BLUE,
  exercise: APPLE_GREEN,
  experience: APPLE_PURPLE,
  live_stream: "#FF6482",
  custom: APPLE_ORANGE,
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
  const [activityStats, setActivityStats] = useState<ActivityStats | null>(null);

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

      const [overviewRes, monRes, apptRes, resRes, actRes] = await Promise.all([
        fetchWithAuth(`/api/v1/statistics/overview?date=${overviewDate}`),
        fetchWithAuth(`/api/v1/statistics/monitoring?${params}`),
        fetchWithAuth(`/api/v1/statistics/appointments?${params}`),
        fetchWithAuth(`/api/v1/statistics/residents?${params}`),
        fetchWithAuth(`/api/v1/statistics/activities?${params}`),
      ]);

      // Check for auth errors
      if (overviewRes.status === 401) {
        window.location.href = "/login";
        return;
      }

      const [overviewJson, monJson, apptJson, resJson, actJson] = await Promise.all([
        overviewRes.json(),
        monRes.json(),
        apptRes.json(),
        resRes.json(),
        actRes.json(),
      ]);

      if (overviewJson.success) setOverview(overviewJson.data);
      if (monJson.success) setMonitoring(monJson.data?.records || []);
      if (apptJson.success) setAppointments(apptJson.data?.records || []);
      if (resJson.success) setResidents(resJson.data?.records || []);
      if (actJson.success) setActivityStats(actJson.data);

      if (!overviewJson.success || !monJson.success || !apptJson.success || !resJson.success || !actJson.success) {
        const msgs = [overviewJson, monJson, apptJson, resJson, actJson]
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

  // ── Period tabs ──

  const periods: Period[] = ["daily", "weekly", "monthly"];

  // ── Render ──

  return (
    <div className="space-y-6">
      <PageHeader
        title="数据统计"
        actions={
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">概览日期</label>
            <input
              type="date"
              value={overviewDate}
              onChange={(e) => setOverviewDate(e.target.value)}
              className="rounded-md border border-border px-2 py-1 text-sm"
            />
          </div>
        }
      />

      {/* Error banner */}
      {error && <ErrorBanner message={error} />}

      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="监测次数" value={overview?.monitoringCount ?? 0} color="text-primary" loading={loading} />
        <StatCard label="预约总数" value={overview?.appointmentCount ?? 0} color="text-apple-purple" loading={loading} />
        <StatCard label="已完成" value={overview?.completedCount ?? 0} color="text-apple-success" loading={loading} />
        <StatCard label="爽约" value={overview?.noShowCount ?? 0} color="text-apple-warning" loading={loading} />
        <StatCard label="新居民" value={overview?.newResidentsCount ?? 0} color="text-apple-cyan" loading={loading} />
        <StatCard label="已取消" value={overview?.cancelledCount ?? 0} color="text-apple-error" loading={loading} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="inline-flex items-center rounded-lg bg-muted p-1">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-all ${
                period === p
                  ? "bg-card text-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <label htmlFor="dateFrom">从</label>
          <input
            id="dateFrom"
            type="date"
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-border px-2 py-1"
          />
          <label htmlFor="dateTo">至</label>
          <input
            id="dateTo"
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
          {loading ? "加载中..." : "刷新"}
        </button>
      </div>

      {/* Charts grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          加载数据中...
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Monitoring chart */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-4 font-semibold text-foreground">监测趋势</h3>
            {monitoring.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground/60">暂无监测数据</p>
            ) : (
              <MonitoringChart data={monitoring} period={period} />
            )}
          </div>

          {/* Appointments chart */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-4 font-semibold text-foreground">预约统计</h3>
            {appointments.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground/60">暂无预约数据</p>
            ) : (
              <AppointmentsChart data={appointments} period={period} />
            )}
          </div>

          {/* Residents chart — full width */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
            <h3 className="mb-4 font-semibold text-foreground">居民趋势</h3>
            {residents.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground/60">暂无居民数据</p>
            ) : (
              <ResidentsChart data={residents} period={period} />
            )}
          </div>
        </div>
      )}

      {/* Activity statistics section */}
      {!loading && (
        <div className="space-y-6">
          <h3 className="border-b border-border pb-2 text-lg font-semibold text-foreground">活动统计</h3>

          {/* Activity overview cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="活动场次" value={activityStats?.activityCount ?? 0} color="text-primary" />
            <StatCard label="参与人次" value={activityStats?.totalRegistrations ?? 0} color="text-apple-purple" />
            <StatCard label="签到率" value={`${activityStats?.checkInRate ?? 0}%`} color="text-apple-success" />
            <StatCard label="爽约率" value={`${activityStats?.noShowRate ?? 0}%`} color="text-apple-warning" />
          </div>

          {/* Activity charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Activity count by type */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h4 className="mb-4 font-semibold text-foreground">活动类型分布</h4>
              {(!activityStats?.breakdown || activityStats.breakdown.length === 0) ? (
                <p className="py-12 text-center text-sm text-muted-foreground/60">暂无活动数据</p>
              ) : (
                <ActivityTypeChart
                  data={activityStats.breakdown.map((b) => ({
                    type: ACTIVITY_TYPE_LABELS[b.type] || b.type,
                    count: b.count,
                    fill: ACTIVITY_TYPE_COLORS[b.type] || "#94a3b8",
                  }))}
                />
              )}
            </div>

            {/* Participation by type */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h4 className="mb-4 font-semibold text-foreground">各类型参与情况</h4>
              {(!activityStats?.breakdown || activityStats.breakdown.length === 0) ? (
                <p className="py-12 text-center text-sm text-muted-foreground/60">暂无活动数据</p>
              ) : (
                <ActivityParticipationChart
                  data={activityStats.breakdown.map((b) => ({
                    type: ACTIVITY_TYPE_LABELS[b.type] || b.type,
                    registrations: b.totalParticipants,
                  }))}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Chart sub-components ──

function MonitoringChart({
  data,
  period,
}: {
  data: MonitoringRecord[];
  period: Period;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CARTESIAN_STROKE} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="count" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="score" orientation="right" tick={{ fontSize: 11 }} domain={[0, 100]} />
        <Tooltip />
        <Legend />
        <Bar yAxisId="count" dataKey="count" name="监测次数" fill={APPLE_BLUE} radius={[4, 4, 0, 0]} />
        <Line
          yAxisId="score"
          type="monotone"
          dataKey="avgScore"
          name="平均评分"
          stroke={APPLE_ORANGE}
          strokeWidth={2}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function AppointmentsChart({
  data,
}: {
  data: AppointmentRecord[];
  period: Period;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CARTESIAN_STROKE} />
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
}: {
  data: ResidentRecord[];
  period: Period;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CARTESIAN_STROKE} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Line
          type="monotone"
          dataKey="newCount"
          name="新增居民"
          stroke={APPLE_CYAN}
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="totalCount"
          name="累计居民"
          stroke={APPLE_PURPLE}
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ActivityTypeChart({
  data,
}: {
  data: { type: string; count: number; fill: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CARTESIAN_STROKE} />
        <XAxis dataKey="type" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="count" name="活动场次" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ActivityParticipationChart({
  data,
}: {
  data: { type: string; registrations: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CARTESIAN_STROKE} />
        <XAxis dataKey="type" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="registrations" name="参与人次" fill={APPLE_PURPLE} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
