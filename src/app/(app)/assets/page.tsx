import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { CredentialBrowser } from "@/components/credential-browser";
import { CredentialForm } from "@/components/credential-form";
import { CatalogueManager, type CatalogueEntry } from "@/components/catalogue-manager";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { encryptionConfigured } from "@/lib/crypto";
import { assetHost, assetsForRole, toolOptions } from "@/lib/team-assets";
import { clientOptions as clientOptions_ } from "@/lib/clients";
import type { CredentialGrant, CredentialSummary, GrantMode, Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Team assets" };

export default async function TeamAssetsPage() {
  const { profile } = await requireSession();
  const supabase = await createClient();
  const assets = assetsForRole(profile.role);
  const isOwner = profile.role === "owner";

  // secret_ciphertext is deliberately NOT selected. Nothing encrypted ever
  // reaches this page's HTML — decryption happens only in the reveal action.
  const [
    { data: credentialRows },
    { data: peopleRows },
    { data: grantRows },
    { data: toolRows },
    { data: clientRows },
  ] = await Promise.all([
    supabase
      .from("credentials")
      // extra_ciphertext is deliberately NOT selected — only its label, so the
      // UI can say a second secret exists without shipping it to the browser.
      .select(
        "id, ref, asset_id, client_key, label, username, url, notes, visible_to_roles, rotated_at, extra_label",
      )
      .order("ref"),
    // Employees can only read their own profile, so this list is populated for
    // staff and empty for everyone else — which is fine, since only the Owner
    // sees the sharing controls that use it.
    supabase
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("is_active", true)
      .order("full_name"),
    supabase.from("credential_grants").select("credential_id, profile_id, mode"),
    supabase.from("credential_tools").select("slug, name").order("name"),
    supabase.from("credential_clients").select("slug, name, hint").order("name"),
  ]);

  const credentials = (credentialRows ?? []) as CredentialSummary[];

  const people = ((peopleRows ?? []) as Pick<Profile, "id" | "full_name" | "role">[])
    .filter((p) => p.id !== profile.id)
    .map((p) => ({ id: p.id, name: p.full_name, role: p.role }));

  const grantsByCredential: Record<string, Record<string, GrantMode>> = {};
  for (const grant of (grantRows ?? []) as CredentialGrant[]) {
    (grantsByCredential[grant.credential_id] ??= {})[grant.profile_id] = grant.mode;
  }

  // The catalogues are the source of truth for names now. A credential naming
  // a slug with no row still has to display, so anything in use but missing
  // falls back to the old title-cased label rather than vanishing.
  const toolRecords = (toolRows ?? []) as { slug: string; name: string }[];
  const clientRecords = (clientRows ?? []) as { slug: string; name: string; hint: string | null }[];

  const toolUsage = new Map<string, number>();
  for (const c of credentials) toolUsage.set(c.asset_id, (toolUsage.get(c.asset_id) ?? 0) + 1);

  const clientUsage = new Map<string, number>();
  for (const c of credentials) {
    if (c.client_key) clientUsage.set(c.client_key, (clientUsage.get(c.client_key) ?? 0) + 1);
  }

  const knownTools = new Set(toolRecords.map((t) => t.slug));
  const knownClients = new Set(clientRecords.map((c) => c.slug));

  const assetOptions = [
    ...toolRecords.map((t) => ({ id: t.slug, name: t.name })),
    ...toolOptions([...toolUsage.keys()].filter((slug) => !knownTools.has(slug))),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const clientOptions = [
    ...clientRecords.map((c) => ({ id: c.slug, name: c.name })),
    ...clientOptions_([...clientUsage.keys()].filter((slug) => !knownClients.has(slug))),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const toolCatalogue: CatalogueEntry[] = toolRecords.map((t) => ({
    slug: t.slug,
    name: t.name,
    usage: toolUsage.get(t.slug) ?? 0,
  }));

  const clientCatalogue: CatalogueEntry[] = clientRecords.map((c) => ({
    slug: c.slug,
    name: c.name,
    hint: c.hint,
    usage: clientUsage.get(c.slug) ?? 0,
  }));

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

      {/* ---- Credentials: one table, filtered and searched ---------------- */}
      <section className="mt-10">
        {/* Heading and the one action it takes, on a line. The explanation that
            used to sit here described controls that are directly below and
            visibly self-describing. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-navy">Logins</h2>
          {isOwner ? (
            <div className="flex items-center gap-2">
              <CatalogueManager tools={toolCatalogue} clients={clientCatalogue} />
              <CredentialForm assets={assetOptions} clients={clientOptions} people={people} />
            </div>
          ) : null}
        </div>

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
        <p className="mt-8 text-xs text-ink-muted">
          Secrets are encrypted with AES-256-GCM before they reach the database, using a key held
          in the environment rather than in Postgres. A shared login cannot be revoked for one
          person — when someone leaves, rotate whatever the reveal log says they saw.
        </p>
      ) : null}
    </>
  );
}
