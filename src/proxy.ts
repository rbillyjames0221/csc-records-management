import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic redirect only (cookie presence). Every page, server action and API route
 * re-validates the session and permissions on the server.
 */
export function proxy(request: NextRequest) {
  const cookie = getSessionCookie(request);
  if (!cookie) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/records/:path*", "/intake/:path*", "/qa/:path*", "/file-plan/:path*", "/retention/:path*", "/users/:path*", "/audit/:path*", "/integrations/:path*", "/help/:path*", "/settings/:path*"],
};
