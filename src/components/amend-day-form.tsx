"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { setAttendanceFor } from "@/app/actions/attendance";
import { Button } from "@/components/ui/button";
import { FieldRow, Input } from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";

/**
 * Staff-only amendment of any person's day, including past dates.
 * Every change lands in attendance_audit with who made it.
 */
export function AmendDayForm({
  people,
  defaultDate,
}: {
  people: { id: string; full_name: string }[];
  defaultDate: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await setAttendanceFor(formData);
      if (result.ok) {
        toast.success(result.message ?? "Updated.");
        formRef.current?.reset();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form ref={formRef} action={onSubmit} className="grid gap-3 sm:grid-cols-4 sm:items-end">
      <FieldRow label="Person" htmlFor="amend-person">
        <Combobox
          id="amend-person"
          name="profile_id"
          required
          placeholder="Choose…"
          options={people.map((p) => ({ value: p.id, label: p.full_name }))}
          searchPlaceholder="Find a person…"
        />
      </FieldRow>

      <FieldRow label="Date" htmlFor="amend-date">
        <Input id="amend-date" name="work_date" type="date" defaultValue={defaultDate} required />
      </FieldRow>

      <FieldRow label="Status" htmlFor="amend-status">
        <Combobox
          id="amend-status"
          name="status"
          defaultValue="present"
          options={[
            { value: "present", label: "Present" },
            { value: "half_day", label: "Half Day" },
            { value: "absent", label: "Absent" },
            // The action reads an empty status as "delete this day's row", so the
            // value has to stay "" rather than a sentinel of our own.
            { value: "", label: "Clear (Not marked)" },
          ]}
        />
      </FieldRow>

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Amend day"}
      </Button>
    </form>
  );
}
