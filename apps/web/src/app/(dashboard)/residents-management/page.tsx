"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Download } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { STAFF_ROLES } from "@zhyj/shared";
import { cn } from "@/lib/utils";
import { DataTable, type Column } from "@/components/data-table";
import { FormModal } from "@/components/form-modal";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* ─── Types ─── */

interface StoreInfo {
  storeId: string;
  store: { id: string; name: string };
}

interface ResidentRecord {
  id: string;
  name: string;
  phone: string;
  registrationSource: string;
  residentStores: StoreInfo[];
}

interface ResidentListResponse {
  success: boolean;
  data: {
    records: ResidentRecord[];
    total: number;
    limit: number;
    offset: number;
  };
}

interface ResidentDetail {
  id: string;
  name: string;
  phone: string;
  registrationSource: string;
  createdAt: string;
  stores: { id: string; name: string }[];
  stats: {
    monitoringCount: number;
    appointmentCount: number;
  };
  residentStores: StoreInfo[];
}

interface MonitoringRecord {
  id: string;
  score: number;
  monitoringDate: string;
  constitutionType: string | null;
}

interface AppointmentRecord {
  id: string;
  scheduledAt: string;
  status: string;
  room: { id: string; name: string; capacity: number } | null;
  machine: { id: string; name: string; status: string } | null;
  staff: { id: string; name: string } | null;
}

interface StoreOption {
  id: string;
  name: string;
}

/* ─── Constants (Apple design tokens) ─── */

const SOURCE_LABELS: Record<string, string> = {
  "walk-in": "现场登记",
  wechat: "微信注册",
  referral: "转介绍",
};

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  booked: "已预约",
  verified: "已核销",
  cancelled: "已取消",
  "no-show": "爽约",
};

const APPOINTMENT_STATUS_COLORS: Record<string, string> = {
  booked: "bg-primary/10 text-primary ring-primary/20",
  verified: "bg-apple-success/10 text-apple-success ring-apple-success/20",
  cancelled: "bg-muted text-muted-foreground ring-muted-foreground/20",
  "no-show": "bg-apple-error/10 text-apple-error ring-apple-error/20",
};

const SCORE_COLOR_MAP: Record<string, string> = {
  high: "text-apple-success",
  medium: "text-apple-warning",
  low: "text-apple-error",
};

function getScoreColorClass(score: number): string {
  if (score >= 80) return SCORE_COLOR_MAP.high;
  if (score >= 60) return SCORE_COLOR_MAP.medium;
  return SCORE_COLOR_MAP.low;
}

const PAGE_SIZE = 20;

/* ─── Page Component ─── */

