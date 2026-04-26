"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { STAFF_ROLES } from "@zhyj/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { ErrorBanner } from "@/components/error-banner";
import { FormModal } from "@/components/form-modal";
import { Button } from "@/components/ui/button";

/* ─── Types ─── */

interface LeaveRecord {
  id: string;
  staffId: string;
  storeId: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  staff: { id: string; name: string; phone: string | null };
  approver: { id: string; name: string } | null;
}

interface LeaveListResponse {
  success: boolean;
  data: {
    records: LeaveRecord[];
    total: number;
    limit: number;
    offset: number;
  };
  error?: { code: string; message: string };
}

/* ─── Constants ─── */

const LEAVE_TYPE_LABELS: Record<string, string> = {
  sick: "病假",
  personal: "事假",
  annual: "年假",
  other: "其他",
};

const LEAVE_TYPE_OPTIONS = [
  { value: "sick", label: "病假" },
  { value: "personal", label: "事假" },
  { value: "annual", label: "年假" },
  { value: "other", label: "其他" },
];

const STATUS_COLOR_MAP: Record<string, string> = {
  pending: "bg-apple-warning/10 text-apple-warning ring-apple-warning/20",
  approved: "bg-apple-success/10 text-apple-success ring-apple-success/20",
  rejected: "bg-apple-error/10 text-apple-error ring-apple-error/20",
};

const STATUS_LABEL_MAP: Record<string, string> = {
  pending: "待审批",
  approved: "已批准",
  rejected: "已拒绝",
};

const STATUS_FILTER_OPTIONS = [
  { value: "_all", label: "全部状态" },
  { value: "pending", label: "待审批" },
  { value: "approved", label: "已批准" },
  { value: "rejected", label: "已拒绝" },
];

const PAGE_SIZE = 20;

function formatDate(dateStr: string): string {
  return dateStr.split("T")[0];
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ─── StaffLeaveView ─── */

function StaffLeaveView() {
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  // Submit form state
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState("sick");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formReason, setFormReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      const res = await fetch(`/api/v1/leaves?${params}`, {
        credentials: "include",
      });
      const json: LeaveListResponse = await res.json();
      if (json.success) {
        setLeaves(json.data.records);
        setTotal(json.data.total);
      } else {
        setListError("获取请假列表失败");
      }
    } catch {
      setListError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  // Auto-dismiss success messages
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(""), 3000);
      return () => clearTimeout(t);
    }
  }, [successMsg]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      if (!formStartDate || !formEndDate) {
        setFormError("请选择开始和结束日期");
        setSubmitting(false);
        return;
      }
      if (formStartDate > formEndDate) {
        setFormError("结束日期不能早于开始日期");
        setSubmitting(false);
        return;
      }

      const res = await fetch("/api/v1/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: formType,
          startDate: formStartDate,
          endDate: formEndDate,
          reason: formReason.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg("请假申请已提交");
        setShowForm(false);
        setFormType("sick");
        setFormStartDate("");
        setFormEndDate("");
        setFormReason("");
        setPage(1);
        fetchLeaves();
      } else {
        setFormError(json.error?.message || "提交失败");
      }
    } catch {
      setFormError("网络错误，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  const columns: Column<LeaveRecord>[] = [
    {
      key: "type",
      header: "类型",
      render: (row) => (
        <span className="text-sm font-medium text-foreground">
          {LEAVE_TYPE_LABELS[row.type] || row.type}
        </span>
      ),
    },
    {
      key: "dates",
      header: "日期范围",
      render: (row) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDate(row.startDate)} ~ {formatDate(row.endDate)}
        </span>
      ),
    },
    {
      key: "status",
      header: "状态",
      render: (row) => (
        <StatusBadge
          status={row.status}
          colorMap={STATUS_COLOR_MAP}
          labelMap={STATUS_LABEL_MAP}
          variant="ring"
        />
      ),
    },
    {
      key: "reason",
      header: "事由",
      render: (row) => (
        <span className="text-sm text-muted-foreground max-w-[200px] truncate block">
          {row.reason || "—"}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "提交时间",
      render: (row) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDateTime(row.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Submit button / form toggle */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">查看和管理您的请假申请</p>
        <Button
          variant={showForm ? "outline" : "default"}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "收起" : "申请请假"}
        </Button>
      </div>

      {/* Submit form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-sm"
        >
          {formError && (
            <div className="rounded-lg bg-apple-error/10 border border-apple-error/20 px-3 py-2 text-sm text-apple-error">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="leave-type" className="block text-sm font-medium text-foreground mb-1">
                请假类型 <span className="text-apple-error">*</span>
              </label>
              <select
                id="leave-type"
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {LEAVE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="leave-start" className="block text-sm font-medium text-foreground mb-1">
                开始日期 <span className="text-apple-error">*</span>
              </label>
              <input
                id="leave-start"
                type="date"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
                className="block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="leave-end" className="block text-sm font-medium text-foreground mb-1">
                结束日期 <span className="text-apple-error">*</span>
              </label>
              <input
                id="leave-end"
                type="date"
                value={formEndDate}
                onChange={(e) => setFormEndDate(e.target.value)}
                className="block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div>
            <label htmlFor="leave-reason" className="block text-sm font-medium text-foreground mb-1">
              请假事由
            </label>
            <textarea
              id="leave-reason"
              value={formReason}
              onChange={(e) => setFormReason(e.target.value)}
              rows={2}
              className="block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="请简要说明请假原因（选填）"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowForm(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              提交申请
            </Button>
          </div>
        </form>
      )}

      {/* Success message */}
      {successMsg && (
        <div className="rounded-lg bg-apple-success/10 border border-apple-success/20 px-4 py-3 text-sm text-apple-success">
          {successMsg}
        </div>
      )}

      {/* Leave list table */}
      <DataTable<LeaveRecord>
        columns={columns}
        data={leaves}
        loading={loading}
        error={listError}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        onRetry={fetchLeaves}
        emptyMessage="暂无请假记录"
      />
    </div>
  );
}

