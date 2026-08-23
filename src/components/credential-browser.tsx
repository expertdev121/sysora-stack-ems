"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/callout";
import { CredentialRow } from "@/components/credential-list";
import type { FormOption, PersonOption } from "@/components/credential-form";
import { clientHint, clientName, sortClientKeys } from "@/lib/clients";
import { toolLabel } from "@/lib/team-assets";
import type { CredentialSummary, GrantMode } from "@/lib/types";

function groupBy<T, K extends string | null>(items: T[], key: (item: T) => K) {
  return items.reduce<Map<K, T[]>>((acc, item) => {
    const k = key(item);
    const existing = acc.get(k);
    if (existing) existing.push(item);
    else acc.set(k, [item]);
    return acc;
  }, new Map());
}

/**
 * Search runs on the client because the whole (small) set is already loaded and
 * every field it matches on is already in the DOM. It matches the label,
 * username, tool, client and notes — but never the secret, which is not present
 * on this page in any form.
 */
function matches(credential: CredentialSummary, query: string): boolean {
  const haystack = [
    credential.label,
    credential.username ?? "",
    credential.url ?? "",
    credential.notes ?? "",
    toolLabel(credential.asset_id),
    clientName(credential.client_key),
    credential.client_key ?? "",
  ]
    .join(" ")
    .toLowerCase();

  // Every whitespace-separated term must appear: "brandy gmail" narrows.
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

  const filtered = useMemo(
    () => (query.trim() ? credentials.filter((c) => matches(c, query.trim())) : credentials),
    [credentials, query],
  );

  const byClient = useMemo(() => groupBy(filtered, (c) => c.client_key), [filtered]);
  const clientKeys = useMemo(() => sortClientKeys([...byClient.keys()]), [byClient]);

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by tool, client, label or username…"
            aria-label="Search credentials"
            className="h-10 w-full rounded-lg border border-line bg-surface pr-9 pl-9 text-sm text-ink placeholder:text-ink-faint transition-colors hover:border-line-strong focus:border-mint focus:outline-none"
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

        <p className="text-xs text-ink-muted">
          {query.trim()
            ? `${filtered.length} of ${credentials.length} ${
                credentials.length === 1 ? "login" : "logins"
              }`
            : `${credentials.length} ${credentials.length === 1 ? "login" : "logins"}`}
        </p>
      </div>

      {credentials.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No credentials are shared with your role.">
            Ask the Owner if you need access to one.
          </EmptyState>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-4">
          <EmptyState title={`Nothing matches “${query.trim()}”.`} />
        </div>
      ) : (
        clientKeys.map((key) => {
          const group = byClient.get(key) ?? [];
          const byAsset = groupBy(group, (c) => c.asset_id);
          const assetIds = [...byAsset.keys()].sort((a, b) =>
            toolLabel(a).localeCompare(toolLabel(b)),
          );

          return (
            <div key={key ?? "unassigned"} className="mt-7">
              <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-line pb-2">
                <h3 className="text-[15px] font-semibold text-navy">{clientName(key)}</h3>
                {clientHint(key) ? (
                  <span className="text-xs text-ink-muted">{clientHint(key)}</span>
                ) : null}
                <span className="ml-auto text-xs text-ink-faint">
                  {group.length} {group.length === 1 ? "login" : "logins"}
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {assetIds.map((assetId) => (
                  <Card key={assetId}>
                    <CardContent className="pt-4">
                      <h4 className="text-[13px] font-semibold text-navy">{toolLabel(assetId)}</h4>
                      <ul className="mt-3 flex flex-col gap-2">
                        {(byAsset.get(assetId) ?? []).map((credential) => (
                          <CredentialRow
                            key={credential.id}
                            credential={credential}
                            canManage={canManage}
                            assets={assets}
                            clients={clients}
                            people={people}
                            grants={grantsByCredential[credential.id]}
                          />
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
