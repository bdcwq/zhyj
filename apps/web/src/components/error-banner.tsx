"use client";

import { AlertCircle } from "lucide-react";

/* ─── Types ─── */

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

/* ─── Component ─── */

function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-apple-error/10 border border-apple-error/20 px-4 py-3 text-sm text-apple-error">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="underline hover:no-underline font-medium"
        >
          重试
        </button>
      )}
    </div>
  );
}

export { ErrorBanner, type ErrorBannerProps };
