"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error: string } | null;

const MIN_PASSWORD_LENGTH = 10;

function safeNextPath(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw : "";
  // Only ever redirect within this app — never to an absolute URL from a form.
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  // Deliberately one generic message for both wrong-email and wrong-password,
  // so this form can't be used to enumerate who works here.
  if (error || !data.user) {
    return { error: "That email and password combination isn't right." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active, must_change_password")
    .eq("id", data.user.id)
    .maybeSingle<{ is_active: boolean; must_change_password: boolean }>();

  if (!profile) {
    await supabase.auth.signOut();
    return { error: "This account isn't set up yet. Ask the Owner to finish adding you." };
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    return { error: "This account has been deactivated." };
  }

  redirect(profile.must_change_password ? "/change-password" : next);
}

export async function changePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirm) {
    return { error: "The two passwords don't match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message };
  }

  // Clears the gate. Goes through the anon-key client, so RLS still applies:
  // profiles_update_self only lets a person touch their own row, and
  // tg_profiles_guard() blocks any attempt to change role or org in the same
  // statement.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);

  if (profileError) {
    return { error: "Password updated, but we couldn't clear the reset flag. Try again." };
  }

  redirect("/dashboard");
}
