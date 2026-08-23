"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { saveCredential } from "@/app/actions/credentials";
import { Button } from "@/components/ui/button";
import { FieldRow, Input, Label, Select, Textarea } from "@/components/ui/field";

/**
 * Owner-only. Deliberately a <details> so the page stays about the tools, not
 * about credential admin.
 */
export function CredentialForm({
  assets,
  clients,
}: {
  assets: { id: string; name: string }[];
  clients: { key: string; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await saveCredential(formData);
      if (result.ok) {
        toast.success(result.message ?? "Stored.");
        formRef.current?.reset();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <details className="group rounded-card border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-[13px] font-medium text-navy">
        <Plus className="size-4 text-mint-deep transition-transform group-open:rotate-45" />
        Store a credential
      </summary>

      <form ref={formRef} action={onSubmit} className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
        <FieldRow label="Client" htmlFor="cred-client">
          <Select id="cred-client" name="client_key" defaultValue="">
            <option value="">Unassigned</option>
            {clients.map((client) => (
              <option key={client.key} value={client.key}>
                {client.name}
              </option>
            ))}
          </Select>
        </FieldRow>

        <FieldRow label="Tool" htmlFor="cred-asset">
          <Select id="cred-asset" name="asset_id" required defaultValue="">
            <option value="" disabled>
              Choose…
            </option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </Select>
        </FieldRow>

        <FieldRow label="Label" htmlFor="cred-label" hint="e.g. “Admin login”">
          <Input id="cred-label" name="label" required placeholder="Admin login" />
        </FieldRow>

        <FieldRow label="Username or email" htmlFor="cred-username">
          <Input id="cred-username" name="username" autoComplete="off" />
        </FieldRow>

        <FieldRow
          label="Password or token"
          htmlFor="cred-secret"
          hint="Encrypted before it reaches the database."
        >
          <Input id="cred-secret" name="secret" type="password" autoComplete="new-password" />
        </FieldRow>

        <FieldRow label="Sign-in URL" htmlFor="cred-url" className="sm:col-span-2">
          <Input id="cred-url" name="url" type="url" placeholder="https://…" />
        </FieldRow>

        <FieldRow label="Notes" htmlFor="cred-notes" className="sm:col-span-2">
          <Textarea id="cred-notes" name="notes" placeholder="2FA device, recovery email, gotchas…" />
        </FieldRow>

        <div className="sm:col-span-2">
          <Label>Who can reveal this</Label>
          <div className="mt-1.5 flex flex-wrap gap-4">
            {(
              [
                { value: "owner", label: "Owner", locked: true },
                { value: "manager", label: "Manager", locked: false },
                { value: "employee", label: "Employee", locked: false },
              ] as const
            ).map((role) => (
              <label key={role.value} className="flex items-center gap-2 text-[13px] text-navy">
                <input
                  type="checkbox"
                  name="visible_to_roles"
                  value={role.value}
                  defaultChecked={role.locked}
                  disabled={role.locked}
                  className="size-4 accent-[var(--color-mint)]"
                />
                {role.label}
                {role.locked ? <span className="text-xs text-ink-faint">(always)</span> : null}
              </label>
            ))}
          </div>
          {/* Owner is disabled above, so its value would not be submitted. */}
          <input type="hidden" name="visible_to_roles" value="owner" />
        </div>

        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Storing…" : "Store credential"}
          </Button>
        </div>
      </form>
    </details>
  );
}
