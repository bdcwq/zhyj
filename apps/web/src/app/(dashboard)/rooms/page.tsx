"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { FormEvent } from "react";

/* ─── Types ─── */

interface RoomRecord {
  id: string;
  name: string;
  capacity: number;
  storeId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  _count: { machines: number };
}

interface RoomListResponse {
  success: boolean;
  data: {
    records: RoomRecord[];
    total: number;
    page: number;
    pageSize: number;
  };
}

interface ModalForm {
  name: string;
  capacity: string;
}

const EMPTY_FORM: ModalForm = {
  name: "",
  capacity: "",
};

const PAGE_SIZE = 20;

/* ─── Page Component ─── */

export default function RoomsPage() {
  // ── List state ──
  const [roomList, setRoomList] = useState<RoomRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  // ── Modal state ──
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingRoom, setEditingRoom] = useState<RoomRecord | null>(null);
  const [form, setForm] = useState<ModalForm>(EMPTY_FORM);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // ── Delete confirmation ──
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // ── Debounced search ──
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchRooms = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (search) params.set("search", search);

      const res = await fetch(`/api/v1/rooms?${params}`, {
        credentials: "include",
      });
      const json: RoomListResponse = await res.json();

      if (json.success) {
        setRoomList(json.data.records);
        setTotal(json.data.total);
      } else {
        setListError("获取房间列表失败");
      }
    } catch {
      setListError("网络错误，请重试");
    } finally {
      setListLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // Debounce search input
  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // fetchRooms will fire via the useEffect deps (search changed)
    }, 300);
  }

  // ── Modal handlers ──

  function openCreateModal() {
    setModalMode("create");
    setEditingRoom(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowModal(true);
  }

  function openEditModal(room: RoomRecord) {
    setModalMode("edit");
    setEditingRoom(room);
    setForm({
      name: room.name,
      capacity: String(room.capacity),
    });
    setFormError("");
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingRoom(null);
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
      const capacity = Number(form.capacity);
      if (!form.name.trim()) {
        setFormError("请输入房间名称");
        setFormSubmitting(false);
        return;
      }
      if (form.name.trim().length > 50) {
        setFormError("房间名称不能超过50个字符");
        setFormSubmitting(false);
        return;
      }
      if (!form.capacity || isNaN(capacity) || capacity < 1 || capacity > 100) {
        setFormError("容量必须为1-100的数字");
        setFormSubmitting(false);
        return;
      }

      if (modalMode === "create") {
        const res = await fetch("/api/v1/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: form.name.trim(), capacity }),
        });
        const json = await res.json();
        if (!json.success) {
          setFormError(json.error?.message || "创建失败");
        } else {
          closeModal();
          fetchRooms();
        }
      } else {
        if (!editingRoom) return;
        const body: Record<string, unknown> = {};
        if (form.name.trim() !== editingRoom.name) body.name = form.name.trim();
        if (capacity !== editingRoom.capacity) body.capacity = capacity;

        if (Object.keys(body).length === 0) {
          closeModal();
          setFormSubmitting(false);
          return;
        }

        const res = await fetch(`/api/v1/rooms/${editingRoom.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!json.success) {
          setFormError(json.error?.message || "更新失败");
        } else {
          closeModal();
          fetchRooms();
        }
      }
    } catch {
      setFormError("网络错误，请重试");
    } finally {
      setFormSubmitting(false);
    }
  }

  // ── Delete handler ──

  function confirmDelete(room: RoomRecord) {
    setDeleteTarget({ id: room.id, name: room.name });
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`/api/v1/rooms/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        setDeleteTarget(null);
        fetchRooms();
      }
    } catch {
      // silently fail — user can retry
    } finally {
      setDeleteSubmitting(false);
    }
  }

  // ── Derived ──
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
          房间管理
        </h2>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          添加房间
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
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            type="text"
            placeholder="搜索房间名称"
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
          <button
            type="button"
            onClick={fetchRooms}
            className="ml-2 underline hover:no-underline"
          >
            重试
          </button>
        </div>
      )}

      {/* ── Rooms table ── */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                名称
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                容量
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                设备数量
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
                  {Array.from({ length: 4 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div
                        className="h-4 bg-gray-100 rounded animate-pulse"
                        style={{
                          width: `${60 + Math.random() * 40}%`,
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : roomList.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-12 text-center text-sm text-gray-400"
                >
                  暂无房间数据
                </td>
              </tr>
            ) : (
              roomList.map((room) => (
                <tr
                  key={room.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                    {room.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {room.capacity}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {room._count.machines}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(room)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmDelete(room)}
                      className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
                    >
                      删除
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

      {/* ── Create / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeModal}
          />
          {/* Dialog */}
          <div className="relative z-10 w-full max-w-md rounded-xl bg-white shadow-2xl ring-1 ring-gray-900/5">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {modalMode === "create" ? "添加房间" : "编辑房间"}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div>
                <label
                  htmlFor="room-name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  房间名称 <span className="text-red-500">*</span>
                </label>
                <input
                  id="room-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm("name", e.target.value)}
                  maxLength={50}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="请输入房间名称"
                />
              </div>

              <div>
                <label
                  htmlFor="room-capacity"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  容量 <span className="text-red-500">*</span>
                </label>
                <input
                  id="room-capacity"
                  type="number"
                  min={1}
                  max={100}
                  value={form.capacity}
                  onChange={(e) => updateForm("capacity", e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="请输入容量 (1-100)"
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
                  )}
                  {modalMode === "create" ? "创建" : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirmation dialog ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-xl bg-white shadow-2xl ring-1 ring-gray-900/5 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              确认删除
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              确定要删除房间「{deleteTarget.name}」吗？删除后该房间及其所有设备将被停用。
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
                onClick={handleDeleteConfirm}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteSubmitting && (
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
