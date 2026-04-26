"use client";

import * as React from "react";

/* ─── Types ─── */

interface EmptyStateProps {
  icon?: React.ReactNode;
  message?: string;
  action?: React.ReactNode;
}

/* ─── Component ─── */

function EmptyState({
  icon,
  message = "暂无数据",
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && (
        <div className="mb-3 text-muted-foreground">{icon}</div>
      )}
      <p className="text-sm text-muted-foreground">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export { EmptyState, type EmptyStateProps };
