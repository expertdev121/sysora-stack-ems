import { eachDayBetween } from "@/lib/dates";
import type { Attendance, DayState, LeaveRequest, LeaveType } from "@/lib/types";

export interface DayInfo {
  state: DayState;
  leaveType?: LeaveType;
  note?: string | null;
}

export interface MonthSummary {
  present: number;
  halfDay: number;
  absent: number;
  paidLeave: number;
  unpaidLeave: number;
  unmarked: number;
  /** Present + 0.5 x Half Day + approved PAID leave. Absent is unpaid. */
  payableDays: number;
}

/**
 * Resolve every day of a range into one state.
 *
 * Precedence: an approved leave day wins over an attendance row, because an
 * approved absence is not the same thing as an unexplained one. Days before a
 * person joined are excluded from every count rather than shown as missing.
 */
export function buildDays({
  days,
  attendance,
  leaves,
  joinedOn,
  todayISO,
}: {
  days: string[];
  attendance: Pick<Attendance, "work_date" | "status" | "note">[];
  leaves: Pick<LeaveRequest, "start_date" | "end_date" | "leave_type" | "status">[];
  joinedOn?: string;
  todayISO?: string;
}): Map<string, DayInfo> {
  const byDate = new Map<string, DayInfo>();

  for (const day of days) {
    if (joinedOn && day < joinedOn) {
      byDate.set(day, { state: "pre_joining" });
      continue;
    }
    if (todayISO && day > todayISO) {
      byDate.set(day, { state: "pre_joining" });
      continue;
    }
    byDate.set(day, { state: "unmarked" });
  }

  for (const row of attendance) {
    const current = byDate.get(row.work_date);
    if (!current || current.state === "pre_joining") continue;
    byDate.set(row.work_date, { state: row.status, note: row.note });
  }

  for (const leave of leaves) {
    if (leave.status !== "approved") continue;
    for (const day of eachDayBetween(leave.start_date, leave.end_date)) {
      const current = byDate.get(day);
      if (!current || current.state === "pre_joining") continue;
      byDate.set(day, { state: "leave", leaveType: leave.leave_type });
    }
  }

  return byDate;
}

export function summarise(days: Iterable<DayInfo>): MonthSummary {
  const summary: MonthSummary = {
    present: 0,
    halfDay: 0,
    absent: 0,
    paidLeave: 0,
    unpaidLeave: 0,
    unmarked: 0,
    payableDays: 0,
  };

  for (const day of days) {
    switch (day.state) {
      case "present":
        summary.present += 1;
        break;
      case "half_day":
        summary.halfDay += 1;
        break;
      case "absent":
        summary.absent += 1;
        break;
      case "leave":
        if (day.leaveType === "unpaid") summary.unpaidLeave += 1;
        else summary.paidLeave += 1;
        break;
      case "unmarked":
        summary.unmarked += 1;
        break;
      default:
        break;
    }
  }

  summary.payableDays =
    summary.present + summary.halfDay * 0.5 + summary.paidLeave;

  return summary;
}
