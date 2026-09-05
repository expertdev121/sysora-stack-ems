"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { EmptyState } from "@/components/ui/callout";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { CREDENTIAL_COLUMNS, CredentialTableRow } from "@/components/credential-list";
import type { FormOption, PersonOption } from "@/components/credential-form";
import { clientName } from "@/lib/clients";
import { toolLabel } from "@/lib/team-assets";
import type { CredentialSummary, GrantMode } from "@/lib/types";

/**
 * Search matches every field on the row — reference, label, username, URL,
 * notes, tool and client — and requires every whitespace-separated term to
 * appear somewhere. "brandy ghl" narrows; "ghl brandy" narrows identically,
 * because people remember the words in a name but rarely their order.
 *
 * The secret is not matched, because it is not on this page in any form.
 */
function matches(
  credential: CredentialSummary,
  query: string,
  toolName: (slug: string) => string,
  clientLabel: (slug: string | null) => string,
): boolean {
  const haystack = [
    credential.ref,
    credential.label,
    credential.username ?? "",
    credential.url ?? "",
    credential.notes ?? "",
    toolName(credential.asset_id),
    clientLabel(credential.client_key),
    credential.client_key ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export function CredentialBrowser({
  credentials,
  canManage,
  assets,
  clients,
  people,
  grantsByCredential,
}: {
  credentials: CredentialSummary[];
  canManage: boolean;
  assets: FormOption[];
  clients: FormOption[];
  people: PersonOption[];
  grantsByCredential: Record<string, Record<string, GrantMode>>;
}) {
  const [query, setQuery] = useState("");
  const [client, setClient] = useState("");
  const [tool, setTool] = useState("");

  // Names come from the editable catalogue; the old constants are the fallback
  // for a slug in use that has no row yet.
  const toolName = useMemo(() => {
    const map = new Map(assets.map((a) => [a.id, a.name]));
    return (slug: string) => map.get(slug) ?? toolLabel(slug);
  }, [assets]);

  const clientLabel = useMemo(() => {
    const map = new Map(clients.map((c) => [c.id, c.name]));
    return (slug: string | null) => (slug ? (map.get(slug) ?? clientName(slug)) : clientName(null));
  }, [clients]);

  // Counts live on the filter options themselves, so picking one is an
  // informed choice rather than a guess that might land on an empty list.
  const clientOptions: ComboboxOption[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of credentials) {
      const key = c.client_key ?? "";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, n]) => ({
        value: key || "__none__",
        label: key ? clientLabel(key) : "No client",
        hint: String(n),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [credentials, clientLabel]);

  const toolOptions: ComboboxOption[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of credentials) counts.set(c.asset_id, (counts.get(c.asset_id) ?? 0) + 1);
    return [...counts.entries()]
      .map(([id, n]) => ({ value: id, label: toolName(id), hint: String(n) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [credentials, toolName]);

  const filtered = useMemo(() => {
    return credentials.filter((c) => {
      if (client === "__none__" && c.client_key !== null) return false;
      if (client && client !== "__none__" && c.client_key !== client) return false;
      if (tool && c.asset_id !== tool) return false;
      if (query.trim() && !matches(c, query.trim(), toolName, clientLabel)) return false;
      return true;
    });
  }, [credentials, client, tool, query, toolName, clientLabel]);

  const narrowed = Boolean(query.trim() || client || tool);

  if (credentials.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState title="No credentials are shared with your role.">
          Ask the Owner if you need access to one.
        </EmptyState>
      </div>
    );
  }

  return (
    <>
      <div className="mt-4 flex flex-col gap-3 rounded-card border border-line bg-surface p-3 sm:flex-row sm:items-center">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reference, login, username, tool, client, notes…"
            aria-label="Search credentials"
            className="h-10 w-full rounded-lg border border-line bg-canvas pr-9 pl-9 text-sm text-ink placeholder:text-ink-faint transition-colors hover:border-line-strong focus:border-mint focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-faint hover:text-navy"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="w-full sm:w-56">
          <Combobox
            options={clientOptions}
            value={client}
            onChange={setClient}
            allowClear
            clearLabel="All clients"
            placeholder="All clients"
            searchPlaceholder="Find a client…"
            emptyText="No client by that name."
          />
        </div>

        <div className="w-full sm:w-48">
          <Combobox
            options={toolOptions}
            value={tool}
            onChange={setTool}
            allowClear
            clearLabel="All tools"
            placeholder="All tools"
            searchPlaceholder="Find a tool…"
            emptyText="No tool by that name."
          />
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <p className="text-xs text-ink-muted">
          {narrowed
            ? `${filtered.length} of ${credentials.length} logins`
            : `${credentials.length} ${credentials.length === 1 ? "login" : "logins"}`}
        </p>
        {narrowed ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setClient("");
              setTool("");
            }}
            className="text-xs font-medium text-mint-deep hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="Nothing matches those filters." />
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="bg-canvas">
                {CREDENTIAL_COLUMNS.map((heading, i) => (
                  <th
                    key={heading || `actions-${i}`}
                    scope="col"
                    className="px-3 py-2 text-[11px] font-semibold tracking-[0.6px] text-ink-muted uppercase"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((credential) => (
                <CredentialTableRow
                  key={credential.id}
                  credential={credential}
                  canManage={canManage}
                  assets={assets}
                  clients={clients}
                  people={people}
                  grants={grantsByCredential[credential.id]}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
