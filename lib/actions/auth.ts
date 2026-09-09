"use server";

import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db, tables } from "@/lib/db";
import { getSession } from "@/lib/session";

export type LoginResult = { error: string } | { ok: true };

// Generic error text on purpose — don't reveal whether the email exists.
const INVALID_CREDS = "Onjuiste inloggegevens";

export async function login(_prev: LoginResult | null, formData: FormData): Promise<LoginResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "E-mailadres en wachtwoord zijn verplicht" };

  const rows = await db
    .select({
      id: tables.users.id,
      email: tables.users.email,
      hash: tables.users.encryptedPassword,
    })
    .from(tables.users)
    .where(eq(sql`lower(${tables.users.email})`, email))
    .limit(1);

  const user = rows[0];
  if (!user) return { error: INVALID_CREDS };

  const ok = await bcrypt.compare(password, user.hash);
  if (!ok) return { error: INVALID_CREDS };

  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  await session.save();

  // Fire-and-forget last-sign-in bump; missing it isn't a hard error.
  db
    .update(tables.users)
    .set({ lastSignInAt: new Date() })
    .where(eq(tables.users.id, user.id))
    .catch((e) => console.error("last_sign_in_at update failed:", e));

  redirect("/protected");
}

export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect("/auth/login");
}
