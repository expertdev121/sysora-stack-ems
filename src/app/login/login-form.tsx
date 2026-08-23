"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signIn, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { FieldRow, Input } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(signIn, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      {notice ? <Callout tone="warn">{notice}</Callout> : null}
      {state?.error ? <Callout tone="warn">{state.error}</Callout> : null}

      <FieldRow label="Work email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          placeholder="you@sysorastack.com"
        />
      </FieldRow>

      <FieldRow label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </FieldRow>

      <SubmitButton />
    </form>
  );
}
