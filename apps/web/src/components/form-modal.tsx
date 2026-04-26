"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* ─── Types ─── */

interface FormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  onSubmit?: () => void;
  submitting?: boolean;
  error?: string;
  submitLabel?: string;
  cancelLabel?: string;
}

/* ─── Component ─── */

function FormModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitting = false,
  error,
  submitLabel = "提交",
  cancelLabel = "取消",
}: FormModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md rounded-xl shadow-2xl ring-1 ring-foreground/5 p-0"
        showCloseButton={false}
      >
        {/* Header */}
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>

        {/* Body — scrollable form content */}
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          {/* Error banner */}
          {error && (
            <div className="rounded-lg bg-apple-error/10 border border-apple-error/20 px-3 py-2 text-sm text-apple-error mb-4">
              {error}
            </div>
          )}
          {children}
        </div>

        {/* Footer — cancel + submit */}
        {onSubmit && (
          <DialogFooter className="border-t border-border px-6 py-4 gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              {cancelLabel}
            </Button>
            <Button type="submit" disabled={submitting} onClick={onSubmit}>
              {submitting && <Loader2 className="animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { FormModal, type FormModalProps };
