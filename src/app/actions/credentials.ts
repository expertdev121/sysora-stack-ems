"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { decryptSecret, encryptSecret, encryptionConfigured } from "@/lib/crypto";
import { slugify } from "@/lib/utils";
import type { ActionResult, AppRole, GrantMode } from "@/lib/types";

const ROLES: AppRole[] = ["owner", "manager", "employee"];

export type RevealResult =
  | {
      ok: true;
      username: string | null;
      secret: string;
      /** Second secret — security answer, backup code, app password. */
      extra: { label: string; value: string } | null;
    }
  | { ok: false; error: string };

/**
 * Decrypt one credential for the caller, and record that it happened.
 *
 * The plaintext exists only in this function's return value — it is never
 * stored, never logged, and never part of any page's HTML. RLS decides whether
 * the caller can see the row at all; the visibility list is re-checked here
 * because a SELECT policy governs reading a row, not the right to decrypt it.
 */
export async function revealCredential(formData: FormData): Promise<RevealResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Your session expired. Sign in again." };

  if (!encryptionConfigured()) {
    return { ok: false, error: "CREDENTIALS_ENCRYPTION_KEY is not set on this deployment." };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing credential." };

  const supabase = await createClient();

  const { data: credential, error } = await supabase
    .from("credentials")
    .select("id, org_id, username, secret_ciphertext, extra_ciphertext, extra_label")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      org_id: string;
      username: string | null;
      secret_ciphertext: string;
      extra_ciphertext: string | null;
      extra_label: string | null;
    }>();

  // RLS is the authority here, not a check in this function. The select above
  // runs on the caller's own anon-key client, and credentials_select_visible
  // already applies the full rule: Owner always, then an explicit per-person
  // deny, then an explicit per-person allow, then the role list. Re-checking
  // visible_to_roles here would wrongly refuse someone who has been granted
  // this credential personally despite their role.
  if (error || !credential) {
    return { ok: false, error: "That credential isn't available to you." };
  }

  let secret: string;
  let extra: { label: string; value: string } | null = null;
  try {
    secret = decryptSecret(credential.secret_ciphertext);
    if (credential.extra_ciphertext) {
      extra = {
        label: credential.extra_label ?? "Also stored",
        value: decryptSecret(credential.extra_ciphertext),
      };
    }
  } catch {
    return {
      ok: false,
      error:
        "Could not decrypt. The encryption key has probably changed since this was saved — re-enter the credential.",
    };
  }

  // Best effort: a failure to write the audit row must not deny access, but it
  // must not pass silently either.
  const { error: auditError } = await supabase.from("credential_reveals").insert({
    org_id: credential.org_id,
    credential_id: credential.id,
    profile_id: session.userId,
  });
  if (auditError) {
    console.error("credential reveal audit failed", auditError.message);
  }

  return { ok: true, username: credential.username, secret, extra };
}

