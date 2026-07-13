import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

import { createClient } from "@/lib/supabase/server";

// Node runtime needed for exceljs streams + Buffer.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  // Auth check — the page that links here is behind /protected, but enforce
  // server-side anyway in case someone hits the URL directly.
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const jaarParam = url.searchParams.get("jaar");
  const jaar = jaarParam ? parseInt(jaarParam, 10) : new Date().getFullYear();
  if (!Number.isFinite(jaar)) {
    return new NextResponse("Invalid jaar", { status: 400 });
  }

  const locationParam = url.searchParams.get("location");
  const locationId = locationParam ? parseInt(locationParam, 10) : null;
  if (locationParam && !Number.isFinite(locationId)) {
    return new NextResponse("Invalid location", { status: 400 });
  }

  const yearStart = `${jaar}-01-01`;
  const yearEnd = `${jaar}-12-31`;

  const txQuery = supabase
    .from("v_transactions")
    .select("*")
    .gte("datum", yearStart)
    .lte("datum", yearEnd)
    .order("datum")
    .order("boekstuk");
  const gbQuery = supabase.from("v_grootboek").select("*").eq("jaar", jaar);
  const btwQuery = supabase.from("v_btw_quarterly").select("*").eq("jaar", jaar);
  if (locationId !== null) {
    txQuery.eq("location_id", locationId);
    gbQuery.eq("location_id", locationId);
    btwQuery.eq("location_id", locationId);
  }

  const locationLookupPromise = locationId !== null
    ? supabase.from("locations").select("name").eq("id", locationId).single()
    : Promise.resolve({ data: null, error: null });

  const [
    { data: transactions, error: txErr },
    { data: grootboek, error: gbErr },
    { data: btw, error: btwErr },
    { data: locationRow },
  ] = await Promise.all([txQuery, gbQuery, btwQuery, locationLookupPromise]);

  if (txErr || gbErr || btwErr) {
    console.error("xlsx export query error", { txErr, gbErr, btwErr });
    return new NextResponse("Database error", { status: 500 });
  }

  const locationName = (locationRow as { name?: string } | null)?.name ?? null;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Admin Pap & Sjanet";
  wb.created = new Date();

  // ---------- Sheet 1: Transacties ----------
  const txSheet = wb.addWorksheet("Transacties");
  txSheet.columns = [
    { header: "Datum", key: "datum", width: 12 },
    { header: "Locatie", key: "location_name", width: 16 },
    { header: "Boekstuk", key: "boekstuk", width: 10 },
    { header: "Grootboek", key: "grootboek", width: 32 },
    { header: "BTW Code", key: "btw_label", width: 14 },
    { header: "Bedrag inkomsten", key: "bedrag_inkomsten", width: 16, style: { numFmt: euroFmt() } },
    { header: "BTW inkomsten", key: "btw_inkomsten", width: 14, style: { numFmt: euroFmt() } },
    { header: "Bedrag uitgaven", key: "bedrag_uitgaven", width: 16, style: { numFmt: euroFmt() } },
    { header: "BTW uitgaven", key: "btw_uitgaven", width: 14, style: { numFmt: euroFmt() } },
    { header: "Bedrag deeluitgaven", key: "bedrag_deeluitgaven", width: 18, style: { numFmt: euroFmt() } },
    { header: "BTW deeluitgaven", key: "btw_deeluitgaven", width: 16, style: { numFmt: euroFmt() } },
    { header: "Omschrijving", key: "omschrijving", width: 40 },
  ];
  styleHeader(txSheet);

  for (const t of (transactions ?? []) as Array<Record<string, unknown>>) {
    txSheet.addRow({
      datum: t.datum ? new Date(t.datum as string) : null,
      location_name: t.location_name,
      boekstuk: t.boekstuk,
      grootboek: t.ledger_code ? `${t.ledger_code} ${t.ledger_name ?? ""}`.trim() : "",
      btw_label: t.btw_label ?? "",
      bedrag_inkomsten: numOrNull(t.bedrag_inkomsten),
      btw_inkomsten: numOrNull(t.btw_inkomsten),
      bedrag_uitgaven: numOrNull(t.bedrag_uitgaven),
      btw_uitgaven: numOrNull(t.btw_uitgaven),
      bedrag_deeluitgaven: numOrNull(t.bedrag_deeluitgaven),
      btw_deeluitgaven: numOrNull(t.btw_deeluitgaven),
      omschrijving: t.omschrijving ?? "",
    });
  }
  txSheet.getColumn("datum").numFmt = "dd-mm-yyyy";
  txSheet.views = [{ state: "frozen", ySplit: 1 }];

  // ---------- Sheet 2: Grootboek ----------
  const gbSheet = wb.addWorksheet("Grootboek");
  gbSheet.columns = [
    { header: "Grootboek code", key: "code", width: 14 },
    { header: "Grootboek naam", key: "name", width: 30 },
    { header: "Locatie", key: "location", width: 16 },
    { header: "Inkomsten", key: "inkomsten", width: 14, style: { numFmt: euroFmt() } },
    { header: "Uitgaven", key: "uitgaven", width: 14, style: { numFmt: euroFmt() } },
    { header: "Deeluitgaven", key: "deeluitgaven", width: 14, style: { numFmt: euroFmt() } },
    { header: "Netto", key: "netto", width: 14, style: { numFmt: euroFmt() } },
  ];
  styleHeader(gbSheet);

  for (const r of (grootboek ?? []) as Array<Record<string, unknown>>) {
    gbSheet.addRow({
      code: r.ledger_code,
      name: r.ledger_name,
      location: r.location_name,
      inkomsten: numOrNull(r.inkomsten),
      uitgaven: numOrNull(r.uitgaven),
      deeluitgaven: numOrNull(r.deeluitgaven),
      netto: numOrNull(r.netto),
    });
  }
  gbSheet.views = [{ state: "frozen", ySplit: 1 }];

  // ---------- Sheet 3: BTW per kwartaal ----------
  const btwSheet = wb.addWorksheet("BTW per kwartaal");
  btwSheet.columns = [
    { header: "Locatie", key: "location", width: 16 },
    { header: "Kwartaal", key: "kwartaal", width: 10 },
    { header: "BTW inkomsten", key: "btw_inkomsten", width: 14, style: { numFmt: euroFmt() } },
    { header: "BTW uitgaven", key: "btw_uitgaven", width: 14, style: { numFmt: euroFmt() } },
    { header: "BTW netto", key: "btw_netto", width: 14, style: { numFmt: euroFmt() } },
  ];
  styleHeader(btwSheet);

  const btwRows = ((btw ?? []) as Array<Record<string, unknown>>).slice().sort((a, b) => {
    const al = String(a.location_name);
    const bl = String(b.location_name);
    if (al !== bl) return al.localeCompare(bl);
    return String(a.kwartaal).localeCompare(String(b.kwartaal));
  });
  for (const r of btwRows) {
    btwSheet.addRow({
      location: r.location_name,
      kwartaal: r.kwartaal,
      btw_inkomsten: numOrNull(r.btw_inkomsten),
      btw_uitgaven: numOrNull(r.btw_uitgaven),
      btw_netto: numOrNull(r.btw_netto),
    });
  }
  btwSheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const locSlug = locationName ? `-${slugify(locationName)}` : "";
  const filename = `Admin-Pap-Sjanet-${jaar}${locSlug}.xlsx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function euroFmt() {
  // Dutch euro: € 1.234,56  — Excel uses ; for negative.
  return '"€"\\ #,##0.00;"€"\\ -#,##0.00';
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const row = sheet.getRow(1);
  row.font = { bold: true };
  row.alignment = { vertical: "middle" };
  row.commit();
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return null;
  return n;
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
