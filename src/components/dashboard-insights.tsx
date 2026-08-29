import { DAY_STATE_CELL, DAY_STATE_LABEL, DayCell } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import type { DayState } from "@/lib/types";

/**
 * The last seven days at a glance.
 *
 * The dashboard already loads a week of attendance to answer "did you mark
 * today"; showing the rest of it costs nothing and answers the question people
 * actually have on a Monday, which is whether last week has holes in it.
 *
 * Weekday initials rather than dates: at seven cells the letter is enough to
 * orient by, and a date under every square turns a glanceable strip into
 * something you have to read.
 */
export function WeekStrip({
  days,
}: {
  days: { date: string; state: DayState; weekday: string }[];
}) {
  return (
    <div className="flex items-end gap-1.5">
      {days.map((day) => (
        <div key={day.date} className="flex flex-col items-center gap-1">
          <DayCell state={day.state} title={`${day.date} — ${DAY_STATE_LABEL[day.state]}`} />
          <span className="text-[10px] text-ink-faint">{day.weekday}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Who is accounted for today, as one proportional bar.
 *
 * Uses the same fills as the attendance grid rather than a palette of its own —
 * the house rule is that these states are told apart by fill, not hue, so a
 * five-colour stacked bar would be a second visual language for the same facts.
 */
export function CoverageBar({
  counts,
  total,
}: {
  counts: { state: DayState; n: number }[];
  total: number;
}) {
  const present = counts.filter((c) => c.state === "present" || c.state === "half_day");
  const accounted = counts
    .filter((c) => c.state !== "unmarked")
    .reduce((sum, c) => sum + c.n, 0);

  const shown = counts.filter((c) => c.n > 0);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-[30px] leading-none font-bold tracking-[-0.8px] text-navy tabular">
          {present.reduce((sum, c) => sum + c.n, 0)}
          <span className="ml-1 text-[15px] font-semibold text-ink-faint">/ {total}</span>
        </p>
        <p className="text-xs text-ink-muted">
          {total - accounted > 0 ? `${total - accounted} not marked` : "everyone accounted for"}
        </p>
      </div>

      {total > 0 ? (
        <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {shown.map((c) => (
            <span
              key={c.state}
              title={`${DAY_STATE_LABEL[c.state]}: ${c.n}`}
              style={{ flexGrow: c.n }}
              className={cn("block rounded-full border", DAY_STATE_CELL[c.state])}
            />
          ))}
        </div>
      ) : null}

      <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1">
        {shown.map((c) => (
          <span key={c.state} className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className={cn("h-2.5 w-2.5 rounded-[3px] border", DAY_STATE_CELL[c.state])} />
            {DAY_STATE_LABEL[c.state]} {c.n}
          </span>
        ))}
      </div>
    </div>
  );
}
