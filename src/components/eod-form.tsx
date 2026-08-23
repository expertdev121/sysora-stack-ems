"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { submitEod } from "@/app/actions/eod";
import { Button } from "@/components/ui/button";
import { FieldRow, Textarea } from "@/components/ui/field";

export function EodForm({
  existing,
  locksInLabel,
}: {
  existing: { work_done: string; blockers: string } | null;
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
