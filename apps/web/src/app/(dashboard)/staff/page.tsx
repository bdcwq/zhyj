"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { STAFF_ROLES } from "@zhyj/shared";

/* ─── Types ─── */

interface StoreBasic {
  id: string;
  name: string;
}

interface StoreInfo {
  storeId: string;
  store: { id: string; name: string };
}

interface StaffRecord {
  id: string;
  username: string;
  phone: string;
  name: string;
  role: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  staffStores: StoreInfo[];
}

interface StaffListResponse {
  success: boolean;
  data: {
    records: StaffRecord[];
    total: number;
    page: number;
    pageSize: number;
  };
}

interface ModalForm {
  name: string;
  phone: string;
  username: string;
  password: string;
  role: string;
  storeIds: string;
}

const EMPTY_FORM: ModalForm = {
  name: "",
  phone: "",
  username: "",
  password: "",
  role: "staff",
  storeIds: "",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "管理员",
  store_manager: "店长",
  staff: "员工",
};

const ROLE_BADGE_CLASSES: Record<string, string> = {
  admin: "bg-red-50 text-red-700 ring-red-600/20",
  store_manager: "bg-blue-50 text-blue-700 ring-blue-600/20",
  staff: "bg-gray-50 text-gray-700 ring-gray-500/20",
};

const PAGE_SIZE = 20;

/* ─── Page Component ─── */

