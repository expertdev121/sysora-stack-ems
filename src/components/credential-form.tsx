"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronRight, Plus } from "lucide-react";
import { saveCredential } from "@/app/actions/credentials";
import { Button } from "@/components/ui/button";
import { FieldRow, Input, Label, Textarea } from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";
import { Modal } from "@/components/ui/modal";
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

/** Show the friendly name in the field, not the stored slug. */
function clientDisplay(key: string | null, clients: FormOption[]): string {
  if (!key) return "";
  return clients.find((c) => c.id === key)?.name ?? key;
}

function toolDisplay(assetId: string, assets: FormOption[]): string {
  return assets.find((a) => a.id === assetId)?.name ?? assetId;
}

const GRANT_CHOICES = [
  { value: "allow", label: "Always" },
  { value: "deny", label: "Never" },
];

const ROLE_CHOICES = [
  { value: "owner", label: "Owner", locked: true },
  { value: "manager", label: "Manager", locked: false },
  { value: "employee", label: "Employee", locked: false },
  { value: "bde", label: "BDE", locked: false },
] as const;

/**
 * Shared by create and edit so the two cannot drift — a field missing from the
 * edit form would silently blank that column on save.
 *
 * Six fields are enough to store a login. Everything else is behind "More
 * options", because a form that asks eleven questions to save a password is a
 * form people avoid.
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

      {/* ---- The six that matter ------------------------------------------ */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Searchable, but not a closed list: typing a name nothing matches
            offers it as a new client or tool, so adding one is not a code
            change. The value posted is the display name; the action slugifies
            it, which is why an existing name must map back to its label. */}
        <FieldRow label="Client" htmlFor={`${idPrefix}-client`} hint="Pick one or type a new name.">
          <Combobox
            id={`${idPrefix}-client`}
            name="client_key"
            defaultValue={credential ? clientDisplay(credential.client_key, clients) : ""}
            options={clients.map((c) => ({ value: c.name, label: c.name }))}
            allowCustom
            allowClear
            clearLabel="Unassigned"
            placeholder="Unassigned"
            searchPlaceholder="Find or name a client…"
            emptyText="Type a name to add it."
          />
        </FieldRow>

        <FieldRow label="Tool" htmlFor={`${idPrefix}-asset`} hint="Pick one or type a new one.">
          <Combobox
            id={`${idPrefix}-asset`}
            name="asset_id"
            required
            defaultValue={credential ? toolDisplay(credential.asset_id, assets) : ""}
            options={assets.map((a) => ({ value: a.name, label: a.name }))}
            allowCustom
            placeholder="e.g. Dropbox"
            searchPlaceholder="Find or name a tool…"
            emptyText="Type a name to add it."
          />
        </FieldRow>

        <FieldRow label="Label" htmlFor={`${idPrefix}-label`} hint="What this login is for.">
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
          label={isEdit ? "New password" : "Password or token"}
          htmlFor={`${idPrefix}-secret`}
          hint={isEdit ? "Blank keeps the current one." : "Encrypted before it's saved."}
        >
          <Input
            id={`${idPrefix}-secret`}
            name="secret"
            type="password"
            autoComplete="new-password"
          />
        </FieldRow>

        <FieldRow label="Sign-in URL" htmlFor={`${idPrefix}-url`}>
          <Input
            id={`${idPrefix}-url`}
            name="url"
            type="url"
            placeholder="https://…"
            defaultValue={credential?.url ?? ""}
          />
        </FieldRow>
      </div>

      {/* ---- Everything else ---------------------------------------------- */}
      <details className="group/more mt-1 rounded-lg border border-line-soft bg-canvas px-3 py-2.5">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-ink-muted">
          <ChevronRight className="size-4 transition-transform group-open/more:rotate-90" />
          More options — notes, who can see it
        </summary>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FieldRow label="Notes" htmlFor={`${idPrefix}-notes`} className="sm:col-span-2">
            <Textarea
              id={`${idPrefix}-notes`}
              name="notes"
              rows={2}
              placeholder="2FA device, recovery email, gotchas…"
              defaultValue={credential?.notes ?? ""}
            />
          </FieldRow>

          {/*
            A second secret, for the logins that genuinely have one — an API
            key beside a password, a backup code, an app password.

            It lives behind "More options" because most logins do not need one
            and three always-visible fields made the form read like paperwork.

            The label is prefilled deliberately. The save action treats a
            present-but-empty label as "clear it", so leaving this blank on an
            edit would wipe a stored secret during an unrelated change.
          */}
          <FieldRow
            label="Second secret — label"
            htmlFor={`${idPrefix}-extra-label`}
            hint="What it is, e.g. “API key”. Clearing this removes the second secret."
          >
            <Input
              id={`${idPrefix}-extra-label`}
              name="extra_label"
              placeholder="API key"
              defaultValue={credential?.extra_label ?? ""}
            />
          </FieldRow>

          <FieldRow
            label="Second secret — value"
            htmlFor={`${idPrefix}-extra-secret`}
            hint={isEdit ? "Blank keeps the stored one." : "Encrypted before it's saved."}
          >
            <Input
              id={`${idPrefix}-extra-secret`}
              name="extra_secret"
              type="password"
              autoComplete="new-password"
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
                      (credential
                        ? credential.visible_to_roles.includes(role.value as AppRole)
                        : role.value !== "employee")
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
                <strong>Never</strong> revokes it from that person even though their role allows
                it. <strong>Always</strong> gives it to them even though their role does not —
                that&rsquo;s how you hand one login to a single person.
              </p>

              <div className="grid gap-2 sm:grid-cols-2">
                {people.map((person) => (
                  <label
                    key={person.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface px-3 py-1.5"
                  >
                    <span className="min-w-0 truncate text-[13px] text-navy">
                      {person.name}
                      <span className="ml-1.5 text-xs text-ink-faint capitalize">
                        {person.role}
                      </span>
                    </span>
                    <Combobox
                      name={`grant:${person.id}`}
                      defaultValue={grants?.[person.id] ?? ""}
                      placeholder="Follow roles"
                      options={GRANT_CHOICES}
                      allowClear
                      clearLabel="Follow roles"
                      className="w-36 shrink-0"
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </details>
    </>
  );
}

/** Owner-only create form. */
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
  const [open, setOpen] = useState(false);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await saveCredential(formData);
      if (result.ok) {
        toast.success(result.message ?? "Stored.");
        formRef.current?.reset();
        setOpen(false);
      } else {
        // Left open on failure: closing would take the half-typed password
        // with it, and the error names something the person has to fix here.
        toast.error(result.error);
      }
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Add a credential"
      description="Encrypted before it reaches the database. It gets its own reference once saved."
      trigger={
        <Button type="button" size="sm">
          <Plus className="size-4" />
          Add login
        </Button>
      }
    >
      <form ref={formRef} action={onSubmit} className="flex flex-col gap-3">
        <CredentialFields assets={assets} clients={clients} people={people} idPrefix="new" />
        <div className="flex gap-2 border-t border-line-soft pt-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save credential"}
          </Button>
          <Button type="button" variant="quiet" disabled={pending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
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
      className="mt-3 flex flex-col gap-3 rounded-lg border border-mint-line bg-surface p-3"
    >
      <CredentialFields
        assets={assets}
        clients={clients}
        people={people}
        grants={grants}
        credential={credential}
        idPrefix={`edit-${credential.id}`}
      />
      <div className="flex gap-2">
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
