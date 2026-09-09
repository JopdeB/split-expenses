import { unsealData } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, type SessionData, getSessionSecret } from "@/lib/session";

async function isAuthenticated(req: NextRequest): Promise<boolean> {
  const raw = req.cookies.get(SESSION_COOKIE)?.value;
  if (!raw) return false;
  try {
    const data = await unsealData<SessionData>(raw, { password: getSessionSecret() });
    return !!data.userId;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths — no auth required.
  if (
    pathname === "/" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/keepalive")
  ) {
    return NextResponse.next();
  }

  const authed = await isAuthenticated(request);
  if (!authed) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // All routes except static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