/** Create or rotate. Owner only — enforced here and again by RLS. */
export async function saveCredential(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.profile.role !== "owner") {
    return { ok: false, error: "Only the Owner can store credentials." };
  }
  if (!encryptionConfigured()) {
    return { ok: false, error: "CREDENTIALS_ENCRYPTION_KEY is not set. Add it and restart." };
  }

  const id = String(formData.get("id") ?? "").trim();

  // Client and tool are free text. Slugify so "Green Geeks", "green geeks" and
  // "Green  Geeks" all land in one group rather than three, and so a tool
  // nobody predicted needs no code change to store.
  const assetId = slugify(String(formData.get("asset_id") ?? ""));
  const clientKey = slugify(String(formData.get("client_key") ?? "")) || null;
  const label = String(formData.get("label") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim() || null;
  const secret = String(formData.get("secret") ?? "");
  const url = String(formData.get("url") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const extraLabel = String(formData.get("extra_label") ?? "").trim() || null;
  const extraSecret = String(formData.get("extra_secret") ?? "");

  const visibleTo = formData
    .getAll("visible_to_roles")
    .map(String)
    .filter((role): role is AppRole => ROLES.includes(role as AppRole));

  if (!assetId) {
    return { ok: false, error: "Name the tool this login is for — anything you like." };
  }
  if (!label) return { ok: false, error: "Give it a label, e.g. “Admin login”." };

  const supabase = await createClient();

  // An empty secret on an edit means "leave the password alone".
  if (id) {
    const update: Record<string, unknown> = {
      asset_id: assetId,
      client_key: clientKey,
      label,
      username,
      url,
      notes,
      extra_label: extraLabel,
      visible_to_roles: visibleTo.length > 0 ? visibleTo : ["owner"],
    };
    if (secret) update.secret_ciphertext = encryptSecret(secret);
    // Blank keeps the stored value; clearing the label clears the secret too,
    // so a second secret cannot be left orphaned with no name.
    if (extraSecret) update.extra_ciphertext = encryptSecret(extraSecret);
    else if (!extraLabel) update.extra_ciphertext = null;

    const { error } = await supabase.from("credentials").update(update).eq("id", id);
    if (error) return { ok: false, error: humanise(error.message) };

    const grantError = await syncGrants(supabase, session.org.id, id, formData);
    if (grantError) return { ok: false, error: grantError };

    revalidatePath("/assets");
    return { ok: true, message: "Updated." };
  }

  if (!secret) return { ok: false, error: "Enter the password or token to store." };

  const { data: created, error } = await supabase
    .from("credentials")
    .insert({
      org_id: session.org.id,
      asset_id: assetId,
      client_key: clientKey,
      label,
      username,
      secret_ciphertext: encryptSecret(secret),
      url,
      notes,
      extra_label: extraLabel,
      extra_ciphertext: extraSecret ? encryptSecret(extraSecret) : null,
      visible_to_roles: visibleTo.length > 0 ? visibleTo : ["owner"],
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) return { ok: false, error: humanise(error.message) };

  if (created) {
    const grantError = await syncGrants(supabase, session.org.id, created.id, formData);
    if (grantError) return { ok: false, error: grantError };
  }

  revalidatePath("/assets");
  return { ok: true, message: "Stored." };
}

/**
 * Replace the per-person exceptions for one credential.
 *
 * The form submits one `grant:<profileId>` field per active person, valued
 * "" (follow the role list), "allow" or "deny". Rewriting the whole set rather
 * than diffing means a person removed from the form cannot leave a stale grant
 * behind — which, for a 'deny', would be a silent lockout nobody can explain.
 */
async function syncGrants(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  credentialId: string,
  formData: FormData,
): Promise<string | null> {
  const rows: { org_id: string; credential_id: string; profile_id: string; mode: GrantMode }[] = [];
  let sawAnyGrantField = false;

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("grant:")) continue;
    sawAnyGrantField = true;

    const profileId = key.slice("grant:".length);
    const mode = String(value);
    if (mode !== "allow" && mode !== "deny") continue;

    rows.push({ org_id: orgId, credential_id: credentialId, profile_id: profileId, mode });
  }

  // A form that carried no grant fields at all (e.g. an older client) must not
  // be read as "clear every exception".
  if (!sawAnyGrantField) return null;

  const { error: clearError } = await supabase
    .from("credential_grants")
    .delete()
    .eq("credential_id", credentialId);
  if (clearError) return clearError.message;

  if (rows.length === 0) return null;

  const { error: insertError } = await supabase.from("credential_grants").insert(rows);
  return insertError ? insertError.message : null;
}

export async function deleteCredential(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.profile.role !== "owner") {
    return { ok: false, error: "Only the Owner can delete credentials." };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing credential." };

  const supabase = await createClient();
  const { error } = await supabase.from("credentials").delete().eq("id", id);
  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath("/assets");
  return { ok: true, message: "Deleted." };
}

function humanise(message: string): string {
  if (message.includes("credentials_org_id_asset_id_label_key")) {
    return "There's already a credential with that label for this tool.";
  }
  if (message.includes("row-level security")) {
    return "Only the Owner can change stored credentials.";
  }
  return message;
}
