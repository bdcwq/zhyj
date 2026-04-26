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

interface StoreSwitcherProps {
  dark?: boolean;
}

export default function StoreSwitcher({ dark }: StoreSwitcherProps) {
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
        <span
          className={`text-sm px-3 py-1.5 border rounded-md ${
            dark
              ? "text-white/80 border-white/20 bg-white/5"
              : "text-gray-600 border-gray-200 bg-white"
          }`}
        >
          {stores[0].name}
        </span>
      );
    }
    return null;
  }

  return (
    <Select value={currentStoreId} onValueChange={handleSwitch} disabled={switching}>
      <SelectTrigger
        className={
          dark
            ? "w-[180px] bg-white/10 border-white/20 text-white hover:bg-white/15 [&>span]:text-white [&>span_svg]:text-white/70"
            : "w-[180px]"
        }
      >
        <SelectValue placeholder={switching ? "切换中..." : "选择门店"} />
      </SelectTrigger>
      <SelectContent
        className={
          dark
            ? "bg-[#1a1a2e] border-white/10 text-white/90"
            : ""
        }
      >
        {stores.map((store) => (
          <SelectItem
            key={store.id}
            value={store.id}
            className={
              dark
                ? "text-white/80 hover:bg-white/10 focus:bg-white/10 focus:text-white"
                : ""
            }
          >
            {store.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
