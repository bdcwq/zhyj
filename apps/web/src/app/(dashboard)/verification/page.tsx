"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { ErrorBanner } from "@/components/error-banner";

const fetchWithAuth = (url: string, init?: RequestInit) =>
  fetch(url, { ...init, credentials: "include" });

interface Appointment {
  id: string;
  scheduledAt: string;
  resident?: { id: string; name: string };
  room?: { id: string; name: string };
  machine?: { id: string; name: string };
  status: string;
}

const APPOINTMENT_COLOR_MAP: Record<string, string> = {
  booked: "bg-primary/10 text-primary",
};

const APPOINTMENT_LABEL_MAP: Record<string, string> = {
  booked: "已预约",
};

export default function VerificationPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadTodayAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetchWithAuth(
        `/api/v1/appointments?dateFrom=${today}&dateTo=${today}&status=booked`
      );
      const data = await res.json();
      if (data.success) setAppointments(data.data?.records || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTodayAppointments();
  }, [loadTodayAppointments]);

  const handleVerify = async (id: string) => {
    setError("");
    try {
      const res = await fetchWithAuth(`/api/v1/appointments/${id}/verify`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setAppointments((prev) => prev.filter((a) => a.id !== id));
      } else {
        setError(data.error?.message || "核销失败");
      }
    } catch {
      setError("网络错误");
    }
  };

  const handleNoShow = async (id: string) => {
    setError("");
    try {
      const res = await fetchWithAuth(`/api/v1/appointments/${id}/no-show`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setAppointments((prev) => prev.filter((a) => a.id !== id));
      } else {
        setError(data.error?.message || "操作失败");
      }
    } catch {
      setError("网络错误");
    }
  };

  const tableColumns: Column<Appointment>[] = [
    {
      key: "scheduledAt",
      header: "预约时间",
      render: (a) =>
        new Date(a.scheduledAt).toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
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
      render: (a) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => handleVerify(a.id)}
            className="bg-apple-success/10 text-apple-success hover:bg-apple-success/20 border-0"
          >
            核销
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleNoShow(a.id)}
            className="text-apple-error border-apple-error/30 hover:bg-apple-error/10"
          >
            未到诊
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="核销管理" description="核销今日已预约的居民到诊情况" />

      {error && <ErrorBanner message={error} onRetry={loadTodayAppointments} />}

      <div className="bg-card rounded-xl border border-border shadow-sm p-6">
        <h3 className="font-medium mb-3 text-foreground">今日待核销预约</h3>
        <DataTable
          columns={tableColumns}
          data={appointments}
          loading={loading}
          onRetry={loadTodayAppointments}
          emptyMessage="今日暂无待核销预约"
        />
      </div>
    </div>
  );
}
