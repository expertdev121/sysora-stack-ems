import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/callout";
import { CredentialForm } from "@/components/credential-form";
import { CredentialList } from "@/components/credential-list";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { encryptionConfigured } from "@/lib/crypto";
import { assetHost, assetsForRole, TEAM_ASSETS } from "@/lib/team-assets";
import { CLIENTS, clientHint, clientName, sortClientKeys } from "@/lib/clients";
import type { CredentialSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Team assets" };

/** "my-profit-engine" -> "My profit engine", for tools with no link entry. */
function humaniseAssetId(assetId: string): string {
  const spaced = assetId.replace(/[-_]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Tool names for the credential grouping.
 *
 * Deliberately NOT the TEAM_ASSETS name: that is the name of *our* link (e.g.
 * "Sysora GHL account"), which would mislabel a client's login for the same
 * platform. This is the platform, not our account on it.
 */
const TOOL_NAMES: Record<string, string> = {
  "a2a-course": "A2A course",
  addevent: "AddEvent",
  chc: "GoHighLevel",
  claude: "Claude",
  clickup: "ClickUp",
  email: "Email",
  "email-delivery": "Email delivery",
  ghl: "GoHighLevel",
  gmail: "Gmail",
  gohighlevel: "GoHighLevel",
  groupkit: "GroupKit",
  microsoft: "Microsoft",
  miro: "Miro",
  "my-profit-engine": "My Profit Engine",
  n8n: "n8n",
  openai: "OpenAI",
  "p2p-email": "Email",
  "power-bi": "Power BI",
  scoreapp: "ScoreApp",
  "sola-payments": "Sola Payments",
  thinkific: "Thinkific",
  zapier: "Zapier",
  zoom: "Zoom",
};

function assetLabel(assetId: string): string {
  return TOOL_NAMES[assetId] ?? humaniseAssetId(assetId);
}

function groupBy<T, K extends string | null>(items: T[], key: (item: T) => K) {
  return items.reduce<Map<K, T[]>>((acc, item) => {
    const k = key(item);
    const existing = acc.get(k);
    if (existing) existing.push(item);
    else acc.set(k, [item]);
    return acc;
  }, new Map());
}

export default async function TeamAssetsPage() {
  const { profile } = await requireSession();
  const supabase = await createClient();
  const assets = assetsForRole(profile.role);
  const isOwner = profile.role === "owner";

  // secret_ciphertext is deliberately NOT selected. Nothing encrypted ever
  // reaches this page's HTML — decryption happens only in the reveal action.
  const { data: credentialRows } = await supabase
    .from("credentials")
    .select("id, asset_id, client_key, label, username, url, notes, visible_to_roles, rotated_at")
    .order("label");

  const credentials = (credentialRows ?? []) as CredentialSummary[];

  const byClient = groupBy(credentials, (c) => c.client_key);
  const clientKeys = sortClientKeys([...byClient.keys()]);

  // The form's tool list is the linked assets plus any tool that already has a
  // credential, so an existing group stays selectable without needing a link.
  const assetOptions = [
    ...TEAM_ASSETS.map((a) => ({ id: a.id, name: a.name })),
    ...[...new Set(credentials.map((c) => c.asset_id))]
      .filter((id) => !TEAM_ASSETS.some((a) => a.id === id))
      .map((id) => ({ id, name: assetLabel(id) })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        title="Team assets"
        description="The tools we work in, and the logins for them. Links open in a new tab."
      />

      {isOwner && !encryptionConfigured() ? (
        <Callout tone="warn" title="Credential storage is switched off." className="mb-6">
          <code className="rounded bg-surface px-1 py-0.5 text-[12px]">
            CREDENTIALS_ENCRYPTION_KEY
          </code>{" "}
          isn&rsquo;t set, so nothing can be encrypted or revealed. Generate one with{" "}
          <code className="rounded bg-surface px-1 py-0.5 text-[12px]">openssl rand -base64 32</code>
          .
        </Callout>
      ) : null}

      {/* ---- Tools ------------------------------------------------------- */}
      {assets.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <Card key={asset.id} className="transition-colors hover:border-mint-line">
              <CardContent className="flex h-full flex-col pt-5">
                <h2 className="text-[15px] font-semibold text-navy">{asset.name}</h2>
                <p className="mt-1 flex-1 text-[13px] text-ink-muted">{asset.description}</p>
                <a
                  href={asset.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex w-fit items-center gap-2 rounded-lg bg-mint px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-mint-deep"
                >
                  Open
                  <ExternalLink className="size-3.5" />
                </a>
                <p className="mt-2 truncate text-xs text-ink-faint">{assetHost(asset.href)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* ---- Credentials, grouped by client ------------------------------ */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-navy">Logins by client</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Encrypted at rest. Every reveal is recorded against your name.
        </p>

        {credentials.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No credentials stored yet." />
          </div>
        ) : (
          clientKeys.map((key) => {
            const group = byClient.get(key) ?? [];
            const byAsset = groupBy(group, (c) => c.asset_id);
            const assetIds = [...byAsset.keys()].sort((a, b) =>
              assetLabel(a).localeCompare(assetLabel(b)),
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
                        <h4 className="text-[13px] font-semibold text-navy">
                          {assetLabel(assetId)}
                        </h4>
                        <CredentialList
                          credentials={byAsset.get(assetId) ?? []}
                          canManage={isOwner}
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>

      {isOwner ? (
        <div className="mt-8">
          <CredentialForm
            assets={assetOptions}
            clients={CLIENTS.map((c) => ({ key: c.key, name: c.name }))}
          />
          <p className="mt-3 text-xs text-ink-muted">
            Secrets are encrypted with AES-256-GCM before they reach the database, using a key
            held in the environment rather than in Postgres. A shared login cannot be revoked for
            one person — when someone leaves, rotate whatever the reveal log says they saw.
          </p>
        </div>
      ) : null}
    </>
  );
}
