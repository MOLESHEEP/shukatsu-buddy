import { NextResponse, type NextRequest } from "next/server";

// Cheap gate for app pages: no session cookie -> login. Pages and APIs still verify the token itself.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("sb_session")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/es/:path*", "/tracker/:path*", "/inbox/:path*", "/tests/:path*", "/settings/:path*", "/community/:path*", "/admin/:path*", "/feedback/:path*"],
};
