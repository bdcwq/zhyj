"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { STAFF_ROLES } from "@zhyj/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { ErrorBanner } from "@/components/error-banner";
import { CheckCircle2 } from "lucide-react";

/* ─── Types ─── */

interface TodayAttendance {
  id: string;
  clockIn: string | null;
  clockOut: string | null;
  workedMinutes: number | null;
  status: string;
  scheduleId: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
}

interface StaffAttendanceRecord {
  id: string;
  clockIn: string | null;
  clockOut: string | null;
  workedMinutes: number | null;
  status: string;
  staff: { id: string; name: string; phone: string | null };
  schedule: {
    id: string;
    startTime: string;
    endTime: string;
    shiftType: string;
  } | null;
}

interface AttendanceListResponse {
  success: boolean;
  data: {
    records: StaffAttendanceRecord[];
    total: number;
    limit: number;
    offset: number;
  };
}

/* ─── Constants ─── */

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  normal: { label: "正常", color: "text-apple-success", bg: "bg-apple-success/10 border-apple-success/20" },
  late: { label: "迟到", color: "text-apple-warning", bg: "bg-apple-warning/10 border-apple-warning/20" },
  early_leave: { label: "早退", color: "text-apple-warning", bg: "bg-apple-warning/10 border-apple-warning/20" },
  late_and_early: { label: "迟到+早退", color: "text-apple-error", bg: "bg-apple-error/10 border-apple-error/20" },
  pending: { label: "未签退", color: "text-muted-foreground", bg: "bg-muted border-border" },
  absent: { label: "缺勤", color: "text-apple-error", bg: "bg-apple-error/10 border-apple-error/20" },
};

const STATUS_COLOR_MAP: Record<string, string> = {
  normal: "bg-apple-success/10 text-apple-success",
  late: "bg-apple-warning/10 text-apple-warning",
  early_leave: "bg-apple-warning/10 text-apple-warning",
  late_and_early: "bg-apple-error/10 text-apple-error",
  pending: "bg-muted text-muted-foreground",
  absent: "bg-apple-error/10 text-apple-error",
};

