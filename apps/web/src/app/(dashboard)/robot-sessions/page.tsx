"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

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

const SESSION_STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  completed: "bg-gray-100 text-gray-700",
  error: "bg-red-100 text-red-700",
};

const SESSION_STATUS_LABELS: Record<string, string> = {
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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">机器人管理</h2>

      {error && (
        <div className="p-2 bg-red-50 text-red-600 text-sm rounded">
          {error}
        </div>
      )}

      {/* Start new session */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="font-medium mb-3">开始理疗</h3>
        {verifiedAppointments.length === 0 ? (
          <p className="text-sm text-gray-400">暂无已核销待理疗的预约</p>
        ) : (
          <form
            onSubmit={handleStartSession}
            className="space-y-3"
          >
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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2">预约时间</th>
                  <th className="pb-2">居民</th>
                  <th className="pb-2">房间</th>
                  <th className="pb-2">设备</th>
                </tr>
              </thead>
              <tbody>
                {verifiedAppointments.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-2">
                      {new Date(a.scheduledAt).toLocaleString("zh-CN")}
                    </td>
                    <td className="py-2">{a.resident?.name || "-"}</td>
                    <td className="py-2">{a.room?.name || "-"}</td>
                    <td className="py-2">{a.machine?.name || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Active sessions */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="font-medium mb-3">理疗会话</h3>
        {loading ? (
          <p className="text-sm text-gray-400">加载中...</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-gray-400">暂无进行中的会话</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2">居民</th>
                <th className="pb-2">设备</th>
                <th className="pb-2">状态</th>
                <th className="pb-2">进度</th>
                <th className="pb-2">开始时间</th>
                <th className="pb-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-2">
                    {s.appointment?.resident?.name || "-"}
                  </td>
                  <td className="py-2">
                    {s.appointment?.machine?.name || "-"}
                  </td>
                  <td className="py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        SESSION_STATUS_COLORS[s.status] ||
                        "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {SESSION_STATUS_LABELS[s.status] || s.status}
                    </span>
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all"
                          style={{ width: `${s.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">
                        {s.progress}%
                      </span>
                    </div>
                  </td>
                  <td className="py-2">
                    {new Date(s.startedAt).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      {s.status === "active" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePauseSession(s.id)}
                          >
                            暂停
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStopSession(s.id)}
                            className="text-red-600 border-red-300 hover:bg-red-50"
                          >
                            停止
                          </Button>
                        </>
                      )}
                      {s.status === "paused" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleResumeSession(s.id)}
                          >
                            继续
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStopSession(s.id)}
                            className="text-red-600 border-red-300 hover:bg-red-50"
                          >
                            停止
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
