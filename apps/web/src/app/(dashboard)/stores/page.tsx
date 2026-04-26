"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { DataTable, type Column } from "@/components/data-table";
import { FormModal } from "@/components/form-modal";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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

/* ─── Constants ─── */

const EMPTY_FORM: ModalForm = {
  name: "",
  address: "",
  phone: "",
  businessHours: "",
};

const STORE_STATUS_COLORS: Record<string, string> = {
  active: "bg-apple-success/10 text-apple-success ring-apple-success/20",
  disabled: "bg-muted text-muted-foreground ring-muted-foreground/20",
};

const STORE_STATUS_LABELS: Record<string, string> = {
  active: "正常",
  disabled: "已禁用",
};

const PAGE_SIZE = 20;

/* ─── Page Component ─── */

export default function StoresPage() {
  const { user, loading: authLoading } = useAuth();
  const canManage = user?.role === "admin";

  // ── List state ──
  const [storeList, setStoreList] = useState<StoreRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
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

  // ── Fetch stores ──
  const fetchStores = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const offset = (page - 1) * PAGE_SIZE;
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
  }, [page, search]);

  useEffect(() => {
    if (!authLoading) fetchStores();
  }, [fetchStores, authLoading]);

  // ── Search handler (DataTable handles debounce) ──
  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
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

  async function handleSubmit() {
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

  // ── Column definitions (MEM074: inside component body) ──
  const columns: Column<StoreRecord>[] = [
    {
      key: "name",
      header: "店铺名称",
      render: (store) => (
        <span className="font-medium text-foreground">{store.name}</span>
      ),
    },
    {
      key: "address",
      header: "地址",
      render: (store) => (
        <span className="text-muted-foreground max-w-[200px] truncate block">
          {store.address || "—"}
        </span>
      ),
    },
    {
      key: "phone",
      header: "电话",
      render: (store) => (
        <span className="text-muted-foreground">{store.phone || "—"}</span>
      ),
    },
    {
      key: "businessHours",
      header: "营业时间",
      render: (store) => (
        <span className="text-muted-foreground">{store.businessHours || "—"}</span>
      ),
    },
    {
      key: "status",
      header: "状态",
      render: (store) => (
        <StatusBadge
          status={store.deletedAt ? "disabled" : "active"}
          colorMap={STORE_STATUS_COLORS}
          labelMap={STORE_STATUS_LABELS}
          variant="ring"
        />
      ),
    },
    {
      key: "createdAt",
      header: "创建时间",
      render: (store) => (
        <span className="text-muted-foreground">
          {new Date(store.createdAt).toLocaleDateString("zh-CN")}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
              key: "actions",
              header: "操作",
              className: "text-right" as const,
              render: (store: StoreRecord) => (
                <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-primary hover:text-primary/80"
                    onClick={() => openEditModal(store)}
                  >
                    编辑
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    className={`h-auto p-0 ${
                      store.deletedAt
                        ? "text-apple-success hover:text-apple-success/80"
                        : "text-apple-error hover:text-apple-error/80"
                    }`}
                    onClick={() => confirmDisable(store)}
                  >
                    {store.deletedAt ? "启用" : "禁用"}
                  </Button>
                </div>
              ),
            },
        ]
      : []),
  ];

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
        title="店铺管理"
        actions={
          canManage ? (
            <Button onClick={openCreateModal} size="sm">
              <Plus className="h-4 w-4" />
              添加店铺
            </Button>
          ) : undefined
        }
      />

      {/* ── Data table ── */}
      <DataTable
        columns={columns}
        data={storeList}
        loading={listLoading}
        error={listError}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        onSearch={handleSearchChange}
        searchPlaceholder="搜索店铺名称"
        onRetry={fetchStores}
        emptyMessage="暂无店铺数据"
      />

      {/* ── Create / Edit Modal ── */}
      <FormModal
        open={showModal}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
        title={modalMode === "create" ? "添加店铺" : "编辑店铺"}
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
              店铺名称 <span className="text-apple-error">*</span>
            </label>
            <Input
              value={form.name}
              onChange={(e) => updateForm("name", e.target.value)}
              placeholder="请输入店铺名称"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">地址</label>
            <Input
              value={form.address}
              onChange={(e) => updateForm("address", e.target.value)}
              placeholder="请输入地址"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">电话</label>
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => updateForm("phone", e.target.value)}
              placeholder="请输入电话号码"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">营业时间</label>
            <Input
              value={form.businessHours}
              onChange={(e) => updateForm("businessHours", e.target.value)}
              placeholder="例如: 09:00-18:00"
            />
          </div>
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
            ? `确定要${disableTarget.disabled ? "禁用" : "启用"}店铺「${disableTarget.name}」吗？${
                disableTarget.disabled ? " 禁用后该店铺将不可用。" : ""
              }`
            : undefined
        }
        onSubmit={handleDisableConfirm}
        submitting={disableSubmitting}
        submitLabel={disableTarget?.disabled ? "禁用" : "启用"}
      >
        <></>
      </FormModal>
    </div>
  );
}
