import * as React from "react";
import { cn } from "@/lib/utils";
import type { DayState, LeaveStatus } from "@/lib/types";

export const DAY_STATE_LABEL: Record<DayState, string> = {
  present: "Present",
  half_day: "Half Day",
  absent: "Absent",
  leave: "On leave",
  unmarked: "Not marked",
  pre_joining: "Before joining",
};

/**
 * Attendance states are distinguished by FILL, not by hue.
 * Solid mint / half-filled mint / solid cool grey / navy hatch — so the grid
 * stays instantly readable while mint remains the only saturated colour.
 */
export const DAY_STATE_CELL: Record<DayState, string> = {
  present: "bg-mint border-mint",
  half_day: "status-fill-half border-mint-line",
  absent: "bg-[var(--color-status-absent)] border-[var(--color-status-absent)]",
  leave: "status-fill-leave border-navy-line",
  unmarked: "bg-surface border-dashed border-line-strong",
  pre_joining: "bg-canvas border-transparent",
};

const DAY_STATE_CHIP: Record<DayState, string> = {
  present: "bg-mint-soft text-mint-deep border-mint-line",
  half_day: "bg-mint-soft/60 text-mint-deep border-mint-line",
  absent: "bg-navy-soft text-[var(--color-status-absent-ink)] border-navy-line",
  leave: "bg-navy-soft text-navy border-navy-line",
  unmarked: "bg-surface text-ink-muted border-dashed border-line-strong",
  pre_joining: "bg-canvas text-ink-faint border-line",
};

export function StatusChip({
  state,
  className,
  label,
}: {
  state: DayState;
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        DAY_STATE_CHIP[state],
        className,
      )}
    >
      {label ?? DAY_STATE_LABEL[state]}
    </span>
  );
}

export function DayCell({
  state,
  title,
  className,
}: {
  state: DayState;
  title: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      aria-label={title}
      className={cn("block h-6 w-6 rounded-[5px] border", DAY_STATE_CELL[state], className)}
    />
  );
}

const LEAVE_STATUS_CHIP: Record<LeaveStatus, string> = {
  pending: "bg-surface text-ink-muted border-line-strong border-dashed",
  approved: "bg-mint-soft text-mint-deep border-mint-line",
  rejected: "bg-navy-soft text-navy border-navy-line",
  cancelled: "bg-canvas text-ink-faint border-line",
};

const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Withdrawn",
};

export function LeaveStatusChip({ status }: { status: LeaveStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        LEAVE_STATUS_CHIP[status],
      )}
    >
      {LEAVE_STATUS_LABEL[status]}
    </span>
  );
}

export function Legend() {
  const items: DayState[] = ["present", "half_day", "absent", "leave", "unmarked"];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {items.map((state) => (
        <span key={state} className="flex items-center gap-1.5 text-xs text-ink-muted">
          <span className={cn("h-3.5 w-3.5 rounded-[4px] border", DAY_STATE_CELL[state])} />
          {DAY_STATE_LABEL[state]}
        </span>
      ))}
    </div>
  );
}
