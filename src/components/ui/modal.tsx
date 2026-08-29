"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A dialog, for the forms that were previously a <details> the page had to
 * grow around.
 *
 * Radix handles the parts that are tedious to get right and obvious when they
 * are wrong: focus moves in and is trapped, Escape closes, the page behind
 * stops scrolling, and everything outside is hidden from screen readers.
 *
 * Content scrolls inside the panel rather than the panel growing past the
 * viewport, because the submit button being below the fold is how a form gets
 * abandoned half-filled.
 */
export function Modal({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  className,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="modal-overlay fixed inset-0 z-50 bg-[var(--color-navy)]/35 backdrop-blur-[2px]" />

        <DialogPrimitive.Content
          className={cn(
            "modal-panel fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-2xl",
            "-translate-x-1/2 -translate-y-1/2",
            "flex max-h-[86vh] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-xl",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-[15px] font-semibold text-navy">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-[13px] text-ink-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>

            <DialogPrimitive.Close
              aria-label="Close"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-canvas hover:text-navy"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          {/* The dropdown panels inside are absolutely positioned, so this needs
              to scroll without clipping them shut at the edges. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
