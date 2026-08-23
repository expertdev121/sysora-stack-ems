import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { CredentialBrowser } from "@/components/credential-browser";
import { CredentialForm } from "@/components/credential-form";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { encryptionConfigured } from "@/lib/crypto";
import { assetHost, assetsForRole, toolOptions } from "@/lib/team-assets";
import { CLIENTS } from "@/lib/clients";
import type { CredentialGrant, CredentialSummary, GrantMode, Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Team assets" };

export default async function TeamAssetsPage() {
  const { profile } = await requireSession();
  const supabase = await createClient();
  const assets = assetsForRole(profile.role);
  const isOwner = profile.role === "owner";

  // secret_ciphertext is deliberately NOT selected. Nothing encrypted ever
  // reaches this page's HTML — decryption happens only in the reveal action.
  const [{ data: credentialRows }, { data: peopleRows }, { data: grantRows }] = await Promise.all([
    supabase
      .from("credentials")
      .select("id, asset_id, client_key, label, username, url, notes, visible_to_roles, rotated_at")
      .order("label"),
    // Employees can only read their own profile, so this list is populated for
    // staff and empty for everyone else — which is fine, since only the Owner
    // sees the sharing controls that use it.
    supabase
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("is_active", true)
      .order("full_name"),
    supabase.from("credential_grants").select("credential_id, profile_id, mode"),
  ]);

  const credentials = (credentialRows ?? []) as CredentialSummary[];

  const people = ((peopleRows ?? []) as Pick<Profile, "id" | "full_name" | "role">[])
    .filter((p) => p.id !== profile.id)
    .map((p) => ({ id: p.id, name: p.full_name, role: p.role }));

  const grantsByCredential: Record<string, Record<string, GrantMode>> = {};
  for (const grant of (grantRows ?? []) as CredentialGrant[]) {
    (grantsByCredential[grant.credential_id] ??= {})[grant.profile_id] = grant.mode;
  }

  const assetOptions = toolOptions(credentials.map((c) => c.asset_id));
  const clientOptions = CLIENTS.map((c) => ({ id: c.key, name: c.name }));

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

      {/* ---- Credentials, searchable, grouped by client ------------------ */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-navy">Logins by client</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Encrypted at rest. Every reveal is recorded against your name.
        </p>

        <CredentialBrowser
          credentials={credentials}
          canManage={isOwner}
          assets={assetOptions}
          clients={clientOptions}
          people={people}
          grantsByCredential={grantsByCredential}
        />
      </section>

      {isOwner ? (
        <div className="mt-8">
          <CredentialForm assets={assetOptions} clients={clientOptions} people={people} />
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
