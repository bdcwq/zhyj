"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table";
import { FormModal } from "@/components/form-modal";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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

/* ─── Constants ─── */

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

  // ── Fetch rooms ──
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

  // ── Search handler (DataTable debounces internally) ──
  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
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

  async function handleSubmit() {
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

  // ── Column definitions (MEM074: inside component body) ──
  const columns: Column<RoomRecord>[] = [
    {
      key: "name",
      header: "名称",
      render: (room) => (
        <span className="font-medium text-foreground">{room.name}</span>
      ),
    },
    { key: "capacity", header: "容量" },
    {
      key: "machines",
      header: "设备数量",
      render: (room) => (
        <span className="text-muted-foreground">{room._count.machines}</span>
      ),
    },
    {
      key: "actions",
      header: "操作",
      className: "text-right",
      render: (room) => (
        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-primary hover:text-primary/80"
            onClick={() => openEditModal(room)}
          >
            编辑
          </Button>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-apple-error hover:text-apple-error/80"
            onClick={() => confirmDelete(room)}
          >
            删除
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <PageHeader
        title="房间管理"
        actions={
          <Button onClick={openCreateModal} size="sm">
            <Plus className="h-4 w-4" />
            添加房间
          </Button>
        }
      />

      {/* ── Data table with search ── */}
      <DataTable
        columns={columns}
        data={roomList}
        loading={listLoading}
        error={listError}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        onSearch={handleSearchChange}
        searchPlaceholder="搜索房间名称"
        onRetry={fetchRooms}
        emptyMessage="暂无房间数据"
      />

      {/* ── Create / Edit Modal ── */}
      <FormModal
        open={showModal}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
        title={modalMode === "create" ? "添加房间" : "编辑房间"}
        onSubmit={handleSubmit}
        submitting={formSubmitting}
        error={formError}
        submitLabel={modalMode === "create" ? "创建" : "保存"}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              房间名称 <span className="text-apple-error">*</span>
            </label>
            <Input
              value={form.name}
              onChange={(e) => updateForm("name", e.target.value)}
              maxLength={50}
              placeholder="请输入房间名称"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              容量 <span className="text-apple-error">*</span>
            </label>
            <Input
              type="number"
              min={1}
              max={100}
              value={form.capacity}
              onChange={(e) => updateForm("capacity", e.target.value)}
              placeholder="请输入容量 (1-100)"
            />
          </div>
        </form>
      </FormModal>

      {/* ── Delete confirmation ── */}
      <FormModal
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="确认删除"
        description={
          deleteTarget
            ? `确定要删除房间「${deleteTarget.name}」吗？删除后该房间及其所有设备将被停用。`
            : undefined
        }
        onSubmit={handleDeleteConfirm}
        submitting={deleteSubmitting}
        submitLabel="删除"
      >
        <></>
      </FormModal>
    </div>
  );
}
