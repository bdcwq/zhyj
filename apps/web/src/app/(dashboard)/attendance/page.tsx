"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { STAFF_ROLES } from "@zhyj/shared";

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
  normal: { label: "正常", color: "text-green-700", bg: "bg-green-50 border-green-200" },
  late: { label: "迟到", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  early_leave: { label: "早退", color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  late_and_early: { label: "迟到+早退", color: "text-red-700", bg: "bg-red-50 border-red-200" },
  pending: { label: "未签退", color: "text-gray-600", bg: "bg-gray-50 border-gray-200" },
  absent: { label: "缺勤", color: "text-red-700", bg: "bg-red-50 border-red-200" },
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
        <p className="text-sm text-gray-500">
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
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-8 animate-pulse">
          <div className="h-6 bg-gray-100 rounded w-1/2 mx-auto mb-4" />
          <div className="h-10 bg-gray-100 rounded w-3/4 mx-auto" />
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-8 text-center">
          {/* Status */}
          {!todayRecord ? (
            <>
              <p className="text-4xl mb-2">📋</p>
              <p className="text-lg font-semibold text-gray-900">今日未签到</p>
              <p className="text-sm text-gray-500 mt-1">请点击下方按钮签到打卡</p>
            </>
          ) : !isClockedIn ? (
            <>
              <p className="text-4xl mb-2">⏳</p>
              <p className="text-lg font-semibold text-gray-900">等待签到</p>
              <p className="text-sm text-gray-500 mt-1">考勤记录已创建，请签到</p>
            </>
          ) : isClockedOut ? (
            <>
              <p className="text-4xl mb-2">✅</p>
              <p className="text-lg font-semibold text-gray-900">今日已完成</p>
              <div className="mt-3 space-y-1 text-sm text-gray-600">
                <p>
                  签到时间：<span className="font-medium">{formatTime(todayRecord.clockIn)}</span>
                </p>
                <p>
                  签退时间：<span className="font-medium">{formatTime(todayRecord.clockOut)}</span>
                </p>
                <p>
                  工作时长：<span className="font-medium">{formatHours(todayRecord.workedMinutes)}</span>
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
              <p className="text-lg font-semibold text-gray-900">工作中</p>
              <div className="mt-3 space-y-1 text-sm text-gray-600">
                <p>
                  签到时间：<span className="font-medium">{formatTime(todayRecord.clockIn)}</span>
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
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 text-center">
          {successMsg}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 text-center">
          {error}
        </div>
      )}

      {/* Clock-in / Clock-out button */}
      {!loading && (
        <div className="flex justify-center">
          {!isClockedIn || !todayRecord ? (
            <button
              type="button"
              disabled={actionLoading || isClockedOut}
              onClick={handleClockIn}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-8 py-4 text-lg font-semibold text-white shadow-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
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
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-8 py-4 text-lg font-semibold text-white shadow-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
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
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div>
            <label htmlFor="attendance-date" className="block text-sm font-medium text-gray-700 mb-1">
              选择日期
            </label>
            <input
              id="attendance-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-center">
            <p className="font-semibold text-gray-900 text-lg">{presentCount}</p>
            <p className="text-gray-500">已签到</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-900 text-lg">{completedCount}</p>
            <p className="text-gray-500">已签退</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-900 text-lg">{total}</p>
            <p className="text-gray-500">总记录</p>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
          <button type="button" onClick={fetchAttendance} className="ml-2 underline hover:no-underline">
            重试
          </button>
        </div>
      )}

      {/* Attendance table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                员工姓名
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                班次
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                签到时间
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                签退时间
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                工时
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                状态
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`skel-${i}`}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div
                        className="h-4 bg-gray-100 rounded animate-pulse"
                        style={{ width: `${50 + Math.random() * 50}%` }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                  暂无考勤记录
                </td>
              </tr>
            ) : (
              records.map((record) => {
                const statusConfig = STATUS_CONFIG[record.status] || STATUS_CONFIG.pending;
                return (
                  <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                      {record.staff?.name || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {record.schedule
                        ? `${record.schedule.startTime} - ${record.schedule.endTime}`
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {formatTime(record.clockIn)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {formatTime(record.clockOut)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {formatHours(record.workedMinutes)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConfig.bg} ${statusConfig.color}`}
                      >
                        {statusConfig.label}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
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
      <div className="flex items-center justify-center gap-4">
        <button type="button" onClick={goToPrevMonth} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">←</button>
        <span className="text-sm font-medium text-gray-900 min-w-[140px] text-center">{viewYear}年{String(viewMonth).padStart(2, "0")}月</span>
        <button type="button" onClick={goToNextMonth} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">→</button>
        <button type="button" onClick={goToCurrentMonth} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">本月</button>
      </div>
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
          <button type="button" onClick={fetchReport} className="ml-2 underline hover:no-underline">重试</button>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">姓名</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">出勤天数</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">迟到天数</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">早退天数</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">请假天数</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">缺勤天数</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">总工时(h)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`skel-${i}`}>{Array.from({ length: 7 }).map((_, j) => (
                  <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse mx-auto" style={{ width: `${40 + Math.random() * 40}%` }} /></td>
                ))}</tr>
              ))
            ) : reports.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">暂无考勤数据</td></tr>
            ) : (
              reports.map((r) => (
                <tr key={r.staffId} className="hover:bg-gray-50 transition-colors">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">{r.staffName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 text-center">{r.presentDays}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-center">{r.lateDays > 0 ? <span className="text-yellow-700 font-medium">{r.lateDays}</span> : <span className="text-gray-400">0</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-center">{r.earlyLeaveDays > 0 ? <span className="text-orange-700 font-medium">{r.earlyLeaveDays}</span> : <span className="text-gray-400">0</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-blue-600 text-center">{r.leaveDays}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-center">{r.absentDays > 0 ? <span className="text-red-700 font-medium">{r.absentDays}</span> : <span className="text-gray-400">0</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 text-center">{r.totalHours}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="h-10 w-full bg-gray-200 rounded" />
        <div className="h-64 w-full bg-gray-200 rounded" />
      </div>
    );
  }

  if (!user) { return null; }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 tracking-tight">考勤管理</h2>
        <p className="text-sm text-gray-500 mt-1">{isStaff ? "查看您的考勤状态并进行签到/签退" : "查看员工到岗情况"}</p>
      </div>
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        <button type="button" onClick={() => setActiveTab("clock-in")} className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === "clock-in" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>考勤打卡</button>
        <button type="button" onClick={() => setActiveTab("report")} className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === "report" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>月度报表</button>
      </div>
      {activeTab === "clock-in" ? (isStaff ? <StaffClockView /> : isManager ? <ManagerDashboard /> : null) : <AttendanceReportView />}
    </div>
  );
}
