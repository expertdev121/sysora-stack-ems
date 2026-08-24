import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  ExternalLink,
  NotebookPen,
  Plane,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatCard,
} from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status";
import { Callout, EmptyState } from "@/components/ui/callout";
import { TimezoneForm } from "@/components/person-admin";
import { requireSession, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { onboardingAsset } from "@/lib/team-assets";
import {
  addDaysISO,
  diffDaysISO,
  humanDate,
  humanDateRange,
  localDateISO,
  ordinal,
  toISODate,
} from "@/lib/dates";
import type { AttendanceStatus, DayState, LeaveRequest, Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

/** How long after someone joins the onboarding banner stays on their dashboard. */
const ONBOARDING_BANNER_DAYS = 30;

/** The zones this team actually works across. Any IANA zone is valid in the
 *  database; this is just the short list people pick from. */
const BASE_ZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Australia/Sydney",
  "UTC",
];

/** Next occurrence of the org's salary day, in the viewer's own timezone. */
function nextSalaryDate(todayISO: string, salaryDay: number): string {
  const [year, month, day] = todayISO.split("-").map(Number);
  if (day <= salaryDay) return toISODate(year, month, salaryDay);
  return month === 12 ? toISODate(year + 1, 1, salaryDay) : toISODate(year, month + 1, salaryDay);
}

export default async function DashboardPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const staff = isStaff(session.profile);

  const todayISO = localDateISO(session.profile.timezone);
  const year = Number(todayISO.slice(0, 4));
  const windowStart = addDaysISO(todayISO, -6);

  const [
    { data: peopleRows },
    { data: todayAttendanceRows },
    { data: leaveRows },
    { data: eodRows },
    { data: usageRows },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role, timezone, is_active, joined_on")
      .order("full_name"),
    supabase
      .from("attendance")
      .select("profile_id, work_date, status")
      .gte("work_date", windowStart)
      .lte("work_date", todayISO),
    supabase
      .from("leave_requests")
      .select("*")
      .order("start_date", { ascending: true })
      .limit(100),
    supabase
      .from("eod_reports")
      .select("profile_id, report_date, summary")
      .gte("report_date", windowStart)
      .order("report_date", { ascending: false }),
    supabase
      .from("v_leave_usage")
      .select("profile_id, paid_days_used")
      .eq("year", year),
  ]);

  const people = (peopleRows ?? []) as Pick<
    Profile,
    "id" | "full_name" | "role" | "timezone" | "is_active" | "joined_on"
  >[];
  const activePeople = people.filter((p) => p.is_active);
  const attendance = (todayAttendanceRows ?? []) as {
    profile_id: string;
    work_date: string;
    status: AttendanceStatus;
  }[];
  const leaves = (leaveRows ?? []) as LeaveRequest[];
  const eods = (eodRows ?? []) as { profile_id: string; report_date: string; summary: string | null }[];
  const usage = (usageRows ?? []) as { profile_id: string; paid_days_used: number }[];

  const myStatus =
    attendance.find((a) => a.profile_id === session.userId && a.work_date === todayISO)?.status ??
    null;
  const myEodToday = eods.some(
    (e) => e.profile_id === session.userId && e.report_date === todayISO,
  );
  const paidUsed = usage.find((u) => u.profile_id === session.userId)?.paid_days_used ?? 0;
  const remainingPaid = Math.max(0, session.org.annual_paid_leave - paidUsed);

  const myPending = leaves.filter(
    (l) => l.profile_id === session.userId && l.status === "pending",
  ).length;
  const teamPending = leaves.filter((l) => l.status === "pending");

  const onLeaveToday = new Set(
    leaves
      .filter((l) => l.status === "approved" && l.start_date <= todayISO && l.end_date >= todayISO)
      .map((l) => l.profile_id),
  );

  const salaryDate = nextSalaryDate(todayISO, session.org.salary_day);

  // The onboarding guide is prominent while it is actually useful, then gets
  // out of the way. A permanent banner is a banner nobody reads, and this page
  // is meant to answer "what do I owe today".
  const onboarding = onboardingAsset();
  const daysSinceJoining = diffDaysISO(session.profile.joined_on, todayISO);
  const isNewJoiner = daysSinceJoining >= 0 && daysSinceJoining <= ONBOARDING_BANNER_DAYS;
  const TIMEZONE_CHOICES = Array.from(new Set([session.profile.timezone, ...BASE_ZONES]));

  const teamToday = activePeople.map((person) => {
    const personToday = localDateISO(person.timezone);
    const row = attendance.find(
      (a) => a.profile_id === person.id && a.work_date === personToday,
    );
    const state: DayState = onLeaveToday.has(person.id)
      ? "leave"
      : (row?.status ?? "unmarked");
    return {
      person,
      state,
      personToday,
      eod: eods.some((e) => e.profile_id === person.id && e.report_date === personToday),
    };
  });

  const missingEod = teamToday.filter((t) => !t.eod && t.state !== "leave");

  return (
    <>
      <PageHeader
        title={`Hello, ${session.profile.full_name.split(" ")[0]}`}
        description={`${humanDate(todayISO)} · ${session.profile.timezone}`}
      />

      {/* ---- New joiner: onboarding -------------------------------------- */}
      {isNewJoiner && onboarding ? (
        <Callout tone="accent" title="New here? Start with the onboarding guide." className="mb-6">
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Accounts, access and what your first week looks like. It stays in{" "}
              <Link href="/assets" className="underline underline-offset-2">
                Team assets
              </Link>{" "}
              once you&rsquo;ve settled in.
            </span>
            <a
              href={onboarding.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-mint px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-mint-deep"
            >
              Open the guide
              <ExternalLink className="size-3.5" />
            </a>
          </span>
        </Callout>
      ) : null}

      {/* ---- Your day ---------------------------------------------------- */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Attendance"
          icon={<CalendarCheck2 />}
          footer={
            <Link
              href="/attendance"
              className="inline-flex items-center gap-1 font-medium text-mint-deep hover:underline"
            >
              {myStatus ? "Change it" : "Mark your day"}
              <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          <StatusChip state={myStatus ?? "unmarked"} />
        </StatCard>

        <StatCard
          label="EOD report"
          icon={<NotebookPen />}
          footer={
            <Link
              href="/eod"
              className="inline-flex items-center gap-1 font-medium text-mint-deep hover:underline"
            >
              {myEodToday ? "View history" : "Fill it in"}
              <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          <StatusChip
            state={myEodToday ? "present" : "unmarked"}
            label={myEodToday ? "Filed" : "Not filed"}
          />
        </StatCard>

        <StatCard
          label="Paid leave left"
          icon={<Plane />}
          footer={
            <>
              of {session.org.annual_paid_leave} this year
              {myPending > 0 ? ` · ${myPending} awaiting a decision` : ""}
            </>
          }
        >
          <p className="font-display text-[34px] leading-none font-extrabold tracking-[-1px] text-navy tabular">
            {remainingPaid}
          </p>
        </StatCard>

        <StatCard
          label="Salary date"
          icon={<CalendarClock />}
          footer={<>Next: {humanDate(salaryDate)}</>}
        >
          <p className="font-display text-[34px] leading-none font-extrabold tracking-[-1px] text-navy">
            {ordinal(session.org.salary_day)}
          </p>
        </StatCard>
      </div>

      {/* ---- Staff view -------------------------------------------------- */}
      {staff ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Team today</CardTitle>
              <CardDescription>Each row uses that person&rsquo;s own local date.</CardDescription>
            </CardHeader>
            <CardContent>
              {teamToday.length === 0 ? (
                <EmptyState title="No active people yet." />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {teamToday.map(({ person, state, eod }) => (
                    <li
                      key={person.id}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-mint-50/60"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-wash text-[11px] font-bold text-ink-muted">
                          {person.full_name
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((p) => p[0]?.toUpperCase() ?? "")
                            .join("")}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-navy">
                            {person.full_name}
                          </span>
                          <span className="block text-xs text-ink-muted">
                            {person.timezone} · EOD {eod ? "in" : "pending"}
                          </span>
                        </span>
                      </div>
                      <StatusChip state={state} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Leave waiting on a decision</CardTitle>
              </CardHeader>
              <CardContent>
                {teamPending.length === 0 ? (
                  <EmptyState title="Nothing pending." />
                ) : (
                  <ul className="divide-y divide-line">
                    {teamPending.slice(0, 5).map((request) => (
                      <li key={request.id} className="py-2.5">
                        <p className="text-[13px] text-navy">
                          {people.find((p) => p.id === request.profile_id)?.full_name ?? "Unknown"}{" "}
                          · {humanDateRange(request.start_date, request.end_date)}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {request.days_count} {request.days_count === 1 ? "day" : "days"} ·{" "}
                          {request.leave_type === "paid" ? "Paid" : "Unpaid"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {teamPending.length > 0 ? (
                  <Link
                    href="/leave"
                    className="mt-3 inline-flex items-center gap-1 text-[13px] text-mint-deep hover:underline"
                  >
                    Decide them
                    <ArrowRight className="size-3.5" />
                  </Link>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Missing EOD today</CardTitle>
                <CardDescription>
                  People on approved leave aren&rsquo;t counted as missing.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {missingEod.length === 0 ? (
                  <Callout tone="accent">Everyone has filed today. Nothing to chase.</Callout>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {missingEod.map(({ person }) => (
                      <li key={person.id}>
                        <StatusChip state="unmarked" label={person.full_name} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Your last few days</CardTitle>
          </CardHeader>
          <CardContent>
            {eods.filter((e) => e.profile_id === session.userId).length === 0 ? (
              <EmptyState title="No EOD reports in the last week." />
            ) : (
              <ul className="divide-y divide-line">
                {eods
                  .filter((e) => e.profile_id === session.userId)
                  .slice(0, 7)
                  .map((report) => (
                    <li key={report.report_date} className="py-2.5">
                      <p className="text-[13px] text-navy">{humanDate(report.report_date)}</p>
                      <p className="line-clamp-2 text-xs text-ink-muted">
                        {report.summary ?? "Submitted"}
                      </p>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---- Your settings ------------------------------------------------ */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Your settings</CardTitle>
          <CardDescription>
            Your timezone decides when your day rolls over for attendance and EOD.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-6">
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-navy">Timezone</p>
            <TimezoneForm current={session.profile.timezone} zones={TIMEZONE_CHOICES} />
          </div>
          <Link
            href="/change-password?voluntary=1"
            className="text-[13px] text-mint-deep hover:underline"
          >
            Change your password
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
