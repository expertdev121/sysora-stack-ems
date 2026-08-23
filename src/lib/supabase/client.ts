import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Carries the anon key only, so every query it
 * makes is filtered by the RLS policies in supabase/migrations/0003_rls.sql.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
