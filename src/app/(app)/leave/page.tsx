import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { LeaveRequestForm } from "@/components/leave-request-form";
import { DecisionButtons, WithdrawButton } from "@/components/leave-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LeaveStatusChip } from "@/components/ui/status";
import { Callout, EmptyState } from "@/components/ui/callout";
import { requireSession, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { humanDateRange, localDateISO, monthName } from "@/lib/dates";
import type { LeaveMonthly, LeaveRequest, LeaveUsage, Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Leave" };

export default async function LeavePage() {
  const session = await requireSession();
  const supabase = await createClient();
  const staff = isStaff(session.profile);
  const owner = session.profile.role === "owner";

  const todayISO = localDateISO(session.profile.timezone);
  const year = Number(todayISO.slice(0, 4));

  const [{ data: peopleRows }, { data: requestRows }, { data: usageRows }, { data: monthlyRows }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name, role, is_active").order("full_name"),
      supabase
        .from("leave_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("v_leave_usage").select("*").eq("year", year),
      supabase.from("v_leave_monthly").select("*").eq("year", year),
    ]);

  const people = (peopleRows ?? []) as Pick<Profile, "id" | "full_name" | "role" | "is_active">[];
  const nameOf = new Map(people.map((p) => [p.id, p.full_name]));
  const requests = (requestRows ?? []) as LeaveRequest[];
  const usage = (usageRows ?? []) as LeaveUsage[];
  const monthly = (monthlyRows ?? []) as LeaveMonthly[];

  const myUsage = usage.find((u) => u.profile_id === session.userId);
  const paidUsed = myUsage?.paid_days_used ?? 0;
  const allowance = session.org.annual_paid_leave;
  const remainingPaid = Math.max(0, allowance - paidUsed);

  const myRequests = requests.filter((r) => r.profile_id === session.userId);
  const pending = requests.filter((r) => r.status === "pending");

  return (
    <>
      <PageHeader
        title="Leave"
        description={`${allowance} paid days a year. Request, get a decision, done.`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-ink-muted">Paid leave remaining ({year})</p>
            <p className="mt-1 text-3xl font-semibold text-navy tabular">{remainingPaid}</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-navy-soft">
              <div
                className="h-full rounded-full bg-mint"
                style={{ width: `${allowance ? Math.min(100, (paidUsed / allowance) * 100) : 0}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              {paidUsed} of {allowance} used
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-ink-muted">Unpaid leave taken ({year})</p>
            <p className="mt-1 text-3xl font-semibold text-navy tabular">
              {myUsage?.unpaid_days_used ?? 0}
            </p>
            <p className="mt-3 text-xs text-ink-muted">Not deducted from your paid allowance.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-ink-muted">Awaiting a decision</p>
            <p className="mt-1 text-3xl font-semibold text-navy tabular">
              {myRequests.filter((r) => r.status === "pending").length}
            </p>
            <p className="mt-3 text-xs text-ink-muted">
              {staff ? `${pending.length} pending across the team` : "Your Manager gets these."}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Request leave</CardTitle>
          <CardDescription>
            Approved paid leave counts as a full payable day. Absent does not.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LeaveRequestForm today={todayISO} remainingPaid={remainingPaid} />
        </CardContent>
      </Card>

      {staff ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Pending approvals</CardTitle>
            <CardDescription>
              Nobody approves their own leave. Only the Owner decides for a Manager or Owner.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pending.length === 0 ? (
              <EmptyState title="Nothing waiting on you." />
            ) : (
              <ul className="divide-y divide-line">
                {pending.map((request) => {
                  const subject = people.find((p) => p.id === request.profile_id);
                  const isMine = request.profile_id === session.userId;
                  const needsOwner =
                    !owner && (subject?.role === "manager" || subject?.role === "owner");

                  return (
                    <li key={request.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-navy">
                          {nameOf.get(request.profile_id) ?? "Unknown"} ·{" "}
                          {humanDateRange(request.start_date, request.end_date)}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {request.days_count} {request.days_count === 1 ? "day" : "days"} ·{" "}
                          {request.leave_type === "paid" ? "Paid" : "Unpaid"} · {request.reason}
                        </p>
                      </div>
                      {isMine ? (
                        <span className="text-xs text-ink-muted">
                          Your own request — someone else decides.
                        </span>
                      ) : needsOwner ? (
                        <span className="text-xs text-ink-muted">Owner decides this one.</span>
                      ) : (
                        <DecisionButtons requestId={request.id} />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card className={owner ? "mb-6" : undefined}>
        <CardHeader>
          <CardTitle>Your requests</CardTitle>
        </CardHeader>
        <CardContent>
          {myRequests.length === 0 ? (
            <EmptyState title="No requests yet." />
          ) : (
            <ul className="divide-y divide-line">
              {myRequests.map((request) => (
                <li key={request.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-navy">
                      {humanDateRange(request.start_date, request.end_date)}
                      <span className="ml-2 text-xs font-normal text-ink-muted">
                        {request.days_count} {request.days_count === 1 ? "day" : "days"} ·{" "}
                        {request.leave_type === "paid" ? "Paid" : "Unpaid"}
                      </span>
                    </p>
                    <p className="text-xs text-ink-muted">{request.reason}</p>
                    {request.decision_note ? (
                      <p className="mt-0.5 text-xs text-ink-muted">
                        Note: {request.decision_note}
                      </p>
                    ) : null}
                  </div>
                  <LeaveStatusChip status={request.status} />
                  {request.status === "pending" ? <WithdrawButton requestId={request.id} /> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {owner ? (
        <Card>
          <CardHeader>
            <CardTitle>Team leave by month — {year}</CardTitle>
            <CardDescription>
              Approved days only, counted against each person&rsquo;s {allowance}-day paid
              allowance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="py-2 pr-3 text-left text-xs font-medium text-ink-muted">
                      Person
                    </th>
                    {Array.from({ length: 12 }, (_, i) => (
                      <th
                        key={i}
                        className="px-1.5 py-2 text-center text-xs font-medium text-ink-muted"
                      >
                        {monthName(i + 1).slice(0, 3)}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right text-xs font-medium text-ink-muted">
                      Paid used
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-ink-muted">
                      Left
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {people
                    .filter((p) => p.is_active)
                    .map((person) => {
                      const personUsage = usage.find((u) => u.profile_id === person.id);
                      const used = personUsage?.paid_days_used ?? 0;
                      return (
                        <tr key={person.id} className="border-b border-line last:border-0">
                          <td className="py-2 pr-3 text-[13px] text-navy">{person.full_name}</td>
                          {Array.from({ length: 12 }, (_, i) => {
                            const cell = monthly.find(
                              (m) => m.profile_id === person.id && m.month === i + 1,
                            );
                            return (
                              <td
                                key={i}
                                className="px-1.5 py-2 text-center text-[13px] tabular text-navy"
                              >
                                {cell?.total_days ? cell.total_days : <span className="text-ink-faint">·</span>}
                              </td>
                            );
                          })}
                          <td className="px-2 py-2 text-right text-[13px] tabular text-navy">
                            {used}
                          </td>
                          <td className="px-2 py-2 text-right text-[13px] font-semibold tabular text-navy">
                            {Math.max(0, allowance - used)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <Callout className="mt-4">
              A request that straddles a month or year boundary is counted whole, in the month it
              starts.
            </Callout>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
