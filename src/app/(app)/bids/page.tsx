import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { BidForm, BidList, type Bid } from "@/components/bid-form";
import { BidTimer } from "@/components/bid-timer";
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
  const [{ data: bidRows }, { data: targetRows }, { data: accountRows }] = await Promise.all([
    supabase
      .from("proposals")
      .select(
        "id, submitted_on, job_title, job_url, client_name, connects_spent, connects_refunded, outcome, submitted_by",
      )
      .order("submitted_on", { ascending: false })
      .limit(200),
    supabase
      .from("bidder_targets")
      .select("*")
      .eq("is_current", true)
      .order("starts_on", { ascending: false }),
    // Names only — a bidder cannot read what any batch of connects cost.
    supabase.from("bidder_accounts").select("account").order("account"),
  ]);

  const all = (bidRows ?? []) as (Bid & { submitted_by: string | null })[];
  const mine = all.filter((b) => b.submitted_by === session.userId);
  const staff = isStaff(session.profile);
  // The timer is a bidder's own working aid, not a management view.
  const isBde = session.profile.role === "bde";

  const accounts = ((accountRows ?? []) as { account: string }[]).map((a) => a.account);
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

      {isBde ? <div className="mb-6"><BidTimer /></div> : null}

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
