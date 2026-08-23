"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { submitEod } from "@/app/actions/eod";
import { Button } from "@/components/ui/button";
import { FieldRow, Textarea } from "@/components/ui/field";

/**
 * 1–10 self-rating.
 *
 * Radio inputs rather than React state: the browser handles selection, it works
 * before hydration, and arrow keys move through the scale for free.
 *
 * Only the selected number is mint. A red-to-green gradient would be the
 * obvious choice and is wrong twice over — it puts two saturated colours in one
 * view, and it tells someone their honest answer is a bad answer.
 */
function MoodScale({ value }: { value: number | null }) {
  return (
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
              defaultChecked={value === n}
              className="peer sr-only"
            />
            <span className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface text-[13px] text-ink-muted transition-colors select-none hover:border-line-strong peer-checked:border-mint peer-checked:bg-mint peer-checked:font-semibold peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mint">
              {n}
            </span>
          </label>
        ))}

        <span className="ml-1 hidden text-xs text-ink-faint sm:inline">Flying</span>

        <label className="ml-auto cursor-pointer">
          <input
            type="radio"
            name="mood"
            value=""
            defaultChecked={value === null}
            className="peer sr-only"
          />
          <span className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-xs text-ink-muted transition-colors select-none hover:border-line-strong peer-checked:border-navy-line peer-checked:bg-navy-soft peer-checked:text-navy">
            Prefer not to say
          </span>
        </label>
      </div>
    </fieldset>
  );
}

export function EodForm({
  existing,
  locksInLabel,
}: {
  existing: { work_done: string; blockers: string; mood: number | null } | null;
  locksInLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await submitEod(formData);
      if (result.ok) {
        toast.success(result.message ?? "EOD filed.");
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <FieldRow
        label="What did you work on today?"
        htmlFor="work_done"
        hint="Specific beats thorough. What moved, what shipped, who you spoke to."
      >
        <Textarea
          id="work_done"
          name="work_done"
          required
          rows={6}
          defaultValue={existing?.work_done ?? ""}
          placeholder="Shipped the retry queue for the agent runner. Closed two client tickets. Discovery call with…"
          className="min-h-36"
        />
      </FieldRow>

      <FieldRow
        label="Blockers or anything you need"
        htmlFor="blockers"
        hint="Optional. Leave empty if nothing is in your way."
      >
        <Textarea
          id="blockers"
          name="blockers"
          rows={3}
          defaultValue={
            existing?.blockers && existing.blockers !== "None" ? existing.blockers : ""
          }
          placeholder="Waiting on client credentials for the GHL sub-account."
        />
      </FieldRow>

      <MoodScale value={existing?.mood ?? null} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">
          {existing
            ? `Already filed for today. You can change it until midnight your time — ${locksInLabel}.`
            : `Files against today in your timezone. Editable until midnight — ${locksInLabel}.`}
        </p>
        <Button type="submit" disabled={pending}>
          {saved ? <Check className="size-4" /> : null}
          {pending ? "Saving…" : saved ? "Saved" : existing ? "Update today's EOD" : "File EOD"}
        </Button>
      </div>
    </form>
  );
}
