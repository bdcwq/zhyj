"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { STAFF_ROLES } from "@zhyj/shared";
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

interface InstructorRecord {
  id: string;
  name: string;
  specialty: string | null;
  bio: string | null;
  avatar: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  _count: { activities: number };
}

interface InstructorListResponse {
  success: boolean;
  data: {
    records: InstructorRecord[];
    total: number;
    limit: number;
    offset: number;
  };
}

interface ModalForm {
  name: string;
  specialty: string;
  bio: string;
  phone: string;
}

/* ─── Constants ─── */

const EMPTY_FORM: ModalForm = {
  name: "",
  specialty: "",
  bio: "",
  phone: "",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-apple-success/10 text-apple-success ring-apple-success/20",
  inactive: "bg-muted text-muted-foreground ring-muted-foreground/20",
};

const STATUS_LABELS: Record<string, string> = {
  active: "正常",
  inactive: "已停用",
};

const PAGE_SIZE = 20;

/* ─── Page Component ─── */

export default function InstructorsPage() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = user?.role === STAFF_ROLES.ADMIN;

  // ── List state ──
  const [instructors, setInstructors] = useState<InstructorRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  // ── Create/Edit modal state ──
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingInstructor, setEditingInstructor] = useState<InstructorRecord | null>(null);
  const [form, setForm] = useState<ModalForm>(EMPTY_FORM);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // ── Delete confirmation ──
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // ── Fetch instructor list ──
  const fetchInstructors = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/v1/instructors?${params}`, { credentials: "include" });
      const json: InstructorListResponse = await res.json();

      if (json.success) {
        setInstructors(json.data.records);
        setTotal(json.data.total);
      } else {
        setListError("获取老师列表失败");
      }
    } catch {
      setListError("网络错误，请稍后重试");
    } finally {
      setListLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    if (user) fetchInstructors();
  }, [user, fetchInstructors]);

  // ── Form handlers ──
  function openCreateModal() {
    setModalMode("create");
    setEditingInstructor(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowModal(true);
  }

  function openEditModal(instructor: InstructorRecord) {
    setModalMode("edit");
    setEditingInstructor(instructor);
    setForm({
      name: instructor.name,
      specialty: instructor.specialty || "",
      bio: instructor.bio || "",
      phone: instructor.phone || "",
    });
    setFormError("");
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      setFormError("姓名不能为空");
      return;
    }

    setFormSubmitting(true);
    setFormError("");

    try {
      const url =
        modalMode === "create"
          ? "/api/v1/instructors"
          : `/api/v1/instructors/${editingInstructor!.id}`;

      const res = await fetch(url, {
        method: modalMode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });

      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        fetchInstructors();
      } else {
        setFormError(json.error?.message || "操作失败");
      }
    } catch {
      setFormError("网络错误，请稍后重试");
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`/api/v1/instructors/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        setDeleteTarget(null);
        fetchInstructors();
      }
    } catch {
      // ignore
    } finally {
      setDeleteSubmitting(false);
    }
  }

  async function handleToggleStatus(instructor: InstructorRecord) {
    const newStatus = instructor.status === "active" ? "inactive" : "active";
    try {
      const res = await fetch(`/api/v1/instructors/${instructor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      if ((await res.json()).success) {
        fetchInstructors();
      }
    } catch {
      // ignore
    }
  }

  // ── Table columns ──
  const columns: Column<InstructorRecord>[] = [
    { key: "name", header: "姓名", render: (r) => r.name },
    { key: "specialty", header: "专长", render: (r) => r.specialty || "—" },
    { key: "phone", header: "电话", render: (r) => r.phone || "—" },
    { key: "activities", header: "活动数", render: (r) => r._count.activities },
    {
      key: "status",
      header: "状态",
      render: (r) => (
        <StatusBadge
          status={r.status}
          labelMap={STATUS_LABELS}
          colorMap={STATUS_COLORS}
        />
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (r) => (
        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-primary hover:text-primary/80"
            onClick={() => handleToggleStatus(r)}
          >
            {r.status === "active" ? "停用" : "启用"}
          </Button>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-primary hover:text-primary/80"
            onClick={() => openEditModal(r)}
          >
            编辑
          </Button>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-apple-error hover:text-apple-error/80"
            onClick={() => setDeleteTarget({ id: r.id, name: r.name })}
          >
            删除
          </Button>
        </div>
      ),
    },
  ];

  // ── Loading guard ──
  if (authLoading) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="授课老师管理"
        description="管理活动/课程的授课老师信息"
        actions={
          <Button onClick={openCreateModal} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            添加老师
          </Button>
        }
      />

      <DataTable<InstructorRecord>
        columns={columns}
        data={instructors}
        loading={listLoading}
        error={listError}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        onSearch={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="搜索姓名..."
        filter={
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="active">正常</SelectItem>
              <SelectItem value="inactive">已停用</SelectItem>
            </SelectContent>
          </Select>
        }
        emptyMessage="暂无授课老师"
        onRetry={fetchInstructors}
      />

      {/* Create/Edit Modal */}
      <FormModal
        open={showModal}
        onOpenChange={setShowModal}
        title={modalMode === "create" ? "添加授课老师" : "编辑授课老师"}
        onSubmit={handleSubmit}
        submitting={formSubmitting}
        error={formError}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              姓名 <span className="text-apple-error">*</span>
            </label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="请输入老师姓名"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              专长
            </label>
            <Input
              value={form.specialty}
              onChange={(e) => setForm({ ...form, specialty: e.target.value })}
              placeholder="如：八段锦、瑜伽、艾灸理疗"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              联系电话
            </label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="请输入联系电话"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              个人简介
            </label>
            <textarea
              className="flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder="请输入个人简介"
              rows={3}
            />
          </div>
        </div>
      </FormModal>

      {/* Delete Confirmation Modal */}
      <FormModal
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="确认删除"
        onSubmit={handleDelete}
        submitting={deleteSubmitting}
        submitLabel="确认删除"
        error=""
      >
        <p className="text-sm text-muted-foreground">
          确定要删除授课老师「{deleteTarget?.name}」吗？此操作不可恢复。
        </p>
      </FormModal>
    </div>
  );
}
