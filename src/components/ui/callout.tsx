import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Notices. Deliberately monochrome-plus-mint: an "error" is a navy-tinted
 * panel, not a red one, so a page showing an error still has exactly one
 * saturated colour on it.
 */
export function Callout({
  tone = "neutral",
  title,
  children,
  className,
}: {
  tone?: "neutral" | "accent" | "warn";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "border-line bg-surface text-ink-muted",
    accent: "border-mint-line bg-mint-soft text-mint-deep",
    warn: "border-navy-line bg-navy-soft text-navy",
  } as const;

  return (
    <div className={cn("rounded-lg border px-4 py-3 text-[13px]", tones[tone], className)}>
      {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="text-sm font-medium text-navy">{title}</p>
      {children ? <p className="mt-1 text-[13px] text-ink-muted">{children}</p> : null}
    </div>
  );
}
