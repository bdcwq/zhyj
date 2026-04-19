"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">核销管理</h2>

      {error && (
        <div className="p-2 bg-red-50 text-red-600 text-sm rounded">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg border p-4">
        <h3 className="font-medium mb-3">今日待核销预约</h3>
        {loading ? (
          <p className="text-sm text-gray-400">加载中...</p>
        ) : appointments.length === 0 ? (
          <p className="text-sm text-gray-400">今日暂无待核销预约</p>
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
                    {new Date(a.scheduledAt).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-2">{a.resident?.name || "-"}</td>
                  <td className="py-2">{a.room?.name || "-"}</td>
                  <td className="py-2">{a.machine?.name || "-"}</td>
                  <td className="py-2">
                    <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                      {a.status === "booked" ? "已预约" : "已确认"}
                    </span>
                  </td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleVerify(a.id)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        核销
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleNoShow(a.id)}
                        className="text-red-600 border-red-300 hover:bg-red-50"
                      >
                        未到诊
                      </Button>
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
