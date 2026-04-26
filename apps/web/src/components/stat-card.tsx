"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ─── Types ─── */

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: string;
  loading?: boolean;
  className?: string;
}

/* ─── Component ─── */

function StatCard({
  label,
  value,
  icon,
  color,
  loading = false,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-sm",
        className
      )}
    >
      <div className="flex items-center gap-2">
        {icon && (
          <div className="text-muted-foreground">{icon}</div>
        )}
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p
        className={cn(
          "mt-1 text-2xl font-bold",
          color ?? "text-foreground"
        )}
      >
        {loading ? "—" : value}
      </p>
    </div>
  );
}

export { StatCard, type StatCardProps };
