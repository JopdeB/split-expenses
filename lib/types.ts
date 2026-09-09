// Types are inferred from the Drizzle schema so there is a single source
// of truth for column names and nullability. Numeric columns come through
// as strings (Postgres NUMERIC preserves precision), which components handle
// via Number() casts and the formatEuro helper.

import type { InferSelectModel } from "drizzle-orm";

import * as schema from "./db/schema";

export type Location = InferSelectModel<typeof schema.locations>;
export type LedgerAccount = InferSelectModel<typeof schema.ledgerAccounts>;
export type BtwCode = InferSelectModel<typeof schema.btwCodes>;
export type Transaction = InferSelectModel<typeof schema.transactions>;
// Views use $inferSelect because they aren't insertable.
export type TransactionWithRefs = typeof schema.vTransactions.$inferSelect;
export type GrootboekRow = typeof schema.vGrootboek.$inferSelect;
export type BtwQuarterRow = typeof schema.vBtwQuarterly.$inferSelect;
export type User = InferSelectModel<typeof schema.users>;
export type AuditRow = InferSelectModel<typeof schema.auditLog>;
