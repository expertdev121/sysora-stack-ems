import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { BidForm, BidList, type Bid } from "@/components/bid-form";
import { BidTimer } from "@/components/bid-timer";
import type { BidSession } from "@/app/actions/bid-sessions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { StatusChip } from "@/components/ui/status";
import { requireSession, isStaff } from "@/lib/auth";
import { createSalesClient } from "@/lib/supabase/sales";
import { humanDate, localDateISO } from "@/lib/dates";

export const metadata: Metadata = { title: "My bids" };

type BidderTarget = {
  window_name: string | null;
  starts_on: string;
  ends_on: string;
  metric_slug: string;
  metric_label: string;
  unit: string;
  target_count: number;
  is_current: boolean;
};

/**
 * Where a bidder records the work.
 *
 * This is the only place connects get spent, so the count on the sales
 * dashboard and the number here are the same number — nobody types it twice.
 * Deliberately shows no money: how many connects a job took is this person's
 * business, what those connects cost is not.
 */
export default async function BidsPage() {
  const session = await requireSession();
  const supabase = await createSalesClient();
  const today = localDateISO(session.profile.timezone);

  // RLS returns your own bids, or everyone's if you are staff.
  const [
    { data: bidRows },
    { data: targetRows },
    { data: accountRows },
    { data: sessionRows },
  ] = await Promise.all([
    supabase
      .from("proposals")
      .select(
        "id, submitted_on, job_title, job_url, client_name, connects_spent, connects_refunded, outcome, submitted_by, notes",
      )
      .order("submitted_on", { ascending: false })
      .limit(200),
    supabase
      .from("bidder_targets")
      .select("*")
      .eq("is_current", true)
      .order("starts_on", { ascending: false }),
    // Names only — a bidder cannot read what any batch of connects cost.
    supabase.from("bidder_accounts").select("account, spends_from").order("account"),
    // RLS gives you your own sessions. Thirty days is enough for a week total
    // and a short recent list without dragging a year of rows into the page.
    supabase
      .from("bid_sessions")
      .select("id, started_at, ended_at, user_id")
      .gte("started_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
      .order("started_at", { ascending: false }),
  ]);

  const all = (bidRows ?? []) as (Bid & { submitted_by: string | null })[];
  const mine = all.filter((b) => b.submitted_by === session.userId);
  const staff = isStaff(session.profile);
  // The timer is a bidder's own working aid, not a management view.
  const isBde = session.profile.role === "bde";

  // Staff see everyone's sessions through RLS, but the timer is a personal
  // clock — only ever show and total the viewer's own.
  const mySessions = ((sessionRows ?? []) as (BidSession & { user_id: string })[]).filter(
    (s) => s.user_id === session.userId,
  );

  const openSession = mySessions.find((s) => s.ended_at === null) ?? null;
  const closed = mySessions.filter((s) => s.ended_at !== null);

  // Both totals count only finished sessions. The one still running is added
  // in the browser as it ticks, so the figure moves while you watch it.
  const startOfToday = new Date(today + "T00:00:00").getTime();
  const startOfWeek = startOfToday - ((new Date(startOfToday).getDay() + 6) % 7) * 86_400_000;

  const secondsIn = (from: number) =>
    closed
      .filter((s) => new Date(s.started_at).getTime() >= from)
      .reduce(
        (sum, s) =>
          sum +
          Math.max(
            Math.floor(
              (new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime()) / 1000,
            ),
            0,
          ),
        0,
      );

  // Each profile with the balance it actually spends. An agency member bids
  // on the agency connects, so the form has to say so — otherwise somebody
  // watches their own balance and wonders why it never moves.
  const accounts = (accountRows ?? []) as { account: string; spends_from: string }[];
  const targets = (targetRows ?? []) as BidderTarget[];
  const bidTarget = targets.find((t) => t.metric_slug === "upwork_bids") ?? null;

  const inWindow = bidTarget
    ? mine.filter((b) => b.submitted_on >= bidTarget.starts_on && b.submitted_on <= bidTarget.ends_on)
    : [];

  const doneInWindow = inWindow.length;
  const remaining = bidTarget ? Math.max(bidTarget.target_count - doneInWindow, 0) : 0;
  const daysLeft = bidTarget
    ? Math.max(
        Math.ceil(
          (new Date(bidTarget.ends_on + "T00:00:00Z").getTime() -
            new Date(today + "T00:00:00Z").getTime()) /
            86_400_000,
        ) + 1,
        0,
      )
    : 0;

  const todayBids = mine.filter((b) => b.submitted_on === today);
  const todayConnects = todayBids.reduce((sum, b) => sum + b.connects_spent, 0);

  const monthStart = today.slice(0, 8) + "01";
  const monthBids = mine.filter((b) => b.submitted_on >= monthStart);
  const monthConnects = monthBids.reduce(
    (sum, b) => sum + b.connects_spent - b.connects_refunded,
    0,
  );

  return (
    <>
      <PageHeader
        title="My bids"
        description="Log every job you bid on. The connects come off the balance automatically."
        actions={
          <StatusChip
            state={todayBids.length > 0 ? "present" : "unmarked"}
            label={
              todayBids.length > 0
                ? `${todayBids.length} today`
                : "Nothing logged today"
            }
          />
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today" footer={`${todayConnects} connects`}>
          <p className="font-display text-[34px] leading-none font-extrabold tracking-[-1px] text-navy tabular">
            {todayBids.length}
          </p>
        </StatCard>

        <StatCard label="This month" footer={`${monthConnects} connects, net of refunds`}>
          <p className="font-display text-[34px] leading-none font-extrabold tracking-[-1px] text-navy tabular">
            {monthBids.length}
          </p>
        </StatCard>

        {bidTarget ? (
          <>
            <StatCard
              label="This target"
              footer={`${bidTarget.window_name ?? "Current window"} · ends ${humanDate(bidTarget.ends_on)}`}
            >
              <p className="font-display text-[34px] leading-none font-extrabold tracking-[-1px] text-navy tabular">
                {doneInWindow}
                <span className="ml-1 text-[17px] font-semibold text-ink-faint">
                  / {bidTarget.target_count}
                </span>
              </p>
            </StatCard>

            <StatCard
              label="Still to do"
              footer={
                remaining === 0
                  ? "Target met"
                  : daysLeft > 0
                    ? `${Math.ceil(remaining / daysLeft)} a day for ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`
                    : "Window has closed"
              }
            >
              <p className="font-display text-[34px] leading-none font-extrabold tracking-[-1px] text-navy tabular">
                {remaining}
              </p>
            </StatCard>
          </>
        ) : (
          <StatCard label="This target" footer="Nobody has set a bid target for today's date">
            <p className="text-[15px] text-ink-muted">None set</p>
          </StatCard>
        )}
      </div>

      {isBde ? (
        <div className="mb-6">
          <BidTimer
            open={openSession}
            todaySeconds={secondsIn(startOfToday)}
            weekSeconds={secondsIn(startOfWeek)}
            recent={closed.slice(0, 8)}
          />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Log a bid</CardTitle>
          <CardDescription>
            Dated by your own timezone ({session.profile.timezone}), so a late-evening bid
            counts for the day you meant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BidForm accounts={accounts} />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Your bids</CardTitle>
          <CardDescription>
            Mark one Expired when the job closes unhired — Upwork returns the connects, and
            marking it hands them back here too.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BidList bids={mine} canEdit />
        </CardContent>
      </Card>

      {staff && all.length > mine.length ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Everyone else</CardTitle>
            <CardDescription>
              Read-only here. {all.length - mine.length} from the rest of the team.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BidList bids={all.filter((b) => b.submitted_by !== session.userId)} canEdit={false} />
          </CardContent>
        </Card>
      ) : null}

      {mine.length === 0 ? (
        <Callout className="mt-6">
          Every bid logged here feeds the sales dashboard: connects come off the balance, the
          acquisition budget burns, and the win rate is worked out from the outcomes you set. It
          is the only place that happens, so nothing needs entering twice.
        </Callout>
      ) : null}
    </>
  );
}
