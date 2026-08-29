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
import { Input } from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";
import { Callout } from "@/components/ui/callout";
import type { AppRole } from "@/lib/types";

function report(result: PeopleState) {
  if (!result) return;
  if (result.ok) toast.success(result.message);
  else toast.error(result.error);
}

export const ROLE_OPTIONS = [
  { value: "employee", label: "Employee" },
  { value: "bde", label: "BDE" },
  { value: "manager", label: "Manager" },
  { value: "owner", label: "Owner" },
];

export const ENGAGEMENT_OPTIONS = [
  { value: "full_time", label: "Full-time" },
  { value: "freelance", label: "Freelance" },
];

export function RoleSelect({ profileId, role }: { profileId: string; role: AppRole }) {
  const [pending, startTransition] = useTransition();

  return (
    <Combobox
      value={role}
      disabled={pending}
      className="w-32"
      options={ROLE_OPTIONS}
      onChange={(value) => {
        startTransition(async () => {
          const data = new FormData();
          data.set("profile_id", profileId);
          data.set("role", value);
          report(await setPersonRole(data));
        });
      }}
    />
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

/**
 * How someone is engaged, and what they are paid for it.
 *
 * The two are one control because they are one decision: a monthly figure
 * against a freelancer is meaningless, and the table has a constraint that
 * refuses it. Changing the engagement re-saves immediately so the pair can
 * never disagree; changing the amount waits for blur, because a salary typed
 * digit by digit would otherwise save four times on the way to 45000.
 */
export function CompensationField({
  profileId,
  engagement,
  amount,
}: {
  profileId: string;
  engagement: "full_time" | "freelance";
  amount: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState(engagement);
  const [value, setValue] = useState(amount ?? "");

  function save(nextKind = kind, nextValue = value) {
    if (!nextValue.trim()) return;
    startTransition(async () => {
      const data = new FormData();
      data.set("profile_id", profileId);
      data.set("engagement", nextKind);
      data.set("amount", nextValue.trim());
      report(await setCompensation(data));
    });
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Combobox
        value={kind}
        disabled={pending}
        className="w-32"
        options={ENGAGEMENT_OPTIONS}
        onChange={(next) => {
          const nextKind = next as "full_time" | "freelance";
          setKind(nextKind);
          save(nextKind, value);
        }}
      />
      <div className="relative">
        <Input
          aria-label={kind === "full_time" ? "Monthly salary" : "Hourly rate"}
          inputMode="decimal"
          value={value}
          disabled={pending}
          placeholder="—"
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            if (value.trim() !== (amount ?? "")) save();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          className="tabular h-8 w-28 pr-9 text-right text-[13px]"
        />
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] text-ink-faint">
          {kind === "full_time" ? "/mo" : "/hr"}
        </span>
      </div>
    </div>
  );
}

export function TimezoneForm({ current, zones }: { current: string; zones: string[] }) {
  const [pending, startTransition] = useTransition();

  return (
    <Combobox
      value={current}
      disabled={pending}
      className="w-full max-w-xs"
      options={zones.map((zone) => ({ value: zone, label: zone }))}
      searchPlaceholder="Find a timezone…"
      emptyText="No timezone by that name."
      onChange={(value) => {
        startTransition(async () => {
          const data = new FormData();
          data.set("timezone", value);
          report(await updateMyTimezone(data));
        });
      }}
    />
  );
}
