"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { changePassword, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { FieldRow, Input } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Saving…" : "Set password and continue"}
    </Button>
  );
}

export function ChangePasswordForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(changePassword, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? <Callout tone="warn">{state.error}</Callout> : null}

      <FieldRow label="New password" htmlFor="password" hint="At least 10 characters.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          autoFocus
          required
        />
      </FieldRow>

      <FieldRow label="Confirm new password" htmlFor="confirm">
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </FieldRow>

      <SubmitButton />
    </form>
  );
}
