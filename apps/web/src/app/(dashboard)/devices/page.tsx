"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { MACHINE_STATUS } from "@zhyj/shared";
import { DataTable, type Column } from "@/components/data-table";
import { FormModal } from "@/components/form-modal";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

/* ─── Constants ─── */

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

const STATUS_COLOR_MAP: Record<string, string> = {
  [MACHINE_STATUS.AVAILABLE]: "bg-apple-success/10 text-apple-success",
  [MACHINE_STATUS.IN_USE]: "bg-apple-primary/10 text-apple-primary",
  [MACHINE_STATUS.MAINTENANCE]: "bg-apple-warning/10 text-apple-warning",
  [MACHINE_STATUS.OUT_OF_SERVICE]: "bg-apple-error/10 text-apple-error",
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
      if (roomFilter && roomFilter !== "_all")
        params.set("roomId", roomFilter);
      if (statusFilter && statusFilter !== "_all")
        params.set("status", statusFilter);

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

  async function handleSubmit() {
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
        if (form.roomId && form.roomId !== "_none") body.roomId = form.roomId;
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
        const effectiveRoomId =
          form.roomId === "_none" ? "" : form.roomId;
        if (effectiveRoomId !== (editingMachine.roomId ?? ""))
          body.roomId = effectiveRoomId || null;
        if (form.status !== editingMachine.status) body.status = form.status;

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

  // ── Column definitions (MEM074: inside component body) ──
  const columns: Column<MachineRecord>[] = [
    {
      key: "name",
      header: "名称",
      render: (machine) => (
        <span className="font-medium text-foreground">{machine.name}</span>
      ),
    },
    {
      key: "room",
      header: "归属房间",
      render: (machine) =>
        machine.room ? (
          <span className="text-muted-foreground">{machine.room.name}</span>
        ) : (
          <span className="text-muted-foreground/60">未分配</span>
        ),
    },
    {
      key: "status",
      header: "状态",
      render: (machine) => (
        <StatusBadge
          status={machine.status}
          colorMap={STATUS_COLOR_MAP}
          labelMap={STATUS_LABELS}
          variant="ring"
        />
      ),
    },
    {
      key: "actions",
      header: "操作",
      className: "text-right",
      render: (machine) => (
        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-primary hover:text-primary/80"
            onClick={() => openEditModal(machine)}
          >
            编辑
          </Button>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-apple-error hover:text-apple-error/80"
            onClick={() => confirmDelete(machine)}
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
        title="设备管理"
        actions={
          <Button onClick={openCreateModal} size="sm">
            <Plus className="h-4 w-4" />
            添加设备
          </Button>
        }
      />

      {/* ── Data table with filters ── */}
      <DataTable
        columns={columns}
        data={machineList}
        loading={listLoading}
        error={listError}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        onRetry={fetchMachines}
        emptyMessage="暂无设备数据"
        filter={
          <div className="flex items-center gap-2">
            <Select
              value={roomFilter || "_all"}
              onValueChange={handleRoomFilterChange}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="全部房间" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">全部房间</SelectItem>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter || "_all"}
              onValueChange={handleStatusFilterChange}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">全部状态</SelectItem>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* ── Create / Edit Modal ── */}
      <FormModal
        open={showModal}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
        title={modalMode === "create" ? "添加设备" : "编辑设备"}
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
              设备名称 <span className="text-apple-error">*</span>
            </label>
            <Input
              value={form.name}
              onChange={(e) => updateForm("name", e.target.value)}
              maxLength={50}
              placeholder="请输入设备名称"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              归属房间
            </label>
            <Select
              value={form.roomId || "_none"}
              onValueChange={(value) => updateForm("roomId", value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="未分配" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">未分配</SelectItem>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              状态
            </label>
            <Select
              value={form.status}
              onValueChange={(value) => updateForm("status", value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择状态" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            ? `确定要删除设备「${deleteTarget.name}」吗？删除后该设备将被停用。`
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
