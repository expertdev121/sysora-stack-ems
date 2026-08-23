import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Paths reachable without a session. Everything else requires one. */
const PUBLIC_PATHS = ["/login", "/auth"];

/** Paths that authenticate themselves and must never be redirected. */
const SELF_AUTHENTICATED_PATHS = ["/api/webhooks"];

function isPrefixed(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase auth cookies and gates unauthenticated traffic.
 *
 * Cookies have to be written on BOTH the request (so Server Components in this
 * same render see the refreshed token) and the response (so the browser keeps
 * it). Getting only one of the two is the classic "logged out after an hour"
 * bug with @supabase/ssr.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Do not put any logic between createServerClient and getUser(): getUser()
  // is what actually revalidates and rotates the token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (isPrefixed(pathname, SELF_AUTHENTICATED_PATHS)) {
    return response;
  }

  if (!user && !isPrefixed(pathname, PUBLIC_PATHS)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserve where they were headed so login can send them back.
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
