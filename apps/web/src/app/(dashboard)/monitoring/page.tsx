"use client";

import { useState, useEffect, useCallback } from "react";
import { CONSTITUTION_TYPES } from "@zhyj/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const fetchWithAuth = (url: string, init?: RequestInit) =>
  fetch(url, { ...init, credentials: "include" });

interface Resident {
  id: string;
  name: string;
  phone: string;
}

interface MonitoringRecord {
  id: string;
  score: number;
  constitutionType: string;
  monitoringDate: string;
}

export default function MonitoringPage() {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [search, setSearch] = useState("");
  const [selectedResident, setSelectedResident] = useState<string>("");
  const [records, setRecords] = useState<MonitoringRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [score, setScore] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [constitutionType, setConstitutionType] = useState<string>(CONSTITUTION_TYPES[0]);
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

  const loadRecords = useCallback(async (residentId: string) => {
    if (!residentId) {
      setRecords([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetchWithAuth(
        `/api/v1/residents/${residentId}/monitoring-history`
      );
      const data = await res.json();
      if (data.success) setRecords(data.data?.records || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResidents();
  }, [loadResidents]);

  const handleSelectResident = (id: string) => {
    setSelectedResident(id);
    loadRecords(id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResident) {
      setError("请先选择居民");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetchWithAuth("/api/v1/monitoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residentId: selectedResident,
          score: Number(score),
          constitutionType,
          monitoringDate: new Date(date).toISOString(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setScore("");
        loadRecords(selectedResident);
      } else {
        setError(data.error?.message || "创建失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredResidents = residents.filter(
    (r) =>
      r.name.includes(search) || r.phone.includes(search)
  );

  const chartData = [...records]
    .sort(
      (a, b) =>
        new Date(a.monitoringDate).getTime() - new Date(b.monitoringDate).getTime()
    )
    .map((r) => ({
      date: new Date(r.monitoringDate).toLocaleDateString("zh-CN"),
      score: r.score,
    }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">体质监测</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const params = new URLSearchParams();
            if (selectedResident) params.set("residentId", selectedResident);
            const qs = params.toString();
            window.open(`/api/v1/export/monitoring${qs ? `?${qs}` : ""}`, "_blank");
          }}
        >
          <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          导出
        </Button>
      </div>

      {/* Resident search */}
      <div className="bg-white rounded-lg border p-4">
        <Label className="mb-2 block">搜索居民</Label>
        <Input
          placeholder="输入姓名或手机号搜索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2"
        />
        {search && filteredResidents.length > 0 && (
          <div className="border rounded max-h-40 overflow-y-auto">
            {filteredResidents.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  handleSelectResident(r.id);
                  setSearch("");
                }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex justify-between"
              >
                <span>{r.name}</span>
                <span className="text-gray-400">{r.phone}</span>
              </button>
            ))}
          </div>
        )}
        {selectedResident && (
          <p className="mt-2 text-sm text-gray-600">
            当前居民：{residents.find((r) => r.id === selectedResident)?.name}
          </p>
        )}
      </div>

      {/* Monitoring form */}
      {selectedResident && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border p-4 space-y-3">
          <h3 className="font-medium">新增监测记录</h3>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="score">评分 (0-100)</Label>
              <Input
                id="score"
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="date">日期</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="constitution">体质类型</Label>
              <select
                id="constitution"
                value={constitutionType}
                onChange={(e) => setConstitutionType(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                {CONSTITUTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "提交中..." : "提交"}
          </Button>
        </form>
      )}

      {/* Records table */}
      {selectedResident && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="font-medium mb-3">监测记录</h3>
          {loading ? (
            <p className="text-sm text-gray-400">加载中...</p>
          ) : records.length === 0 ? (
            <p className="text-sm text-gray-400">暂无记录</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2">日期</th>
                  <th className="pb-2">评分</th>
                  <th className="pb-2">体质类型</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2">
                      {new Date(r.monitoringDate).toLocaleDateString("zh-CN")}
                    </td>
                    <td className="py-2">{r.score}</td>
                    <td className="py-2">{r.constitutionType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Score trend chart */}
      {selectedResident && chartData.length >= 2 && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="font-medium mb-3">评分趋势</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#3b82f6"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
