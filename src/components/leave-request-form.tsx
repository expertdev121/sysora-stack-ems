"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { requestLeave } from "@/app/actions/leave";
import { Button } from "@/components/ui/button";
import { FieldRow, Input, Textarea } from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";
import { diffDaysISO } from "@/lib/dates";

export function LeaveRequestForm({
  today,
  remainingPaid,
}: {
  today: string;
  remainingPaid: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);

  const days = end >= start ? diffDaysISO(start, end) + 1 : 0;

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await requestLeave(formData);
      if (result.ok) {
        toast.success(result.message ?? "Request sent.");
        formRef.current?.reset();
        setStart(today);
        setEnd(today);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form ref={formRef} action={onSubmit} className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <FieldRow label="From" htmlFor="start_date">
          <Input
            id="start_date"
            name="start_date"
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (end < e.target.value) setEnd(e.target.value);
            }}
            required
          />
        </FieldRow>

        <FieldRow label="To" htmlFor="end_date">
          <Input
            id="end_date"
            name="end_date"
            type="date"
            value={end}
            min={start}
            onChange={(e) => setEnd(e.target.value)}
            required
          />
        </FieldRow>

        <FieldRow
          label="Type"
          htmlFor="leave_type"
          hint={`${remainingPaid} paid ${remainingPaid === 1 ? "day" : "days"} left this year`}
        >
          <Combobox
            id="leave_type"
            name="leave_type"
            defaultValue="paid"
            options={[
              { value: "paid", label: "Paid" },
              { value: "unpaid", label: "Unpaid" },
            ]}
          />
        </FieldRow>
      </div>

      <FieldRow label="Reason" htmlFor="reason">
        <Textarea
          id="reason"
          name="reason"
          required
          placeholder="Short and specific — this is what gets approved."
        />
      </FieldRow>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-muted">
          {days > 0 ? (
            <>
              <span className="font-medium text-navy">
                {days} {days === 1 ? "day" : "days"}
              </span>{" "}
              — every calendar day counts, since this team sometimes works weekends.
            </>
          ) : (
            "Pick your dates."
          )}
        </p>
        <Button type="submit" disabled={pending || days <= 0}>
          {pending ? "Sending…" : "Request leave"}
        </Button>
      </div>
    </form>
  );
}
