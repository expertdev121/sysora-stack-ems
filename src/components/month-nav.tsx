import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthName } from "@/lib/dates";

export function monthParam(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Parses ?month=YYYY-MM, falling back to the caller's current month. */
export function parseMonthParam(
  raw: string | undefined,
  fallbackISODate: string,
): { year: number; month: number } {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [year, month] = raw.split("-").map(Number);
    if (month >= 1 && month <= 12) return { year, month };
  }
  const [year, month] = fallbackISODate.split("-").map(Number);
  return { year, month };
}

export function shiftMonth(year: number, month: number, delta: number) {
  const zero = month - 1 + delta;
  return { year: year + Math.floor(zero / 12), month: ((zero % 12) + 12) % 12 + 1 };
}

export function MonthNav({
  basePath,
  year,
  month,
}: {
  basePath: string;
  year: number;
  month: number;
}) {
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  const linkClass =
    "grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface text-ink-muted transition-colors hover:border-line-strong hover:text-navy";

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`${basePath}?month=${monthParam(prev.year, prev.month)}`}
        aria-label="Previous month"
        className={linkClass}
      >
        <ChevronLeft className="size-4" />
      </Link>
      <span className="min-w-36 text-center text-sm font-medium text-navy">
        {monthName(month)} {year}
      </span>
      <Link
        href={`${basePath}?month=${monthParam(next.year, next.month)}`}
        aria-label="Next month"
        className={linkClass}
      >
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}
