"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { setAttendanceFor } from "@/app/actions/attendance";
import { Button } from "@/components/ui/button";
import { FieldRow, Input, Select } from "@/components/ui/field";

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
        <Select id="amend-person" name="profile_id" required defaultValue="">
          <option value="" disabled>
            Choose…
          </option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.full_name}
            </option>
          ))}
        </Select>
      </FieldRow>

      <FieldRow label="Date" htmlFor="amend-date">
        <Input id="amend-date" name="work_date" type="date" defaultValue={defaultDate} required />
      </FieldRow>

      <FieldRow label="Status" htmlFor="amend-status">
        <Select id="amend-status" name="status" defaultValue="present">
          <option value="present">Present</option>
          <option value="half_day">Half Day</option>
          <option value="absent">Absent</option>
          <option value="">Clear (Not marked)</option>
        </Select>
      </FieldRow>

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Amend day"}
      </Button>
    </form>
  );
}
