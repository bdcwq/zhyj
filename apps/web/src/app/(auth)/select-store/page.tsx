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
      <div className="text-center text-gray-500">加载中...</div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <h2 className="text-2xl font-semibold text-center mb-6">选择门店</h2>
      {error && (
        <div className="mb-4 p-2 bg-red-50 text-red-600 text-sm rounded">
          {error}
        </div>
      )}
      {stores.length === 0 ? (
        <div className="text-center text-gray-500">暂无可用的门店</div>
      ) : (
        <div className="space-y-3">
          {stores.map((store) => (
            <button
              key={store.id}
              onClick={() => handleSelectStore(store.id)}
              disabled={switching !== null}
              className="w-full p-4 bg-white border border-gray-200 rounded-lg text-left hover:border-blue-400 hover:shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="font-medium">{store.name}</div>
              {switching === store.id && (
                <div className="text-sm text-blue-500 mt-1">切换中...</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
