import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { MonthNav, monthParam, parseMonthParam } from "@/components/month-nav";
import { DayMarker } from "@/components/day-marker";
import { AmendDayForm } from "@/components/amend-day-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DayCell, Legend, StatusChip } from "@/components/ui/status";
import { Callout, EmptyState } from "@/components/ui/callout";
import { buttonVariants } from "@/components/ui/button";
import { requireSession, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildDays, summarise } from "@/lib/attendance";
import {
  eachDayOfMonth,
  humanDate,
  localDateISO,
  monthEnd,
  monthName,
  monthStart,
  msUntilLocalMidnight,
  weekdayShort,
} from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Attendance, AttendanceStatus, LeaveRequest, Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Attendance" };

function locksInLabel(timeZone: string) {
  const ms = msUntilLocalMidnight(timeZone);
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.round((ms % 3_600_000) / 60_000);
  if (hours <= 0) return `${minutes} min from now`;
  return `about ${hours}h ${minutes}m from now`;
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await requireSession();
  const supabase = await createClient();
  const staff = isStaff(session.profile);

  const todayISO = localDateISO(session.profile.timezone);
  const { month: monthRaw } = await searchParams;
  const { year, month } = parseMonthParam(monthRaw, todayISO);

  const rangeStart = monthStart(year, month);
  const rangeEnd = monthEnd(year, month);
  const days = eachDayOfMonth(year, month);

  // RLS does the scoping: an Employee's query returns only their own rows even
  // though the filter below is org-wide.
  const [{ data: peopleRows }, { data: attendanceRows }, { data: leaveRows }, { data: todayRow }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, role, timezone, joined_on, is_active")
        .order("full_name"),
      supabase
        .from("attendance")
        .select("profile_id, work_date, status, note")
        .gte("work_date", rangeStart)
        .lte("work_date", rangeEnd),
      supabase
        .from("leave_requests")
        .select("profile_id, start_date, end_date, leave_type, status")
        .eq("status", "approved")
        .lte("start_date", rangeEnd)
        .gte("end_date", rangeStart),
      supabase
        .from("attendance")
        .select("status")
        .eq("profile_id", session.userId)
        .eq("work_date", todayISO)
        .maybeSingle<{ status: AttendanceStatus }>(),
    ]);

  const people = (peopleRows ?? []) as Pick<
    Profile,
    "id" | "full_name" | "email" | "role" | "timezone" | "joined_on" | "is_active"
  >[];
  const activePeople = people.filter((p) => p.is_active);
  const attendance = (attendanceRows ?? []) as (Pick<Attendance, "work_date" | "status" | "note"> & {
    profile_id: string;
  })[];
  const leaves = (leaveRows ?? []) as (Pick<
    LeaveRequest,
    "start_date" | "end_date" | "leave_type" | "status"
  > & { profile_id: string })[];

  const rows = activePeople.map((person) => {
    const dayMap = buildDays({
      days,
      attendance: attendance.filter((a) => a.profile_id === person.id),
      leaves: leaves.filter((l) => l.profile_id === person.id),
      joinedOn: person.joined_on,
      todayISO,
    });
    return { person, dayMap, summary: summarise(dayMap.values()) };
  });

  return (
    <>
      <PageHeader
        title="Attendance"
        description="One status per person per day. No clock-in, no hours."
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Today — {humanDate(todayISO)}</CardTitle>
          <CardDescription>
            {session.profile.timezone} · your own date, not the server&rsquo;s
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DayMarker
            current={todayRow?.status ?? null}
            locksInLabel={locksInLabel(session.profile.timezone)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{staff ? "Team month" : "Your month"}</CardTitle>
            <CardDescription>
              {monthName(month)} {year}
              {staff ? ` · ${activePeople.length} active` : ""}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <MonthNav basePath="/attendance" year={year} month={month} />
            {staff ? (
              <Link
                href={`/api/attendance/export?month=${monthParam(year, month)}`}
                prefetch={false}
                className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
              >
                <Download className="size-4" />
                CSV
              </Link>
            ) : null}
          </div>
        </CardHeader>

        <CardContent>
          {rows.length === 0 ? (
            <EmptyState title="Nobody to show yet.">
              Add your first person from the Team page.
            </EmptyState>
          ) : (
            <>
              <div className="-mx-1 overflow-x-auto px-1 pb-2">
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 bg-surface pr-3 pb-2 text-left text-xs font-medium text-ink-muted">
                        Person
                      </th>
                      {days.map((day) => (
                        <th key={day} className="px-0.5 pb-2 text-center">
                          <span className="block text-[10px] leading-3 text-ink-faint">
                            {weekdayShort(day)}
                          </span>
                          <span className="block text-[10px] leading-4 text-ink-muted tabular">
                            {Number(day.slice(8))}
                          </span>
                        </th>
                      ))}
                      {["P", "H", "A", "L", "Pay"].map((label) => (
                        <th
                          key={label}
                          className="px-1.5 pb-2 text-center text-[10px] font-medium text-ink-muted"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ person, dayMap, summary }) => (
                      <tr key={person.id} className="group">
                        <td className="sticky left-0 z-10 max-w-40 truncate border-t border-line bg-surface py-1.5 pr-3 text-[13px] text-navy">
                          {person.full_name}
                          {person.id === session.userId ? (
                            <span className="ml-1 text-[11px] text-ink-faint">(you)</span>
                          ) : null}
                        </td>
                        {days.map((day) => {
                          const info = dayMap.get(day)!;
                          return (
                            <td key={day} className="border-t border-line px-0.5 py-1.5">
                              <DayCell
                                state={info.state}
                                title={`${person.full_name} · ${humanDate(day)}`}
                              />
                            </td>
                          );
                        })}
                        <td className="border-t border-line px-1.5 text-center text-[13px] text-navy tabular">
                          {summary.present}
                        </td>
                        <td className="border-t border-line px-1.5 text-center text-[13px] text-navy tabular">
                          {summary.halfDay}
                        </td>
                        <td className="border-t border-line px-1.5 text-center text-[13px] text-navy tabular">
                          {summary.absent}
                        </td>
                        <td className="border-t border-line px-1.5 text-center text-[13px] text-navy tabular">
                          {summary.paidLeave + summary.unpaidLeave}
                        </td>
                        <td className="border-t border-line px-1.5 text-center text-[13px] font-semibold text-navy tabular">
                          {summary.payableDays}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <Legend />
                <p className="text-xs text-ink-muted">
                  Pay = Present + ½ Half Day + approved paid leave
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {!staff && rows[0] ? (
        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Your month at a glance</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <StatusChip state="present" label={`Present ${rows[0].summary.present}`} />
              <StatusChip state="half_day" label={`Half Day ${rows[0].summary.halfDay}`} />
              <StatusChip state="absent" label={`Absent ${rows[0].summary.absent}`} />
              <StatusChip
                state="leave"
                label={`Leave ${rows[0].summary.paidLeave + rows[0].summary.unpaidLeave}`}
              />
              <StatusChip state="unmarked" label={`Not marked ${rows[0].summary.unmarked}`} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {staff ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Amend a day</CardTitle>
            <CardDescription>
              For past days, or when someone forgot. Every change is recorded with your name.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AmendDayForm
              people={activePeople.map((p) => ({ id: p.id, full_name: p.full_name }))}
              defaultDate={todayISO}
            />
            <Callout className="mt-4">
              Nothing is auto-marked. A blank cell means <strong>Not marked</strong>, which is not
              the same as Absent — deliberately, since this team sometimes works weekends.
            </Callout>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
