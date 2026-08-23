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
import type { CredentialSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Team assets" };

/** "my-profit-engine" -> "My profit engine". Only used for credentials whose
 *  asset_id has no matching link in TEAM_ASSETS. */
function humaniseAssetId(assetId: string): string {
  const spaced = assetId.replace(/[-_]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
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
    .select("id, asset_id, label, username, url, notes, visible_to_roles, rotated_at")
    .order("label");

  const credentials = (credentialRows ?? []) as CredentialSummary[];
  const orphaned = credentials.filter(
    (c) => !TEAM_ASSETS.some((asset) => asset.id === c.asset_id),
  );

  const orphanGroups = Object.entries(
    orphaned.reduce<Record<string, CredentialSummary[]>>((acc, credential) => {
      (acc[credential.asset_id] ??= []).push(credential);
      return acc;
    }, {}),
  ).sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <PageHeader
        title="Team assets"
        description="The tools we work in. Everything here opens in a new tab."
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

      {assets.length === 0 ? (
        <EmptyState title="Nothing shared with your role yet." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {assets.map((asset) => {
            const assetCredentials = credentials.filter((c) => c.asset_id === asset.id);

            return (
              <Card key={asset.id} className="transition-colors hover:border-mint-line">
                <CardContent className="flex h-full flex-col pt-5">
                  <h2 className="text-[15px] font-semibold text-navy">{asset.name}</h2>
                  <p className="mt-1 text-[13px] text-ink-muted">{asset.description}</p>

                  <a
                    href={asset.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex w-fit items-center gap-2 rounded-lg bg-mint px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-mint-deep"
                  >
                    Open {asset.name}
                    <ExternalLink className="size-3.5" />
                  </a>

                  <p className="mt-2 truncate text-xs text-ink-faint">{assetHost(asset.href)}</p>

                  <CredentialList credentials={assetCredentials} canManage={isOwner} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {orphanGroups.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-[15px] font-semibold text-navy">Other credentials</h2>
          <p className="mt-1 mb-4 text-[13px] text-ink-muted">
            Logins for tools that don&rsquo;t have a link above — including client-owned accounts.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {orphanGroups.map(([assetId, group]) => (
              <Card key={assetId}>
                <CardContent className="pt-5">
                  <h3 className="text-[15px] font-semibold text-navy">{humaniseAssetId(assetId)}</h3>
                  <p className="mt-1 text-[13px] text-ink-muted">
                    {group.length} {group.length === 1 ? "login" : "logins"}
                  </p>
                  <CredentialList credentials={group} canManage={isOwner} />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {isOwner ? (
        <div className="mt-6">
          <CredentialForm assets={TEAM_ASSETS.map((a) => ({ id: a.id, name: a.name }))} />
          <p className="mt-3 text-xs text-ink-muted">
            Secrets are encrypted with AES-256-GCM before they reach the database, using a key held
            in the environment rather than in Postgres. Every reveal is recorded against the
            person who did it — that trail is your rotation checklist when someone leaves.
          </p>
        </div>
      ) : null}
    </>
  );
}
