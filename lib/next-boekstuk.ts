import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Map of locationId -> year -> next available boekstuk number.
 * Years not present in the map mean "no boekingen yet" → form should suggest 1.
 */
export type NextBoekstukMap = Record<number, Record<number, number>>;

/**
 * Aggregate MAX(boekstuk) per location_id+jaar from v_transactions and return
 * a lookup map of the next number (max + 1). The form uses this to show a
 * live suggestion as the user picks location/datum.
 *
 * Volume here is small (single-tenant family bookkeeping app), so we fetch
 * the projection and aggregate in JS rather than building yet another view.
 */
export async function fetchNextBoekstukMap(
  supabase: SupabaseClient,
): Promise<NextBoekstukMap> {
  const { data, error } = await supabase
    .from("v_transactions")
    .select("location_id, jaar, boekstuk")
    .not("boekstuk", "is", null);
  if (error || !data) return {};

  const map: NextBoekstukMap = {};
  for (const row of data as Array<{
    location_id: number;
    jaar: number;
    boekstuk: number;
  }>) {
    const perLoc = (map[row.location_id] ??= {});
    const cur = perLoc[row.jaar] ?? 0;
    if (row.boekstuk > cur) perLoc[row.jaar] = row.boekstuk;
  }
  // Convert "max" to "next" in place.
  for (const locId of Object.keys(map)) {
    const perLoc = map[Number(locId)];
    for (const year of Object.keys(perLoc)) {
      perLoc[Number(year)] = perLoc[Number(year)] + 1;
    }
  }
  return map;
}
