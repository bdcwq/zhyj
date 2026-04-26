"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { FormEvent } from "react";
import { Plus, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { FormModal } from "@/components/form-modal";
import { ErrorBanner } from "@/components/error-banner";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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

const ACTIVITY_STATUS_COLOR_MAP: Record<string, string> = {
  draft: "bg-apple-muted text-apple-secondary",
  published: "bg-apple-success/10 text-apple-success",
  completed: "bg-apple-primary/10 text-apple-primary",
  cancelled: "bg-apple-error/10 text-apple-error",
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

  async function handleSubmit() {
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

  // ── DataTable columns ──
  const columns: Column<ActivityRecord>[] = [
    {
      key: "name",
      header: "活动名称",
      className: "max-w-[200px]",
      render: (row) => (
        <span className="font-medium text-foreground truncate block">
          {row.name}
        </span>
      ),
    },
    {
      key: "type",
      header: "类型",
      render: (row) => (
        <span className="text-secondary">
          {row.type === "custom"
            ? row.customType || "自定义"
            : ACTIVITY_TYPE_LABELS[row.type] || row.type}
        </span>
      ),
    },
    {
      key: "activityDate",
      header: "日期",
      render: (row) => (
        <span className="text-secondary">{formatActivityDate(row.activityDate)}</span>
      ),
    },
    {
      key: "time",
      header: "时间",
      render: (row) => (
        <span className="text-secondary">
          {row.startTime}-{row.endTime}
        </span>
      ),
    },
    {
      key: "capacity",
      header: "容量",
      render: (row) => (
        <span className="text-secondary">
          {row.currentCapacity}/{row.maxCapacity}
        </span>
      ),
    },
    {
      key: "status",
      header: "状态",
      render: (row) => (
        <StatusBadge
          status={row.status}
          colorMap={ACTIVITY_STATUS_COLOR_MAP}
          labelMap={ACTIVITY_STATUS_LABELS}
        />
      ),
    },
    {
      key: "actions",
      header: "操作",
      className: "text-right",
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          {(row.status === "draft" || row.status === "published") && (
            <button
              type="button"
              onClick={() => openEditModal(row)}
              className="text-sm text-apple-primary hover:text-apple-primary/80 font-medium transition-colors"
            >
              编辑
            </button>
          )}
          {row.status === "draft" && (
            <button
              type="button"
              onClick={() => handleStatusTransition(row, "published")}
              className="text-sm text-apple-success hover:text-apple-success/80 font-medium transition-colors"
            >
              发布
            </button>
          )}
          {row.status === "published" && (
            <>
              <button
                type="button"
                onClick={() => handleStatusTransition(row, "completed")}
                className="text-sm text-apple-primary hover:text-apple-primary/80 font-medium transition-colors"
              >
                完成
              </button>
              <button
                type="button"
                onClick={() => handleStatusTransition(row, "cancelled")}
                className="text-sm text-apple-error hover:text-apple-error/80 font-medium transition-colors"
              >
                取消
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  // ── Filter node ──
  const filterNode = (
    <div className="flex items-center gap-2">
      <select
        value={statusFilter}
        onChange={(e) => {
          setStatusFilter(e.target.value);
          setPage(1);
        }}
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:border-apple-primary focus:ring-1 focus:ring-apple-primary transition-colors"
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
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:border-apple-primary focus:ring-1 focus:ring-apple-primary transition-colors"
      >
        {TYPE_FILTER_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );

  // ── Actions node ──
  const actionsNode = (
    <Button onClick={openCreateModal} size="sm">
      <Plus className="h-4 w-4" />
      添加活动
    </Button>
  );

  return (
    <>
      <DataTable<ActivityRecord>
        columns={columns}
        data={activities}
        loading={listLoading}
        error={listError || undefined}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        onSearch={(value) => { setSearch(value); setPage(1); }}
        searchPlaceholder="搜索活动名称"
        onRetry={fetchActivities}
        emptyMessage="暂无活动数据"
        filter={filterNode}
        actions={actionsNode}
      />

      {/* ── Create / Edit Modal ── */}
      <FormModal
        open={showModal}
        onOpenChange={(open) => { if (!open) closeModal(); }}
        title={modalMode === "create" ? "添加活动" : "编辑活动"}
        onSubmit={handleSubmit}
        submitting={formSubmitting}
        error={formError || undefined}
        submitLabel={modalMode === "create" ? "创建" : "保存"}
      >
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); handleSubmit(); }} className="space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="activity-name" className="block text-sm font-medium text-foreground mb-1">
              活动名称 <span className="text-apple-error">*</span>
            </label>
            <Input
              id="activity-name"
              type="text"
              value={form.name}
              onChange={(e) => updateForm("name", e.target.value)}
              maxLength={100}
              placeholder="请输入活动名称"
            />
          </div>

          {/* Type */}
          <div>
            <label htmlFor="activity-type" className="block text-sm font-medium text-foreground mb-1">
              活动类型 <span className="text-apple-error">*</span>
            </label>
            <select
              id="activity-type"
              value={form.type}
              onChange={(e) => updateForm("type", e.target.value)}
              className="block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-apple-primary focus:ring-1 focus:ring-apple-primary transition-colors"
            >
              {ACTIVITY_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Custom type (only when type=custom) */}
          {form.type === "custom" && (
            <div>
              <label htmlFor="activity-custom-type" className="block text-sm font-medium text-foreground mb-1">
                自定义类型名称 <span className="text-apple-error">*</span>
              </label>
              <Input
                id="activity-custom-type"
                type="text"
                value={form.customType}
                onChange={(e) => updateForm("customType", e.target.value)}
                maxLength={50}
                placeholder="例如：舞蹈课"
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label htmlFor="activity-description" className="block text-sm font-medium text-foreground mb-1">
              活动描述
            </label>
            <textarea
              id="activity-description"
              value={form.description}
              onChange={(e) => updateForm("description", e.target.value)}
              maxLength={500}
              rows={3}
              className="block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-apple-primary focus:ring-1 focus:ring-apple-primary transition-colors resize-none"
              placeholder="请输入活动描述（选填）"
            />
          </div>

          {/* Date + Time row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="activity-date" className="block text-sm font-medium text-foreground mb-1">
                活动日期 <span className="text-apple-error">*</span>
              </label>
              <Input
                id="activity-date"
                type="date"
                value={form.activityDate}
                onChange={(e) => updateForm("activityDate", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="activity-start" className="block text-sm font-medium text-foreground mb-1">
                开始时间 <span className="text-apple-error">*</span>
              </label>
              <Input
                id="activity-start"
                type="time"
                value={form.startTime}
                onChange={(e) => updateForm("startTime", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="activity-end" className="block text-sm font-medium text-foreground mb-1">
                结束时间 <span className="text-apple-error">*</span>
              </label>
              <Input
                id="activity-end"
                type="time"
                value={form.endTime}
                onChange={(e) => updateForm("endTime", e.target.value)}
              />
            </div>
          </div>

          {/* Capacity + Instructor row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="activity-capacity" className="block text-sm font-medium text-foreground mb-1">
                最大人数 <span className="text-apple-error">*</span>
              </label>
              <Input
                id="activity-capacity"
                type="number"
                min={1}
                max={500}
                value={form.maxCapacity}
                onChange={(e) => updateForm("maxCapacity", e.target.value)}
                placeholder="1-500"
              />
            </div>
            <div>
              <label htmlFor="activity-instructor" className="block text-sm font-medium text-foreground mb-1">
                授课员工
              </label>
              <select
                id="activity-instructor"
                value={form.instructorId}
                onChange={(e) => updateForm("instructorId", e.target.value)}
                className="block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-apple-primary focus:ring-1 focus:ring-apple-primary transition-colors"
              >
                <option value="">不指定</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Live stream URL */}
          <div>
            <label htmlFor="activity-livestream" className="block text-sm font-medium text-foreground mb-1">
              直播链接
            </label>
            <Input
              id="activity-livestream"
              type="url"
              value={form.liveStreamUrl}
              onChange={(e) => updateForm("liveStreamUrl", e.target.value)}
              maxLength={500}
              placeholder="https://...（选填）"
            />
          </div>
        </form>
      </FormModal>
    </>
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

  // Activity card color by status
  function activityCardClasses(status: string): string {
    switch (status) {
      case "cancelled":
        return "bg-muted border-border opacity-50";
      case "completed":
        return "bg-apple-primary/5 border-apple-primary/20";
      case "published":
        return "bg-apple-success/5 border-apple-success/20";
      default:
        return "bg-muted border-border";
    }
  }

  return (
    <div className="space-y-4">
      {/* Header + filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">
          按周查看活动课表安排
        </p>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:border-apple-primary focus:ring-1 focus:ring-apple-primary transition-colors"
        >
          <option value="">全部类型</option>
          {ACTIVITY_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={goToPrevWeek}
        >
          <ChevronLeft className="h-4 w-4" />
          上一周
        </Button>
        <span className="text-sm font-medium text-foreground min-w-[220px] text-center">
          {formatDate(weekStart)} ~ {formatDate(weekEnd)}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={goToNextWeek}
        >
          下一周
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={goToCurrentWeek}
        >
          <CalendarDays className="h-4 w-4" />
          今天
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <ErrorBanner message={error} onRetry={fetchActivities} />
      )}

      {/* Timetable grid */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="p-12 space-y-3 animate-pulse">
            <div className="h-6 bg-muted rounded w-1/2" />
            <div className="h-24 bg-muted rounded" />
            <div className="h-24 bg-muted rounded" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-muted">
                <tr>
                  {weekDays.map((day) => (
                    <th
                      key={day.date}
                      className={cn(
                        "px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider",
                        day.isToday
                          ? "text-apple-primary bg-apple-primary/5"
                          : "text-muted-foreground"
                      )}
                    >
                      <div>{day.label}</div>
                      <div className="text-[11px] font-normal text-muted-foreground mt-0.5">
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
                        className={cn(
                          "px-2 py-2 align-top min-w-[140px] max-w-[200px]",
                          day.isToday && "bg-apple-primary/5"
                        )}
                      >
                        {dayActivities.length === 0 ? (
                          <div className="h-12 flex items-center justify-center">
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {dayActivities.map((activity) => (
                              <div
                                key={activity.id}
                                className={cn(
                                  "rounded-md px-2 py-1.5 text-xs border",
                                  activityCardClasses(activity.status)
                                )}
                                title={`${activity.startTime}-${activity.endTime} | ${activity.currentCapacity}/${activity.maxCapacity}人`}
                              >
                                <div className="font-medium text-foreground truncate">
                                  {activity.name}
                                </div>
                                <div className="text-secondary mt-0.5">
                                  {activity.startTime}-{activity.endTime}
                                </div>
                                <div className="text-muted-foreground mt-0.5">
                                  {activity.type === "custom"
                                    ? activity.customType || "自定义"
                                    : ACTIVITY_TYPE_LABELS[activity.type]}
                                  {activity.instructor ? ` · ${activity.instructor.name}` : ""}
                                </div>
                                <div className="text-muted-foreground mt-0.5">
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
      <PageHeader title="活动管理" />

      {/* Tab navigation — Apple design token switcher */}
      <div className="flex gap-1 rounded-xl bg-muted p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("list")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-all",
            activeTab === "list"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          活动列表
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("timetable")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-all",
            activeTab === "timetable"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
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
