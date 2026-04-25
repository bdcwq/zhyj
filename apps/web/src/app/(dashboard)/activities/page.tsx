"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { FormEvent } from "react";

/* ─── Types ─── */

interface ActivityRecord {
  id: string;
  name: string;
  description: string | null;
  type: string;
  customType: string | null;
  activityDate: string;
  startTime: string;
  endTime: string;
  maxCapacity: number;
  currentCapacity: number;
  liveStreamUrl: string | null;
  status: string;
  instructorId: string | null;
  instructor: { id: string; name: string } | null;
}

interface ActivityListResponse {
  success: boolean;
  data: {
    records: ActivityRecord[];
    total: number;
    limit: number;
    offset: number;
  };
}

interface StaffRecord {
  id: string;
  name: string;
  role: string;
}

interface StaffListResponse {
  success: boolean;
  data: {
    records: StaffRecord[];
    total: number;
  };
}

interface ModalForm {
  name: string;
  description: string;
  type: string;
  customType: string;
  activityDate: string;
  startTime: string;
  endTime: string;
  maxCapacity: string;
  liveStreamUrl: string;
  instructorId: string;
}

/* ─── Constants ─── */

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  course: "课程",
  exercise: "运动",
  experience: "体验",
  live_stream: "直播",
  custom: "自定义",
};

const ACTIVITY_TYPE_OPTIONS = [
  { value: "course", label: "课程" },
  { value: "exercise", label: "运动" },
  { value: "experience", label: "体验" },
  { value: "live_stream", label: "直播" },
  { value: "custom", label: "自定义" },
];

const ACTIVITY_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
  completed: "已完成",
  cancelled: "已取消",
};

const ACTIVITY_STATUS_BADGE_CLASSES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  published: "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "draft", label: "草稿" },
  { value: "published", label: "已发布" },
  { value: "completed", label: "已完成" },
  { value: "cancelled", label: "已取消" },
];

const TYPE_FILTER_OPTIONS = [
  { value: "", label: "全部类型" },
  { value: "course", label: "课程" },
  { value: "exercise", label: "运动" },
  { value: "experience", label: "体验" },
  { value: "live_stream", label: "直播" },
  { value: "custom", label: "自定义" },
];

const EMPTY_FORM: ModalForm = {
  name: "",
  description: "",
  type: "course",
  customType: "",
  activityDate: "",
  startTime: "09:00",
  endTime: "10:00",
  maxCapacity: "20",
  liveStreamUrl: "",
  instructorId: "",
};

const PAGE_SIZE = 20;

const DAY_LABELS = [
  "周一",
  "周二",
  "周三",
  "周四",
  "周五",
  "周六",
  "周日",
];

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatActivityDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

/* ─── Spinner ─── */

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/* ─── ActivityList Component ─── */

