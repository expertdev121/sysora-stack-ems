"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { saveCredential } from "@/app/actions/credentials";
import { Button } from "@/components/ui/button";
import { FieldRow, Input, Label, Select, Textarea } from "@/components/ui/field";
import type { AppRole, CredentialSummary, GrantMode } from "@/lib/types";

export interface FormOption {
  id: string;
  name: string;
}

export interface PersonOption {
  id: string;
  name: string;
  role: AppRole;
}

const ROLE_CHOICES = [
  { value: "owner", label: "Owner", locked: true },
  { value: "manager", label: "Manager", locked: false },
  { value: "employee", label: "Employee", locked: false },
] as const;

/**
 * The shared field set. Used for both creating and editing so the two can never
 * drift apart — an edit form missing a field would silently blank it on save.
 */
function CredentialFields({
  assets,
  clients,
  people,
  grants,
  credential,
  idPrefix,
}: {
  assets: FormOption[];
  clients: FormOption[];
  people: PersonOption[];
  grants?: Record<string, GrantMode>;
  credential?: CredentialSummary;
  idPrefix: string;
}) {
  const isEdit = Boolean(credential);

  return (
    <>
      {credential ? <input type="hidden" name="id" value={credential.id} /> : null}

      <FieldRow label="Client" htmlFor={`${idPrefix}-client`}>
        <Select
          id={`${idPrefix}-client`}
          name="client_key"
          defaultValue={credential?.client_key ?? ""}
        >
          <option value="">Unassigned</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </Select>
      </FieldRow>

      <FieldRow label="Tool" htmlFor={`${idPrefix}-asset`}>
        <Select
          id={`${idPrefix}-asset`}
          name="asset_id"
          required
          defaultValue={credential?.asset_id ?? ""}
        >
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

      <FieldRow label="Label" htmlFor={`${idPrefix}-label`} hint="e.g. “Admin login”">
        <Input
          id={`${idPrefix}-label`}
          name="label"
          required
          defaultValue={credential?.label ?? ""}
          placeholder="Admin login"
        />
      </FieldRow>

      <FieldRow label="Username or email" htmlFor={`${idPrefix}-username`}>
        <Input
          id={`${idPrefix}-username`}
          name="username"
          autoComplete="off"
          defaultValue={credential?.username ?? ""}
        />
      </FieldRow>

      <FieldRow
        label={isEdit ? "New password or token" : "Password or token"}
        htmlFor={`${idPrefix}-secret`}
        hint={
          isEdit
            ? "Leave blank to keep the current one. Filling it in counts as a rotation."
            : "Encrypted before it reaches the database."
        }
        className="sm:col-span-2"
      >
        <Input
          id={`${idPrefix}-secret`}
          name="secret"
          type="password"
          autoComplete="new-password"
        />
      </FieldRow>

      <FieldRow
        label="Second secret — label"
        htmlFor={`${idPrefix}-extra-label`}
        hint="Optional, e.g. “Security answer”, “Backup code”."
      >
        <Input
          id={`${idPrefix}-extra-label`}
          name="extra_label"
          defaultValue={credential?.extra_label ?? ""}
          placeholder="Security answer"
        />
      </FieldRow>

      <FieldRow
        label="Second secret — value"
        htmlFor={`${idPrefix}-extra`}
        hint={
          isEdit ? "Leave blank to keep the current one." : "Encrypted, same as the password."
        }
      >
        <Input
          id={`${idPrefix}-extra`}
          name="extra_secret"
          type="password"
          autoComplete="off"
        />
      </FieldRow>

      <FieldRow label="Sign-in URL" htmlFor={`${idPrefix}-url`} className="sm:col-span-2">
        <Input
          id={`${idPrefix}-url`}
          name="url"
          type="url"
          placeholder="https://…"
          defaultValue={credential?.url ?? ""}
        />
      </FieldRow>

      <FieldRow label="Notes" htmlFor={`${idPrefix}-notes`} className="sm:col-span-2">
        <Textarea
          id={`${idPrefix}-notes`}
          name="notes"
          placeholder="2FA device, recovery email, gotchas…"
          defaultValue={credential?.notes ?? ""}
        />
      </FieldRow>

      <div className="sm:col-span-2">
        <Label>Who can reveal this</Label>
        <div className="mt-1.5 flex flex-wrap gap-4">
          {ROLE_CHOICES.map((role) => (
            <label key={role.value} className="flex items-center gap-2 text-[13px] text-navy">
              <input
                type="checkbox"
                name="visible_to_roles"
                value={role.value}
                defaultChecked={
                  role.locked ||
                  (credential?.visible_to_roles ?? []).includes(role.value as AppRole)
                }
                disabled={role.locked}
                className="size-4 accent-[var(--color-mint)]"
              />
              {role.label}
              {role.locked ? <span className="text-xs text-ink-faint">(always)</span> : null}
            </label>
          ))}
        </div>
        {/* Owner is disabled above, so its value would not otherwise submit. */}
        <input type="hidden" name="visible_to_roles" value="owner" />
      </div>

      {people.length > 0 ? (
        <div className="sm:col-span-2">
          <Label>Per-person exceptions</Label>
          <p className="mt-0.5 mb-2 text-xs text-ink-muted">
            Leave on <strong>Follow roles</strong> unless someone needs an exception.{" "}
            <strong>Never</strong> revokes it from that person even though their role allows it;{" "}
            <strong>Always</strong> gives it to them even though their role does not — that&rsquo;s
            how you hand one login to a single person.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {people.map((person) => (
              <label
                key={person.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas px-3 py-1.5"
              >
                <span className="min-w-0 truncate text-[13px] text-navy">
                  {person.name}
                  <span className="ml-1.5 text-xs text-ink-faint capitalize">{person.role}</span>
                </span>
                <Select
                  name={`grant:${person.id}`}
                  defaultValue={grants?.[person.id] ?? ""}
                  aria-label={`Access for ${person.name}`}
                  className="h-8 w-36 shrink-0 text-[13px]"
                >
                  <option value="">Follow roles</option>
                  <option value="allow">Always</option>
                  <option value="deny">Never</option>
                </Select>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Owner-only create form. Collapsed so the page stays about the tools. */
export function CredentialForm({
  assets,
  clients,
  people,
}: {
  assets: FormOption[];
  clients: FormOption[];
  people: PersonOption[];
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
        <CredentialFields assets={assets} clients={clients} people={people} idPrefix="new" />
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Storing…" : "Store credential"}
          </Button>
        </div>
      </form>
    </details>
  );
}

/** Owner-only inline edit, rendered underneath the credential being changed. */
export function CredentialEditForm({
  credential,
  assets,
  clients,
  people,
  grants,
  onDone,
}: {
  credential: CredentialSummary;
  assets: FormOption[];
  clients: FormOption[];
  people: PersonOption[];
  grants?: Record<string, GrantMode>;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await saveCredential(formData);
      if (result.ok) {
        toast.success(result.message ?? "Updated.");
        onDone();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form
      action={onSubmit}
      className="mt-3 grid gap-3 rounded-lg border border-mint-line bg-surface p-3 sm:grid-cols-2"
    >
      <CredentialFields
        assets={assets}
        clients={clients}
        people={people}
        grants={grants}
        credential={credential}
        idPrefix={`edit-${credential.id}`}
      />
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" size="sm" variant="quiet" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
