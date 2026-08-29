"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { deleteCredential, revealCredential } from "@/app/actions/credentials";
import { Button } from "@/components/ui/button";
import {
  CredentialEditForm,
  type FormOption,
  type PersonOption,
} from "@/components/credential-form";
import { clientName } from "@/lib/clients";
import { toolLabel } from "@/lib/team-assets";
import type { CredentialSummary, GrantMode } from "@/lib/types";

/** Revealed secrets clear themselves after this long. */
const AUTO_HIDE_MS = 45_000;

/** Columns rendered below. Exported so the header can't drift from the body. */
export const CREDENTIAL_COLUMNS = ["ID", "Login", "Tool", "Client", "Username", ""] as const;

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Your browser blocked the clipboard. Select and copy manually.");
        }
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

/**
 * One credential as a table row, with the secret revealing into a row beneath.
 *
 * A table rather than nested cards because the question people arrive with is
 * "which one is the Brandy GHL login" — a scanning question, and columns are
 * what you scan. The reference leads because it is the part you quote to
 * someone: "use CRD-0003" survives the login being renamed.
 */
export function CredentialTableRow({
  credential,
  canManage,
  assets,
  clients,
  people,
  grants,
}: {
  credential: CredentialSummary;
  canManage: boolean;
  assets: FormOption[];
  clients: FormOption[];
  people: PersonOption[];
  grants?: Record<string, GrantMode>;
}) {
  const [revealed, setRevealed] = useState<{
    username: string | null;
    secret: string;
    extra: { label: string; value: string } | null;
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function hide() {
    setRevealed(null);
    if (timer.current) clearTimeout(timer.current);
  }

  function reveal() {
    startTransition(async () => {
      const data = new FormData();
      data.set("id", credential.id);
      const result = await revealCredential(data);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setRevealed({ username: result.username, secret: result.secret, extra: result.extra });
      timer.current = setTimeout(() => setRevealed(null), AUTO_HIDE_MS);
    });
  }

  const grantModes = grants ? Object.values(grants) : [];
  const denied = grantModes.filter((m) => m === "deny").length;
  const allowed = grantModes.filter((m) => m === "allow").length;

  return (
    <>
      <tr className="border-t border-line-soft align-middle transition-colors hover:bg-canvas">
        <td className="px-3 py-2.5 whitespace-nowrap">
          <button
            type="button"
            title="Copy this reference"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(credential.ref);
                toast.success(`${credential.ref} copied.`);
              } catch {
                toast.error("Your browser blocked the clipboard.");
              }
            }}
            className="tabular rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[11.5px] text-ink-muted transition-colors hover:border-mint hover:text-mint-deep"
          >
            {credential.ref}
          </button>
        </td>

        <td className="px-3 py-2.5">
          <span className="block text-[13px] font-medium text-navy">{credential.label}</span>
          {credential.notes ? (
            <span className="block max-w-[38ch] truncate text-xs text-ink-faint">
              {credential.notes}
            </span>
          ) : null}
          {canManage && (denied > 0 || allowed > 0) ? (
            <span className="block text-xs text-ink-muted">
              {[
                denied > 0 ? `${denied} revoked` : null,
                allowed > 0 ? `${allowed} granted directly` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          ) : null}
        </td>

        <td className="px-3 py-2.5 text-[13px] text-ink">{toolLabel(credential.asset_id)}</td>

        <td className="px-3 py-2.5 text-[13px] text-ink">{clientName(credential.client_key)}</td>

        <td className="px-3 py-2.5">
          <span className="block max-w-[26ch] truncate text-[13px] text-ink-muted">
            {credential.username ?? "—"}
          </span>
          {credential.rotated_at ? (
            <span className="block text-xs text-ink-faint">
              rotated {new Date(credential.rotated_at).toLocaleDateString("en-GB")}
            </span>
          ) : null}
        </td>

        <td className="px-3 py-2.5">
          <div className="flex items-center justify-end gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={revealed ? "quiet" : "secondary"}
              disabled={pending}
              onClick={revealed ? hide : reveal}
            >
              {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              {pending ? "…" : revealed ? "Hide" : "Reveal"}
            </Button>

            {canManage ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="quiet"
                  aria-label={`Edit ${credential.label}`}
                  onClick={() => setEditing((v) => !v)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="quiet"
                  aria-label={`Delete ${credential.label}`}
                  onClick={() =>
                    startTransition(async () => {
                      const data = new FormData();
                      data.set("id", credential.id);
                      const result = await deleteCredential(data);
                      if (result.ok) toast.success(result.message ?? "Deleted.");
                      else toast.error(result.error);
                    })
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            ) : null}
          </div>
        </td>
      </tr>

      {revealed ? (
        <tr className="bg-canvas">
          <td colSpan={CREDENTIAL_COLUMNS.length} className="px-3 pt-0 pb-3">
            <div className="flex flex-col gap-2 rounded-lg border border-mint-line bg-surface p-3">
              {revealed.username ? (
                <div className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-xs text-ink-muted">Username</span>
                  <code className="flex-1 truncate rounded border border-line bg-canvas px-2 py-1.5 font-mono text-[12px] text-navy">
                    {revealed.username}
                  </code>
                  <CopyButton value={revealed.username} label="username" />
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-xs text-ink-muted">Password</span>
                <code className="flex-1 truncate rounded border border-mint-line bg-canvas px-2 py-1.5 font-mono text-[12px] break-all text-navy">
                  {revealed.secret}
                </code>
                <CopyButton value={revealed.secret} label="password" />
              </div>

              {revealed.extra ? (
                <div className="flex items-center gap-2">
                  <span className="w-24 shrink-0 truncate text-xs text-ink-muted">
                    {revealed.extra.label}
                  </span>
                  <code className="flex-1 truncate rounded border border-line bg-canvas px-2 py-1.5 font-mono text-[12px] break-all text-navy">
                    {revealed.extra.value}
                  </code>
                  <CopyButton value={revealed.extra.value} label={revealed.extra.label} />
                </div>
              ) : null}

              <p className="text-xs text-ink-faint">
                Hides automatically in {AUTO_HIDE_MS / 1000}s. This view is recorded against your
                name.
              </p>
            </div>
          </td>
        </tr>
      ) : null}

      {editing && canManage ? (
        <tr className="bg-canvas">
          <td colSpan={CREDENTIAL_COLUMNS.length} className="px-3 pt-0 pb-3">
            <CredentialEditForm
              credential={credential}
              assets={assets}
              clients={clients}
              people={people}
              grants={grants}
              onDone={() => setEditing(false)}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}
