import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Server-side Supabase client bound to the signed-in user's cookies.
 *
 * This uses the ANON key, which means RLS still applies. That is deliberate:
 * server code gets the same row-level guarantees the browser does, so a bug in
 * a page cannot leak another person's attendance. Use createAdminClient() only
 * where genuine admin rights are required, and only after checking the caller.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, which cannot set cookies.
            // The proxy/middleware refresh handles cookie rotation instead.
          }
        },
      },
    },
  );
}
