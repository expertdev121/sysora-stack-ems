"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

/**
 * The tool and client catalogues.
 *
 * Both are keyed by slug, and credentials point at that slug rather than at a
 * row id. That is what makes renaming free: "GHL" becoming "GoHighLevel" is one
 * UPDATE and no credential moves. It is also why merging is a real operation
 * rather than a delete — the slug is load-bearing, so the credentials naming
 * the losing slug have to be repointed before it can go.
 */

type Kind = "tool" | "client";

const TABLE: Record<Kind, string> = {
  tool: "credential_tools",
  client: "credential_clients",
};

/** Which column on credentials points at this catalogue. */
const COLUMN: Record<Kind, string> = {
  tool: "asset_id",
  client: "client_key",
};

async function ownerOnly() {
  const session = await getSession();
  if (!session) return null;
  if (session.profile.role !== "owner") return null;
  return session;
}

function parseKind(raw: FormDataEntryValue | null): Kind | null {
  return raw === "tool" || raw === "client" ? raw : null;
}

/**
 * Create or rename. An existing slug renames in place; a new one is created
 * with a slug derived from the name.
 */
export async function saveCatalogueEntry(formData: FormData): Promise<ActionResult> {
  const session = await ownerOnly();
  if (!session) return { ok: false, error: "Only the Owner can change these." };

  const kind = parseKind(formData.get("kind"));
  if (!kind) return { ok: false, error: "Unknown catalogue." };

  const name = String(formData.get("name") ?? "").trim();
  const hint = String(formData.get("hint") ?? "").trim() || null;
  const existingSlug = String(formData.get("slug") ?? "").trim();

  if (!name) return { ok: false, error: "Give it a name." };

  const supabase = await createClient();

  if (existingSlug) {
    const patch: Record<string, unknown> = { name, updated_at: new Date().toISOString() };
    if (kind === "client") patch.hint = hint;

    const { error } = await supabase.from(TABLE[kind]).update(patch).eq("slug", existingSlug);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/assets");
    return { ok: true, message: "Renamed." };
  }

  const slug = slugify(name);
  if (!slug) return { ok: false, error: "That name has no letters or numbers in it." };

  const row: Record<string, unknown> = { slug, name, org_id: session.org.id };
  if (kind === "client") row.hint = hint;

  const { error } = await supabase.from(TABLE[kind]).insert(row);
  if (error) {
    if (error.message.includes("duplicate key")) {
      return { ok: false, error: `There is already an entry with the reference “${slug}”.` };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/assets");
  return { ok: true, message: kind === "tool" ? "Tool added." : "Client added." };
}

/**
 * Delete, but only once nothing points at it.
 *
 * Refusing rather than cascading: a credential whose tool vanished still has to
 * belong to something, and silently blanking it would lose the one field that
 * says what the login is even for. The count in the message is what turns this
 * from a dead end into an instruction.
 */
export async function deleteCatalogueEntry(formData: FormData): Promise<ActionResult> {
  const session = await ownerOnly();
  if (!session) return { ok: false, error: "Only the Owner can change these." };

  const kind = parseKind(formData.get("kind"));
  if (!kind) return { ok: false, error: "Unknown catalogue." };

  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return { ok: false, error: "Missing entry." };

  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("credentials")
    .select("id", { count: "exact", head: true })
    .eq(COLUMN[kind], slug);

  if (countError) return { ok: false, error: countError.message };

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `${count} ${count === 1 ? "login uses" : "logins use"} this. Merge it into another entry first, or move them.`,
    };
  }

  const { error } = await supabase.from(TABLE[kind]).delete().eq("slug", slug);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/assets");
  return { ok: true, message: "Removed." };
}

/**
 * Fold one entry into another: repoint every credential, then delete the loser.
 *
 * This is the answer to three slugs all displaying "GoHighLevel". Not done in a
 * transaction because PostgREST has no way to open one — so the repoint runs
 * first and the delete second. The failure mode of that order is an empty entry
 * left behind, which is visible and removable. The other order would orphan
 * live credentials.
 */
export async function mergeCatalogueEntry(formData: FormData): Promise<ActionResult> {
  const session = await ownerOnly();
  if (!session) return { ok: false, error: "Only the Owner can change these." };

  const kind = parseKind(formData.get("kind"));
  if (!kind) return { ok: false, error: "Unknown catalogue." };

  const from = String(formData.get("from") ?? "").trim();
  const into = String(formData.get("into") ?? "").trim();

  if (!from || !into) return { ok: false, error: "Pick what to merge into." };
  if (from === into) return { ok: false, error: "That is the same entry." };

  const supabase = await createClient();

  const { data: target } = await supabase
    .from(TABLE[kind])
    .select("slug")
    .eq("slug", into)
    .maybeSingle<{ slug: string }>();

  if (!target) return { ok: false, error: "The entry you're merging into no longer exists." };

  const { count, error: moveError } = await supabase
    .from("credentials")
    .update({ [COLUMN[kind]]: into }, { count: "exact" })
    .eq(COLUMN[kind], from);

  if (moveError) return { ok: false, error: moveError.message };

  const { error } = await supabase.from(TABLE[kind]).delete().eq("slug", from);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/assets");
  return {
    ok: true,
    message: `Merged. ${count ?? 0} ${count === 1 ? "login" : "logins"} moved.`,
  };
}
