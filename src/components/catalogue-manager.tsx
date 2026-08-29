"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Merge, Plus, Settings2, Trash2 } from "lucide-react";
import {
  deleteCatalogueEntry,
  mergeCatalogueEntry,
  saveCatalogueEntry,
} from "@/app/actions/catalogue";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/callout";

export type CatalogueEntry = {
  slug: string;
  name: string;
  hint?: string | null;
  /** How many credentials point at this slug. */
  usage: number;
};

type Kind = "tool" | "client";

/**
 * Rename, add, merge and remove the tools and clients credentials are filed
 * under.
 *
 * Merge is the operation this screen exists for. Three slugs — chc, ghl,
 * gohighlevel — all displayed as "GoHighLevel", so the picker offered the same
 * tool three times and there was no way to say they were one thing. Names that
 * collide are flagged here rather than left for you to spot.
 */
export function CatalogueManager({ tools, clients }: { tools: CatalogueEntry[]; clients: CatalogueEntry[] }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("tool");

  const entries = kind === "tool" ? tools : clients;

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Tools and clients"
      description="Rename, merge duplicates, or remove one nothing uses."
      className="max-w-3xl"
      trigger={
        <Button type="button" size="sm" variant="secondary">
          <Settings2 className="size-4" />
          Manage
        </Button>
      }
    >
      <div className="mb-4 inline-flex rounded-lg border border-line bg-canvas p-0.5">
        {(["tool", "client"] as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={
              kind === k
                ? "rounded-md bg-surface px-3 py-1.5 text-[13px] font-semibold text-navy shadow-sm"
                : "rounded-md px-3 py-1.5 text-[13px] text-ink-muted hover:text-navy"
            }
          >
            {k === "tool" ? `Tools (${tools.length})` : `Clients (${clients.length})`}
          </button>
        ))}
      </div>

      <CatalogueList key={kind} kind={kind} entries={entries} />
    </Modal>
  );
}

