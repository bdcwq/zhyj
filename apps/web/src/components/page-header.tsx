"use client";

import * as React from "react";

/* ─── Types ─── */

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

/* ─── Component ─── */

function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="min-w-0">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export { PageHeader, type PageHeaderProps };
