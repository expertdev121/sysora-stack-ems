import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * The same signed-in user, pointed at the `sales` schema.
 *
 * supabase-js binds one client to one schema, so reaching a second one means a
 * second client rather than a qualified table name. Anon key and cookies as
 * usual: RLS decides what a bidder can see, exactly as it does everywhere else
 * in this app. `sales.proposals` carries policies for that; the rest of the
 * schema stays deny-all and is reachable only by the sales app's service role.
 */
export async function createSalesClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "sales" },
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
            // Called from a Server Component, which cannot set cookies. The
            // proxy handles rotation, same as the public-schema client.
          }
        },
      },
    },
  );
}