export default function ResidentsManagementPage() {
  const { user, loading: authLoading } = useAuth();
  const role = user?.role;

  // ── List state ──
  const [residents, setResidents] = useState<ResidentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  // ── Detail slide-over state ──
  const [selectedResident, setSelectedResident] = useState<ResidentRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [residentDetail, setResidentDetail] = useState<ResidentDetail | null>(null);
  const [activeTab, setActiveTab] = useState<"monitoring" | "appointments">("monitoring");
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState("");
  const [monitoringRecords, setMonitoringRecords] = useState<MonitoringRecord[]>([]);
  const [appointmentRecords, setAppointmentRecords] = useState<AppointmentRecord[]>([]);

  // ── Bind store modal state ──
  const [showBindModal, setShowBindModal] = useState(false);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [bindSubmitting, setBindSubmitting] = useState(false);
  const [bindError, setBindError] = useState("");

  // ── Unbind confirmation state ──
  const [unbindTarget, setUnbindTarget] = useState<{
    residentId: string;
    residentName: string;
    storeId: string;
    storeName: string;
  } | null>(null);
  const [unbindSubmitting, setUnbindSubmitting] = useState(false);

  const canManage = role === STAFF_ROLES.ADMIN || role === STAFF_ROLES.STORE_MANAGER;

  // ── Fetch residents list ──
  const fetchResidents = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (search) params.set("search", search);

      const res = await fetch(`/api/v1/residents?${params}`, { credentials: "include" });
      const json: ResidentListResponse = await res.json();

      if (json.success) {
        setResidents(json.data.records);
        setTotal(json.data.total);
      } else {
        setListError("获取居民列表失败");
      }
    } catch {
      setListError("网络错误，请重试");
    } finally {
      setListLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    if (!authLoading) fetchResidents();
  }, [fetchResidents, authLoading]);

  // ── Search handler ──
  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  // ── Export handler ──
  function handleExport() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const qs = params.toString();
    window.open(`/api/v1/export/residents${qs ? `?${qs}` : ""}`, "_blank");
  }

  // ── Detail panel ──

  async function openDetail(resident: ResidentRecord) {
    setSelectedResident(resident);
    setResidentDetail(null);
    setActiveTab("monitoring");
    setMonitoringRecords([]);
    setAppointmentRecords([]);
    setDetailError("");
    setTabError("");

    if (canManage) {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/v1/residents/${resident.id}`, { credentials: "include" });
        const json = await res.json();
        if (json.success) {
          setResidentDetail(json.data);
        } else {
          setDetailError("获取居民详情失败");
        }
      } catch {
        setDetailError("网络错误，请重试");
      } finally {
        setDetailLoading(false);
      }
    }

    await fetchMonitoringTab(resident.id);
  }

  function closeDetail() {
    setSelectedResident(null);
    setResidentDetail(null);
    setMonitoringRecords([]);
    setAppointmentRecords([]);
    setDetailError("");
    setTabError("");
  }

  async function fetchMonitoringTab(residentId: string) {
    setTabLoading(true);
    setTabError("");
    try {
      const res = await fetch(
        `/api/v1/residents/${residentId}/monitoring-history?limit=20&offset=0`,
        { credentials: "include" }
      );
      const json = await res.json();
      if (json.success) {
        setMonitoringRecords(json.data.records);
      } else {
        setTabError("获取监测记录失败");
      }
    } catch {
      setTabError("网络错误，请重试");
    } finally {
      setTabLoading(false);
    }
  }

  async function fetchAppointmentsTab(residentId: string) {
    setTabLoading(true);
    setTabError("");
    try {
      const res = await fetch(
        `/api/v1/appointments?residentId=${residentId}&limit=20&offset=0`,
        { credentials: "include" }
      );
      const json = await res.json();
      if (json.success) {
        setAppointmentRecords(json.data.records);
      } else {
        setTabError("获取预约记录失败");
      }
    } catch {
      setTabError("网络错误，请重试");
    } finally {
      setTabLoading(false);
    }
  }

  async function handleTabChange(tab: "monitoring" | "appointments") {
    setActiveTab(tab);
    if (!selectedResident) return;
    if (tab === "monitoring") {
      await fetchMonitoringTab(selectedResident.id);
    } else {
      await fetchAppointmentsTab(selectedResident.id);
    }
  }

  // ── Bind store modal ──

  async function openBindModal() {
    if (!selectedResident) return;
    setShowBindModal(true);
    setSelectedStoreId("");
    setBindError("");
    setStoresLoading(true);
    try {
      const res = await fetch("/api/v1/auth/staff/stores", { credentials: "include" });
      const json = await res.json();
      if (json.success) {
        setStoreOptions(json.data.stores || []);
      }
    } catch {
      // silently fail
    } finally {
      setStoresLoading(false);
    }
  }

  async function handleBindSubmit() {
    if (!selectedResident || !selectedStoreId) return;
    setBindSubmitting(true);
    setBindError("");
    try {
      const res = await fetch(`/api/v1/residents/${selectedResident.id}/bind-store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId: selectedStoreId }),
      });
      const json = await res.json();
      if (json.success) {
        setShowBindModal(false);
        if (selectedResident) {
          const detailRes = await fetch(`/api/v1/residents/${selectedResident.id}`, { credentials: "include" });
          const detailJson = await detailRes.json();
          if (detailJson.success) setResidentDetail(detailJson.data);
        }
        fetchResidents();
      } else {
        setBindError(json.error?.message || "绑定失败");
      }
    } catch {
      setBindError("网络错误，请重试");
    } finally {
      setBindSubmitting(false);
    }
  }

  // ── Unbind confirmation ──

  function confirmUnbind(storeId: string, storeName: string) {
    if (!selectedResident) return;
    setUnbindTarget({
      residentId: selectedResident.id,
      residentName: selectedResident.name,
      storeId,
      storeName,
    });
  }

  async function handleUnbindConfirm() {
    if (!unbindTarget) return;
    setUnbindSubmitting(true);
    try {
      const res = await fetch(`/api/v1/residents/${unbindTarget.residentId}/bind-store`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId: unbindTarget.storeId }),
      });
      const json = await res.json();
      if (json.success) {
        setUnbindTarget(null);
        if (selectedResident) {
          const detailRes = await fetch(`/api/v1/residents/${selectedResident.id}`, { credentials: "include" });
          const detailJson = await detailRes.json();
          if (detailJson.success) setResidentDetail(detailJson.data);
        }
        fetchResidents();
      }
    } catch {
      // silently fail
    } finally {
      setUnbindSubmitting(false);
    }
  }

  // ── Column definitions (MEM074: inside component body) ──
  const columns: Column<ResidentRecord>[] = [
    {
      key: "name",
      header: "姓名",
      render: (r) => (
        <span className="font-medium text-foreground">{r.name}</span>
      ),
    },
    { key: "phone", header: "手机号" },
    {
      key: "registrationSource",
      header: "注册来源",
      render: (r) => (
        <span className="text-muted-foreground">
          {SOURCE_LABELS[r.registrationSource] || r.registrationSource}
        </span>
      ),
    },
    {
      key: "stores",
      header: "绑定门店",
      render: (r) => (
        <span className="text-muted-foreground max-w-[200px] truncate block">
          {r.residentStores.length > 0
            ? r.residentStores.map((s) => s.store.name).join("、")
            : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "操作",
      className: "text-right",
      render: (r) => (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-primary hover:text-primary/80"
          onClick={(e) => {
            e.stopPropagation();
            openDetail(r);
          }}
        >
          查看
        </Button>
      ),
    },
  ];

  // ── Export button for DataTable actions slot ──
  const exportButton = (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="h-4 w-4" />
      导出
    </Button>
  );

  // ── Resolved store list for detail panel ──
  const detailStores = residentDetail?.stores ||
    selectedResident?.residentStores.map((s) => ({ id: s.store.id, name: s.store.name })) || [];

  // ── Loading skeleton ──
  if (authLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 animate-pulse">
          <div className="h-7 w-48 bg-muted rounded" />
        </div>
        <div className="h-10 w-full bg-muted rounded-lg" />
        <div className="h-64 w-full bg-muted rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <PageHeader title="居民管理" />

      {/* ── Data table with search and export ── */}
      <div
        className="bg-card rounded-xl border border-border shadow-sm p-6"
        onClick={(e) => {
          // Allow DataTable row clicks to propagate for openDetail
          const target = e.target as HTMLElement;
          if (target.closest("button") || target.closest("a") || target.closest("select") || target.closest("input")) return;
          // Only handle clicks on table rows — not search, pagination, or actions
        }}
      >
        <DataTable
          columns={columns}
          data={residents}
          loading={listLoading}
          error={listError}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          onSearch={handleSearchChange}
          searchPlaceholder="搜索姓名或手机号"
          onRetry={fetchResidents}
          emptyMessage="暂无居民数据"
          actions={exportButton}
        />
      </div>

      {/* ── Detail slide-over panel ── */}
      {selectedResident && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeDetail}
          />
          {/* Panel */}
          <div className="relative z-10 w-full max-w-lg bg-card shadow-2xl flex flex-col">
            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">居民详情</h3>
              <button
                type="button"
                onClick={closeDetail}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              {/* Basic info */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  基本信息
                </h4>
                {detailLoading ? (
                  <div className="space-y-2 animate-pulse">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                    <div className="h-4 bg-muted rounded w-2/3" />
                  </div>
                ) : detailError ? (
                  <div className="rounded-lg bg-apple-error/10 border border-apple-error/20 px-3 py-2 text-sm text-apple-error">
                    {detailError}
                    <button
                      type="button"
                      onClick={() => openDetail(selectedResident)}
                      className="ml-2 underline hover:no-underline"
                    >
                      重试
                    </button>
                  </div>
                ) : (
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">姓名</dt>
                      <dd className="font-medium text-foreground">
                        {residentDetail?.name || selectedResident.name}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">手机号</dt>
                      <dd className="font-medium text-foreground">
                        {residentDetail?.phone || selectedResident.phone}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">注册来源</dt>
                      <dd className="text-foreground/80">
                        {SOURCE_LABELS[residentDetail?.registrationSource || selectedResident.registrationSource] || selectedResident.registrationSource}
                      </dd>
                    </div>
                    {residentDetail?.createdAt && (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">注册时间</dt>
                        <dd className="text-foreground/80">
                          {new Date(residentDetail.createdAt).toLocaleDateString("zh-CN")}
                        </dd>
                      </div>
                    )}
                    {residentDetail?.stats && (
                      <>
                        <div className="flex justify-between pt-2 border-t border-border">
                          <dt className="text-muted-foreground">监测次数</dt>
                          <dd className="font-semibold text-primary">
                            {residentDetail.stats.monitoringCount}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">预约次数</dt>
                          <dd className="font-semibold text-primary">
                            {residentDetail.stats.appointmentCount}
                          </dd>
                        </div>
                      </>
                    )}
                  </dl>
                )}
              </div>

              {/* Store bindings */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    绑定门店
                  </h4>
                  {canManage && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-primary hover:text-primary/80"
                      onClick={openBindModal}
                    >
                      + 绑定门店
                    </Button>
                  )}
                </div>
                {detailStores.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无绑定门店</p>
                ) : (
                  <ul className="space-y-2">
                    {detailStores.map((store) => (
                      <li
                        key={store.id}
                        className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                      >
                        <span className="text-sm font-medium text-foreground">{store.name}</span>
                        {canManage && (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-apple-error hover:text-apple-error/80"
                            onClick={() => confirmUnbind(store.id, store.name)}
                          >
                            解绑
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Tabs: monitoring history / appointments */}
              <div>
                <div className="flex border-b border-border">
                  <button
                    type="button"
                    onClick={() => handleTabChange("monitoring")}
                    className={cn(
                      "flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                      activeTab === "monitoring"
                        ? "text-foreground border-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    监测记录
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabChange("appointments")}
                    className={cn(
                      "flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                      activeTab === "appointments"
                        ? "text-foreground border-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    预约记录
                  </button>
                </div>

                {/* Tab error */}
                {tabError && (
                  <div className="mt-3 rounded-lg bg-apple-error/10 border border-apple-error/20 px-3 py-2 text-sm text-apple-error">
                    {tabError}
                  </div>
                )}

                {/* Tab content */}
                <div className="mt-3">
                  {tabLoading ? (
                    <div className="space-y-2 animate-pulse">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-12 bg-muted rounded" />
                      ))}
                    </div>
                  ) : activeTab === "monitoring" ? (
                    monitoringRecords.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">暂无监测记录</p>
                    ) : (
                      <div className="space-y-2">
                        {monitoringRecords.map((record) => (
                          <div
                            key={record.id}
                            className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                评分:{" "}
                                <span className={getScoreColorClass(record.score)}>
                                  {record.score}
                                </span>
                              </p>
                              {record.constitutionType && (
                                <p className="text-xs text-muted-foreground">{record.constitutionType}</p>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(record.monitoringDate).toLocaleDateString("zh-CN")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  ) : appointmentRecords.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">暂无预约记录</p>
                  ) : (
                    <div className="space-y-2">
                      {appointmentRecords.map((apt) => (
                        <div
                          key={apt.id}
                          className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {new Date(apt.scheduledAt).toLocaleString("zh-CN", {
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {apt.room?.name || "未分配房间"}
                              {apt.machine?.name ? ` · ${apt.machine.name}` : ""}
                            </p>
                          </div>
                          <StatusBadge
                            status={apt.status}
                            colorMap={APPOINTMENT_STATUS_COLORS}
                            labelMap={APPOINTMENT_STATUS_LABELS}
                            variant="ring"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bind store modal ── */}
      <FormModal
        open={showBindModal}
        onOpenChange={(open) => {
          if (!open) setShowBindModal(false);
        }}
        title="绑定门店"
        onSubmit={handleBindSubmit}
        submitting={bindSubmitting}
        error={bindError}
        submitLabel="确认绑定"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">选择门店</label>
            {storesLoading ? (
              <div className="h-10 bg-muted rounded-lg animate-pulse" />
            ) : (
              <Select
                value={selectedStoreId}
                onValueChange={setSelectedStoreId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择门店" />
                </SelectTrigger>
                <SelectContent>
                  {storeOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </FormModal>

      {/* ── Unbind confirmation dialog ── */}
      <FormModal
        open={!!unbindTarget}
        onOpenChange={(open) => {
          if (!open) setUnbindTarget(null);
        }}
        title="确认解绑"
        description={
          unbindTarget
            ? `确定要将居民「${unbindTarget.residentName}」从门店「${unbindTarget.storeName}」解绑吗？`
            : undefined
        }
        onSubmit={handleUnbindConfirm}
        submitting={unbindSubmitting}
        submitLabel="确认解绑"
      >
        <></>
      </FormModal>
    </div>
  );
}
