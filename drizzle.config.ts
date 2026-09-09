import type { Config } from "drizzle-kit";

// drizzle-kit picks up DATABASE_URL from the shell / .env.local for
// `pnpm drizzle-kit push` and `generate`. Migrations are stored under
// supabase/drizzle-migrations/ so the existing supabase/*.sql files stay
// separate history.
export default {
  schema: "./lib/db/schema.ts",
  out: "./supabase/drizzle-migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://invalid",
  },
  strict: true,
} satisfies Config;
