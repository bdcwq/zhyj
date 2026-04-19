"use client";

import { useState, useEffect } from "react";

export interface UserInfo {
  role: string;
  name: string;
  staffId?: string;
}

interface UseAuthResult {
  user: UserInfo | null;
  loading: boolean;
}

/**
 * Fetches current user info from /api/v1/auth/stores on mount.
 * Returns { user: { role, name } | null, loading }.
 * If the fetch fails (network error, 401, etc.), user is null
 * and the navigation will safely show no management items.
 */
export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchUser() {
      try {
        const res = await fetch("/api/v1/auth/staff/stores", {
          credentials: "include",
        });
        if (!res.ok || cancelled) {
          setUser(null);
          return;
        }
        const json = await res.json();
        if (json.success && json.data) {
          setUser({
            role: json.data.role ?? null,
            name: json.data.name ?? "",
            staffId: json.data.staffId ?? undefined,
          });
        }
      } catch {
        // Network error — user is null, nav shows safe defaults
        setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchUser();
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading };
}
