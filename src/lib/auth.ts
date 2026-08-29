import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Org, Profile } from "@/lib/types";

export interface Session {
  userId: string;
  email: string;
  profile: Profile;
  org: Org;
}

/**
 * The signed-in user, their profile and their org — or null.
 *
 * Read through the anon-key client on purpose, so RLS applies here too. An
 * Employee reading this gets exactly their own profile row because that is all
 * profiles_select_self permits.
 *
 * cache() dedupes it across a single render pass.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  if (!profile) return null;

  const { data: org } = await supabase
    .from("orgs")
    .select("id, name, slug, timezone, salary_day, annual_paid_leave")
    .eq("id", profile.org_id)
    .maybeSingle<Org>();

  if (!org) return null;

  return { userId: user.id, email: user.email ?? profile.email, profile, org };
});

/** Signed in, active, and past the forced password change. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.profile.is_active) redirect("/login?error=deactivated");
  if (session.profile.must_change_password) redirect("/change-password");
  return session;
}

/** Signed in, but allowed through the change-password gate. */
export async function requireUser(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.profile.is_active) redirect("/login?error=deactivated");
  return session;
}

export async function requireStaff(): Promise<Session> {
  const session = await requireSession();
  // Named allow-list, not "everyone except employee". The database says
  // the same thing in auth_is_staff() — 'owner', 'manager' — and the two
  // must agree, or a role added later walks through this gate and then
  // meets an RLS policy that returns nothing, which reads as a broken
  // page rather than a closed door. BDE is what added the fourth role.
  if (!isStaff(session.profile)) redirect("/dashboard");
  return session;
}

export async function requireOwner(): Promise<Session> {
  const session = await requireSession();
  if (session.profile.role !== "owner") redirect("/dashboard");
  return session;
}

export function isStaff(profile: Pick<Profile, "role">) {
  return profile.role === "owner" || profile.role === "manager";
}
