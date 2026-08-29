"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import {
  resetPassword,
  setCompensation,
  setPersonActive,
  setPersonRole,
  updateMyTimezone,
  type PeopleState,
} from "@/app/actions/people";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import type { AppRole } from "@/lib/types";

function report(result: PeopleState) {
  if (!result) return;
  if (result.ok) toast.success(result.message);
  else toast.error(result.error);
}

export function RoleSelect({ profileId, role }: { profileId: string; role: AppRole }) {
  const [pending, startTransition] = useTransition();

  return (
    <Select
      aria-label="Role"
      defaultValue={role}
      disabled={pending}
      className="h-8 w-32 text-[13px]"
      onChange={(event) => {
        const value = event.target.value;
        startTransition(async () => {
          const data = new FormData();
          data.set("profile_id", profileId);
          data.set("role", value);
          report(await setPersonRole(data));
        });
      }}
    >
      <option value="employee">Employee</option>
      <option value="bde">BDE</option>
      <option value="manager">Manager</option>
      <option value="owner">Owner</option>
    </Select>
  );
}

export function ActiveToggle({ profileId, active }: { profileId: string; active: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="quiet"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const data = new FormData();
          data.set("profile_id", profileId);
          data.set("active", String(!active));
          report(await setPersonActive(data));
        })
      }
    >
      {active ? "Deactivate" : "Reactivate"}
    </Button>
  );
}

export function ResetPasswordButton({ profileId }: { profileId: string }) {
  const [pending, startTransition] = useTransition();
  const [temp, setTemp] = useState<{ password: string; name?: string } | null>(null);

  return (
    <>
      <Button
        size="sm"
        variant="quiet"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const data = new FormData();
            data.set("profile_id", profileId);
            const result = await resetPassword(null, data);
            report(result);
            if (result?.ok && result.tempPassword) {
              setTemp({ password: result.tempPassword, name: result.personName });
            }
          })
        }
      >
        <KeyRound className="size-3.5" />
        Reset password
      </Button>

      {temp ? (
        <Callout tone="accent" className="mt-2 w-full">
          <p className="mb-1 font-semibold">Temporary password for {temp.name}</p>
          <code className="block rounded border border-mint-line bg-surface px-2 py-1 font-mono text-[13px] break-all">
            {temp.password}
          </code>
          <p className="mt-1 text-xs">
            They&rsquo;ll be forced to change it at next sign-in. Shown once.
          </p>
        </Callout>
      ) : null}
    </>
  );
}

export function CompensationField({
  profileId,
  amount,
}: {
  profileId: string;
  amount: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(amount ?? "");

  function save() {
    if (value.trim() === (amount ?? "")) return;
    startTransition(async () => {
      const data = new FormData();
      data.set("profile_id", profileId);
      data.set("monthly_amount", value.trim());
      report(await setCompensation(data));
    });
  }

  return (
    <Input
      aria-label="Monthly pay"
      inputMode="decimal"
      value={value}
      disabled={pending}
      placeholder="—"
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        }
      }}
      className="h-8 w-32 text-right text-[13px] tabular"
    />
  );
}

export function TimezoneForm({ current, zones }: { current: string; zones: string[] }) {
  const [pending, startTransition] = useTransition();

  return (
    <Select
      aria-label="Your timezone"
      defaultValue={current}
      disabled={pending}
      className="h-9 w-full max-w-xs text-[13px]"
      onChange={(event) => {
        const value = event.target.value;
        startTransition(async () => {
          const data = new FormData();
          data.set("timezone", value);
          report(await updateMyTimezone(data));
        });
      }}
    >
      {zones.map((zone) => (
        <option key={zone} value={zone}>
          {zone}
        </option>
      ))}
    </Select>
  );
}
