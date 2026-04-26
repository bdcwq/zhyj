"use client";

import { useState, useEffect, useCallback } from "react";
import { Bot, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { ErrorBanner } from "@/components/error-banner";
import { EmptyState } from "@/components/empty-state";

const fetchWithAuth = (url: string, init?: RequestInit) =>
  fetch(url, { ...init, credentials: "include" });

interface Routine {
  id: string;
  name: string;
  duration: number;
  description: string;
}

interface VerifiedAppointment {
  id: string;
  scheduledAt: string;
  resident?: { id: string; name: string };
  room?: { id: string; name: string };
  machine?: { id: string; name: string };
}

interface RobotSession {
  id: string;
  appointmentId: string;
  routineId?: string;
  status: string;
  progress: number;
  startedAt: string;
  appointment?: VerifiedAppointment;
}

const SESSION_COLOR_MAP: Record<string, string> = {
  active: "bg-apple-success/10 text-apple-success",
  paused: "bg-apple-warning/10 text-apple-warning",
  completed: "bg-muted text-muted-foreground",
  error: "bg-apple-error/10 text-apple-error",
};

const SESSION_LABEL_MAP: Record<string, string> = {
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
  error: "异常",
};

export default function RobotSessionsPage() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [verifiedAppointments, setVerifiedAppointments] = useState<
    VerifiedAppointment[]
  >([]);
  const [sessions, setSessions] = useState<RobotSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Start session form state
  const [selectedAppointment, setSelectedAppointment] = useState("");
  const [selectedRoutine, setSelectedRoutine] = useState("");
  const [starting, setStarting] = useState(false);

  const loadRoutines = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/v1/robot-sessions/routines");
      const data = await res.json();
      if (data.success) setRoutines(data.data || []);
    } catch {
      // ignore
    }
  }, []);

  const loadVerifiedAppointments = useCallback(async () => {
    try {
      const res = await fetchWithAuth(
        `/api/v1/appointments?status=verified&hasSession=false`
      );
      const data = await res.json();
      if (data.success) setVerifiedAppointments(data.data?.records || []);
    } catch {
      // ignore
    }
  }, []);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/v1/robot-sessions");
      const data = await res.json();
      if (data.success) setSessions(data.data?.records || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoutines();
    loadVerifiedAppointments();
    loadSessions();
  }, [loadRoutines, loadVerifiedAppointments, loadSessions]);

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment || !selectedRoutine) return;
    setError("");
    setStarting(true);
    try {
      const res = await fetchWithAuth("/api/v1/robot-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: selectedAppointment,
          routineId: selectedRoutine,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedAppointment("");
        setSelectedRoutine("");
        loadVerifiedAppointments();
        loadSessions();
      } else {
        setError(data.error?.message || "启动失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setStarting(false);
    }
  };

  const handleStopSession = async (id: string) => {
    try {
      const res = await fetchWithAuth(`/api/v1/robot-sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const data = await res.json();
      if (data.success) {
        loadSessions();
        loadVerifiedAppointments();
      } else {
        setError(data.error?.message || "停止失败");
      }
    } catch {
      setError("网络错误");
    }
  };

  const handlePauseSession = async (id: string) => {
    try {
      const res = await fetchWithAuth(`/api/v1/robot-sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause" }),
      });
      const data = await res.json();
      if (data.success) {
        loadSessions();
      }
    } catch {
      // ignore
    }
  };

  const handleResumeSession = async (id: string) => {
    try {
      const res = await fetchWithAuth(`/api/v1/robot-sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume" }),
      });
      const data = await res.json();
      if (data.success) {
        loadSessions();
      }
    } catch {
      // ignore
    }
  };

  /* ── Verified appointments columns ── */
  const appointmentColumns: Column<VerifiedAppointment>[] = [
    {
      key: "scheduledAt",
      header: "预约时间",
      render: (a) => new Date(a.scheduledAt).toLocaleString("zh-CN"),
    },
    {
      key: "resident",
      header: "居民",
      render: (a) => a.resident?.name || "-",
    },
    {
      key: "room",
      header: "房间",
      render: (a) => a.room?.name || "-",
    },
    {
      key: "machine",
      header: "设备",
      render: (a) => a.machine?.name || "-",
    },
  ];

  /* ── Sessions columns ── */
  const sessionColumns: Column<RobotSession>[] = [
    {
      key: "resident",
      header: "居民",
      render: (s) => s.appointment?.resident?.name || "-",
    },
    {
      key: "machine",
      header: "设备",
      render: (s) => s.appointment?.machine?.name || "-",
    },
    {
      key: "status",
      header: "状态",
      render: (s) => (
        <StatusBadge
          status={s.status}
          colorMap={SESSION_COLOR_MAP}
          labelMap={SESSION_LABEL_MAP}
        />
      ),
    },
    {
      key: "progress",
      header: "进度",
      render: (s) => (
        <div className="flex items-center gap-2">
          <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${s.progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{s.progress}%</span>
        </div>
      ),
    },
    {
      key: "startedAt",
      header: "开始时间",
      render: (s) =>
        new Date(s.startedAt).toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
    },
    {
      key: "actions",
      header: "操作",
      render: (s) => (
        <div className="flex items-center gap-2">
          {s.status === "active" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handlePauseSession(s.id)}
                className="bg-apple-warning/10 text-apple-warning border-apple-warning/30 hover:bg-apple-warning/20"
              >
                <Pause className="h-3.5 w-3.5 mr-1" />
                暂停
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStopSession(s.id)}
                className="text-apple-error border-apple-error/30 hover:bg-apple-error/10"
              >
                <Square className="h-3.5 w-3.5 mr-1" />
                停止
              </Button>
            </>
          )}
          {s.status === "paused" && (
            <>
              <Button
                size="sm"
                onClick={() => handleResumeSession(s.id)}
                className="bg-apple-success text-white hover:bg-apple-success/90"
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                继续
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStopSession(s.id)}
                className="text-apple-error border-apple-error/30 hover:bg-apple-error/10"
              >
                <Square className="h-3.5 w-3.5 mr-1" />
                停止
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="机器人管理"
        description="管理理疗会话的启动、暂停和停止"
      />

      {error && <ErrorBanner message={error} onRetry={loadSessions} />}

      {/* Start new session */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-6">
        <h3 className="font-medium mb-3 text-foreground">开始理疗</h3>
        {verifiedAppointments.length === 0 ? (
          <EmptyState
            icon={<Bot className="h-8 w-8" />}
            message="暂无已核销待理疗的预约"
          />
        ) : (
          <form onSubmit={handleStartSession} className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="appointment-select">选择预约</Label>
                <select
                  id="appointment-select"
                  value={selectedAppointment}
                  onChange={(e) => setSelectedAppointment(e.target.value)}
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="">选择已核销的预约</option>
                  {verifiedAppointments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.resident?.name || "未知"} -{" "}
                      {new Date(a.scheduledAt).toLocaleString("zh-CN")}
                      {a.machine ? ` (${a.machine.name})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="routine-select">理疗方案</Label>
                <select
                  id="routine-select"
                  value={selectedRoutine}
                  onChange={(e) => setSelectedRoutine(e.target.value)}
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="">选择方案</option>
                  {routines.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.duration}分钟)
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button type="submit" disabled={starting}>
              {starting ? "启动中..." : "开始理疗"}
            </Button>
          </form>
        )}

        {/* Verified appointments list */}
        {verifiedAppointments.length > 0 && (
          <div className="mt-4">
            <DataTable
              columns={appointmentColumns}
              data={verifiedAppointments}
              emptyMessage="暂无已核销待理疗的预约"
            />
          </div>
        )}
      </div>

      {/* Active sessions */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-6">
        <h3 className="font-medium mb-3 text-foreground">理疗会话</h3>
        <DataTable
          columns={sessionColumns}
          data={sessions}
          loading={loading}
          onRetry={loadSessions}
          emptyMessage="暂无进行中的会话"
        />
      </div>
    </div>
  );
}
