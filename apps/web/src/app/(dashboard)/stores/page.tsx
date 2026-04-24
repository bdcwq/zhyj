"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";

/* ─── Types ─── */

interface StoreRecord {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  businessHours: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface StoreListResponse {
  success: boolean;
  data: {
    records: StoreRecord[];
    total: number;
    limit: number;
    offset: number;
  };
}

interface ModalForm {
  name: string;
  address: string;
  phone: string;
  businessHours: string;
}

const EMPTY_FORM: ModalForm = {
  name: "",
  address: "",
  phone: "",
  businessHours: "",
};

const PAGE_SIZE = 20;

/* ─── Page Component ─── */

export default function StoresPage() {
  const { user, loading: authLoading } = useAuth();
  const role = user?.role;
  const canManage = role === "admin";

  // ── List state ──
  const [storeList, setStoreList] = useState<StoreRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  // ── Modal state ──
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingStore, setEditingStore] = useState<StoreRecord | null>(null);
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

  // ── Debounced search ──
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchStores = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (search) params.set("search", search);

      const res = await fetch(`/api/v1/stores?${params}`, {
        credentials: "include",
      });
      const json: StoreListResponse = await res.json();

      if (json.success) {
        setStoreList(json.data.records);
        setTotal(json.data.total);
      } else {
        setListError("获取店铺列表失败");
      }
    } catch {
      setListError("网络错误，请重试");
    } finally {
      setListLoading(false);
    }
  }, [offset, search]);

  useEffect(() => {
    if (!authLoading) fetchStores();
  }, [fetchStores, authLoading]);

  // Debounce search input
  function handleSearchChange(value: string) {
    setSearch(value);
    setOffset(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // fetchStores will fire via the useEffect deps (search changed)
    }, 300);
  }

  // ── Modal handlers ──

  function openCreateModal() {
    setModalMode("create");
    setEditingStore(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowModal(true);
  }

  function openEditModal(store: StoreRecord) {
    setModalMode("edit");
    setEditingStore(store);
    setForm({
      name: store.name,
      address: store.address || "",
      phone: store.phone || "",
      businessHours: store.businessHours || "",
    });
    setFormError("");
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingStore(null);
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
      if (modalMode === "create") {
        if (!form.name) {
          setFormError("请填写店铺名称");
          setFormSubmitting(false);
          return;
        }
        const res = await fetch("/api/v1/stores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: form.name,
            address: form.address || undefined,
            phone: form.phone || undefined,
            businessHours: form.businessHours || undefined,
          }),
        });
        const json = await res.json();
        if (!json.success) {
          setFormError(json.error?.message || "创建失败");
        } else {
          closeModal();
          fetchStores();
        }
      } else {
        if (!editingStore) return;
        const body: Record<string, unknown> = {};
        if (form.name !== editingStore.name) body.name = form.name;
        if (form.address !== (editingStore.address || "")) body.address = form.address || null;
        if (form.phone !== (editingStore.phone || "")) body.phone = form.phone || null;
        if (form.businessHours !== (editingStore.businessHours || "")) body.businessHours = form.businessHours || null;

        if (Object.keys(body).length === 0) {
          closeModal();
          setFormSubmitting(false);
          return;
        }

        const res = await fetch(`/api/v1/stores/${editingStore.id}`, {
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
          fetchStores();
        }
      }
    } catch {
      setFormError("网络错误，请重试");
    } finally {
      setFormSubmitting(false);
    }
  }

  // ── Disable/Enable handler ──

  function confirmDisable(store: StoreRecord) {
    setDisableTarget({ id: store.id, name: store.name, disabled: !store.deletedAt });
  }

  async function handleDisableConfirm() {
    if (!disableTarget) return;
    setDisableSubmitting(true);
    try {
      const res = await fetch(`/api/v1/stores/${disableTarget.id}/disable`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ disabled: disableTarget.disabled }),
      });
      const json = await res.json();
      if (json.success) {
        setDisableTarget(null);
        fetchStores();
      }
    } catch {
      // silently fail — user can retry
    } finally {
      setDisableSubmitting(false);
    }
  }

  // ── Derived ──
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 tracking-tight">店铺管理</h2>
        {canManage && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            添加店铺
          </button>
        )}
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
            placeholder="搜索店铺名称"
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
          <button type="button" onClick={fetchStores} className="ml-2 underline hover:no-underline">
            重试
          </button>
        </div>
      )}

      {/* ── Stores table ── */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">店铺名称</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">地址</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">电话</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">营业时间</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">状态</th>
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
                  {Array.from({ length: canManage ? 7 : 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : storeList.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="px-4 py-12 text-center text-sm text-gray-400">
                  暂无店铺数据
                </td>
              </tr>
            ) : (
              storeList.map((store) => (
                <tr key={store.id} className={`hover:bg-gray-50 transition-colors ${store.deletedAt ? "opacity-50" : ""}`}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">{store.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">{store.address || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{store.phone || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{store.businessHours || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {store.deletedAt ? (
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
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {new Date(store.createdAt).toLocaleDateString("zh-CN")}
                  </td>
                  {canManage && (
                    <td className="whitespace-nowrap px-4 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(store)}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmDisable(store)}
                        className={`text-sm font-medium transition-colors ${
                          store.deletedAt
                            ? "text-green-600 hover:text-green-800"
                            : "text-red-500 hover:text-red-700"
                        }`}
                      >
                        {store.deletedAt ? "启用" : "禁用"}
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* ── Pagination ── */}
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

      {/* ── Create / Edit Modal (admin only) ── */}
      {showModal && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          {/* Dialog */}
          <div className="relative z-10 w-full max-w-md rounded-xl bg-white shadow-2xl ring-1 ring-gray-900/5">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {modalMode === "create" ? "添加店铺" : "编辑店铺"}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div>
                <label htmlFor="store-name" className="block text-sm font-medium text-gray-700 mb-1">
                  店铺名称 <span className="text-red-500">*</span>
                </label>
                <input
                  id="store-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm("name", e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="请输入店铺名称"
                />
              </div>

              <div>
                <label htmlFor="store-address" className="block text-sm font-medium text-gray-700 mb-1">
                  地址
                </label>
                <input
                  id="store-address"
                  type="text"
                  value={form.address}
                  onChange={(e) => updateForm("address", e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="请输入地址"
                />
              </div>

              <div>
                <label htmlFor="store-phone" className="block text-sm font-medium text-gray-700 mb-1">
                  电话
                </label>
                <input
                  id="store-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateForm("phone", e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="请输入电话号码"
                />
              </div>

              <div>
                <label htmlFor="store-hours" className="block text-sm font-medium text-gray-700 mb-1">
                  营业时间
                </label>
                <input
                  id="store-hours"
                  type="text"
                  value={form.businessHours}
                  onChange={(e) => updateForm("businessHours", e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="例如: 09:00-18:00"
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

      {/* ── Disable / Enable confirmation dialog (admin only) ── */}
      {disableTarget && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDisableTarget(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-xl bg-white shadow-2xl ring-1 ring-gray-900/5 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              确认{disableTarget.disabled ? "禁用" : "启用"}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              确定要{disableTarget.disabled ? "禁用" : "启用"}店铺「{disableTarget.name}」吗？
              {disableTarget.disabled && " 禁用后该店铺将不可用。"}
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
    </div>
  );
}
