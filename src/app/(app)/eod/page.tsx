import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { EodForm } from "@/components/eod-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/callout";
import { StatusChip } from "@/components/ui/status";
import { requireSession, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { humanDate, localDateISO, msUntilLocalMidnight } from "@/lib/dates";
import type { EodReport, Profile } from "@/lib/types";

export const metadata: Metadata = { title: "EOD Report" };

/** Identity and plumbing keys — not part of what someone wrote. */
const HIDDEN_KEYS = new Set(["name", "email", "date", "user_id", "token", "submission_id", "id"]);

function locksInLabel(timeZone: string) {
  const ms = msUntilLocalMidnight(timeZone);
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.round((ms % 3_600_000) / 60_000);
  return hours <= 0 ? `${minutes} min from now` : `about ${hours}h ${minutes}m from now`;
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export default async function EodPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const staff = isStaff(session.profile);

  const todayISO = localDateISO(session.profile.timezone);

  const [{ data: reportRows }, { data: peopleRows }] = await Promise.all([
    supabase.from("eod_reports").select("*").order("report_date", { ascending: false }).limit(60),
    supabase.from("profiles").select("id, full_name, timezone, is_active").order("full_name"),
  ]);

  const reports = (reportRows ?? []) as EodReport[];
  const people = (peopleRows ?? []) as Pick<
    Profile,
    "id" | "full_name" | "timezone" | "is_active"
  >[];
  const nameOf = new Map(people.map((p) => [p.id, p.full_name]));

  const myReports = reports.filter((r) => r.profile_id === session.userId);
  const mineToday = myReports.find((r) => r.report_date === todayISO) ?? null;

  const existing = mineToday
    ? {
        work_done: String(
          (mineToday.payload as Record<string, unknown>)?.work_done ?? mineToday.summary ?? "",
        ),
        blockers: String((mineToday.payload as Record<string, unknown>)?.blockers ?? ""),
      }
    : null;

  // "Today" is each person's own local date, so nobody is flagged late merely
  // for being in a different timezone.
  const teamToday = people
    .filter((p) => p.is_active)
    .map((person) => {
      const personToday = localDateISO(person.timezone);
      return {
        person,
        personToday,
        submitted: reports.some(
          (r) => r.profile_id === person.id && r.report_date === personToday,
        ),
      };
    });

  return (
    <>
      <PageHeader
        title="EOD Report"
        description="Write your end-of-day here. It saves straight into the app."
        actions={
          <StatusChip
            state={mineToday ? "present" : "unmarked"}
            label={mineToday ? "Filed today" : "Not filed today"}
          />
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Today — {humanDate(todayISO)}</CardTitle>
          <CardDescription>
            {session.profile.timezone} · your own date, not the server&rsquo;s
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EodForm existing={existing} locksInLabel={locksInLabel(session.profile.timezone)} />
        </CardContent>
      </Card>

      {staff ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Who has filed today</CardTitle>
            <CardDescription>
              Checked against each person&rsquo;s own local date.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-line">
              {teamToday.map(({ person, personToday, submitted }) => (
                <li key={person.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-[13px] text-navy">{person.full_name}</p>
                    <p className="text-xs text-ink-muted">
                      {person.timezone} · {humanDate(personToday)}
                    </p>
                  </div>
                  <StatusChip
                    state={submitted ? "present" : "unmarked"}
                    label={submitted ? "Filed" : "Missing"}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{staff ? "Recent reports" : "Your EOD history"}</CardTitle>
          <CardDescription>
            Yesterday and earlier are read-only — that&rsquo;s what makes it a daily record.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <EmptyState title="No EOD reports yet.">
              Yours will appear here as soon as you file one above.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {reports.map((report) => {
                const entries = Object.entries(report.payload ?? {}).filter(
                  ([key, value]) =>
                    !HIDDEN_KEYS.has(key.toLowerCase()) && value !== "" && value !== null,
                );

                return (
                  <li key={report.id} className="py-3">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium text-navy">
                            {humanDate(report.report_date)}
                            {staff ? (
                              <span className="ml-2 font-normal text-ink-muted">
                                {nameOf.get(report.profile_id) ?? "Unknown"}
                              </span>
                            ) : null}
                            {report.report_date === todayISO &&
                            report.profile_id === session.userId ? (
                              <span className="ml-2 text-[11px] text-mint-deep">today</span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 line-clamp-1 block text-xs text-ink-muted">
                            {report.summary ?? `${entries.length} fields`}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-mint-deep group-open:hidden">
                          View
                        </span>
                        <span className="hidden shrink-0 text-xs text-ink-muted group-open:inline">
                          Hide
                        </span>
                      </summary>

                      <dl className="mt-3 grid gap-2 rounded-lg border border-line bg-canvas p-3">
                        {entries.length === 0 ? (
                          <p className="text-xs text-ink-muted">Empty report.</p>
                        ) : (
                          entries.map(([key, value]) => (
                            <div key={key} className="grid gap-0.5 sm:grid-cols-[9rem_1fr]">
                              <dt className="text-xs font-medium text-ink-muted">
                                {key.replace(/[-_]+/g, " ")}
                              </dt>
                              <dd className="text-[13px] whitespace-pre-wrap text-navy">
                                {renderValue(value)}
                              </dd>
                            </div>
                          ))
                        )}
                      </dl>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {staff ? (
        <Callout className="mt-6">
          Reports written here are stored directly in <code>public.eod_reports</code>. The n8n
          webhook at <code>/api/webhooks/n8n/eod</code> still works if you ever want to pipe
          submissions in from elsewhere — nothing depends on it now.
        </Callout>
      ) : null}
    </>
  );
}
