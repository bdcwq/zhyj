"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { STAFF_ROLES } from "@zhyj/shared";

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

const LEAVE_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  pending: { label: "待审批", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  approved: { label: "已批准", color: "text-green-700", bg: "bg-green-50 border-green-200" },
  rejected: { label: "已拒绝", color: "text-red-700", bg: "bg-red-50 border-red-200" },
};

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "全部状态" },
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
  const [offset, setOffset] = useState(0);
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
  }, [offset]);

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
        setOffset(0);
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

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Submit button / form toggle */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">查看和管理您的请假申请</p>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          {showForm ? "收起" : "申请请假"}
        </button>
      </div>

      {/* Submit form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-gray-200 bg-white p-4 space-y-4 shadow-sm"
        >
          {formError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="leave-type" className="block text-sm font-medium text-gray-700 mb-1">
                请假类型 <span className="text-red-500">*</span>
              </label>
              <select
                id="leave-type"
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {LEAVE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="leave-start" className="block text-sm font-medium text-gray-700 mb-1">
                开始日期 <span className="text-red-500">*</span>
              </label>
              <input
                id="leave-start"
                type="date"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="leave-end" className="block text-sm font-medium text-gray-700 mb-1">
                结束日期 <span className="text-red-500">*</span>
              </label>
              <input
                id="leave-end"
                type="date"
                value={formEndDate}
                onChange={(e) => setFormEndDate(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label htmlFor="leave-reason" className="block text-sm font-medium text-gray-700 mb-1">
              请假事由
            </label>
            <textarea
              id="leave-reason"
              value={formReason}
              onChange={(e) => setFormReason(e.target.value)}
              rows={2}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="请简要说明请假原因（选填）"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              提交申请
            </button>
          </div>
        </form>
      )}

      {/* Success message */}
      {successMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          {successMsg}
        </div>
      )}

      {/* Error banner */}
      {listError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {listError}
          <button type="button" onClick={fetchLeaves} className="ml-2 underline hover:no-underline">
            重试
          </button>
        </div>
      )}

      {/* Leave list table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                类型
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                日期范围
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                状态
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                事由
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                提交时间
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skel-${i}`}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div
                        className="h-4 bg-gray-100 rounded animate-pulse"
                        style={{ width: `${50 + Math.random() * 50}%` }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : leaves.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">
                  暂无请假记录
                </td>
              </tr>
            ) : (
              leaves.map((leave) => {
                const statusConfig = LEAVE_STATUS_CONFIG[leave.status] || LEAVE_STATUS_CONFIG.pending;
                return (
                  <tr key={leave.id} className="hover:bg-gray-50 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                      {LEAVE_TYPE_LABELS[leave.type] || leave.type}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {formatDate(leave.startDate)} ~ {formatDate(leave.endDate)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConfig.bg} ${statusConfig.color}`}
                      >
                        {statusConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">
                      {leave.reason || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {formatDateTime(leave.createdAt)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {!loading && total > 0 && (
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
    </div>
  );
}

/* ─── ManagerLeaveView ─── */

function ManagerLeaveView() {
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

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
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (statusFilter) params.set("status", statusFilter);
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
  }, [offset, statusFilter]);

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
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Pending queue (highlighted) */}
      {pendingLeaves.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <h3 className="text-sm font-semibold text-yellow-800 mb-3">
            ⏳ 待审批请假（{pendingLeaves.length}）
          </h3>
          <div className="space-y-2">
            {pendingLeaves.map((leave) => (
              <div
                key={leave.id}
                className="flex items-center justify-between rounded-lg border border-yellow-200 bg-white p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {leave.staff?.name || leave.staffId}
                    <span className="ml-2 text-gray-500">
                      ({LEAVE_TYPE_LABELS[leave.type] || leave.type})
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatDate(leave.startDate)} ~ {formatDate(leave.endDate)}
                    {leave.reason ? ` — ${leave.reason}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <button
                    type="button"
                    onClick={() => openActionModal(leave, "approve")}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors"
                  >
                    批准
                  </button>
                  <button
                    type="button"
                    onClick={() => openActionModal(leave, "reject")}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
                  >
                    拒绝
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success message */}
      {successMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          {successMsg}
        </div>
      )}

      {/* Error banner */}
      {listError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {listError}
          <button type="button" onClick={fetchLeaves} className="ml-2 underline hover:no-underline">
            重试
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setOffset(0);
          }}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* All leaves table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                员工姓名
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                类型
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                日期范围
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                状态
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                事由
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skel-${i}`}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div
                        className="h-4 bg-gray-100 rounded animate-pulse"
                        style={{ width: `${50 + Math.random() * 50}%` }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : leaves.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                  暂无请假记录
                </td>
              </tr>
            ) : (
              leaves.map((leave) => {
                const statusConfig = LEAVE_STATUS_CONFIG[leave.status] || LEAVE_STATUS_CONFIG.pending;
                return (
                  <tr key={leave.id} className="hover:bg-gray-50 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                      {leave.staff?.name || leave.staffId}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {LEAVE_TYPE_LABELS[leave.type] || leave.type}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {formatDate(leave.startDate)} ~ {formatDate(leave.endDate)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConfig.bg} ${statusConfig.color}`}
                      >
                        {statusConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">
                      {leave.reason || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {leave.status === "pending" && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openActionModal(leave, "approve")}
                            className="text-sm text-green-600 hover:text-green-800 font-medium transition-colors"
                          >
                            批准
                          </button>
                          <button
                            type="button"
                            onClick={() => openActionModal(leave, "reject")}
                            className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
                          >
                            拒绝
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {!loading && total > 0 && (
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

      {/* Approve/Reject confirmation dialog */}
      {actionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setActionTarget(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-xl bg-white shadow-2xl ring-1 ring-gray-900/5 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {actionType === "approve" ? "批准请假" : "拒绝请假"}
            </h3>
            <div className="text-sm text-gray-600 mb-4 space-y-1">
              <p>
                <span className="text-gray-500">员工：</span>
                <span className="font-medium text-gray-900">{actionTarget.staffName}</span>
              </p>
              <p>
                <span className="text-gray-500">类型：</span>
                {LEAVE_TYPE_LABELS[actionTarget.type] || actionTarget.type}
              </p>
              <p>
                <span className="text-gray-500">日期：</span>
                {actionTarget.startDate} ~ {actionTarget.endDate}
              </p>
              {actionTarget.reason && (
                <p>
                  <span className="text-gray-500">事由：</span>
                  {actionTarget.reason}
                </p>
              )}
            </div>
            {actionError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-4">
                {actionError}
              </div>
            )}
            <p className="text-sm text-gray-500 mb-6">
              {actionType === "approve"
                ? "批准后，该员工在请假日期内的排班将被自动取消。"
                : "确定要拒绝该请假申请吗？"}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setActionTarget(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                disabled={actionSubmitting}
                onClick={handleAction}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50 transition-colors ${
                  actionType === "approve"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {actionSubmitting && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {actionType === "approve" ? "确认批准" : "确认拒绝"}
              </button>
            </div>
          </div>
        </div>
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
        <div className="h-8 w-48 bg-gray-200 rounded" />
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
      <div>
        <h2 className="text-xl font-semibold text-gray-900 tracking-tight">请假管理</h2>
        <p className="text-sm text-gray-500 mt-1">
          {isStaff ? "提交请假申请并查看审批状态" : "审批员工请假申请"}
        </p>
      </div>

      {/* Role-based view */}
      {isStaff ? <StaffLeaveView /> : isManager ? <ManagerLeaveView /> : null}
    </div>
  );
}
