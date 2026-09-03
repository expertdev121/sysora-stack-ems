"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronRight, ExternalLink, Trash2 } from "lucide-react";
import { deleteBid, logBid, setBidOutcome } from "@/app/actions/bids";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { FieldRow, Input, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/callout";
import { humanDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type Bid = {
  id: string;
  submitted_on: string;
  job_title: string;
  job_url: string | null;
  client_name: string | null;
  connects_spent: number;
  connects_refunded: number;
  outcome: string;
  /** The proposal as it was sent. Null on rows logged before this existed. */
  notes: string | null;
};

const OUTCOMES = [
  { value: "sent", label: "Sent" },
  { value: "viewed", label: "Viewed" },
  { value: "replied", label: "Replied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "hired", label: "Won" },
  { value: "declined", label: "Declined" },
  { value: "expired", label: "Expired" },
];

const OUTCOME_LABEL: Record<string, string> = Object.fromEntries(
  OUTCOMES.map((o) => [o.value, o.label]),
);

/**
 * Log a bid.
 *
 * Six fields, and only three of them required — a title, an account and a
 * connect count. A form that asks ten questions per proposal is a form that
 * gets filled in at the end of the week from memory, which is worse than no
 * form.
 *
 * The proposal itself is optional for the same reason. Pasting a cover letter
 * is worth doing and worth keeping, but making it mandatory would turn a
 * ten-second log into a chore and the logging would stop.
 */
export function BidForm({ accounts }: { accounts: string[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await logBid(formData);
      if (result.ok) {
        toast.success(result.message ?? "Logged.");
        formRef.current?.reset();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form ref={formRef} action={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldRow label="Job" htmlFor="job_title" className="sm:col-span-2">
          <Input
            id="job_title"
            name="job_title"
            required
            autoComplete="off"
            placeholder="Shopify automation build"
          />
        </FieldRow>

        <FieldRow
          label="Upwork account"
          htmlFor="account"
          hint="Which account's connects this used."
        >
          <Combobox
            id="account"
            name="account"
            required
            defaultValue={accounts[0] ?? ""}
            placeholder={accounts.length === 0 ? "None set up yet" : "Choose…"}
            options={accounts.map((a) => ({ value: a, label: a }))}
          />
        </FieldRow>

        <FieldRow label="Connects used" htmlFor="connects_spent">
          <Input
            id="connects_spent"
            name="connects_spent"
            inputMode="numeric"
            required
            defaultValue=""
            placeholder="12"
          />
        </FieldRow>

        {/* No client field. At the moment you bid you do not know who the
            client is — Upwork does not tell you until they reply — so asking
            produced a blank box on every row. The column is still there and
            still filled in from the sales side when a bid is won, which is
            the first point anybody actually knows the answer. */}

        <FieldRow label="Job link" htmlFor="job_url" className="sm:col-span-2">
          <Input
            id="job_url"
            name="job_url"
            type="url"
            placeholder="https://www.upwork.com/jobs/…"
          />
        </FieldRow>

        <FieldRow
          label="Your proposal"
          htmlFor="notes"
          hint="Paste what you actually sent, so you can see later which pitches won."
          className="sm:col-span-2"
        >
          <Textarea
            id="notes"
            name="notes"
            rows={8}
            className="min-h-40 leading-[1.6]"
            placeholder="Paste the cover letter you submitted for this job…"
          />
        </FieldRow>
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Logging…" : "Log this bid"}
        </Button>
      </div>
    </form>
  );
}

/** One bid, with its outcome editable in place. */
export function BidRow({ bid, canEdit }: { bid: Bid; canEdit: boolean }) {
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState(bid.outcome);

  const net = bid.connects_spent - bid.connects_refunded;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-navy">
          {bid.job_url ? (
            <a
              href={bid.job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-2"
            >
              {bid.job_title}
              <ExternalLink className="size-3" />
            </a>
          ) : (
            bid.job_title
          )}
        </p>
        <p className="text-xs text-ink-muted">
          {humanDate(bid.submitted_on)} · {bid.connects_spent} connects
          {bid.connects_refunded > 0 && (
            <span className="text-mint-deep"> · {bid.connects_refunded} back</span>
          )}
          {net !== bid.connects_spent && <span> · {net} net</span>}
          {bid.client_name ? ` · ${bid.client_name}` : ""}
        </p>

        {/* Collapsed by default. Storing a proposal you cannot read back is
            pointless, but a list of twenty open cover letters is unreadable —
            so it is here, one click away, and folded. */}
        {bid.notes ? (
          <details className="group mt-1.5">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-mint-deep hover:underline [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
              <span className="group-open:hidden">Read the proposal</span>
              <span className="hidden group-open:inline">Hide the proposal</span>
            </summary>
            <p className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-line-soft bg-canvas px-3 py-2 text-xs leading-[1.7] whitespace-pre-wrap text-ink">
              {bid.notes}
            </p>
          </details>
        ) : null}
      </div>

      {canEdit ? (
        <div className="flex items-center gap-2">
          <Combobox
            value={outcome}
            disabled={pending}
            className="w-36"
            options={OUTCOMES}
            onChange={(next) => {
              setOutcome(next);
              startTransition(async () => {
                const data = new FormData();
                data.set("id", bid.id);
                data.set("outcome", next);
                // Expiring a job hands its connects back.
                data.set("connects_spent", String(bid.connects_spent));
                const result = await setBidOutcome(data);
                if (result.ok) toast.success(result.message ?? "Updated.");
                else {
                  toast.error(result.error);
                  setOutcome(bid.outcome);
                }
              });
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="quiet"
            disabled={pending}
            aria-label={`Remove ${bid.job_title}`}
            onClick={() =>
              startTransition(async () => {
                const data = new FormData();
                data.set("id", bid.id);
                const result = await deleteBid(data);
                if (result.ok) toast.success(result.message ?? "Removed.");
                else toast.error(result.error);
              })
            }
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ) : (
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
            bid.outcome === "hired"
              ? "border-mint-line bg-mint-soft text-mint-deep"
              : "border-line bg-surface text-ink-muted",
          )}
        >
          {OUTCOME_LABEL[bid.outcome] ?? bid.outcome}
        </span>
      )}
    </li>
  );
}

export function BidList({ bids, canEdit }: { bids: Bid[]; canEdit: boolean }) {
  if (bids.length === 0) {
    return <EmptyState title="No bids logged yet." >Log the first one above.</EmptyState>;
  }

  return (
    <ul className="divide-y divide-line-soft">
      {bids.map((bid) => (
        <BidRow key={bid.id} bid={bid} canEdit={canEdit} />
      ))}
    </ul>
  );
}
