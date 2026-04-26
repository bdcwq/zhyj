"use client";

import { useState, useEffect, useCallback } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APPOINTMENT_STATUS } from "@zhyj/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { ErrorBanner } from "@/components/error-banner";

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

const APPOINTMENT_COLOR_MAP: Record<string, string> = {
  booked: "bg-primary/10 text-primary",
  confirmed: "bg-apple-warning/10 text-apple-warning",
  verified: "bg-apple-success/10 text-apple-success",
  in_progress: "bg-apple-warning/10 text-apple-warning",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-apple-error/10 text-apple-error",
  no_show: "bg-apple-error/10 text-apple-error",
};

const APPOINTMENT_LABEL_MAP: Record<string, string> = {
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

  const columns: Column<Appointment>[] = [
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
    {
      key: "status",
      header: "状态",
      render: (a) => (
        <StatusBadge
          status={a.status}
          colorMap={APPOINTMENT_COLOR_MAP}
          labelMap={APPOINTMENT_LABEL_MAP}
        />
      ),
    },
    {
      key: "actions",
      header: "操作",
      render: (a) =>
        a.status === APPOINTMENT_STATUS.BOOKED ||
        a.status === APPOINTMENT_STATUS.CONFIRMED ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCancel(a.id)}
            className="text-apple-error hover:text-apple-error/80 hover:bg-apple-error/10"
          >
            取消
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="预约管理"
        description="管理居民预约、查看预约状态"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open("/api/v1/export/appointments", "_blank")}
          >
            <Download className="mr-1.5 h-4 w-4" />
            导出
          </Button>
        }
      />

      {/* New booking form */}
      <form
        onSubmit={handleSubmit}
        className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-4"
      >
        <h3 className="text-base font-semibold text-foreground">新建预约</h3>
        {error && <ErrorBanner message={error} />}
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

      {/* Appointments table */}
      <DataTable
        columns={columns}
        data={appointments}
        loading={loading}
        onRetry={loadAppointments}
        emptyMessage="暂无预约"
      />
    </div>
  );
}
