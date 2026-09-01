"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { fileBidderDay } from "@/app/actions/bids";
import { Button } from "@/components/ui/button";
import { FieldRow, Textarea } from "@/components/ui/field";

/**
 * Ending the day, for someone whose day is bids.
 *
 * The summary is not asked for — it is composed from what was logged, because
 * retyping "bid on 4 jobs" under a list of four jobs is the duplication this
 * whole design exists to avoid. What a bid log genuinely cannot know is asked
 * instead: what is in your way, and how the day went.
 */
export function BidderDay({
  bidsToday,
  connectsToday,
  filed,
  existingBlockers,
  existingMood,
}: {
  bidsToday: number;
  connectsToday: number;
  filed: boolean;
  existingBlockers: string;
  existingMood: number | null;
}) {
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await fileBidderDay(formData);
      if (result.ok) toast.success(result.message ?? "Filed.");
      else toast.error(result.error);
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <p className="m-0 text-[13px] leading-relaxed text-ink-muted">
        {bidsToday === 0 ? (
          <>Nothing logged today yet. Log your bids above, then file the day here.</>
        ) : (
          <>
            Today&rsquo;s report writes itself from your bids —{" "}
            <span className="font-medium text-navy">
              {bidsToday} {bidsToday === 1 ? "job" : "jobs"}, {connectsToday} connects
            </span>
            . These two are the parts it can&rsquo;t know.
          </>
        )}
      </p>

      <FieldRow
        label="Blockers or anything you need"
        htmlFor="blockers"
        hint="Optional. Leave empty if nothing is in your way."
      >
        <Textarea
          id="blockers"
          name="blockers"
          rows={2}
          defaultValue={existingBlockers}
          placeholder="Waiting on client credentials for the GHL sub-account."
        />
      </FieldRow>

      <fieldset>
        <legend className="text-[13px] font-medium text-navy">How are you feeling today?</legend>
        <p className="mt-0.5 mb-2 text-xs text-ink-muted">
          Optional. 1 is a rough day, 10 is flying.
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 hidden text-xs text-ink-faint sm:inline">Rough</span>

          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <label key={n} className="cursor-pointer">
              <input
                type="radio"
                name="mood"
                value={n}
                defaultChecked={existingMood === n}
                className="peer sr-only"
              />
              <span className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface text-[13px] text-ink-muted transition-colors select-none hover:border-line-strong peer-checked:border-mint peer-checked:bg-mint peer-checked:font-semibold peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mint">
                {n}
              </span>
            </label>
          ))}

          <span className="ml-1 hidden text-xs text-ink-faint sm:inline">Flying</span>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-xs text-ink-muted">
          {filed
            ? "Already filed today — saving again updates it."
            : "Files against today in your timezone."}
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? "Filing…" : filed ? "Update today" : "File the day"}
        </Button>
      </div>
    </form>
  );
}
