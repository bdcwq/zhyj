"use client";

import { cn } from "@/lib/utils";

/* ─── Types ─── */

interface StatusBadgeProps {
  status: string;
  colorMap?: Record<string, string>;
  labelMap?: Record<string, string>;
  variant?: "solid" | "ring";
  className?: string;
}

/* ─── Component ─── */

function StatusBadge({
  status,
  colorMap,
  labelMap,
  variant = "solid",
  className,
}: StatusBadgeProps) {
  const label = labelMap?.[status] ?? status;

  // Default fallback for unknown statuses
  const defaultColor =
    variant === "ring"
      ? "bg-muted text-muted-foreground ring-muted-foreground/20"
      : "bg-muted text-muted-foreground";

  const colorClasses = colorMap?.[status] ?? defaultColor;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variant === "ring" && "ring-1 ring-inset",
        colorClasses,
        className
      )}
    >
      {label}
    </span>
  );
}

export { StatusBadge, type StatusBadgeProps };
