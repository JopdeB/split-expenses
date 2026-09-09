import type { SessionOptions } from "iron-session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = {
  userId?: string;
  email?: string;
};

export const SESSION_COOKIE = "admin_pap_session";

export const sessionOptions: SessionOptions = {
  password: getSessionSecret(),
  cookieName: SESSION_COOKIE,
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    // Secure automatically only in production so `next dev` on http works.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // 30 dagen — deze app zien de gebruikers een paar keer per maand,
    // langer inloggen scheelt gedoe.
    maxAge: 60 * 60 * 24 * 30,
  },
};

function getSessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set in production");
    }
    // Dev fallback so `next build` doesn't blow up before the env is set.
    return "dev-only-fallback-secret-please-set-a-real-one-in-env-local";
  }
  if (s.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  return s;
}

/** Read the session from cookies (server components / server actions / route handlers). */
export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
