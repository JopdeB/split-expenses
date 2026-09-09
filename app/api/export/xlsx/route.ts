import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";

import { createClient } from "@/lib/supabase/server";
import { db, tables } from "@/lib/db";

// Node runtime needed for exceljs streams + Buffer.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Auth is still Supabase during the migration; only the data queries have
  // moved to Drizzle.
  const supabase = await createClient();
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

  const txFilters: SQL[] = [
    gte(tables.vTransactions.datum, yearStart),
    lte(tables.vTransactions.datum, yearEnd),
  ];
  const gbFilters: SQL[] = [eq(tables.vGrootboek.jaar, jaar)];
  const btwFilters: SQL[] = [eq(tables.vBtwQuarterly.jaar, jaar)];
  if (locationId !== null) {
    txFilters.push(eq(tables.vTransactions.locationId, locationId));
    gbFilters.push(eq(tables.vGrootboek.locationId, locationId));
    btwFilters.push(eq(tables.vBtwQuarterly.locationId, locationId));
  }

  const [transactions, grootboek, btw, locationRows] = await Promise.all([
    db
      .select()
      .from(tables.vTransactions)
      .where(and(...txFilters))
      .orderBy(asc(tables.vTransactions.datum), asc(tables.vTransactions.boekstuk)),
    db.select().from(tables.vGrootboek).where(and(...gbFilters)),
    db.select().from(tables.vBtwQuarterly).where(and(...btwFilters)),
    locationId !== null
      ? db
          .select({ name: tables.locations.name })
          .from(tables.locations)
          .where(eq(tables.locations.id, locationId))
          .limit(1)
      : Promise.resolve([] as Array<{ name: string }>),
  ]);

  const locationName = locationRows[0]?.name ?? null;

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

  for (const t of transactions) {
    txSheet.addRow({
      datum: t.datum ? new Date(t.datum) : null,
      location_name: t.locationName,
      boekstuk: t.boekstuk,
      grootboek: t.ledgerCode ? `${t.ledgerCode} ${t.ledgerName ?? ""}`.trim() : "",
      btw_label: t.btwLabel ?? "",
      bedrag_inkomsten: numOrNull(t.bedragInkomsten),
      btw_inkomsten: numOrNull(t.btwInkomsten),
      bedrag_uitgaven: numOrNull(t.bedragUitgaven),
      btw_uitgaven: numOrNull(t.btwUitgaven),
      bedrag_deeluitgaven: numOrNull(t.bedragDeeluitgaven),
      btw_deeluitgaven: numOrNull(t.btwDeeluitgaven),
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

  for (const r of grootboek) {
    gbSheet.addRow({
      code: r.ledgerCode,
      name: r.ledgerName,
      location: r.locationName,
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

  const btwRows = btw.slice().sort((a, b) => {
    const al = String(a.locationName ?? "");
    const bl = String(b.locationName ?? "");
    if (al !== bl) return al.localeCompare(bl);
    return String(a.kwartaal).localeCompare(String(b.kwartaal));
  });
  for (const r of btwRows) {
    btwSheet.addRow({
      location: r.locationName,
      kwartaal: r.kwartaal,
      btw_inkomsten: numOrNull(r.btwInkomsten),
      btw_uitgaven: numOrNull(r.btwUitgaven),
      btw_netto: numOrNull(r.btwNetto),
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
