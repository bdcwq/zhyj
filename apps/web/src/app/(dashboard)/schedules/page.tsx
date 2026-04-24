"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";

/* ─── Types ─── */

interface ShiftDef {
  type: string;
  startTime: string;
  endTime: string;
  requiredStaff: number;
}

interface ShiftTemplateRecord {
  id: string;
  name: string;
  storeId: string;
  shifts: ShiftDef[];
  effectiveDays: number[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface ScheduleRecord {
  id: string;
  date: string;
  staffId: string;
  storeId: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  status: string;
  templateId: string | null;
  staff?: { id: string; name: string; phone: string | null };
}

interface TemplateListResponse {
  success: boolean;
  data: {
    records: ShiftTemplateRecord[];
    total: number;
    limit: number;
    offset: number;
  };
}

interface ScheduleListResponse {
  success: boolean;
  data: {
    records: ScheduleRecord[];
    total: number;
    limit: number;
    offset: number;
  };
}

interface ShiftFormRow {
  type: string;
  startTime: string;
  endTime: string;
  requiredStaff: number;
}

interface TemplateForm {
  name: string;
  shifts: ShiftFormRow[];
  effectiveDays: number[];
}

/* ─── Constants ─── */

const SHIFT_TYPE_LABELS: Record<string, string> = {
  morning: "早班",
  afternoon: "中班",
  evening: "晚班",
  night: "夜班",
};

const SHIFT_TYPE_OPTIONS = [
  { value: "morning", label: "早班" },
  { value: "afternoon", label: "中班" },
  { value: "evening", label: "晚班" },
  { value: "night", label: "夜班" },
];

const DAY_LABELS = [
  "周一",
  "周二",
  "周三",
  "周四",
  "周五",
  "周六",
  "周日",
];

const STATUS_LABELS: Record<string, string> = {
  scheduled: "已排班",
  cancelled: "已取消",
  completed: "已完成",
};

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "scheduled", label: "已排班" },
  { value: "cancelled", label: "已取消" },
  { value: "completed", label: "已完成" },
];

const EMPTY_SHIFT_ROW: ShiftFormRow = {
  type: "morning",
  startTime: "08:00",
  endTime: "16:00",
  requiredStaff: 1,
};

const EMPTY_TEMPLATE_FORM: TemplateForm = {
  name: "",
  shifts: [{ ...EMPTY_SHIFT_ROW }],
  effectiveDays: [1, 2, 3, 4, 5],
};

const PAGE_SIZE = 20;

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

function effectiveDaysLabel(days: number[]): string {
  if (!days || days.length === 0) return "—";
  if (days.length === 7) return "每天";
  if (days.length === 5 && days.every((d) => d >= 1 && d <= 5)) return "周一至周五";
  if (days.length === 2 && days.includes(6) && days.includes(7)) return "周六、周日";
  return days.map((d) => DAY_LABELS[d - 1]).join("、");
}

/* ─── TemplateManager Component ─── */

