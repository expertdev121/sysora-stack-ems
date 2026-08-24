"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, Eye, EyeOff, KeyRound, Pencil, Trash2 } from "lucide-react";
import { deleteCredential, revealCredential } from "@/app/actions/credentials";
import { Button } from "@/components/ui/button";
import {
  CredentialEditForm,
  type FormOption,
  type PersonOption,
} from "@/components/credential-form";
import type { CredentialSummary, GrantMode } from "@/lib/types";

/** Revealed secrets clear themselves after this long. */
const AUTO_HIDE_MS = 45_000;

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

export function CredentialRow({
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

  return (
    <li className="rounded-lg border border-line bg-canvas px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-navy">
            <KeyRound className="size-3.5 shrink-0 text-ink-faint" />
            {credential.label}
          </p>
          <p className="truncate text-xs text-ink-muted">
            {credential.username ?? "no username"}
            {credential.rotated_at
              ? ` · rotated ${new Date(credential.rotated_at).toLocaleDateString("en-GB")}`
              : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
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
      </div>

      {credential.notes && !editing ? (
        <p className="mt-1.5 text-xs text-ink-faint">{credential.notes}</p>
      ) : null}

      {canManage && grants && Object.keys(grants).length > 0 && !editing ? (
        <p className="mt-1.5 text-xs text-ink-muted">
          {Object.values(grants).filter((m) => m === "deny").length > 0
            ? `${Object.values(grants).filter((m) => m === "deny").length} revoked`
            : null}
          {Object.values(grants).filter((m) => m === "deny").length > 0 &&
          Object.values(grants).filter((m) => m === "allow").length > 0
            ? " · "
            : null}
          {Object.values(grants).filter((m) => m === "allow").length > 0
            ? `${Object.values(grants).filter((m) => m === "allow").length} granted directly`
            : null}
        </p>
      ) : null}

      {revealed ? (
        <div className="mt-2.5 flex flex-col gap-2 border-t border-line pt-2.5">
          {revealed.username ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded border border-line bg-surface px-2 py-1.5 font-mono text-[12px] text-navy">
                {revealed.username}
              </code>
              <CopyButton value={revealed.username} label="username" />
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded border border-mint-line bg-surface px-2 py-1.5 font-mono text-[12px] break-all text-navy">
              {revealed.secret}
            </code>
            <CopyButton value={revealed.secret} label="password" />
          </div>

          {revealed.extra ? (
            <div className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-xs text-ink-muted">
                {revealed.extra.label}
              </span>
              <code className="flex-1 truncate rounded border border-line bg-surface px-2 py-1.5 font-mono text-[12px] break-all text-navy">
                {revealed.extra.value}
              </code>
              <CopyButton value={revealed.extra.value} label={revealed.extra.label} />
            </div>
          ) : null}

          <p className="text-xs text-ink-faint">
            Hides automatically in {AUTO_HIDE_MS / 1000}s. This view is recorded against your name.
          </p>
        </div>
      ) : null}

      {editing && canManage ? (
        <CredentialEditForm
          credential={credential}
          assets={assets}
          clients={clients}
          people={people}
          grants={grants}
          onDone={() => setEditing(false)}
        />
      ) : null}
    </li>
  );
}