function ActivityList() {
  // ── List state ──
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  // ── Modal state ──
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingActivity, setEditingActivity] = useState<ActivityRecord | null>(null);
  const [form, setForm] = useState<ModalForm>(EMPTY_FORM);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // ── Staff list for instructor dropdown ──
  const [staffList, setStaffList] = useState<StaffRecord[]>([]);

  // ── Debounced search ──
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchActivities = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);

      const res = await fetch(`/api/v1/activities?${params}`, {
        credentials: "include",
      });
      const json: ActivityListResponse = await res.json();

      if (json.success) {
        setActivities(json.data.records);
        setTotal(json.data.total);
      } else {
        setListError("获取活动列表失败");
      }
    } catch {
      setListError("网络错误，请重试");
    } finally {
      setListLoading(false);
    }
  }, [page, search, statusFilter, typeFilter]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // Fetch staff list for instructor dropdown
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/v1/staff?pageSize=100", {
          credentials: "include",
        });
        const json: StaffListResponse = await res.json();
        if (json.success) {
          setStaffList(json.data.records);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // fetchActivities will fire via the useEffect deps
    }, 300);
  }

  // ── Modal handlers ──

  function openCreateModal() {
    setModalMode("create");
    setEditingActivity(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setShowModal(true);
  }

  function openEditModal(activity: ActivityRecord) {
    setModalMode("edit");
    setEditingActivity(activity);
    setForm({
      name: activity.name,
      description: activity.description || "",
      type: activity.type,
      customType: activity.customType || "",
      activityDate: activity.activityDate.split("T")[0],
      startTime: activity.startTime,
      endTime: activity.endTime,
      maxCapacity: String(activity.maxCapacity),
      liveStreamUrl: activity.liveStreamUrl || "",
      instructorId: activity.instructorId || "",
    });
    setFormError("");
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingActivity(null);
    setFormError("");
  }

  function updateForm(field: keyof ModalForm, value: string) {
    setForm((prev: ModalForm) => ({ ...prev, [field]: value }));
    setFormError("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setFormSubmitting(true);

    try {
      // Client-side validation
      if (!form.name.trim()) {
        setFormError("请输入活动名称");
        setFormSubmitting(false);
        return;
      }
      if (form.name.trim().length > 100) {
        setFormError("活动名称不能超过100个字符");
        setFormSubmitting(false);
        return;
      }
      if (!form.activityDate) {
        setFormError("请选择活动日期");
        setFormSubmitting(false);
        return;
      }
      if (form.endTime <= form.startTime) {
        setFormError("结束时间必须晚于开始时间");
        setFormSubmitting(false);
        return;
      }
      const maxCap = Number(form.maxCapacity);
      if (!maxCap || isNaN(maxCap) || maxCap < 1 || maxCap > 500) {
        setFormError("最大人数必须为1-500的数字");
        setFormSubmitting(false);
        return;
      }
      if (form.type === "custom" && !form.customType.trim()) {
        setFormError("自定义类型需要填写类型名称");
        setFormSubmitting(false);
        return;
      }

      if (modalMode === "create") {
        const res = await fetch("/api/v1/activities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            type: form.type,
            customType: form.type === "custom" ? form.customType.trim() : undefined,
            activityDate: form.activityDate,
            startTime: form.startTime,
            endTime: form.endTime,
            maxCapacity: maxCap,
            liveStreamUrl: form.liveStreamUrl.trim() || undefined,
            instructorId: form.instructorId || undefined,
          }),
        });
        const json = await res.json();
        if (!json.success) {
          setFormError(json.error?.message || "创建失败");
        } else {
          closeModal();
          fetchActivities();
        }
      } else {
        if (!editingActivity) return;
        const body: Record<string, unknown> = {};
        if (form.name.trim() !== editingActivity.name) body.name = form.name.trim();
        if ((form.description.trim() || null) !== (editingActivity.description || null)) body.description = form.description.trim() || null;
        if (form.activityDate !== editingActivity.activityDate.split("T")[0]) body.activityDate = form.activityDate;
        if (form.startTime !== editingActivity.startTime) body.startTime = form.startTime;
        if (form.endTime !== editingActivity.endTime) body.endTime = form.endTime;
        if (maxCap !== editingActivity.maxCapacity) body.maxCapacity = maxCap;
        if (form.liveStreamUrl !== (editingActivity.liveStreamUrl || "")) body.liveStreamUrl = form.liveStreamUrl.trim() || null;
        if (form.instructorId !== (editingActivity.instructorId || "")) body.instructorId = form.instructorId || null;
        if (form.type === "custom" && form.customType.trim() !== (editingActivity.customType || "")) body.customType = form.customType.trim();

        if (Object.keys(body).length === 0) {
          closeModal();
          setFormSubmitting(false);
          return;
        }

        const res = await fetch(`/api/v1/activities/${editingActivity.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!json.success) {
          setFormError(json.error?.message || "更新失败");
        } else {
          closeModal();
          fetchActivities();
        }
      }
    } catch {
      setFormError("网络错误，请重试");
    } finally {
      setFormSubmitting(false);
    }
  }

  // ── Status transition ──
  async function handleStatusTransition(activity: ActivityRecord, newStatus: string) {
    // Status transitions are handled via PUT with status field (if supported)
    // For draft → published, published → completed/cancelled
    try {
      const res = await fetch(`/api/v1/activities/${activity.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.success) {
        fetchActivities();
      }
    } catch {
      // silently fail
    }
  }

  // ── Derived ──
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* ── Header + filters ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {TYPE_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          添加活动
        </button>
      </div>

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
            placeholder="搜索活动名称"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* ── Error banner ── */}
      {listError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {listError}
          <button type="button" onClick={fetchActivities} className="ml-2 underline hover:no-underline">
            重试
          </button>
        </div>
      )}

      {/* ── Activities table ── */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                活动名称
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                类型
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                日期
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                时间
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                容量
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                状态
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {listLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skel-${i}`}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div
                        className="h-4 bg-gray-100 rounded animate-pulse"
                        style={{ width: `${60 + Math.random() * 40}%` }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : activities.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                  暂无活动数据
                </td>
              </tr>
            ) : (
              activities.map((activity) => (
                <tr key={activity.id} className="hover:bg-gray-50 transition-colors">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 max-w-[200px] truncate">
                    {activity.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {activity.type === "custom"
                      ? activity.customType || "自定义"
                      : ACTIVITY_TYPE_LABELS[activity.type] || activity.type}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {formatActivityDate(activity.activityDate)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {activity.startTime}-{activity.endTime}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {activity.currentCapacity}/{activity.maxCapacity}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ACTIVITY_STATUS_BADGE_CLASSES[activity.status] || "bg-gray-100 text-gray-700"}`}>
                      {ACTIVITY_STATUS_LABELS[activity.status] || activity.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right space-x-2">
                    {(activity.status === "draft" || activity.status === "published") && (
                      <button
                        type="button"
                        onClick={() => openEditModal(activity)}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                      >
                        编辑
                      </button>
                    )}
                    {activity.status === "draft" && (
                      <button
                        type="button"
                        onClick={() => handleStatusTransition(activity, "published")}
                        className="text-sm text-green-600 hover:text-green-800 font-medium transition-colors"
                      >
                        发布
                      </button>
                    )}
                    {activity.status === "published" && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleStatusTransition(activity, "completed")}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                        >
                          完成
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusTransition(activity, "cancelled")}
                          className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
                        >
                          取消
                        </button>
                      </>
                    )}
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

      {/* ── Create / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeModal}
          />
          {/* Dialog */}
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-white shadow-2xl ring-1 ring-gray-900/5 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">
                {modalMode === "create" ? "添加活动" : "编辑活动"}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {formError}
                </div>
              )}

              {/* Name */}
              <div>
                <label htmlFor="activity-name" className="block text-sm font-medium text-gray-700 mb-1">
                  活动名称 <span className="text-red-500">*</span>
                </label>
                <input
                  id="activity-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm("name", e.target.value)}
                  maxLength={100}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="请输入活动名称"
                />
              </div>

              {/* Type */}
              <div>
                <label htmlFor="activity-type" className="block text-sm font-medium text-gray-700 mb-1">
                  活动类型 <span className="text-red-500">*</span>
                </label>
                <select
                  id="activity-type"
                  value={form.type}
                  onChange={(e) => updateForm("type", e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                >
                  {ACTIVITY_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Custom type (only when type=custom) */}
              {form.type === "custom" && (
                <div>
                  <label htmlFor="activity-custom-type" className="block text-sm font-medium text-gray-700 mb-1">
                    自定义类型名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="activity-custom-type"
                    type="text"
                    value={form.customType}
                    onChange={(e) => updateForm("customType", e.target.value)}
                    maxLength={50}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    placeholder="例如：舞蹈课"
                  />
                </div>
              )}

              {/* Description */}
              <div>
                <label htmlFor="activity-description" className="block text-sm font-medium text-gray-700 mb-1">
                  活动描述
                </label>
                <textarea
                  id="activity-description"
                  value={form.description}
                  onChange={(e) => updateForm("description", e.target.value)}
                  maxLength={500}
                  rows={3}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none"
                  placeholder="请输入活动描述（选填）"
                />
              </div>

              {/* Date + Time row */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="activity-date" className="block text-sm font-medium text-gray-700 mb-1">
                    活动日期 <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="activity-date"
                    type="date"
                    value={form.activityDate}
                    onChange={(e) => updateForm("activityDate", e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="activity-start" className="block text-sm font-medium text-gray-700 mb-1">
                    开始时间 <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="activity-start"
                    type="time"
                    value={form.startTime}
                    onChange={(e) => updateForm("startTime", e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="activity-end" className="block text-sm font-medium text-gray-700 mb-1">
                    结束时间 <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="activity-end"
                    type="time"
                    value={form.endTime}
                    onChange={(e) => updateForm("endTime", e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                </div>
              </div>

              {/* Capacity + Instructor row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="activity-capacity" className="block text-sm font-medium text-gray-700 mb-1">
                    最大人数 <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="activity-capacity"
                    type="number"
                    min={1}
                    max={500}
                    value={form.maxCapacity}
                    onChange={(e) => updateForm("maxCapacity", e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    placeholder="1-500"
                  />
                </div>
                <div>
                  <label htmlFor="activity-instructor" className="block text-sm font-medium text-gray-700 mb-1">
                    授课员工
                  </label>
                  <select
                    id="activity-instructor"
                    value={form.instructorId}
                    onChange={(e) => updateForm("instructorId", e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  >
                    <option value="">不指定</option>
                    {staffList.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Live stream URL (shown for live_stream type, but always available) */}
              <div>
                <label htmlFor="activity-livestream" className="block text-sm font-medium text-gray-700 mb-1">
                  直播链接
                </label>
                <input
                  id="activity-livestream"
                  type="url"
                  value={form.liveStreamUrl}
                  onChange={(e) => updateForm("liveStreamUrl", e.target.value)}
                  maxLength={500}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="https://...（选填）"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {formSubmitting && <Spinner />}
                  {modalMode === "create" ? "创建" : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── WeeklyTimetable Component ─── */

function WeeklyTimetable() {
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Fetch activities for the week range — no limit to get all
      const params = new URLSearchParams({
        dateFrom: formatDate(weekStart),
        dateTo: formatDate(weekEnd),
        limit: "100",
        offset: "0",
      });
      if (typeFilter) params.set("type", typeFilter);

      const res = await fetch(`/api/v1/activities?${params}`, {
        credentials: "include",
      });
      const json: ActivityListResponse = await res.json();
      if (json.success) {
        setActivities(json.data.records);
      } else {
        setError("获取活动数据失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd, typeFilter]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // Week day headers
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return {
      date: formatDate(d),
      label: DAY_LABELS[i],
      isToday: formatDate(d) === formatDate(new Date()),
    };
  });

  // Build lookup: date -> ActivityRecord[]
  const dayMap = new Map<string, ActivityRecord[]>();
  for (const a of activities) {
    const dateKey = a.activityDate.split("T")[0];
    if (!dayMap.has(dateKey)) dayMap.set(dateKey, []);
    dayMap.get(dateKey)!.push(a);
  }

  // Sort each day's activities by startTime
  for (const [, dayActivities] of dayMap) {
    dayActivities.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  function goToPrevWeek() {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }

  function goToNextWeek() {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }

  function goToCurrentWeek() {
    setWeekStart(getMonday(new Date()));
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">
          按周查看活动课表安排
        </p>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        >
          <option value="">全部类型</option>
          {ACTIVITY_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={goToPrevWeek}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          ← 上一周
        </button>
        <span className="text-sm font-medium text-gray-900 min-w-[220px] text-center">
          {formatDate(weekStart)} ~ {formatDate(weekEnd)}
        </span>
        <button
          type="button"
          onClick={goToNextWeek}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          下一周 →
        </button>
        <button
          type="button"
          onClick={goToCurrentWeek}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          今天
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
          <button type="button" onClick={fetchActivities} className="ml-2 underline hover:no-underline">
            重试
          </button>
        </div>
      )}

      {/* Timetable grid */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-12 space-y-3 animate-pulse">
            <div className="h-6 bg-gray-100 rounded w-1/2" />
            <div className="h-24 bg-gray-100 rounded" />
            <div className="h-24 bg-gray-100 rounded" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  {weekDays.map((day) => (
                    <th
                      key={day.date}
                      className={`px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider ${
                        day.isToday ? "text-blue-600 bg-blue-50" : "text-gray-500"
                      }`}
                    >
                      <div>{day.label}</div>
                      <div className="text-[11px] font-normal text-gray-400 mt-0.5">
                        {day.date.slice(5)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="align-top">
                  {weekDays.map((day) => {
                    const dayActivities = dayMap.get(day.date) || [];
                    return (
                      <td
                        key={day.date}
                        className={`px-2 py-2 align-top min-w-[140px] max-w-[200px] ${
                          day.isToday ? "bg-blue-50/50" : ""
                        }`}
                      >
                        {dayActivities.length === 0 ? (
                          <div className="h-12 flex items-center justify-center">
                            <span className="text-gray-300 text-xs">—</span>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {dayActivities.map((activity) => (
                              <div
                                key={activity.id}
                                className={`rounded-md px-2 py-1.5 text-xs border ${
                                  activity.status === "cancelled"
                                    ? "bg-gray-50 border-gray-200 opacity-50"
                                    : activity.status === "completed"
                                      ? "bg-blue-50 border-blue-200"
                                      : activity.status === "published"
                                        ? "bg-green-50 border-green-200"
                                        : "bg-gray-50 border-gray-200"
                                }`}
                                title={`${activity.startTime}-${activity.endTime} | ${activity.currentCapacity}/${activity.maxCapacity}人`}
                              >
                                <div className="font-medium text-gray-800 truncate">
                                  {activity.name}
                                </div>
                                <div className="text-gray-500 mt-0.5">
                                  {activity.startTime}-{activity.endTime}
                                </div>
                                <div className="text-gray-400 mt-0.5">
                                  {activity.type === "custom"
                                    ? activity.customType || "自定义"
                                    : ACTIVITY_TYPE_LABELS[activity.type]}
                                  {activity.instructor ? ` · ${activity.instructor.name}` : ""}
                                </div>
                                <div className="text-gray-400 mt-0.5">
                                  {activity.currentCapacity}/{activity.maxCapacity}人
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page Component ─── */

export default function ActivitiesPage() {
  const [activeTab, setActiveTab] = useState<"list" | "timetable">("list");

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
          活动管理
        </h2>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("list")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "list"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          活动列表
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("timetable")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "timetable"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          周课表
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "list" ? (
        <ActivityList />
      ) : (
        <WeeklyTimetable />
      )}
    </div>
  );
}
