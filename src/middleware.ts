import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap edge gate: bounce anonymous traffic off app routes before it costs a
 * server render. Real authorisation still happens in `requireSession()` and
 * the visibility layer — this only saves a round trip.
 */
const PUBLIC = [/^\/login/, /^\/setup/, /^\/invite/, /^\/api\/auth/, /^\/api\/cron/, /^\/manifest\.webmanifest/];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  const hasSession =
    request.cookies.has("authjs.session-token") || request.cookies.has("__Secure-authjs.session-token");

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.png$).*)"],
};
