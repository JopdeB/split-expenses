import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Supabase free tier pauses projects after 7 days of inactivity. A cron on
// the DO droplet pings this route every 5 days; the single SELECT counts
// as activity and keeps the project alive. Not authenticated on purpose so
// the cron doesn't need credentials — the query touches only public tables
// and returns no data.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { error } = await supabase.from("locations").select("id").limit(1);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
