/**
 * Timezone and calendar helpers.
 *
 * The rule for the whole app: every INSTANT is stored as timestamptz (UTC) and
 * every CALENDAR DATE is resolved in the acting person's own IANA timezone.
 * A contractor in IST marking attendance at 23:40 must land on that day, not
 * on tomorrow because UTC has already rolled over.
 *
 * ISO date strings ('YYYY-MM-DD') are treated as opaque calendar labels and are
 * never round-tripped through `new Date(str)`, which would interpret them as
 * UTC midnight and shift the day for anyone west of Greenwich.
 */

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The current calendar date in `timeZone`, as 'YYYY-MM-DD'. */
export function localDateISO(timeZone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Wall-clock time in `timeZone`, e.g. "11:42 pm". */
export function localTime(timeZone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

/** Short zone label, e.g. "GMT+5:30". */
export function zoneLabel(timeZone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(at);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function supportedTimeZones(): string[] {
  const withValues = Intl as typeof Intl & { supportedValuesOf?: (k: string) => string[] };
  if (typeof withValues.supportedValuesOf === "function") {
    return withValues.supportedValuesOf("timeZone");
  }
  return [DEFAULT_TIMEZONE, "UTC", "America/New_York", "Europe/London", "America/Toronto"];
}

/** Milliseconds until midnight in `timeZone` — powers the "locks in Xh" hint. */
export function msUntilLocalMidnight(timeZone: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const elapsed = num("hour") * 3_600_000 + num("minute") * 60_000 + num("second") * 1_000;
  return 86_400_000 - elapsed;
}

// ---------------------------------------------------------------------------
// Calendar-label arithmetic. No Date objects, no drift.
// ---------------------------------------------------------------------------

export function parseISODate(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

export function toISODate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthStart(year: number, month: number): string {
  return toISODate(year, month, 1);
}

export function monthEnd(year: number, month: number): string {
  return toISODate(year, month, daysInMonth(year, month));
}

export function eachDayOfMonth(year: number, month: number): string[] {
  return Array.from({ length: daysInMonth(year, month) }, (_, i) => toISODate(year, month, i + 1));
}

export function addDaysISO(iso: string, days: number): string {
  const { year, month, day } = parseISODate(iso);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return toISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function diffDaysISO(fromISO: string, toISOStr: string): number {
  const a = parseISODate(fromISO);
  const b = parseISODate(toISOStr);
  const ms =
    Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

/** Every calendar date from start to end inclusive. */
export function eachDayBetween(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const n = diffDaysISO(startISO, endISO);
  for (let i = 0; i <= n; i++) out.push(addDaysISO(startISO, i));
  return out;
}

/** 0 = Sunday … 6 = Saturday. Used only for column labels — no day is treated
 *  as non-working, because this team sometimes works weekends. */
export function weekdayIndex(iso: string): number {
  const { year, month, day } = parseISODate(iso);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function weekdayShort(iso: string): string {
  return ["S", "M", "T", "W", "T", "F", "S"][weekdayIndex(iso)];
}

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? "";
}

/** "23 Aug 2026" — unambiguous for a team spread across IST/US/UK. */
export function humanDate(iso: string): string {
  const { year, month, day } = parseISODate(iso);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function humanDateRange(startISO: string, endISO: string): string {
  return startISO === endISO ? humanDate(startISO) : `${humanDate(startISO)} → ${humanDate(endISO)}`;
}

/** Ordinal for the salary-day line: 5 -> "5th". */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
