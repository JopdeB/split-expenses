import { isNotNull, max } from "drizzle-orm";

import { db, tables } from "@/lib/db";

/**
 * Map of locationId -> year -> next available boekstuk number.
 * Years not present in the map mean "no boekingen yet" → form should suggest 1.
 */
export type NextBoekstukMap = Record<number, Record<number, number>>;

/**
 * Aggregate MAX(boekstuk) per location_id+jaar from v_transactions and return
 * a lookup map of the next number (max + 1). The form uses this to show a
 * live suggestion as the user picks location/datum.
 */
export async function fetchNextBoekstukMap(): Promise<NextBoekstukMap> {
  const rows = await db
    .select({
      locationId: tables.vTransactions.locationId,
      jaar: tables.vTransactions.jaar,
      maxBoekstuk: max(tables.vTransactions.boekstuk),
    })
    .from(tables.vTransactions)
    .where(isNotNull(tables.vTransactions.boekstuk))
    .groupBy(tables.vTransactions.locationId, tables.vTransactions.jaar);

  const map: NextBoekstukMap = {};
  for (const row of rows) {
    if (row.maxBoekstuk == null) continue;
    const perLoc = (map[row.locationId] ??= {});
    perLoc[row.jaar] = row.maxBoekstuk + 1;
  }
  return map;
}
