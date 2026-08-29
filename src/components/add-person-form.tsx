"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy } from "lucide-react";
import { createPerson, type PeopleState } from "@/app/actions/people";
import { Button } from "@/components/ui/button";
import { FieldRow, Input } from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";
import { ROLE_OPTIONS } from "@/components/person-admin";
import { Callout } from "@/components/ui/callout";

const COMMON_ZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Toronto",
  "UTC",
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit">{pending ? "Creating…" : "Create account"}</Button>;
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 rounded-lg border border-mint-line bg-surface px-3 py-2 font-mono text-[13px] break-all text-navy">
        {value}
      </code>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function AddPersonForm({ today }: { today: string }) {
  const [state, formAction] = useActionState<PeopleState, FormData>(createPerson, null);

  return (
    <div className="flex flex-col gap-4">
      {state && state.ok && state.tempPassword ? (
        <Callout tone="accent" title={`Temporary password for ${state.personName}`}>
          <p className="mb-2">
            Send this once, over a channel you trust. They must replace it before they can reach
            anything — after that, you no longer hold a working password for them.
          </p>
          <CopyField value={state.tempPassword} />
          <p className="mt-2 text-xs">
            This is shown once and is not stored anywhere. Losing it just means resetting again.
          </p>
        </Callout>
      ) : null}

      {state && !state.ok ? <Callout tone="warn">{state.error}</Callout> : null}

      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        <FieldRow label="Full name" htmlFor="full_name">
          <Input id="full_name" name="full_name" required placeholder="Priya Nair" />
        </FieldRow>

        <FieldRow label="Work email" htmlFor="new-email">
          <Input
            id="new-email"
            name="email"
            type="email"
            required
            placeholder="priya@sysorastack.com"
          />
        </FieldRow>

        <FieldRow label="Role" htmlFor="new-role">
          <Combobox id="new-role" name="role" defaultValue="employee" options={ROLE_OPTIONS} />
        </FieldRow>

        <FieldRow
          label="Timezone"
          htmlFor="new-timezone"
          hint="Their day boundary for attendance and EOD."
        >
          <Combobox
            id="new-timezone"
            name="timezone"
            defaultValue="Asia/Kolkata"
            options={COMMON_ZONES.map((zone) => ({ value: zone, label: zone }))}
            searchPlaceholder="Find a timezone…"
          />
        </FieldRow>

        <FieldRow label="Start date" htmlFor="joined_on">
          <Input id="joined_on" name="joined_on" type="date" defaultValue={today} />
        </FieldRow>

        <div className="flex items-end">
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