function CatalogueList({ kind, entries }: { kind: Kind; entries: CatalogueEntry[] }) {
  const [adding, setAdding] = useState(false);

  // Same display name, different slug — the thing that made the picker repeat
  // itself. Flagged so the fix is obvious rather than archaeological.
  const duplicateNames = useMemo(() => {
    const seen = new Map<string, number>();
    for (const e of entries) {
      const key = e.name.trim().toLowerCase();
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([name]) => name));
  }, [entries]);

  const duplicateCount = entries.filter((e) =>
    duplicateNames.has(e.name.trim().toLowerCase()),
  ).length;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">
          {duplicateCount > 0
            ? `${duplicateCount} entries share a name with another. Merging folds their logins together.`
            : "No two share a name."}
        </p>
        <Button type="button" size="sm" variant="secondary" onClick={() => setAdding((v) => !v)}>
          <Plus className="size-3.5" />
          {adding ? "Cancel" : kind === "tool" ? "New tool" : "New client"}
        </Button>
      </div>

      {adding ? <AddRow kind={kind} onDone={() => setAdding(false)} /> : null}

      {entries.length === 0 ? (
        <EmptyState title="Nothing here yet." />
      ) : (
        <ul className="flex flex-col divide-y divide-line-soft">
          {entries.map((entry) => (
            <EntryRow
              key={entry.slug}
              kind={kind}
              entry={entry}
              others={entries.filter((e) => e.slug !== entry.slug)}
              isDuplicate={duplicateNames.has(entry.name.trim().toLowerCase())}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function AddRow({ kind, onDone }: { kind: Kind; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [hint, setHint] = useState("");

  function save() {
    startTransition(async () => {
      const data = new FormData();
      data.set("kind", kind);
      data.set("name", name);
      if (kind === "client") data.set("hint", hint);
      const result = await saveCatalogueEntry(data);
      if (result.ok) {
        toast.success(result.message ?? "Added.");
        setName("");
        setHint("");
        onDone();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-mint-line bg-mint-50/40 p-3">
      <div className="min-w-40 flex-1">
        <label className="text-[12.5px] font-medium text-navy">Name</label>
        <Input
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === "tool" ? "e.g. Dropbox" : "e.g. Acme Ltd"}
          className="mt-1 h-9"
        />
      </div>

      {kind === "client" ? (
        <div className="min-w-40 flex-1">
          <label className="text-[12.5px] font-medium text-navy">Hint</label>
          <Input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="Who it is, in a few words"
            className="mt-1 h-9"
          />
        </div>
      ) : null}

      <Button type="button" size="sm" disabled={pending || !name.trim()} onClick={save}>
        {pending ? "Adding…" : "Add"}
      </Button>
    </div>
  );
}

function EntryRow({
  kind,
  entry,
  others,
  isDuplicate,
}: {
  kind: Kind;
  entry: CatalogueEntry;
  others: CatalogueEntry[];
  isDuplicate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(entry.name);
  const [hint, setHint] = useState(entry.hint ?? "");
  const [merging, setMerging] = useState(false);
  const [mergeInto, setMergeInto] = useState("");

  function run(action: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message ?? "Done.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function rename() {
    if (name.trim() === entry.name && hint.trim() === (entry.hint ?? "")) return;
    run(() => {
      const data = new FormData();
      data.set("kind", kind);
      data.set("slug", entry.slug);
      data.set("name", name);
      if (kind === "client") data.set("hint", hint);
      return saveCatalogueEntry(data);
    });
  }

  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-36 flex-1">
          <Input
            value={name}
            disabled={pending}
            aria-label={`Name for ${entry.slug}`}
            onChange={(e) => setName(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                rename();
              }
            }}
            className="h-9"
          />
        </div>

        {kind === "client" ? (
          <div className="min-w-36 flex-1">
            <Input
              value={hint}
              disabled={pending}
              placeholder="Hint"
              aria-label={`Hint for ${entry.slug}`}
              onChange={(e) => setHint(e.target.value)}
              onBlur={rename}
              className="h-9"
            />
          </div>
        ) : null}

        <code className="tabular shrink-0 rounded border border-line bg-canvas px-1.5 py-1 font-mono text-[11px] text-ink-faint">
          {entry.slug}
        </code>

        <span className="w-20 shrink-0 text-right text-xs text-ink-muted">
          {entry.usage} {entry.usage === 1 ? "login" : "logins"}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="quiet"
            disabled={pending || others.length === 0}
            aria-label={`Merge ${entry.name}`}
            title="Merge into another entry"
            onClick={() => setMerging((v) => !v)}
          >
            <Merge className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="quiet"
            disabled={pending}
            aria-label={`Remove ${entry.name}`}
            title={entry.usage > 0 ? "In use — merge it instead" : "Remove"}
            onClick={() =>
              run(() => {
                const data = new FormData();
                data.set("kind", kind);
                data.set("slug", entry.slug);
                return deleteCatalogueEntry(data);
              })
            }
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {isDuplicate ? (
        <p className="mt-1 text-[11.5px] text-[var(--color-warning,#9a6b00)]">
          Another entry shares this name.
        </p>
      ) : null}

      {merging ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-canvas p-2.5">
          <span className="text-[12.5px] text-ink-muted">
            Move its {entry.usage} {entry.usage === 1 ? "login" : "logins"} into
          </span>
          <Combobox
            value={mergeInto}
            onChange={setMergeInto}
            className="w-52"
            placeholder="Choose an entry…"
            searchPlaceholder="Find…"
            options={others.map((o) => ({ value: o.slug, label: o.name, hint: o.slug }))}
          />
          <Button
            type="button"
            size="sm"
            disabled={pending || !mergeInto}
            onClick={() =>
              run(() => {
                const data = new FormData();
                data.set("kind", kind);
                data.set("from", entry.slug);
                data.set("into", mergeInto);
                return mergeCatalogueEntry(data);
              })
            }
          >
            {pending ? "Merging…" : "Merge"}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
