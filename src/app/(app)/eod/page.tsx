import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { EodFrame } from "@/components/eod-frame";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/callout";
import { StatusChip } from "@/components/ui/status";
import { requireSession, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildEodFormUrl, eodFormBaseUrl, prefillEnabled, EOD_PARAMS } from "@/lib/eod";
import { humanDate, localDateISO } from "@/lib/dates";
import type { EodReport, Profile } from "@/lib/types";

export const metadata: Metadata = { title: "EOD Report" };

const HIDDEN_KEYS = new Set(
  [EOD_PARAMS.userId, EOD_PARAMS.token, "submission_id", "submissionId", "id"].map((k) =>
    k.toLowerCase(),
  ),
);

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

  const formUrl = buildEodFormUrl({
    profileId: session.userId,
    fullName: session.profile.full_name,
    email: session.email,
    reportDate: todayISO,
  });

  const [{ data: reportRows }, { data: peopleRows }] = await Promise.all([
    supabase
      .from("eod_reports")
      .select("*")
      .order("report_date", { ascending: false })
      .limit(60),
    supabase.from("profiles").select("id, full_name, timezone, is_active").order("full_name"),
  ]);

  const reports = (reportRows ?? []) as EodReport[];
  const people = (peopleRows ?? []) as Pick<
    Profile,
    "id" | "full_name" | "timezone" | "is_active"
  >[];
  const nameOf = new Map(people.map((p) => [p.id, p.full_name]));

  const myReports = reports.filter((r) => r.profile_id === session.userId);
  const submittedToday = myReports.some((r) => r.report_date === todayISO);

  // "Today" is evaluated in each person's own timezone, not the server's.
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

  const base = eodFormBaseUrl();
  let formHost = "your n8n instance";
  if (base) {
    try {
      formHost = new URL(base).host;
    } catch {
      /* keep the fallback label */
    }
  }

  return (
    <>
      <PageHeader
        title="EOD Report"
        description="Fill in your end-of-day report here without leaving the app."
        actions={
          <StatusChip
            state={submittedToday ? "present" : "unmarked"}
            label={submittedToday ? "Submitted today" : "Not submitted today"}
          />
        }
      />

      {formUrl ? (
        <EodFrame src={formUrl} formHost={formHost} prefilled={prefillEnabled()} />
      ) : (
        <Callout tone="warn" title="No form URL configured yet.">
          Set <code className="rounded bg-surface px-1 py-0.5 text-[12px]">EOD_FORM_URL</code> in
          your environment to the form address. Everything else on this page already works.
        </Callout>
      )}

      {staff ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Who has submitted today</CardTitle>
            <CardDescription>
              Checked against each person&rsquo;s own local date, so nobody is flagged late just
              for being in a different timezone.
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
                    label={submitted ? "Submitted" : "Missing"}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{staff ? "Recent submissions" : "Your EOD history"}</CardTitle>
          <CardDescription>
            Stored exactly as it arrived, so a change to the form can never break this list. This
            fills up only once something POSTs submissions to the return webhook — the embedded
            form does not do that on its own.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <EmptyState title="No EOD reports yet.">
              They&rsquo;ll appear here the moment n8n POSTs the first one to the webhook.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {reports.map((report) => {
                const entries = Object.entries(report.payload ?? {}).filter(
                  ([key]) => !HIDDEN_KEYS.has(key.toLowerCase()),
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
                          <p className="text-xs text-ink-muted">Empty payload.</p>
                        ) : (
                          entries.map(([key, value]) => (
                            <div key={key} className="grid gap-0.5 sm:grid-cols-[10rem_1fr]">
                              <dt className="text-xs font-medium text-ink-muted">{key}</dt>
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
    </>
  );
}
