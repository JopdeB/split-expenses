import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  pgView,
  serial,
  smallint,
  smallserial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// =========================================================================
// Tables — matches the DB restored from Supabase on 2026-09-09.
// Column names + types are chosen to match the live schema exactly so the
// Drizzle model is authoritative going forward and drizzle-kit can generate
// migrations from here without drift.
// =========================================================================

export const locations = pgTable("locations", {
  id: smallserial("id").primaryKey(),
  name: text("name").notNull().unique(),
  sortOrder: smallint("sort_order").notNull().default(0),
});

export const ledgerAccounts = pgTable("ledger_accounts", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: smallint("sort_order").notNull().default(0),
});

export const btwCodes = pgTable(
  "btw_codes",
  {
    id: serial("id").primaryKey(),
    label: text("label").notNull().unique(),
    rate: numeric("rate", { precision: 5, scale: 4 }),
    kind: text("kind"),
    sortOrder: smallint("sort_order").notNull().default(0),
  },
  (t) => [check("btw_codes_kind_check", sql`${t.kind} in ('inkoop','verkoop','beide')`)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    locationId: smallint("location_id")
      .notNull()
      .references(() => locations.id),
    boekstuk: integer("boekstuk"),
    datum: text("datum").notNull(), // stored as DATE; string for Intl formatting downstream
    bedragInkomsten: numeric("bedrag_inkomsten", { precision: 12, scale: 2 }).notNull().default("0"),
    btwInkomsten: numeric("btw_inkomsten", { precision: 12, scale: 2 }).notNull().default("0"),
    bedragUitgaven: numeric("bedrag_uitgaven", { precision: 12, scale: 2 }).notNull().default("0"),
    btwUitgaven: numeric("btw_uitgaven", { precision: 12, scale: 2 }).notNull().default("0"),
    bedragDeeluitgaven: numeric("bedrag_deeluitgaven", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    btwDeeluitgaven: numeric("btw_deeluitgaven", { precision: 12, scale: 2 }).notNull().default("0"),
    btwCodeId: integer("btw_code_id").references(() => btwCodes.id),
    ledgerAccountId: integer("ledger_account_id").references(() => ledgerAccounts.id),
    omschrijving: text("omschrijving"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Legacy: used to reference auth.users(id) on Supabase; kept as loose UUID
    // for backwards data compatibility, no FK in the new DB.
    createdBy: uuid("created_by"),
  },
  (t) => [
    index("transactions_datum_idx").on(t.datum),
    index("transactions_location_idx").on(t.locationId),
    index("transactions_ledger_idx").on(t.ledgerAccountId),
    check(
      "amounts_non_negative",
      sql`${t.bedragInkomsten} >= 0 and ${t.btwInkomsten} >= 0
          and ${t.bedragUitgaven} >= 0 and ${t.btwUitgaven} >= 0
          and ${t.bedragDeeluitgaven} >= 0 and ${t.btwDeeluitgaven} >= 0`,
    ),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    userId: uuid("user_id"),
    userEmail: text("user_email"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
  },
  (t) => [
    index("audit_log_ts_idx").on(t.ts),
    check("audit_log_action_check", sql`${t.action} in ('insert','update','delete')`),
  ],
);

// Users — replaces Supabase auth.users. Passwords are bcrypt-hashed
// ($2a$10$…) and migrated intact so nobody has to reset.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull().unique(),
    encryptedPassword: text("encrypted_password").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_idx").on(sql`lower(${t.email})`)],
);

// =========================================================================
// Views — read-only projections. Column list matches CREATE VIEW in the DB.
// =========================================================================

export const vTransactions = pgView("v_transactions", {
  id: bigserial("id", { mode: "number" }).notNull(),
  locationId: smallint("location_id").notNull(),
  boekstuk: integer("boekstuk"),
  datum: text("datum").notNull(),
  bedragInkomsten: numeric("bedrag_inkomsten", { precision: 12, scale: 2 }).notNull(),
  btwInkomsten: numeric("btw_inkomsten", { precision: 12, scale: 2 }).notNull(),
  bedragUitgaven: numeric("bedrag_uitgaven", { precision: 12, scale: 2 }).notNull(),
  btwUitgaven: numeric("btw_uitgaven", { precision: 12, scale: 2 }).notNull(),
  bedragDeeluitgaven: numeric("bedrag_deeluitgaven", { precision: 12, scale: 2 }).notNull(),
  btwDeeluitgaven: numeric("btw_deeluitgaven", { precision: 12, scale: 2 }).notNull(),
  btwCodeId: integer("btw_code_id"),
  ledgerAccountId: integer("ledger_account_id"),
  omschrijving: text("omschrijving"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  createdBy: uuid("created_by"),
  jaar: integer("jaar").notNull(),
  kwartaal: text("kwartaal").notNull(),
  locationName: text("location_name"),
  ledgerCode: text("ledger_code"),
  ledgerName: text("ledger_name"),
  btwLabel: text("btw_label"),
  btwRate: numeric("btw_rate", { precision: 5, scale: 4 }),
}).existing();

export const vBtwQuarterly = pgView("v_btw_quarterly", {
  locationId: smallint("location_id").notNull(),
  locationName: text("location_name"),
  jaar: integer("jaar").notNull(),
  kwartaal: text("kwartaal").notNull(),
  btwInkomsten: numeric("btw_inkomsten", { precision: 14, scale: 2 }),
  btwUitgaven: numeric("btw_uitgaven", { precision: 14, scale: 2 }),
  btwNetto: numeric("btw_netto", { precision: 14, scale: 2 }),
}).existing();

export const vGrootboek = pgView("v_grootboek", {
  jaar: integer("jaar").notNull(),
  locationId: smallint("location_id").notNull(),
  locationName: text("location_name"),
  ledgerAccountId: integer("ledger_account_id").notNull(),
  ledgerCode: text("ledger_code"),
  ledgerName: text("ledger_name"),
  inkomsten: numeric("inkomsten", { precision: 14, scale: 2 }),
  uitgaven: numeric("uitgaven", { precision: 14, scale: 2 }),
  deeluitgaven: numeric("deeluitgaven", { precision: 14, scale: 2 }),
  netto: numeric("netto", { precision: 14, scale: 2 }),
}).existing();
