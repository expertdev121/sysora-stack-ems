"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { decryptSecret, encryptSecret, encryptionConfigured } from "@/lib/crypto";
import type { ActionResult, AppRole } from "@/lib/types";

const ROLES: AppRole[] = ["owner", "manager", "employee"];

export type RevealResult =
  | { ok: true; username: string | null; secret: string }
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
    .select("id, org_id, username, secret_ciphertext, visible_to_roles")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      org_id: string;
      username: string | null;
      secret_ciphertext: string;
      visible_to_roles: AppRole[];
    }>();

  if (error || !credential) {
    return { ok: false, error: "That credential isn't available to you." };
  }

  if (!credential.visible_to_roles.includes(session.profile.role)) {
    return { ok: false, error: "That credential isn't shared with your role." };
  }

  let secret: string;
  try {
    secret = decryptSecret(credential.secret_ciphertext);
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

  return { ok: true, username: credential.username, secret };
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
  const assetId = String(formData.get("asset_id") ?? "").trim();
  const clientKey = String(formData.get("client_key") ?? "").trim() || null;
  const label = String(formData.get("label") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim() || null;
  const secret = String(formData.get("secret") ?? "");
  const url = String(formData.get("url") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const visibleTo = formData
    .getAll("visible_to_roles")
    .map(String)
    .filter((role): role is AppRole => ROLES.includes(role as AppRole));

  if (!assetId) return { ok: false, error: "Pick which tool this is for." };
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
      visible_to_roles: visibleTo.length > 0 ? visibleTo : ["owner"],
    };
    if (secret) update.secret_ciphertext = encryptSecret(secret);

    const { error } = await supabase.from("credentials").update(update).eq("id", id);
    if (error) return { ok: false, error: humanise(error.message) };

    revalidatePath("/assets");
    return { ok: true, message: "Updated." };
  }

  if (!secret) return { ok: false, error: "Enter the password or token to store." };

  const { error } = await supabase.from("credentials").insert({
    org_id: session.org.id,
    asset_id: assetId,
    client_key: clientKey,
    label,
    username,
    secret_ciphertext: encryptSecret(secret),
    url,
    notes,
    visible_to_roles: visibleTo.length > 0 ? visibleTo : ["owner"],
  });

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath("/assets");
  return { ok: true, message: "Stored." };
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
