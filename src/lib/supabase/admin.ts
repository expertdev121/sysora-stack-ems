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
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient() must never be called in the browser");
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
