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

/* ─── Constants ─── */

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

const ROLE_BADGE_COLORS: Record<string, string> = {
  admin: "bg-apple-error/10 text-apple-error ring-apple-error/20",
  store_manager: "bg-primary/10 text-primary ring-primary/20",
  staff: "bg-muted text-muted-foreground ring-muted-foreground/20",
};

const STAFF_STATUS_COLORS: Record<string, string> = {
  active: "bg-apple-success/10 text-apple-success ring-apple-success/20",
  disabled: "bg-muted text-muted-foreground ring-muted-foreground/20",
};

const STAFF_STATUS_LABELS: Record<string, string> = {
  active: "正常",
  disabled: "已禁用",
};

const PAGE_SIZE = 20;

/* ─── Page Component ─── */

export default function StaffPage() {
  const { user, loading: authLoading } = useAuth();
  const role = user?.role;
  const isAdmin = role === STAFF_ROLES.ADMIN;

  // ── List state ──
  const [staffList, setStaffList] = useState<StaffRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  // ── Create/Edit modal state ──
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingStaff, setEditingStaff] = useState<StaffRecord | null>(null);
  const [form, setForm] = useState<ModalForm>(EMPTY_FORM);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // ── Disable/Enable confirmation state ──
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

  // ── Fetch staff list ──
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

  // ── Search & filter handlers ──
  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleRoleFilterChange(value: string) {
    setRoleFilter(value === "_all" ? "" : value);
    setPage(1);
  }

  // ── Create/Edit modal handlers ──

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

  async function handleSubmit() {
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
    if (staff.staffStores.length > 0) {
      setTransferFromStoreId(staff.staffStores[0].storeId);
    } else {
      setTransferFromStoreId("");
    }
    setTransferToStoreId("");
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

  // ── Column definitions (MEM074: inside component body) ──
  const columns: Column<StaffRecord>[] = [
    {
      key: "name",
      header: "姓名",
      render: (staff) => (
        <span className="font-medium text-foreground">{staff.name}</span>
      ),
    },
    { key: "username", header: "用户名" },
    { key: "phone", header: "手机号" },
    {
      key: "role",
      header: "角色",
      render: (staff) => (
        <StatusBadge
          status={staff.role}
          colorMap={ROLE_BADGE_COLORS}
          labelMap={ROLE_LABELS}
          variant="ring"
        />
      ),
    },
    {
      key: "stores",
      header: "绑定店铺",
      render: (staff) => (
        <span className="text-muted-foreground max-w-[200px] truncate block">
          {staff.staffStores.length > 0
            ? staff.staffStores.map((s) => s.store.name).join("、")
            : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "状态",
      render: (staff) => (
        <StatusBadge
          status={staff.deletedAt ? "disabled" : "active"}
          colorMap={STAFF_STATUS_COLORS}
          labelMap={STAFF_STATUS_LABELS}
          variant="ring"
        />
      ),
    },
    {
      key: "actions",
      header: "操作",
      className: "text-right",
      render: (staff) => (
        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-primary hover:text-primary/80"
            onClick={() => openEditModal(staff)}
          >
            编辑
          </Button>
          {isAdmin && staff.staffStores.length > 0 && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-primary hover:text-primary/80"
              onClick={() => openTransferModal(staff)}
            >
              跨店调动
            </Button>
          )}
          {staff.id !== user?.staffId && (
            <Button
              variant="link"
              size="sm"
              className={cn(
                "h-auto p-0",
                staff.deletedAt
                  ? "text-apple-success hover:text-apple-success/80"
                  : "text-apple-error hover:text-apple-error/80"
              )}
              onClick={() => confirmDisable(staff)}
            >
              {staff.deletedAt ? "启用" : "禁用"}
            </Button>
          )}
        </div>
      ),
    },
  ];

  // ── Role filter select ──
  const roleFilterSelect = (
    <Select value={roleFilter || "_all"} onValueChange={handleRoleFilterChange}>
      <SelectTrigger className="w-[140px]">
        <SelectValue placeholder="全部角色" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="_all">全部角色</SelectItem>
        <SelectItem value="admin">管理员</SelectItem>
        <SelectItem value="store_manager">店长</SelectItem>
        <SelectItem value="staff">员工</SelectItem>
      </SelectContent>
    </Select>
  );

  // ── Loading skeleton ──
  if (authLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 animate-pulse">
          <div className="h-7 w-48 bg-muted rounded" />
        </div>
        <div className="h-10 w-full bg-muted rounded-lg" />
        <div className="h-64 w-full bg-muted rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <PageHeader
        title="员工管理"
        actions={
          <Button onClick={openCreateModal} size="sm">
            <Plus className="h-4 w-4" />
            添加员工
          </Button>
        }
      />

      {/* ── Data table with search, filter, and actions ── */}
      <DataTable
        columns={columns}
        data={staffList}
        loading={listLoading}
        error={listError}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        onSearch={handleSearchChange}
        searchPlaceholder="搜索姓名或手机号"
        onRetry={fetchStaff}
        emptyMessage="暂无员工数据"
        filter={roleFilterSelect}
      />

      {/* ── Create / Edit Modal ── */}
      <FormModal
        open={showModal}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
        title={modalMode === "create" ? "添加员工" : "编辑员工"}
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
              姓名 <span className="text-apple-error">*</span>
            </label>
            <Input
              value={form.name}
              onChange={(e) => updateForm("name", e.target.value)}
              placeholder="请输入姓名"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              手机号 <span className="text-apple-error">*</span>
            </label>
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => updateForm("phone", e.target.value)}
              placeholder="请输入手机号"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              用户名 <span className="text-apple-error">*</span>
            </label>
            <Input
              value={form.username}
              onChange={(e) => updateForm("username", e.target.value)}
              placeholder="请输入用户名"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              密码{" "}
              {modalMode === "create" && <span className="text-apple-error">*</span>}
              {modalMode === "edit" && (
                <span className="text-muted-foreground font-normal">
                  （留空则不修改）
                </span>
              )}
            </label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => updateForm("password", e.target.value)}
              placeholder={modalMode === "create" ? "请输入密码" : "留空则不修改"}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              角色 <span className="text-apple-error">*</span>
            </label>
            <Select
              value={form.role}
              onValueChange={(value) => updateForm("role", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="请选择角色" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">员工</SelectItem>
                <SelectItem value="store_manager">店长</SelectItem>
                {isAdmin && <SelectItem value="admin">管理员</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {/* Store assignment — admin only */}
          {isAdmin ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                门店ID
                <span className="text-muted-foreground font-normal ml-1">
                  （多个用逗号分隔）
                </span>
              </label>
              <Input
                value={form.storeIds}
                onChange={(e) => updateForm("storeIds", e.target.value)}
                placeholder="例如: store_001, store_002"
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              门店将自动分配至您所在的门店
            </p>
          )}
        </form>
      </FormModal>

      {/* ── Disable / Enable confirmation ── */}
      <FormModal
        open={!!disableTarget}
        onOpenChange={(open) => {
          if (!open) setDisableTarget(null);
        }}
        title={`确认${disableTarget?.disabled ? "禁用" : "启用"}`}
        description={
          disableTarget
            ? `确定要${disableTarget.disabled ? "禁用" : "启用"}员工「${disableTarget.name}」吗？${
                disableTarget.disabled ? " 禁用后该员工将无法登录系统。" : ""
              }`
            : undefined
        }
        onSubmit={handleDisableConfirm}
        submitting={disableSubmitting}
        submitLabel={disableTarget?.disabled ? "禁用" : "启用"}
      >
        <></>
      </FormModal>

      {/* ── Transfer Modal ── */}
      <FormModal
        open={showTransferModal}
        onOpenChange={(open) => {
          if (!open) closeTransferModal();
        }}
        title="跨店调动"
        description={transferStaff ? `员工：${transferStaff.name}` : undefined}
        onSubmit={handleTransferSubmit}
        submitting={transferSubmitting}
        error={transferError}
        submitLabel="确认调动"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">原店铺</label>
            <Select
              value={transferFromStoreId}
              onValueChange={setTransferFromStoreId}
            >
              <SelectTrigger>
                <SelectValue placeholder="请选择原店铺" />
              </SelectTrigger>
              <SelectContent>
                {transferStaff?.staffStores.map((s) => (
                  <SelectItem key={s.storeId} value={s.storeId}>
                    {s.store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">目标店铺</label>
            <Select
              value={transferToStoreId}
              onValueChange={setTransferToStoreId}
            >
              <SelectTrigger>
                <SelectValue placeholder="请选择目标店铺" />
              </SelectTrigger>
              <SelectContent>
                {allStores
                  .filter((s) => s.id !== transferFromStoreId)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormModal>
    </div>
  );
}

/* ─── Local import for cn (needed in columns render) ─── */
import { cn } from "@/lib/utils";
