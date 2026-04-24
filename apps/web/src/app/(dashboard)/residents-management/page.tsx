"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { STAFF_ROLES } from "@zhyj/shared";

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

/* ─── Constants ─── */

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

const APPOINTMENT_STATUS_CLASSES: Record<string, string> = {
  booked: "bg-blue-50 text-blue-700 ring-blue-600/20",
  verified: "bg-green-50 text-green-700 ring-green-600/20",
  cancelled: "bg-gray-50 text-gray-500 ring-gray-400/20",
  "no-show": "bg-red-50 text-red-700 ring-red-600/20",
};

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

  // ── Debounced search ──
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Debounce search input
  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // fetchResidents will fire via the useEffect deps (search changed)
    }, 300);
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
      // Fetch full detail (admin/store_manager only)
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

    // Load monitoring tab by default
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
        // Refresh detail and list
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
        // Refresh detail and list
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

  // ── Derived ──
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Loading / auth guard ──
  if (authLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="h-10 w-full bg-gray-200 rounded" />
        <div className="h-64 w-full bg-gray-200 rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <h2 className="text-xl font-semibold text-gray-900 tracking-tight">居民管理</h2>

      {/* ── Search bar ── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            placeholder="搜索姓名或手机号"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams();
            if (search) params.set("search", search);
            const qs = params.toString();
            window.open(`/api/v1/export/residents${qs ? `?${qs}` : ""}`, "_blank");
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          导出
        </button>
      </div>

      {/* ── Error banner ── */}
      {listError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {listError}
          <button type="button" onClick={fetchResidents} className="ml-2 underline hover:no-underline">
            重试
          </button>
        </div>
      )}

      {/* ── Residents table ── */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">姓名</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">手机号</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">注册来源</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">绑定门店</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {listLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skel-${i}`}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : residents.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">
                  暂无居民数据
                </td>
              </tr>
            ) : (
              residents.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => openDetail(r)}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">{r.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{r.phone}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {SOURCE_LABELS[r.registrationSource] || r.registrationSource}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">
                    {r.residentStores.length > 0
                      ? r.residentStores.map((s) => s.store.name).join("、")
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetail(r);
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                    >
                      查看
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* ── Pagination ── */}
        {!listLoading && total > 0 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-sm text-gray-500">
              共 {total} 条，第 {page} / {totalPages} 页
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                上一页
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail slide-over panel ── */}
      {selectedResident && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={closeDetail} />
          {/* Panel */}
          <div className="relative z-10 w-full max-w-lg bg-white shadow-2xl flex flex-col">
            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">居民详情</h3>
              <button
                type="button"
                onClick={closeDetail}
                className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
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
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">基本信息</h4>
                {detailLoading ? (
                  <div className="space-y-2 animate-pulse">
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                    <div className="h-4 bg-gray-100 rounded w-1/2" />
                    <div className="h-4 bg-gray-100 rounded w-2/3" />
                  </div>
                ) : detailError ? (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    {detailError}
                    <button type="button" onClick={() => openDetail(selectedResident)} className="ml-2 underline hover:no-underline">
                      重试
                    </button>
                  </div>
                ) : (
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500">姓名</dt>
                      <dd className="font-medium text-gray-900">{residentDetail?.name || selectedResident.name}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">手机号</dt>
                      <dd className="font-medium text-gray-900">{residentDetail?.phone || selectedResident.phone}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">注册来源</dt>
                      <dd className="text-gray-700">
                        {SOURCE_LABELS[residentDetail?.registrationSource || selectedResident.registrationSource] || selectedResident.registrationSource}
                      </dd>
                    </div>
                    {residentDetail?.createdAt && (
                      <div className="flex justify-between">
                        <dt className="text-gray-500">注册时间</dt>
                        <dd className="text-gray-700">
                          {new Date(residentDetail.createdAt).toLocaleDateString("zh-CN")}
                        </dd>
                      </div>
                    )}
                    {residentDetail?.stats && (
                      <div className="flex justify-between pt-2 border-t border-gray-100">
                        <dt className="text-gray-500">监测次数</dt>
                        <dd className="font-semibold text-blue-600">{residentDetail.stats.monitoringCount}</dd>
                      </div>
                    )}
                    {residentDetail?.stats && (
                      <div className="flex justify-between">
                        <dt className="text-gray-500">预约次数</dt>
                        <dd className="font-semibold text-blue-600">{residentDetail.stats.appointmentCount}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </div>

              {/* Store bindings */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">绑定门店</h4>
                  {canManage && (
                    <button
                      type="button"
                      onClick={openBindModal}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                    >
                      + 绑定门店
                    </button>
                  )}
                </div>
                {(residentDetail?.stores || selectedResident.residentStores.map((s) => ({ id: s.store.id, name: s.store.name }))).length === 0 ? (
                  <p className="text-sm text-gray-400">暂无绑定门店</p>
                ) : (
                  <ul className="space-y-2">
                    {(residentDetail?.stores || selectedResident.residentStores.map((s) => ({ id: s.store.id, name: s.store.name }))).map((store) => (
                      <li key={store.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                        <span className="text-sm font-medium text-gray-900">{store.name}</span>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => confirmUnbind(store.id, store.name)}
                            className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
                          >
                            解绑
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Tabs: monitoring history / appointments */}
              <div>
                <div className="flex border-b border-gray-200">
                  <button
                    type="button"
                    onClick={() => handleTabChange("monitoring")}
                    className={`flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === "monitoring"
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    监测记录
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabChange("appointments")}
                    className={`flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === "appointments"
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    预约记录
                  </button>
                </div>

                {/* Tab error */}
                {tabError && (
                  <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    {tabError}
                  </div>
                )}

                {/* Tab content */}
                <div className="mt-3">
                  {tabLoading ? (
                    <div className="space-y-2 animate-pulse">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-12 bg-gray-100 rounded" />
                      ))}
                    </div>
                  ) : activeTab === "monitoring" ? (
                    monitoringRecords.length === 0 ? (
                      <p className="text-sm text-gray-400 py-4 text-center">暂无监测记录</p>
                    ) : (
                      <div className="space-y-2">
                        {monitoringRecords.map((record) => (
                          <div key={record.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                评分: <span className={record.score >= 80 ? "text-green-600" : record.score >= 60 ? "text-yellow-600" : "text-red-600"}>{record.score}</span>
                              </p>
                              {record.constitutionType && (
                                <p className="text-xs text-gray-500">{record.constitutionType}</p>
                              )}
                            </div>
                            <span className="text-xs text-gray-400">
                              {new Date(record.monitoringDate).toLocaleDateString("zh-CN")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  ) : // appointments tab
                  appointmentRecords.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center">暂无预约记录</p>
                  ) : (
                    <div className="space-y-2">
                      {appointmentRecords.map((apt) => (
                        <div key={apt.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {new Date(apt.scheduledAt).toLocaleString("zh-CN", {
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                            <p className="text-xs text-gray-500">
                              {apt.room?.name || "未分配房间"}
                              {apt.machine?.name ? ` · ${apt.machine.name}` : ""}
                            </p>
                          </div>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${APPOINTMENT_STATUS_CLASSES[apt.status] || "bg-gray-50 text-gray-500 ring-gray-400/20"}`}>
                            {APPOINTMENT_STATUS_LABELS[apt.status] || apt.status}
                          </span>
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
      {showBindModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowBindModal(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-xl bg-white shadow-2xl ring-1 ring-gray-900/5">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">绑定门店</h3>
            </div>
            <div className="p-6 space-y-4">
              {bindError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {bindError}
                </div>
              )}
              <div>
                <label htmlFor="bind-store-select" className="block text-sm font-medium text-gray-700 mb-1">
                  选择门店
                </label>
                {storesLoading ? (
                  <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                ) : (
                  <select
                    id="bind-store-select"
                    value={selectedStoreId}
                    onChange={(e) => setSelectedStoreId(e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  >
                    <option value="">请选择门店</option>
                    {storeOptions.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBindModal(false)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={!selectedStoreId || bindSubmitting}
                  onClick={handleBindSubmit}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {bindSubmitting && (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  确认绑定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Unbind confirmation dialog ── */}
      {unbindTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setUnbindTarget(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-xl bg-white shadow-2xl ring-1 ring-gray-900/5 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">确认解绑</h3>
            <p className="text-sm text-gray-600 mb-6">
              确定要将居民「{unbindTarget.residentName}」从门店「{unbindTarget.storeName}」解绑吗？
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setUnbindTarget(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                disabled={unbindSubmitting}
                onClick={handleUnbindConfirm}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {unbindSubmitting && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                确认解绑
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