const STATUS_LABEL_MAP: Record<string, string> = {
  normal: "正常",
  late: "迟到",
  early_leave: "早退",
  late_and_early: "迟到+早退",
  pending: "未签退",
  absent: "缺勤",
};

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatHours(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return "—";
  return (minutes / 60).toFixed(2) + "h";
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ─── StaffClockView ─── */

function StaffClockView() {
  const [todayRecord, setTodayRecord] = useState<TodayAttendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const fetchToday = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        dateFrom: todayStr(),
        dateTo: todayStr(),
        limit: "10",
        offset: "0",
      });
      const res = await fetch(`/api/v1/attendance?${params}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (json.success && json.data.records.length > 0) {
        setTodayRecord(json.data.records[0]);
      } else {
        setTodayRecord(null);
      }
    } catch {
      setError("获取今日考勤失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchToday();
  }, [fetchToday]);

  // Auto-dismiss success messages
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(""), 3000);
      return () => clearTimeout(t);
    }
  }, [successMsg]);

  const isClockedIn = !!todayRecord?.clockIn;
  const isClockedOut = !!todayRecord?.clockOut;

  async function handleClockIn() {
    setActionLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      // Get today's schedule for this staff member
      const scheduleParams = new URLSearchParams({
        dateFrom: todayStr(),
        dateTo: todayStr(),
        limit: "10",
        offset: "0",
        status: "scheduled",
      });
      const scheduleRes = await fetch(`/api/v1/schedules?${scheduleParams}`, {
        credentials: "include",
      });
      const scheduleJson = await scheduleRes.json();

      let scheduleId: string | undefined;
      if (scheduleJson.success && scheduleJson.data.records.length > 0) {
        // Find the first active schedule
        const activeSchedule = scheduleJson.data.records.find(
          (s: { status: string }) => s.status === "scheduled",
        );
        if (activeSchedule) {
          scheduleId = activeSchedule.id;
        }
      }

      const body: Record<string, string> = {};
      if (scheduleId) body.scheduleId = scheduleId;

      const res = await fetch("/api/v1/attendance/clock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg("签到成功");
        fetchToday();
      } else {
        setError(json.error?.message || "签到失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClockOut() {
    if (!todayRecord?.id) return;
    setActionLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch("/api/v1/attendance/clock-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ attendanceId: todayRecord.id }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg("签退成功");
        fetchToday();
      } else {
        setError(json.error?.message || "签退失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setActionLoading(false);
    }
  }

  const statusConfig = STATUS_CONFIG[todayRecord?.status || ""] || STATUS_CONFIG.pending;

  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* Today's date */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </p>
      </div>

      {/* Status card */}
      {loading ? (
        <div className="rounded-xl border border-border bg-card shadow-sm p-8 animate-pulse">
          <div className="h-6 bg-muted rounded w-1/2 mx-auto mb-4" />
          <div className="h-10 bg-muted rounded w-3/4 mx-auto" />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-sm p-8 text-center">
          {/* Status */}
          {!todayRecord ? (
            <>
              <p className="text-4xl mb-2">📋</p>
              <p className="text-lg font-semibold text-foreground">今日未签到</p>
              <p className="text-sm text-muted-foreground mt-1">请点击下方按钮签到打卡</p>
            </>
          ) : !isClockedIn ? (
            <>
              <p className="text-4xl mb-2">⏳</p>
              <p className="text-lg font-semibold text-foreground">等待签到</p>
              <p className="text-sm text-muted-foreground mt-1">考勤记录已创建，请签到</p>
            </>
          ) : isClockedOut ? (
            <>
              <p className="text-4xl mb-2">✅</p>
              <p className="text-lg font-semibold text-foreground">今日已完成</p>
              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                <p>
                  签到时间：<span className="font-medium text-foreground">{formatTime(todayRecord.clockIn)}</span>
                </p>
                <p>
                  签退时间：<span className="font-medium text-foreground">{formatTime(todayRecord.clockOut)}</span>
                </p>
                <p>
                  工作时长：<span className="font-medium text-foreground">{formatHours(todayRecord.workedMinutes)}</span>
                </p>
                <div className="pt-2">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConfig.bg} ${statusConfig.color}`}
                  >
                    {statusConfig.label}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-4xl mb-2">🟢</p>
              <p className="text-lg font-semibold text-foreground">工作中</p>
              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                <p>
                  签到时间：<span className="font-medium text-foreground">{formatTime(todayRecord.clockIn)}</span>
                </p>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConfig.bg} ${statusConfig.color}`}
                >
                  {statusConfig.label}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Messages */}
      {successMsg && (
        <div className="flex items-center gap-2 justify-center rounded-lg bg-apple-success/10 border border-apple-success/20 px-4 py-3 text-sm text-apple-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}
      {error && (
        <ErrorBanner message={error} />
      )}

      {/* Clock-in / Clock-out button */}
      {!loading && (
        <div className="flex justify-center">
          {!isClockedIn || !todayRecord ? (
            <button
              type="button"
              disabled={actionLoading || isClockedOut}
              onClick={handleClockIn}
              className="inline-flex items-center gap-2 rounded-xl bg-apple-success px-8 py-4 text-lg font-semibold text-white shadow-lg hover:bg-apple-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
            >
              {actionLoading ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
                </svg>
              )}
              {isClockedOut ? "今日已完成" : "签到打卡"}
            </button>
          ) : (
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleClockOut}
              className="inline-flex items-center gap-2 rounded-xl bg-apple-error px-8 py-4 text-lg font-semibold text-white shadow-lg hover:bg-apple-error/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
            >
              {actionLoading ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3-3h-9m9 0-3-3m3 3 3 3" />
                </svg>
              )}
              签退打卡
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── ManagerDashboard ─── */

const managerColumns: Column<StaffAttendanceRecord>[] = [
  {
    key: "staff.name",
    header: "员工姓名",
    render: (row) => (
      <span className="font-medium text-foreground">{row.staff?.name || "—"}</span>
    ),
  },
  {
    key: "schedule",
    header: "班次",
    render: (row) =>
      row.schedule
        ? `${row.schedule.startTime} - ${row.schedule.endTime}`
        : "—",
  },
  {
    key: "clockIn",
    header: "签到时间",
    render: (row) => formatTime(row.clockIn),
  },
  {
    key: "clockOut",
    header: "签退时间",
    render: (row) => formatTime(row.clockOut),
  },
  {
    key: "workedMinutes",
    header: "工时",
    render: (row) => formatHours(row.workedMinutes),
  },
  {
    key: "status",
    header: "状态",
    render: (row) => (
      <StatusBadge
        status={row.status}
        colorMap={STATUS_COLOR_MAP}
        labelMap={STATUS_LABEL_MAP}
      />
    ),
  },
];

function ManagerDashboard() {
  const [records, setRecords] = useState<StaffAttendanceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayStr());

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        dateFrom: selectedDate,
        dateTo: selectedDate,
        limit: "100",
        offset: "0",
      });
      const res = await fetch(`/api/v1/attendance?${params}`, {
        credentials: "include",
      });
      const json: AttendanceListResponse = await res.json();
      if (json.success) {
        setRecords(json.data.records);
        setTotal(json.data.total);
      } else {
        setError("获取考勤数据失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  const presentCount = records.filter((r) => r.clockIn !== null).length;
  const completedCount = records.filter((r) => r.clockOut !== null).length;

  return (
    <div className="space-y-4">
      {/* Summary + date picker */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div>
            <label htmlFor="attendance-date" className="block text-sm font-medium text-foreground mb-1">
              选择日期
            </label>
            <input
              id="attendance-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground bg-card focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-center">
            <p className="font-semibold text-foreground text-lg">{presentCount}</p>
            <p className="text-muted-foreground">已签到</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground text-lg">{completedCount}</p>
            <p className="text-muted-foreground">已签退</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground text-lg">{total}</p>
            <p className="text-muted-foreground">总记录</p>
          </div>
        </div>
      </div>

      {/* Attendance table */}
      <DataTable
        columns={managerColumns}
        data={records}
        loading={loading}
        error={error}
        total={total}
        onRetry={fetchAttendance}
        emptyMessage="暂无考勤记录"
      />
    </div>
  );
}

/* ─── Monthly Report Tab ─── */

interface ReportRecord {
  staffId: string;
  staffName: string;
  presentDays: number;
  lateDays: number;
  earlyLeaveDays: number;
  leaveDays: number;
  absentDays: number;
  totalHours: number;
}

interface ReportResponse {
  success: boolean;
  data: {
    records: ReportRecord[];
    total: number;
    limit: number;
    offset: number;
  };
}

const reportColumns: Column<ReportRecord>[] = [
  {
    key: "staffName",
    header: "姓名",
    render: (row) => (
      <span className="font-medium text-foreground">{row.staffName}</span>
    ),
    className: "whitespace-nowrap",
  },
  {
    key: "presentDays",
    header: "出勤天数",
    render: (row) => (
      <span className="text-foreground">{row.presentDays}</span>
    ),
    className: "text-center",
  },
  {
    key: "lateDays",
    header: "迟到天数",
    render: (row) =>
      row.lateDays > 0 ? (
        <span className="text-apple-warning font-medium">{row.lateDays}</span>
      ) : (
        <span className="text-muted-foreground">0</span>
      ),
    className: "text-center",
  },
  {
    key: "earlyLeaveDays",
    header: "早退天数",
    render: (row) =>
      row.earlyLeaveDays > 0 ? (
        <span className="text-apple-warning font-medium">{row.earlyLeaveDays}</span>
      ) : (
        <span className="text-muted-foreground">0</span>
      ),
    className: "text-center",
  },
  {
    key: "leaveDays",
    header: "请假天数",
    render: (row) => (
      <span className="text-primary font-medium">{row.leaveDays}</span>
    ),
    className: "text-center",
  },
  {
    key: "absentDays",
    header: "缺勤天数",
    render: (row) =>
      row.absentDays > 0 ? (
        <span className="text-apple-error font-medium">{row.absentDays}</span>
      ) : (
        <span className="text-muted-foreground">0</span>
      ),
    className: "text-center",
  },
  {
    key: "totalHours",
    header: "总工时(h)",
    render: (row) => (
      <span className="text-foreground">{row.totalHours}</span>
    ),
    className: "text-center",
  },
];

function AttendanceReportView() {
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);

  const monthStr = `${viewYear}-${String(viewMonth).padStart(2, "0")}`;

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ month: monthStr, limit: "100", offset: "0" });
      const res = await fetch(`/api/v1/attendance/report?${params}`, { credentials: "include" });
      const json: ReportResponse = await res.json();
      if (json.success) {
        setReports(json.data.records);
      } else {
        setError("获取报表数据失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }, [monthStr]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  function goToPrevMonth() {
    if (viewMonth === 1) { setViewMonth(12); setViewYear((y) => y - 1); } else { setViewMonth((m) => m - 1); }
  }
  function goToNextMonth() {
    if (viewMonth === 12) { setViewMonth(1); setViewYear((y) => y + 1); } else { setViewMonth((m) => m + 1); }
  }
  function goToCurrentMonth() {
    setViewYear(now.getFullYear()); setViewMonth(now.getMonth() + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={goToPrevMonth}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          ←
        </button>
        <span className="text-sm font-medium text-foreground min-w-[140px] text-center">
          {viewYear}年{String(viewMonth).padStart(2, "0")}月
        </span>
        <button
          type="button"
          onClick={goToNextMonth}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          →
        </button>
        <button
          type="button"
          onClick={goToCurrentMonth}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          本月
        </button>
      </div>

      <DataTable
        columns={reportColumns}
        data={reports}
        loading={loading}
        error={error}
        onRetry={fetchReport}
        emptyMessage="暂无考勤数据"
      />
    </div>
  );
}

/* ─── Main Page Component ─── */

export default function AttendancePage() {
  const { user, loading: authLoading } = useAuth();
  const role = user?.role;
  const isStaff = role === STAFF_ROLES.STAFF;
  const isManager = role === STAFF_ROLES.ADMIN || role === STAFF_ROLES.STORE_MANAGER;
  const [activeTab, setActiveTab] = useState<"clock-in" | "report">("clock-in");

  if (authLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="h-10 w-full bg-muted rounded" />
        <div className="h-64 w-full bg-muted rounded" />
      </div>
    );
  }

  if (!user) { return null; }

  return (
    <div className="space-y-6">
      <PageHeader
        title="考勤管理"
        description={isStaff ? "查看您的考勤状态并进行签到/签退" : "查看员工到岗情况"}
      />
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("clock-in")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "clock-in"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          考勤打卡
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("report")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "report"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          月度报表
        </button>
      </div>
      {activeTab === "clock-in"
        ? (isStaff ? <StaffClockView /> : isManager ? <ManagerDashboard /> : null)
        : <AttendanceReportView />}
    </div>
  );
}