function TemplateManager({ canManage }: { canManage: boolean }) {
  const [templates, setTemplates] = useState<ShiftTemplateRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>({ ...EMPTY_TEMPLATE_FORM });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      const res = await fetch(`/api/v1/schedules/templates?${params}`, {
        credentials: "include",
      });
      const json: TemplateListResponse = await res.json();
      if (json.success) {
        setTemplates(json.data.records);
        setTotal(json.data.total);
      } else {
        setListError("获取模板列表失败");
      }
    } catch {
      setListError("网络错误，请重试");
    } finally {
      setListLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  function openCreateModal() {
    setModalMode("create");
    setEditingId(null);
    setForm({ ...EMPTY_TEMPLATE_FORM });
    setFormError("");
    setShowModal(true);
  }

  function openEditModal(t: ShiftTemplateRecord) {
    setModalMode("edit");
    setEditingId(t.id);
    setForm({
      name: t.name,
      shifts: t.shifts.length > 0
        ? t.shifts.map((s) => ({ ...s }))
        : [{ ...EMPTY_SHIFT_ROW }],
      effectiveDays: [...t.effectiveDays],
    });
    setFormError("");
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setFormError("");
  }

  function addShiftRow() {
    setForm((prev) => ({
      ...prev,
      shifts: [...prev.shifts, { ...EMPTY_SHIFT_ROW }],
    }));
  }

  function removeShiftRow(index: number) {
    setForm((prev) => ({
      ...prev,
      shifts: prev.shifts.filter((_, i) => i !== index),
    }));
  }

  function updateShiftRow(index: number, field: keyof ShiftFormRow, value: string | number) {
    setForm((prev) => ({
      ...prev,
      shifts: prev.shifts.map((row, i) =>
        i === index ? { ...row, [field]: value } : row,
      ),
    }));
  }

  function toggleDay(day: number) {
    setForm((prev) => ({
      ...prev,
      effectiveDays: prev.effectiveDays.includes(day)
        ? prev.effectiveDays.filter((d) => d !== day)
        : [...prev.effectiveDays, day].sort(),
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setFormSubmitting(true);

    try {
      if (!form.name.trim()) {
        setFormError("请填写模板名称");
        setFormSubmitting(false);
        return;
      }
      if (form.shifts.length === 0) {
        setFormError("请至少添加一个班次");
        setFormSubmitting(false);
        return;
      }
      if (form.effectiveDays.length === 0) {
        setFormError("请选择至少一个生效日");
        setFormSubmitting(false);
        return;
      }

      const body = {
        name: form.name.trim(),
        shifts: form.shifts,
        effectiveDays: form.effectiveDays,
      };

      const url =
        modalMode === "create"
          ? "/api/v1/schedules/templates"
          : `/api/v1/schedules/templates/${editingId}`;
      const method = modalMode === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!json.success) {
        setFormError(json.error?.message || (modalMode === "create" ? "创建失败" : "更新失败"));
      } else {
        closeModal();
        fetchTemplates();
      }
    } catch {
      setFormError("网络错误，请重试");
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`/api/v1/schedules/templates/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        setDeleteTarget(null);
        fetchTemplates();
      }
    } catch {
      // silently fail
    } finally {
      setDeleteSubmitting(false);
    }
  }

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">管理轮班模板，定义班次时段和生效日期</p>
        {canManage && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            创建模板
          </button>
        )}
      </div>

      {/* Error banner */}
      {listError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {listError}
          <button type="button" onClick={fetchTemplates} className="ml-2 underline hover:no-underline">
            重试
          </button>
        </div>
      )}

      {/* Templates table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">模板名称</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">班次数</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">生效日</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">创建时间</th>
              {canManage && (
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">操作</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {listLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skel-${i}`}>
                  {Array.from({ length: canManage ? 5 : 4 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : templates.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 5 : 4} className="px-4 py-12 text-center text-sm text-gray-400">
                  暂无排班模板
                </td>
              </tr>
            ) : (
              templates.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                    {t.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {t.shifts.length} 个班次
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {effectiveDaysLabel(t.effectiveDays)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {new Date(t.createdAt).toLocaleDateString("zh-CN")}
                  </td>
                  {canManage && (
                    <td className="whitespace-nowrap px-4 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(t)}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ id: t.id, name: t.name })}
                        className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
                      >
                        删除
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {!listLoading && total > 0 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-sm text-gray-500">
              共 {total} 条，第 {currentPage} / {totalPages} 页
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                上一页
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-white shadow-2xl ring-1 ring-gray-900/5 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">
                {modalMode === "create" ? "创建排班模板" : "编辑排班模板"}
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
                <label htmlFor="template-name" className="block text-sm font-medium text-gray-700 mb-1">
                  模板名称 <span className="text-red-500">*</span>
                </label>
                <input
                  id="template-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="例如：标准工作周"
                />
              </div>

              {/* Shifts */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">班次列表</label>
                <div className="space-y-2">
                  {form.shifts.map((shift, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1 grid grid-cols-4 gap-2">
                        <select
                          value={shift.type}
                          onChange={(e) => updateShiftRow(idx, "type", e.target.value)}
                          className="col-span-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        >
                          {SHIFT_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <input
                          type="time"
                          value={shift.startTime}
                          onChange={(e) => updateShiftRow(idx, "startTime", e.target.value)}
                          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                        <input
                          type="time"
                          value={shift.endTime}
                          onChange={(e) => updateShiftRow(idx, "endTime", e.target.value)}
                          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={shift.requiredStaff}
                          onChange={(e) => updateShiftRow(idx, "requiredStaff", parseInt(e.target.value) || 1)}
                          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          placeholder="人数"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeShiftRow(idx)}
                        disabled={form.shifts.length <= 1}
                        className="mt-1 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="删除班次"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addShiftRow}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                >
                  + 添加班次
                </button>
              </div>

              {/* Effective days */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">生效日</label>
                <div className="flex flex-wrap gap-2">
                  {DAY_LABELS.map((label, idx) => {
                    const day = idx + 1;
                    const checked = form.effectiveDays.includes(day);
                    return (
                      <label
                        key={day}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                          checked
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDay(day)}
                          className="sr-only"
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
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
                  {formSubmitting && (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {modalMode === "create" ? "创建" : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-xl bg-white shadow-2xl ring-1 ring-gray-900/5 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">确认删除</h3>
            <p className="text-sm text-gray-600 mb-6">
              确定要删除模板「{deleteTarget.name}」吗？删除后不可恢复。
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleteSubmitting}
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteSubmitting && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── ScheduleCalendar Component ─── */

function ScheduleCalendar({ canManage }: { canManage: boolean }) {
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Generate modal state
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [templates, setTemplates] = useState<ShiftTemplateRecord[]>([]);
  const [genTemplateId, setGenTemplateId] = useState("");
  const [genWeekStart, setGenWeekStart] = useState("");
  const [genSubmitting, setGenSubmitting] = useState(false);
  const [genError, setGenError] = useState("");
  const [genResult, setGenResult] = useState<{
    created: number;
    conflicts: Array<{ date: string; shiftType: string; needed: number; available: number }>;
    templateName: string;
  } | null>(null);

  // Schedule adjust modal state
  const [adjustTarget, setAdjustTarget] = useState<ScheduleRecord | null>(null);
  const [adjustStaffId, setAdjustStaffId] = useState("");
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState("");

  // Cancel confirmation
  const [cancelTarget, setCancelTarget] = useState<ScheduleRecord | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        dateFrom: formatDate(weekStart),
        dateTo: formatDate(weekEnd),
        limit: "500",
        offset: "0",
      });
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/v1/schedules?${params}`, {
        credentials: "include",
      });
      const json: ScheduleListResponse = await res.json();
      if (json.success) {
        setSchedules(json.data.records);
      } else {
        setError("获取排班数据失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd, statusFilter]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // Derived: unique shift types from schedules
  const shiftTypes = Array.from(
    new Set(schedules.map((s) => s.shiftType)),
  ).sort();

  // Build a lookup: date -> shiftType -> ScheduleRecord[]
  const scheduleMap = new Map<string, Map<string, ScheduleRecord[]>>();
  for (const s of schedules) {
    const dateKey = s.date.split("T")[0];
    if (!scheduleMap.has(dateKey)) scheduleMap.set(dateKey, new Map());
    const typeMap = scheduleMap.get(dateKey)!;
    if (!typeMap.has(s.shiftType)) typeMap.set(s.shiftType, []);
    typeMap.get(s.shiftType)!.push(s);
  }

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

  // ── Generate schedule ──
  async function openGenerateModal() {
    setGenError("");
    setGenResult(null);
    setGenTemplateId("");
    setGenWeekStart(formatDate(getMonday(new Date())));
    // Fetch templates for the dropdown
    try {
      const res = await fetch("/api/v1/schedules/templates?limit=100&offset=0", {
        credentials: "include",
      });
      const json: TemplateListResponse = await res.json();
      if (json.success) {
        setTemplates(json.data.records);
      }
    } catch {
      // ignore
    }
    setShowGenerateModal(true);
  }

  async function handleGenerate() {
    if (!genTemplateId || !genWeekStart) {
      setGenError("请选择模板和周开始日期");
      return;
    }
    setGenSubmitting(true);
    setGenError("");
    setGenResult(null);
    try {
      const res = await fetch("/api/v1/schedules/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ templateId: genTemplateId, weekStartDate: genWeekStart }),
      });
      const json = await res.json();
      if (json.success) {
        setGenResult(json.data);
        fetchSchedules();
      } else {
        setGenError(json.error?.message || "生成失败");
      }
    } catch {
      setGenError("网络错误，请重试");
    } finally {
      setGenSubmitting(false);
    }
  }

  // ── Adjust schedule (change staff) ──
  function openAdjustModal(schedule: ScheduleRecord) {
    setAdjustTarget(schedule);
    setAdjustStaffId(schedule.staffId);
    setAdjustError("");
  }

  async function handleAdjust() {
    if (!adjustTarget || !adjustStaffId) return;
    setAdjustSubmitting(true);
    setAdjustError("");
    try {
      const res = await fetch(`/api/v1/schedules/${adjustTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ staffId: adjustStaffId }),
      });
      const json = await res.json();
      if (json.success) {
        setAdjustTarget(null);
        fetchSchedules();
      } else {
        setAdjustError(json.error?.message || "调整失败");
      }
    } catch {
      setAdjustError("网络错误，请重试");
    } finally {
      setAdjustSubmitting(false);
    }
  }

  // ── Cancel schedule ──
  async function handleCancel() {
    if (!cancelTarget) return;
    setCancelSubmitting(true);
    try {
      const res = await fetch(`/api/v1/schedules/${cancelTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        setCancelTarget(null);
        fetchSchedules();
      }
    } catch {
      // silently fail
    } finally {
      setCancelSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">
          查看和调整每周排班安排
        </p>
        <div className="flex items-center gap-2">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {canManage && (
            <button
              type="button"
              onClick={openGenerateModal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              生成排班
            </button>
          )}
        </div>
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
          <button type="button" onClick={fetchSchedules} className="ml-2 underline hover:no-underline">
            重试
          </button>
        </div>
      )}

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-12 space-y-3 animate-pulse">
            <div className="h-6 bg-gray-100 rounded w-1/2" />
            <div className="h-24 bg-gray-100 rounded" />
            <div className="h-24 bg-gray-100 rounded" />
          </div>
        ) : shiftTypes.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            本周暂无排班数据
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-24">
                    班次
                  </th>
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
              <tbody className="divide-y divide-gray-100">
                {shiftTypes.map((shiftType) => (
                  <tr key={shiftType} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-700 whitespace-nowrap">
                      {SHIFT_TYPE_LABELS[shiftType] || shiftType}
                    </td>
                    {weekDays.map((day) => {
                      const daySchedules = scheduleMap.get(day.date)?.get(shiftType) || [];
                      const isCancelled = daySchedules.length > 0 && daySchedules.every((s) => s.status === "cancelled");
                      return (
                        <td
                          key={day.date}
                          className={`px-2 py-2 text-center align-top ${
                            day.isToday ? "bg-blue-50/50" : ""
                          } ${isCancelled ? "opacity-50" : ""}`}
                        >
                          {daySchedules.length === 0 ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <div className="space-y-1">
                              {daySchedules.map((s) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => {
                                    if (s.status === "scheduled" && canManage) {
                                      openAdjustModal(s);
                                    }
                                  }}
                                  disabled={s.status !== "scheduled" || !canManage}
                                  className={`block w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                                    s.status === "cancelled"
                                      ? "text-gray-400 line-through"
                                      : canManage
                                        ? "text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer"
                                        : "text-gray-700"
                                  }`}
                                  title={
                                    s.status === "scheduled" && canManage
                                      ? "点击调整"
                                      : undefined
                                  }
                                >
                                  <span className="font-medium">{s.staff?.name || s.staffId}</span>
                                  <span className="text-gray-400 ml-1">
                                    {s.startTime}-{s.endTime}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generate schedule modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowGenerateModal(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl bg-white shadow-2xl ring-1 ring-gray-900/5">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">生成排班</h3>
            </div>
            <div className="p-6 space-y-4">
              {genError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {genError}
                </div>
              )}

              {genResult ? (
                <div className="space-y-3">
                  <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
                    成功创建 {genResult.created} 条排班记录
                  </div>
                  {genResult.conflicts.length > 0 && (
                    <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-700">
                      <p className="font-medium mb-1">存在 {genResult.conflicts.length} 个冲突：</p>
                      <ul className="list-disc list-inside space-y-0.5 text-xs">
                        {genResult.conflicts.map((c, i) => (
                          <li key={i}>
                            {c.date} {SHIFT_TYPE_LABELS[c.shiftType] || c.shiftType}：需要 {c.needed} 人，仅 {c.available} 人可用
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowGenerateModal(false)}
                    className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
                  >
                    完成
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label htmlFor="gen-template" className="block text-sm font-medium text-gray-700 mb-1">
                      选择模板 <span className="text-red-500">*</span>
                    </label>
                    {templates.length === 0 ? (
                      <p className="text-sm text-gray-400">暂无可用模板，请先创建排班模板</p>
                    ) : (
                      <select
                        id="gen-template"
                        value={genTemplateId}
                        onChange={(e) => setGenTemplateId(e.target.value)}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">请选择模板</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}（{t.shifts.length} 班次）</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label htmlFor="gen-week-start" className="block text-sm font-medium text-gray-700 mb-1">
                      周开始日期（周一） <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="gen-week-start"
                      type="date"
                      value={genWeekStart}
                      onChange={(e) => setGenWeekStart(e.target.value)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowGenerateModal(false)}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      disabled={genSubmitting || !genTemplateId || !genWeekStart}
                      onClick={handleGenerate}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {genSubmitting && (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      )}
                      生成
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Adjust schedule modal */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setAdjustTarget(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-xl bg-white shadow-2xl ring-1 ring-gray-900/5 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">调整排班</h3>
            <p className="text-sm text-gray-500 mb-4">
              {adjustTarget.date.split("T")[0]}{" "}
              {SHIFT_TYPE_LABELS[adjustTarget.shiftType] || adjustTarget.shiftType}{" "}
              ({adjustTarget.startTime}-{adjustTarget.endTime})
            </p>
            {adjustError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-4">
                {adjustError}
              </div>
            )}
            <div className="mb-4">
              <label htmlFor="adjust-staff-id" className="block text-sm font-medium text-gray-700 mb-1">
                员工 ID
              </label>
              <input
                id="adjust-staff-id"
                type="text"
                value={adjustStaffId}
                onChange={(e) => setAdjustStaffId(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => {
                  setAdjustTarget(null);
                  setCancelTarget(adjustTarget);
                }}
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
              >
                取消排班
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustTarget(null)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  关闭
                </button>
                <button
                  type="button"
                  disabled={adjustSubmitting}
                  onClick={handleAdjust}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {adjustSubmitting ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel confirmation dialog */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCancelTarget(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-xl bg-white shadow-2xl ring-1 ring-gray-900/5 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">确认取消排班</h3>
            <p className="text-sm text-gray-600 mb-6">
              确定要取消 {cancelTarget.date.split("T")[0]}{" "}
              {SHIFT_TYPE_LABELS[cancelTarget.shiftType] || cancelTarget.shiftType}
              的排班吗？
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                返回
              </button>
              <button
                type="button"
                disabled={cancelSubmitting}
                onClick={handleCancel}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {cancelSubmitting ? "取消中..." : "确认取消"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Page Component ─── */

export default function SchedulesPage() {
  const { user, loading: authLoading } = useAuth();
  const role = user?.role;
  const canManage = role === "admin" || role === "store_manager";

  const [activeTab, setActiveTab] = useState<"templates" | "calendar">("templates");

  if (authLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="h-10 w-full bg-gray-200 rounded" />
        <div className="h-64 w-full bg-gray-200 rounded" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 tracking-tight">排班管理</h2>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("templates")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "templates"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          排班模板
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("calendar")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "calendar"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          排班日历
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "templates" ? (
        <TemplateManager canManage={canManage} />
      ) : (
        <ScheduleCalendar canManage={canManage} />
      )}
    </div>
  );
}
