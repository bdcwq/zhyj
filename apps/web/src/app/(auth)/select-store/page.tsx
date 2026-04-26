"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { StoreSummary } from "@zhyj/shared";

export default function SelectStorePage() {
  const router = useRouter();
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchStores();
  }, []);

  async function fetchStores() {
    try {
      const res = await fetch("/api/v1/auth/staff/stores");
      const data = await res.json();
      if (data.success) {
        setStores(data.data.stores);
        // If already has a store selected, redirect to dashboard
        if (data.data.currentStoreId) {
          router.push("/");
          return;
        }
      } else {
        setError(data.error?.message || "获取门店列表失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectStore(storeId: string) {
    setSwitching(storeId);
    setError("");
    try {
      const res = await fetch("/api/v1/auth/staff/switch-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      const data = await res.json();
      if (data.success) {
        router.push("/");
        router.refresh();
      } else {
        setError(data.error?.message || "切换门店失败");
        setSwitching(null);
      }
    } catch {
      setError("网络错误");
      setSwitching(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground text-sm">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl shadow-sm p-8">
          <h2 className="font-display text-2xl font-semibold text-center text-foreground">
            选择门店
          </h2>
          <p className="mt-1 text-sm text-center text-muted-foreground mb-6">
            请选择要管理的门店
          </p>

          {error && (
            <div className="mb-4 rounded-lg bg-apple-error/10 px-4 py-2.5 text-sm text-apple-error">
              {error}
            </div>
          )}

          {stores.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              暂无可用的门店
            </div>
          ) : (
            <div className="space-y-3">
              {stores.map((store) => (
                <button
                  key={store.id}
                  onClick={() => handleSelectStore(store.id)}
                  disabled={switching !== null}
                  className="w-full p-4 rounded-xl border border-border bg-card text-left hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="font-medium text-foreground">
                    {store.name}
                  </div>
                  {switching === store.id && (
                    <div className="text-sm text-primary mt-1">切换中...</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