/* ─── ManagerLeaveView ─── */

function ManagerLeaveView() {
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [statusFilter, setStatusFilter] = useState("_all");

  // Approve/reject modal
  const [actionTarget, setActionTarget] = useState<{
    id: string;
    staffName: string;
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
  } | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject">("approve");
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");

  const [successMsg, setSuccessMsg] = useState("");

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (statusFilter !== "_all") params.set("status", statusFilter);
      const res = await fetch(`/api/v1/leaves?${params}`, {
        credentials: "include",
      });
      const json: LeaveListResponse = await res.json();
      if (json.success) {
        setLeaves(json.data.records);
        setTotal(json.data.total);
      } else {
        setListError("获取请假列表失败");
      }
    } catch {
      setListError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  // Auto-dismiss success messages
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(""), 3000);
      return () => clearTimeout(t);
    }
  }, [successMsg]);

  function openActionModal(leave: LeaveRecord, type: "approve" | "reject") {
    setActionTarget({
      id: leave.id,
      staffName: leave.staff?.name || leave.staffId,
      type: leave.type,
      startDate: formatDate(leave.startDate),
      endDate: formatDate(leave.endDate),
      reason: leave.reason,
    });
    setActionType(type);
    setActionError("");
  }

  async function handleAction() {
    if (!actionTarget) return;
    setActionSubmitting(true);
    setActionError("");
    try {
      const res = await fetch(`/api/v1/leaves/${actionTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: actionType === "approve" ? "approved" : "rejected" }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(
          actionType === "approve"
            ? `已批准 ${actionTarget.staffName} 的请假申请`
            : `已拒绝 ${actionTarget.staffName} 的请假申请`,
        );
        setActionTarget(null);
        fetchLeaves();
      } else {
        setActionError(json.error?.message || "操作失败");
      }
    } catch {
      setActionError("网络错误，请重试");
    } finally {
      setActionSubmitting(false);
    }
  }

  const pendingLeaves = leaves.filter((l) => l.status === "pending");

  const columns: Column<LeaveRecord>[] = [
    {
      key: "staffName",
      header: "员工姓名",
      render: (row) => (
        <span className="text-sm font-medium text-foreground whitespace-nowrap">
          {row.staff?.name || row.staffId}
        </span>
      ),
    },
    {
      key: "type",
      header: "类型",
      render: (row) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {LEAVE_TYPE_LABELS[row.type] || row.type}
        </span>
      ),
    },
    {
      key: "dates",
      header: "日期范围",
      render: (row) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDate(row.startDate)} ~ {formatDate(row.endDate)}
        </span>
      ),
    },
    {
      key: "status",
      header: "状态",
      render: (row) => (
        <StatusBadge
          status={row.status}
          colorMap={STATUS_COLOR_MAP}
          labelMap={STATUS_LABEL_MAP}
          variant="ring"
        />
      ),
    },
    {
      key: "reason",
      header: "事由",
      render: (row) => (
        <span className="text-sm text-muted-foreground max-w-[200px] truncate block">
          {row.reason || "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (row) =>
        row.status === "pending" ? (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => openActionModal(row, "approve")}
              className="text-sm font-medium text-apple-success hover:text-apple-success/80 transition-colors"
            >
              批准
            </button>
            <button
              type="button"
              onClick={() => openActionModal(row, "reject")}
              className="text-sm font-medium text-apple-error hover:text-apple-error/80 transition-colors"
            >
              拒绝
            </button>
          </div>
        ) : null,
    },
  ];

  // Status filter element for DataTable
  const filterElement = (
    <select
      value={statusFilter}
      onChange={(e) => {
        setStatusFilter(e.target.value);
        setPage(1);
      }}
      className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
    >
      {STATUS_FILTER_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4">
      {/* Pending queue (highlighted) */}
      {pendingLeaves.length > 0 && (
        <div className="rounded-xl border border-apple-warning/20 bg-apple-warning/5 p-4">
          <h3 className="text-sm font-semibold text-apple-warning mb-3">
            ⏳ 待审批请假（{pendingLeaves.length}）
          </h3>
          <div className="space-y-2">
            {pendingLeaves.map((leave) => (
              <div
                key={leave.id}
                className="flex items-center justify-between rounded-lg border border-apple-warning/20 bg-card p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {leave.staff?.name || leave.staffId}
                    <span className="ml-2 text-muted-foreground">
                      ({LEAVE_TYPE_LABELS[leave.type] || leave.type})
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(leave.startDate)} ~ {formatDate(leave.endDate)}
                    {leave.reason ? ` — ${leave.reason}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => openActionModal(leave, "approve")}
                    className="bg-apple-success hover:bg-apple-success/90 text-white"
                  >
                    批准
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => openActionModal(leave, "reject")}
                  >
                    拒绝
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success message */}
      {successMsg && (
        <div className="rounded-lg bg-apple-success/10 border border-apple-success/20 px-4 py-3 text-sm text-apple-success">
          {successMsg}
        </div>
      )}

      {/* All leaves table */}
      <DataTable<LeaveRecord>
        columns={columns}
        data={leaves}
        loading={loading}
        error={listError}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        onRetry={fetchLeaves}
        emptyMessage="暂无请假记录"
        filter={filterElement}
      />

      {/* Approve/Reject confirmation modal */}
      {actionTarget && (
        <FormModal
          open={!!actionTarget}
          onOpenChange={(open) => !open && setActionTarget(null)}
          title={actionType === "approve" ? "批准请假" : "拒绝请假"}
          description={
            actionType === "approve"
              ? "批准后，该员工在请假日期内的排班将被自动取消。"
              : "确定要拒绝该请假申请吗？"
          }
          onSubmit={handleAction}
          submitting={actionSubmitting}
          error={actionError}
          submitLabel={actionType === "approve" ? "确认批准" : "确认拒绝"}
          submitButtonClassName={
            actionType === "approve"
              ? "bg-apple-success hover:bg-apple-success/90 text-white"
              : "bg-apple-error hover:bg-apple-error/90 text-white"
          }
        >
          <div className="text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">员工：</span>
              <span className="font-medium text-foreground">{actionTarget.staffName}</span>
            </p>
            <p>
              <span className="text-muted-foreground">类型：</span>
              {LEAVE_TYPE_LABELS[actionTarget.type] || actionTarget.type}
            </p>
            <p>
              <span className="text-muted-foreground">日期：</span>
              {actionTarget.startDate} ~ {actionTarget.endDate}
            </p>
            {actionTarget.reason && (
              <p>
                <span className="text-muted-foreground">事由：</span>
                {actionTarget.reason}
              </p>
            )}
          </div>
        </FormModal>
      )}
    </div>
  );
}

/* ─── Main Page Component ─── */

export default function LeavesPage() {
  const { user, loading: authLoading } = useAuth();
  const role = user?.role;
  const isStaff = role === STAFF_ROLES.STAFF;
  const isManager = role === STAFF_ROLES.ADMIN || role === STAFF_ROLES.STORE_MANAGER;

  if (authLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="h-64 w-full bg-muted rounded" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageHeader
        title="请假管理"
        description={isStaff ? "提交请假申请并查看审批状态" : "审批员工请假申请"}
        actions={isStaff ? undefined : undefined}
      />

      {/* Role-based view */}
      {isStaff ? <StaffLeaveView /> : isManager ? <ManagerLeaveView /> : null}
    </div>
  );
}
