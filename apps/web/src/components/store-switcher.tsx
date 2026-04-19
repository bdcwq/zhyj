"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { StoreSummary } from "@zhyj/shared";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

export default function StoreSwitcher() {
  const router = useRouter();
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [currentStoreId, setCurrentStoreId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  const fetchStores = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/auth/staff/stores");
      const data = await res.json();
      if (data.success) {
        setStores(data.data.stores);
        setCurrentStoreId(data.data.currentStoreId || "");
      }
    } catch {
      // Silently fail — switcher just won't show options
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  async function handleSwitch(storeId: string) {
    if (storeId === currentStoreId) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/v1/auth/staff/switch-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentStoreId(storeId);
        router.refresh();
      } else {
        // Revert selection on error
        await fetchStores();
      }
    } catch {
      await fetchStores();
    } finally {
      setSwitching(false);
    }
  }

  if (loading || stores.length <= 1) {
    // Don't show switcher if still loading or only one store
    if (loading) return null;
    // Show just the store name if single store
    if (stores.length === 1) {
      return (
        <span className="text-sm text-gray-600 px-3 py-1.5 border rounded-md">
          {stores[0].name}
        </span>
      );
    }
    return null;
  }

  return (
    <Select value={currentStoreId} onValueChange={handleSwitch} disabled={switching}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder={switching ? "切换中..." : "选择门店"} />
      </SelectTrigger>
      <SelectContent>
        {stores.map((store) => (
          <SelectItem key={store.id} value={store.id}>
            {store.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
