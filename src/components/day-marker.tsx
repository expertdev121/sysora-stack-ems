"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { markMyDay } from "@/app/actions/attendance";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/lib/types";

const OPTIONS: { value: AttendanceStatus; label: string; hint: string }[] = [
  { value: "present", label: "Present", hint: "Full day" },
  { value: "half_day", label: "Half Day", hint: "Counts as 0.5" },
  { value: "absent", label: "Absent", hint: "Unpaid unless on approved leave" },
];

export function DayMarker({
  current,
  locksInLabel,
}: {
  current: AttendanceStatus | null;
  locksInLabel: string;
}) {
  const [status, setStatus] = useState<AttendanceStatus | null>(current);
  const [pending, startTransition] = useTransition();

  function choose(value: AttendanceStatus) {
    const previous = status;
    setStatus(value);

    startTransition(async () => {
      const data = new FormData();
      data.set("status", value);
      const result = await markMyDay(data);

      if (!result.ok) {
        setStatus(previous);
        toast.error(result.error);
      } else {
        toast.success(`Marked ${OPTIONS.find((o) => o.value === value)?.label}.`);
      }
    });
  }

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-3">
        {OPTIONS.map((option) => {
          const selected = status === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={pending}
              aria-pressed={selected}
              onClick={() => choose(option.value)}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-lg border px-4 py-3 text-left transition-colors disabled:opacity-60",
                selected
                  ? "border-mint bg-mint-soft"
                  : "border-line bg-surface hover:border-line-strong hover:bg-canvas",
              )}
            >
              <span className="flex w-full items-center justify-between">
                <span
                  className={cn(
                    "text-sm font-medium",
                    selected ? "text-mint-deep" : "text-navy",
                  )}
                >
                  {option.label}
                </span>
                {selected ? <Check className="size-4 text-mint-deep" /> : null}
              </span>
              <span className="text-xs text-ink-muted">{option.hint}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-ink-muted">
        {status
          ? `You can change this until midnight your time — ${locksInLabel}. After that only a Manager or the Owner can amend it.`
          : `Not marked yet. This locks at midnight your time — ${locksInLabel}.`}
      </p>
    </div>
  );
}
