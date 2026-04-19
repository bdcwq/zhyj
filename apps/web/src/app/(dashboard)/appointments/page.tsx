"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APPOINTMENT_STATUS } from "@zhyj/shared";

const fetchWithAuth = (url: string, init?: RequestInit) =>
  fetch(url, { ...init, credentials: "include" });

interface Resident {
  id: string;
  name: string;
}

interface Room {
  id: string;
  name: string;
}

interface Machine {
  id: string;
  name: string;
  status: string;
}

interface Appointment {
  id: string;
  scheduledAt: string;
  resident?: Resident;
  room?: Room;
  machine?: Machine;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  booked: "bg-blue-100 text-blue-700",
  confirmed: "bg-yellow-100 text-yellow-700",
  verified: "bg-green-100 text-green-700",
  in_progress: "bg-orange-100 text-orange-700",
  completed: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-100 text-red-700",
  no_show: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  booked: "已预约",
  confirmed: "已确认",
  verified: "已核销",
  in_progress: "进行中",
  completed: "已完成",
  cancelled: "已取消",
  no_show: "未到诊",
};

export default function AppointmentsPage() {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [residentId, setResidentId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [machineId, setMachineId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadResidents = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/v1/residents");
      const data = await res.json();
      if (data.success) setResidents(data.data?.records || []);
    } catch {
      // ignore
    }
  }, []);

  const loadRooms = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/v1/rooms");
      const data = await res.json();
      if (data.success) setRooms(data.data || []);
    } catch {
      // ignore
    }
  }, []);

  const loadMachines = useCallback(async (roomIdx: string) => {
    if (!roomIdx) {
      setMachines([]);
      return;
    }
    try {
      const res = await fetchWithAuth(`/api/v1/rooms/${roomIdx}/machines`);
      const data = await res.json();
      if (data.success) setMachines(data.data || []);
    } catch {
      setMachines([]);
    }
  }, []);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/v1/appointments");
      const data = await res.json();
      if (data.success) setAppointments(data.data?.records || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResidents();
    loadRooms();
    loadAppointments();
  }, [loadResidents, loadRooms, loadAppointments]);

  const handleRoomChange = (id: string) => {
    setRoomId(id);
    setMachineId("");
    loadMachines(id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetchWithAuth("/api/v1/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residentId,
          roomId,
          machineId: machineId || undefined,
          scheduledAt: new Date(scheduledAt).toISOString(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResidentId("");
        setRoomId("");
        setMachineId("");
        setScheduledAt("");
        loadAppointments();
      } else {
        setError(data.error?.message || "创建失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      const res = await fetchWithAuth(`/api/v1/appointments/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setAppointments((prev) => prev.filter((a) => a.id !== id));
      }
    } catch {
      // ignore
    }
  };

  // Get minimum datetime (now) for the input
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const minDatetime = now.toISOString().slice(0, 16);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">预约管理</h2>

      {/* New booking form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg border p-4 space-y-3"
      >
        <h3 className="font-medium">新建预约</h3>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label htmlFor="resident">居民</Label>
            <select
              id="resident"
              value={residentId}
              onChange={(e) => setResidentId(e.target.value)}
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">选择居民</option>
              {residents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="room">房间</Label>
            <select
              id="room"
              value={roomId}
              onChange={(e) => handleRoomChange(e.target.value)}
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">选择房间</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="machine">设备</Label>
            <select
              id="machine"
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">不选择</option>
              {machines
                .filter((m) => m.status === "available")
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <Label htmlFor="datetime">预约时间</Label>
            <Input
              id="datetime"
              type="datetime-local"
              min={minDatetime}
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
            />
          </div>
        </div>
        <Button type="submit" disabled={submitting}>
          {submitting ? "提交中..." : "创建预约"}
        </Button>
      </form>

      {/* Appointments list */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="font-medium mb-3">预约列表</h3>
        {loading ? (
          <p className="text-sm text-gray-400">加载中...</p>
        ) : appointments.length === 0 ? (
          <p className="text-sm text-gray-400">暂无预约</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2">预约时间</th>
                <th className="pb-2">居民</th>
                <th className="pb-2">房间</th>
                <th className="pb-2">设备</th>
                <th className="pb-2">状态</th>
                <th className="pb-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-2">
                    {new Date(a.scheduledAt).toLocaleString("zh-CN")}
                  </td>
                  <td className="py-2">{a.resident?.name || "-"}</td>
                  <td className="py-2">{a.room?.name || "-"}</td>
                  <td className="py-2">{a.machine?.name || "-"}</td>
                  <td className="py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        STATUS_COLORS[a.status] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {STATUS_LABELS[a.status] || a.status}
                    </span>
                  </td>
                  <td className="py-2">
                    {a.status === APPOINTMENT_STATUS.BOOKED ||
                    a.status === APPOINTMENT_STATUS.CONFIRMED ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancel(a.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        取消
                      </Button>
                    ) : null}
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
