"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSession, isStaff } from "@/lib/auth";
import { isValidTimeZone } from "@/lib/dates";
import type { AppRole } from "@/lib/types";

export type PeopleState =
  | { ok: true; message: string; tempPassword?: string; personName?: string }
  | { ok: false; error: string }
  | null;

const ROLES: AppRole[] = ["owner", "manager", "employee"];

/** 16 URL-safe characters. Shown to the Owner exactly once, never stored. */
function generateTempPassword(): string {
  return randomBytes(12).toString("base64url");
}

async function ownerOnly() {
  const session = await getSession();
  if (!session || session.profile.role !== "owner") return null;
  return session;
}

/**
 * Create a person: auth user + profile, in that order, with cleanup if the
 * second half fails.
 *
 * Requires the service role because creating an auth.users row is an admin
 * operation — which is exactly why the caller is re-checked here rather than
 * relying on the proxy. (Next.js docs: Server Functions are POSTs to the route
 * they live on, so proxy coverage is not guaranteed.)
 */
export async function createPerson(_prev: PeopleState, formData: FormData): Promise<PeopleState> {
  const session = await ownerOnly();
  if (!session) return { ok: false, error: "Only the Owner can add people." };

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "employee") as AppRole;
  const timezone = String(formData.get("timezone") ?? "Asia/Kolkata");
  const joinedOn = String(formData.get("joined_on") ?? "");

  if (!fullName) return { ok: false, error: "Enter their full name." };
  if (!email.includes("@")) return { ok: false, error: "Enter a valid email." };
  if (!ROLES.includes(role)) return { ok: false, error: "Unknown role." };
  if (!isValidTimeZone(timezone)) return { ok: false, error: "Unknown timezone." };

  const admin = createAdminClient();
  const tempPassword = generateTempPassword();

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authError || !created.user) {
    const message = authError?.message ?? "Could not create the account.";
    return {
      ok: false,
      error: message.toLowerCase().includes("already")
        ? "Someone already has an account with that email."
        : message,
    };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    org_id: session.org.id,
    full_name: fullName,
    email,
    role,
    timezone,
    joined_on: joinedOn || new Date().toISOString().slice(0, 10),
    must_change_password: true,
  });

  if (profileError) {
    // Don't leave an orphaned auth user behind.
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: profileError.message };
  }

  revalidatePath("/team");
  revalidatePath("/dashboard");

  return {
    ok: true,
    message: `${fullName} can sign in now.`,
    tempPassword,
    personName: fullName,
  };
}

export async function resetPassword(_prev: PeopleState, formData: FormData): Promise<PeopleState> {
  const session = await ownerOnly();
  if (!session) return { ok: false, error: "Only the Owner can reset a password." };

  const profileId = String(formData.get("profile_id") ?? "");
  if (!profileId) return { ok: false, error: "Missing person." };

  const admin = createAdminClient();

  const { data: person } = await admin
    .from("profiles")
    .select("full_name, org_id")
    .eq("id", profileId)
    .maybeSingle<{ full_name: string; org_id: string }>();

  if (!person || person.org_id !== session.org.id) {
    return { ok: false, error: "That person isn't in your organisation." };
  }

  const tempPassword = generateTempPassword();

  const { error } = await admin.auth.admin.updateUserById(profileId, { password: tempPassword });
  if (error) return { ok: false, error: error.message };

  await admin.from("profiles").update({ must_change_password: true }).eq("id", profileId);

  revalidatePath("/team");
  return {
    ok: true,
    message: `Temporary password set for ${person.full_name}.`,
    tempPassword,
    personName: person.full_name,
  };
}

export async function setPersonActive(formData: FormData): Promise<PeopleState> {
  const session = await ownerOnly();
  if (!session) return { ok: false, error: "Only the Owner can deactivate people." };

  const profileId = String(formData.get("profile_id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!profileId) return { ok: false, error: "Missing person." };
  if (profileId === session.userId) {
    return { ok: false, error: "You can't deactivate yourself." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: active })
    .eq("id", profileId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/team");
  revalidatePath("/dashboard");
  return { ok: true, message: active ? "Reactivated." : "Deactivated." };
}

export async function setPersonRole(formData: FormData): Promise<PeopleState> {
  const session = await ownerOnly();
  if (!session) return { ok: false, error: "Only the Owner can change roles." };

  const profileId = String(formData.get("profile_id") ?? "");
  const role = String(formData.get("role") ?? "") as AppRole;
  if (!profileId || !ROLES.includes(role)) return { ok: false, error: "Missing person or role." };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", profileId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/team");
  return { ok: true, message: "Role updated." };
}

/**
 * Salary. Written through the ANON-key client on purpose: if this ever runs for
 * a non-Owner, compensation_owner_all denies it at the database. The check
 * above and RLS have to both agree.
 */
export async function setCompensation(formData: FormData): Promise<PeopleState> {
  const session = await ownerOnly();
  if (!session) return { ok: false, error: "Only the Owner can set pay." };

  const profileId = String(formData.get("profile_id") ?? "");
  const raw = String(formData.get("monthly_amount") ?? "").trim();
  if (!profileId) return { ok: false, error: "Missing person." };

  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: "Enter a number." };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("compensation")
    .select("id")
    .eq("profile_id", profileId)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  const { error } = existing
    ? await supabase
        .from("compensation")
        .update({ monthly_amount: amount })
        .eq("id", existing.id)
    : await supabase.from("compensation").insert({
        org_id: session.org.id,
        profile_id: profileId,
        monthly_amount: amount,
        currency: "INR",
      });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/team");
  return { ok: true, message: "Pay updated." };
}

/** Anyone may change their OWN timezone. tg_profiles_guard() stops them from
 *  smuggling a role change into the same statement. */
export async function updateMyTimezone(formData: FormData): Promise<PeopleState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Your session expired." };

  const timezone = String(formData.get("timezone") ?? "");
  if (!isValidTimeZone(timezone)) return { ok: false, error: "Unknown timezone." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ timezone })
    .eq("id", session.userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, message: `Timezone set to ${timezone}.` };
}

export async function assertStaffOrThrow() {
  const session = await getSession();
  if (!session || !isStaff(session.profile)) throw new Error("Forbidden");
  return session;
}
