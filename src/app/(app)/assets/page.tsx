import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
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

      {/* ---- Tools -------------------------------------------------------
          The whole card is the link. Six mint buttons in one grid is six
          competing primary actions and breaks the one-accent-per-view rule —
          a single icon chip that fills on hover reads far quieter and makes
          the entire card a bigger, easier target. */}
      {assets.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <a
              key={asset.id}
              href={asset.href}
              target="_blank"
              rel="noopener noreferrer"
              className="card-interactive group flex flex-col rounded-card border border-line bg-surface p-5 shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-[15px] font-extrabold tracking-[-0.3px] text-navy">
                  {asset.name}
                </h2>
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-lg bg-mint-50 text-mint-deep transition-colors duration-200 group-hover:bg-mint group-hover:text-white"
                >
                  <ArrowUpRight className="size-4" />
                </span>
              </div>

              <p className="mt-2 line-clamp-2 flex-1 text-[13px] leading-relaxed text-ink-muted">
                {asset.description}
              </p>

              <p className="mt-4 truncate border-t border-line-soft pt-3 text-xs text-ink-faint">
                {assetHost(asset.href)}
              </p>
            </a>
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