export default function StaffPage() {
  const { user, loading: authLoading } = useAuth();
  const role = user?.role;

  // ── List state ──
  const [staffList, setStaffList] = useState<StaffRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  // ── Modal state ──
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingStaff, setEditingStaff] = useState<StaffRecord | null>(null);
  const [form, setForm] = useState<ModalForm>(EMPTY_FORM);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // ── Disable confirmation ──
  const [disableTarget, setDisableTarget] = useState<{
    id: string;
    name: string;
    disabled: boolean;
  } | null>(null);
  const [disableSubmitting, setDisableSubmitting] = useState(false);

  // ── Transfer modal state ──
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferStaff, setTransferStaff] = useState<StaffRecord | null>(null);
  const [transferFromStoreId, setTransferFromStoreId] = useState("");
  const [transferToStoreId, setTransferToStoreId] = useState("");
  const [allStores, setAllStores] = useState<StoreBasic[]>([]);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState("");

  // ── Debounced search ──
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchStaff = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);

      const res = await fetch(`/api/v1/staff?${params}`, { credentials: "include" });
      const json: StaffListResponse = await res.json();

      if (json.success) {
        setStaffList(json.data.records);
        setTotal(json.data.total);
      } else {
        setListError("获取员工列表失败");
      }
    } catch {
      setListError("网络错误，请重试");
    } finally {
      setListLoading(false);
    }
  }, [page, search, roleFilter]);

  useEffect(() => {
    if (!authLoading) fetchStaff();
  }, [fetchStaff, authLoading]);

  // Debounce search input
  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // fetchStaff will fire via the useEffect deps (search changed)
    }, 300);
  }

  function handleRoleFilterChange(value: string) {
    setRoleFilter(value);
    setPage(1);
  }

  // ── Modal handlers ──

  function openCreateModal() {
    setModalMode("create");
    setEditingStaff(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowModal(true);
  }

  function openEditModal(staff: StaffRecord) {
    setModalMode("edit");
    setEditingStaff(staff);
    setForm({
      name: staff.name,
      phone: staff.phone,
      username: staff.username,
      password: "",
      role: staff.role,
      storeIds: staff.staffStores.map((s) => s.storeId).join(", "),
    });
    setFormError("");
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingStaff(null);
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
      const storeIdsArr = form.storeIds
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);

      if (modalMode === "create") {
        if (!form.name || !form.phone || !form.username || !form.password || !form.role) {
          setFormError("请填写所有必填字段");
          setFormSubmitting(false);
          return;
        }
        const res = await fetch("/api/v1/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            ...form,
            storeIds: role === "store_manager" ? undefined : storeIdsArr.length > 0 ? storeIdsArr : undefined,
          }),
        });
        const json = await res.json();
        if (!json.success) {
          setFormError(json.error?.message || "创建失败");
        } else {
          closeModal();
          fetchStaff();
        }
      } else {
        // Edit — only send changed fields
        if (!editingStaff) return;
        const body: Record<string, unknown> = {};
        if (form.name !== editingStaff.name) body.name = form.name;
        if (form.phone !== editingStaff.phone) body.phone = form.phone;
        if (form.role !== editingStaff.role) body.role = form.role;
        if (form.password) body.password = form.password;
        const newStoreIds = form.storeIds
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean);
        body.storeIds = newStoreIds;

        const res = await fetch(`/api/v1/staff/${editingStaff.id}`, {
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
          fetchStaff();
        }
      }
    } catch {
      setFormError("网络错误，请重试");
    } finally {
      setFormSubmitting(false);
    }
  }

  // ── Disable/Enable handler ──

  function confirmDisable(staff: StaffRecord) {
    setDisableTarget({ id: staff.id, name: staff.name, disabled: !staff.deletedAt });
  }

  async function handleDisableConfirm() {
    if (!disableTarget) return;
    setDisableSubmitting(true);
    try {
      const res = await fetch(`/api/v1/staff/${disableTarget.id}/disable`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ disabled: disableTarget.disabled }),
      });
      const json = await res.json();
      if (json.success) {
        setDisableTarget(null);
        fetchStaff();
      }
    } catch {
      // silently fail — user can retry
    } finally {
      setDisableSubmitting(false);
    }
  }

  // ── Transfer handlers ──

  async function openTransferModal(staff: StaffRecord) {
    setTransferStaff(staff);
    setTransferError("");
    setShowTransferModal(true);
    // Pre-populate fromStore from staff's first store
    if (staff.staffStores.length > 0) {
      setTransferFromStoreId(staff.staffStores[0].storeId);
    } else {
      setTransferFromStoreId("");
    }
    setTransferToStoreId("");
    // Fetch all stores for the toStore dropdown
    try {
      const res = await fetch("/api/v1/stores", { credentials: "include" });
      const json = await res.json();
      if (json.success && json.data?.records) {
        setAllStores(json.data.records.map((s: StoreBasic) => ({ id: s.id, name: s.name })));
      }
    } catch {
      setTransferError("获取店铺列表失败");
    }
  }

  function closeTransferModal() {
    setShowTransferModal(false);
    setTransferStaff(null);
    setTransferError("");
  }

  async function handleTransferSubmit() {
    if (!transferStaff || !transferFromStoreId || !transferToStoreId) {
      setTransferError("请选择原店铺和目标店铺");
      return;
    }
    if (transferFromStoreId === transferToStoreId) {
      setTransferError("原店铺和目标店铺不能相同");
      return;
    }
    setTransferSubmitting(true);
    setTransferError("");
    try {
      const res = await fetch(`/api/v1/staff/${transferStaff.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fromStoreId: transferFromStoreId, toStoreId: transferToStoreId }),
      });
      const json = await res.json();
      if (json.success) {
        closeTransferModal();
        fetchStaff();
      } else {
        setTransferError(json.error?.message || "调动失败");
      }
    } catch {
      setTransferError("网络错误，请重试");
    } finally {
      setTransferSubmitting(false);
    }
  }

  // ── Derived ──
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isAdmin = role === STAFF_ROLES.ADMIN;

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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 tracking-tight">员工管理</h2>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          添加员工
        </button>
      </div>

      {/* ── Search & Filter bar ── */}
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
        <select
          value={roleFilter}
          onChange={(e) => handleRoleFilterChange(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
        >
          <option value="">全部角色</option>
          <option value="admin">管理员</option>
          <option value="store_manager">店长</option>
          <option value="staff">员工</option>
        </select>
      </div>

      {/* ── Error banner ── */}
      {listError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {listError}
          <button type="button" onClick={fetchStaff} className="ml-2 underline hover:no-underline">
            重试
          </button>
        </div>
      )}

      {/* ── Staff table ── */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">姓名</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">用户名</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">手机号</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">角色</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">绑定店铺</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">状态</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {listLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skel-${i}`}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : staffList.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                  暂无员工数据
                </td>
              </tr>
            ) : (
              staffList.map((staff) => (
                <tr key={staff.id} className={`hover:bg-gray-50 transition-colors ${staff.deletedAt ? "opacity-50" : ""}`}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">{staff.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{staff.username}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{staff.phone}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${ROLE_BADGE_CLASSES[staff.role] || ROLE_BADGE_CLASSES.staff}`}>
                      {ROLE_LABELS[staff.role] || staff.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">
                    {staff.staffStores.length > 0
                      ? staff.staffStores.map((s) => s.store.name).join("、")
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {staff.deletedAt ? (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                        已禁用
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        正常
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(staff)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                    >
                      编辑
                    </button>
                    {isAdmin && staff.staffStores.length > 0 && (
                      <button
                        type="button"
                        onClick={() => openTransferModal(staff)}
                        className="text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                      >
                        跨店调动
                      </button>
                    )}
                    {staff.id !== user?.staffId && (
                      <button
                        type="button"
                        onClick={() => confirmDisable(staff)}
                        className={`text-sm font-medium transition-colors ${
                          staff.deletedAt
                            ? "text-green-600 hover:text-green-800"
                            : "text-red-500 hover:text-red-700"
                        }`}
                      >
                        {staff.deletedAt ? "启用" : "禁用"}
                      </button>
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
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          {/* Dialog */}
          <div className="relative z-10 w-full max-w-md rounded-xl bg-white shadow-2xl ring-1 ring-gray-900/5">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {modalMode === "create" ? "添加员工" : "编辑员工"}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div>
                <label htmlFor="staff-name" className="block text-sm font-medium text-gray-700 mb-1">
                  姓名 <span className="text-red-500">*</span>
                </label>
                <input
                  id="staff-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm("name", e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="请输入姓名"
                />
              </div>

              <div>
                <label htmlFor="staff-phone" className="block text-sm font-medium text-gray-700 mb-1">
                  手机号 <span className="text-red-500">*</span>
                </label>
                <input
                  id="staff-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateForm("phone", e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="请输入手机号"
                />
              </div>

              <div>
                <label htmlFor="staff-username" className="block text-sm font-medium text-gray-700 mb-1">
                  用户名 <span className="text-red-500">*</span>
                </label>
                <input
                  id="staff-username"
                  type="text"
                  value={form.username}
                  onChange={(e) => updateForm("username", e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="请输入用户名"
                />
              </div>

              <div>
                <label htmlFor="staff-password" className="block text-sm font-medium text-gray-700 mb-1">
                  密码 {modalMode === "create" && <span className="text-red-500">*</span>}
                  {modalMode === "edit" && <span className="text-gray-400 font-normal">（留空则不修改）</span>}
                </label>
                <input
                  id="staff-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => updateForm("password", e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder={modalMode === "create" ? "请输入密码" : "留空则不修改"}
                />
              </div>

              <div>
                <label htmlFor="staff-role" className="block text-sm font-medium text-gray-700 mb-1">
                  角色 <span className="text-red-500">*</span>
                </label>
                <select
                  id="staff-role"
                  value={form.role}
                  onChange={(e) => updateForm("role", e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                >
                  <option value="staff">员工</option>
                  <option value="store_manager">店长</option>
                  {isAdmin && <option value="admin">管理员</option>}
                </select>
              </div>

              {/* Store assignment — admin only, store_manager auto-assigned */}
              {isAdmin ? (
                <div>
                  <label htmlFor="staff-stores" className="block text-sm font-medium text-gray-700 mb-1">
                    门店ID
                    <span className="text-gray-400 font-normal ml-1">（多个用逗号分隔）</span>
                  </label>
                  <input
                    id="staff-stores"
                    type="text"
                    value={form.storeIds}
                    onChange={(e) => updateForm("storeIds", e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    placeholder="例如: store_001, store_002"
                  />
                </div>
              ) : (
                <p className="text-xs text-gray-400">门店将自动分配至您所在的门店</p>
              )}

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

      {/* ── Disable / Enable confirmation dialog ── */}
      {disableTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDisableTarget(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-xl bg-white shadow-2xl ring-1 ring-gray-900/5 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              确认{disableTarget.disabled ? "禁用" : "启用"}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              确定要{disableTarget.disabled ? "禁用" : "启用"}员工「{disableTarget.name}」吗？
              {disableTarget.disabled && " 禁用后该员工将无法登录系统。"}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDisableTarget(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                disabled={disableSubmitting}
                onClick={handleDisableConfirm}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50 transition-colors ${
                  disableTarget.disabled ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {disableSubmitting && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {disableTarget.disabled ? "禁用" : "启用"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Transfer Modal ── */}
      {showTransferModal && transferStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={closeTransferModal} />
          {/* Dialog */}
          <div className="relative z-10 w-full max-w-md rounded-xl bg-white shadow-2xl ring-1 ring-gray-900/5">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">跨店调动</h3>
              <p className="text-sm text-gray-500 mt-1">
                员工：{transferStaff.name}
              </p>
            </div>
            <div className="p-6 space-y-4">
              {transferError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {transferError}
                </div>
              )}

              <div>
                <label htmlFor="transfer-from" className="block text-sm font-medium text-gray-700 mb-1">
                  原店铺
                </label>
                <select
                  id="transfer-from"
                  value={transferFromStoreId}
                  onChange={(e) => setTransferFromStoreId(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                >
                  {transferStaff.staffStores.map((s) => (
                    <option key={s.storeId} value={s.storeId}>
                      {s.store.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="transfer-to" className="block text-sm font-medium text-gray-700 mb-1">
                  目标店铺
                </label>
                <select
                  id="transfer-to"
                  value={transferToStoreId}
                  onChange={(e) => setTransferToStoreId(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                >
                  <option value="">请选择目标店铺</option>
                  {allStores
                    .filter((s) => s.id !== transferFromStoreId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeTransferModal}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={transferSubmitting}
                  onClick={handleTransferSubmit}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {transferSubmitting && (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  确认调动
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
