import type { SessionOptions } from "iron-session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = {
  userId?: string;
  email?: string;
};

export const SESSION_COOKIE = "admin_pap_session";

// NB: intentionally not resolving SESSION_SECRET at module load. Next's
// build-time page-data collector imports this module in a "production" Node
// process without runtime env vars, and throwing there breaks the build.
// The password is read lazily via getSessionOptions() on the request path.
export function getSessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set in production");
    }
    return "dev-only-fallback-secret-please-set-a-real-one-in-env-local";
  }
  if (s.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  return s;
}

export function getSessionOptions(): SessionOptions {
  return {
    password: getSessionSecret(),
    cookieName: SESSION_COOKIE,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 dagen
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), getSessionOptions());
}
