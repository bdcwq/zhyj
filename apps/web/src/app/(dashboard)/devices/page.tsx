"use client";

import { useState, useEffect, useCallback } from "react";
import type { FormEvent } from "react";
import { MACHINE_STATUS } from "@zhyj/shared";

/* ─── Types ─── */

interface RoomRecord {
  id: string;
  name: string;
}

interface MachineRecord {
  id: string;
  name: string;
  status: string;
  roomId: string | null;
  room: { id: string; name: string } | null;
  storeId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface MachineListResponse {
  success: boolean;
  data: {
    records: MachineRecord[];
    total: number;
    page: number;
    pageSize: number;
  };
}

interface ModalForm {
  name: string;
  roomId: string;
  status: string;
}

const EMPTY_FORM: ModalForm = {
  name: "",
  roomId: "",
  status: MACHINE_STATUS.AVAILABLE,
};

const STATUS_LABELS: Record<string, string> = {
  [MACHINE_STATUS.AVAILABLE]: "可用",
  [MACHINE_STATUS.IN_USE]: "使用中",
  [MACHINE_STATUS.MAINTENANCE]: "维护中",
  [MACHINE_STATUS.OUT_OF_SERVICE]: "停用",
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  [MACHINE_STATUS.AVAILABLE]: "bg-green-50 text-green-700 ring-green-600/20",
  [MACHINE_STATUS.IN_USE]: "bg-blue-50 text-blue-700 ring-blue-600/20",
  [MACHINE_STATUS.MAINTENANCE]: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  [MACHINE_STATUS.OUT_OF_SERVICE]: "bg-red-50 text-red-700 ring-red-600/20",
};

const PAGE_SIZE = 20;

/* ─── Page Component ─── */

export default function DevicesPage() {
  // ── List state ──
  const [machineList, setMachineList] = useState<MachineRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [roomFilter, setRoomFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  // ── Rooms dropdown state ──
  const [rooms, setRooms] = useState<RoomRecord[]>([]);

  // ── Modal state ──
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingMachine, setEditingMachine] = useState<MachineRecord | null>(null);
  const [form, setForm] = useState<ModalForm>(EMPTY_FORM);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // ── Delete confirmation ──
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // ── Fetch rooms for dropdown ──

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/rooms?limit=999", {
        credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        // Handle both paginated response and plain array
        const records = Array.isArray(json.data)
          ? json.data
          : json.data.records ?? [];
        setRooms(records);
      }
    } catch {
      // Non-critical — filter just won't show rooms
    }
  }, []);

  // ── Fetch machines ──

  const fetchMachines = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (roomFilter) params.set("roomId", roomFilter);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/v1/machines?${params}`, {
        credentials: "include",
      });
      const json: MachineListResponse = await res.json();

      if (json.success) {
        setMachineList(json.data.records);
        setTotal(json.data.total);
      } else {
        setListError("获取设备列表失败");
      }
    } catch {
      setListError("网络错误，请重试");
    } finally {
      setListLoading(false);
    }
  }, [page, roomFilter, statusFilter]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  useEffect(() => {
    fetchMachines();
  }, [fetchMachines]);

  // ── Filter handlers ──

  function handleRoomFilterChange(value: string) {
    setRoomFilter(value);
    setPage(1);
  }

  function handleStatusFilterChange(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  // ── Modal handlers ──

  function openCreateModal() {
    setModalMode("create");
    setEditingMachine(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowModal(true);
  }

  function openEditModal(machine: MachineRecord) {
    setModalMode("edit");
    setEditingMachine(machine);
    setForm({
      name: machine.name,
      roomId: machine.roomId ?? "",
      status: machine.status,
    });
    setFormError("");
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingMachine(null);
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
      if (!form.name.trim()) {
        setFormError("请输入设备名称");
        setFormSubmitting(false);
        return;
      }
      if (form.name.trim().length > 50) {
        setFormError("设备名称不能超过50个字符");
        setFormSubmitting(false);
        return;
      }

      if (modalMode === "create") {
        const body: Record<string, unknown> = {
          name: form.name.trim(),
        };
        if (form.roomId) body.roomId = form.roomId;
        if (form.status) body.status = form.status;

        const res = await fetch("/api/v1/machines", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!json.success) {
          setFormError(json.error?.message || "创建失败");
        } else {
          closeModal();
          fetchMachines();
        }
      } else {
        if (!editingMachine) return;
        const body: Record<string, unknown> = {};
        if (form.name.trim() !== editingMachine.name)
          body.name = form.name.trim();
        if (form.roomId !== (editingMachine.roomId ?? ""))
          body.roomId = form.roomId || null;
        if (form.status !== editingMachine.status)
          body.status = form.status;

        if (Object.keys(body).length === 0) {
          closeModal();
          setFormSubmitting(false);
          return;
        }

        const res = await fetch(`/api/v1/machines/${editingMachine.id}`, {
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
          fetchMachines();
        }
      }
    } catch {
      setFormError("网络错误，请重试");
    } finally {
      setFormSubmitting(false);
    }
  }

  // ── Delete handler ──

  function confirmDelete(machine: MachineRecord) {
    setDeleteTarget({ id: machine.id, name: machine.name });
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`/api/v1/machines/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        setDeleteTarget(null);
        fetchMachines();
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
          设备管理
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
          添加设备
        </button>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-3">
        <select
          value={roomFilter}
          onChange={(e) => handleRoomFilterChange(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
        >
          <option value="">全部房间</option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => handleStatusFilterChange(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
        >
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Error banner ── */}
      {listError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {listError}
          <button
            type="button"
            onClick={fetchMachines}
            className="ml-2 underline hover:no-underline"
          >
            重试
          </button>
        </div>
      )}

      {/* ── Machines table ── */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                名称
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                归属房间
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
            ) : machineList.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-12 text-center text-sm text-gray-400"
                >
                  暂无设备数据
                </td>
              </tr>
            ) : (
              machineList.map((machine) => (
                <tr
                  key={machine.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                    {machine.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    {machine.room ? (
                      <span className="text-gray-700">
                        {machine.room.name}
                      </span>
                    ) : (
                      <span className="text-gray-400">未分配</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        STATUS_BADGE_CLASSES[machine.status] ||
                        STATUS_BADGE_CLASSES[MACHINE_STATUS.AVAILABLE]
                      }`}
                    >
                      {STATUS_LABELS[machine.status] || machine.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(machine)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmDelete(machine)}
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
                {modalMode === "create" ? "添加设备" : "编辑设备"}
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
                  htmlFor="machine-name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  设备名称 <span className="text-red-500">*</span>
                </label>
                <input
                  id="machine-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm("name", e.target.value)}
                  maxLength={50}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="请输入设备名称"
                />
              </div>

              <div>
                <label
                  htmlFor="machine-room"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  归属房间
                </label>
                <select
                  id="machine-room"
                  value={form.roomId}
                  onChange={(e) => updateForm("roomId", e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                >
                  <option value="">未分配</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="machine-status"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  状态
                </label>
                <select
                  id="machine-status"
                  value={form.status}
                  onChange={(e) => updateForm("status", e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
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
              确定要删除设备「{deleteTarget.name}」吗？删除后该设备将被停用。
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
