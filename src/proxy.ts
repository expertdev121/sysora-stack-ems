import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-session";

/**
 * Next.js 16 renamed the `middleware` file convention to `proxy`.
 * (middleware.ts still works but is deprecated as of v16.0.0.)
 *
 * This does two things and nothing else: rotate the Supabase auth cookie, and
 * bounce anonymous traffic to /login.
 *
 * It is NOT the authorisation layer. Per the Next.js docs, Server Functions are
 * POSTs to the route they live on, so a matcher change can silently remove
 * proxy coverage from them. Every server action in src/app/actions therefore
 * re-checks the caller itself, and RLS backstops both.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *  - _next/static, _next/image  (build output)
     *  - favicon / metadata files
     *  - image assets
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
