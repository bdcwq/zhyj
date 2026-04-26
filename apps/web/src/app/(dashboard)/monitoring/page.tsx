"use client";

import { useState, useEffect, useCallback } from "react";
import { Download } from "lucide-react";
import { CONSTITUTION_TYPES } from "@zhyj/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { ErrorBanner } from "@/components/error-banner";
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

  const columns: Column<MonitoringRecord>[] = [
    {
      key: "monitoringDate",
      header: "日期",
      render: (row) => new Date(row.monitoringDate).toLocaleDateString("zh-CN"),
    },
    {
      key: "score",
      header: "评分",
      render: (row) => row.score,
    },
    {
      key: "constitutionType",
      header: "体质类型",
      render: (row) => row.constitutionType,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="体质监测"
        description="居民体质监测记录与评分趋势"
        actions={
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
            <Download className="mr-1.5 h-4 w-4" />
            导出
          </Button>
        }
      />

      {/* Resident search */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-6">
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
                className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex justify-between"
              >
                <span>{r.name}</span>
                <span className="text-muted-foreground">{r.phone}</span>
              </button>
            ))}
          </div>
        )}
        {selectedResident && (
          <p className="mt-2 text-sm text-foreground">
            当前居民：{residents.find((r) => r.id === selectedResident)?.name}
          </p>
        )}
      </div>

      {/* Monitoring form */}
      {selectedResident && (
        <form onSubmit={handleSubmit} className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-3">
          <h3 className="font-medium text-foreground">新增监测记录</h3>
          {error && <ErrorBanner message={error} />}
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
        <DataTable
          columns={columns}
          data={records}
          loading={loading}
          onRetry={() => loadRecords(selectedResident)}
          emptyMessage="暂无监测记录"
        />
      )}

      {/* Score trend chart */}
      {selectedResident && chartData.length >= 2 && (
        <div className="bg-card rounded-xl border border-border shadow-sm p-6">
          <h3 className="font-medium mb-3 text-foreground">评分趋势</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))" }} />
              <YAxis domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="score"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
