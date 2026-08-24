import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. BYPASSES EVERY RLS POLICY.
 *
 * Only three things are allowed to use it:
 *   1. Owner-only server actions that create or deactivate people (creating an
 *      auth.users row requires admin rights).
 *   2. The n8n EOD webhook, which has no signed-in user to act as.
 *   3. The seed script.
 *
 * Everything else uses the anon-key client so RLS stays in the loop.
 */
/**
 * Whether admin operations are possible at all.
 *
 * Call this before createAdminClient() so the UI can explain itself. Without
 * it, a missing key surfaces as an unhandled throw and the user just sees a
 * form that silently does nothing.
 */
export function serviceRoleConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient() must never be called in the browser");
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Supabase → Project Settings → API → service_role.",
    );
  }

  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
