"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ExternalLink, Trash2 } from "lucide-react";
import { deleteBid, logBid, setBidOutcome } from "@/app/actions/bids";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { FieldRow, Input } from "@/components/ui/field";
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
 * Six fields, and only two of them required — a title and a connect count. A
 * form that asks ten questions per proposal is a form that gets filled in at
 * the end of the week from memory, which is worse than no form.
 */
export function BidForm() {
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

        <FieldRow label="Client, if you know it" htmlFor="client_name">
          <Input id="client_name" name="client_name" autoComplete="off" placeholder="Optional" />
        </FieldRow>

        <FieldRow label="Job link" htmlFor="job_url" className="sm:col-span-2">
          <Input
            id="job_url"
            name="job_url"
            type="url"
            placeholder="https://www.upwork.com/jobs/…"
          />
        </FieldRow>

        <FieldRow label="Note" htmlFor="notes" className="sm:col-span-2">
          <Input id="notes" name="notes" placeholder="Optional — anything worth remembering" />
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
