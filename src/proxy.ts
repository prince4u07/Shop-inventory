import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

// Next 16 convention: `proxy` replaces `middleware`.
// Lightweight gate: just checks the session cookie EXISTS. Real signature
// verification + role checks happen in layouts / route handlers via
// getSession() / requireOwner() (Node runtime, full jose verify).
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (!hasSession && (pathname.startsWith("/admin") || pathname.startsWith("/pos"))) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/pos/:path*"],
};
