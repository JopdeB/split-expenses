import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Location = { id: number; name: string; sort_order: number };
type LedgerAccount = { id: number; code: string; name: string; sort_order: number };

type GbRow = {
  jaar: number;
  location_id: number;
  location_name: string;
  ledger_account_id: number;
  ledger_code: string;
  ledger_name: string;
  inkomsten: number;
  uitgaven: number;
  deeluitgaven: number;
  netto: number;
};

type BtwRow = {
  location_id: number;
  location_name: string;
  jaar: number;
  kwartaal: string;
  btw_inkomsten: number;
  btw_uitgaven: number;
  btw_netto: number;
};

type TxRow = {
  id: number;
  location_id: number;
  location_name: string;
  ledger_code: string | null;
  ledger_name: string | null;
  btw_label: string | null;
  boekstuk: number | null;
  datum: string;
  kwartaal: string;
  bedrag_inkomsten: number;
  btw_inkomsten: number;
  bedrag_uitgaven: number;
  btw_uitgaven: number;
  bedrag_deeluitgaven: number;
  btw_deeluitgaven: number;
  omschrijving: string | null;
};

const nlNumber = new Intl.NumberFormat("nl-NL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
function euro(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const num = typeof n === "number" ? n : parseFloat(String(n));
  if (!Number.isFinite(num) || num === 0) return "—";
  return "€ " + nlNumber.format(num);
}
function formatDateNL(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const PAGE_MARGIN = 36;
const PAGE_WIDTH = 595.28; // A4 portrait
const CONTENT_WIDTH = PAGE_WIDTH - 2 * PAGE_MARGIN; // 523pt
const PAGE_BOTTOM = 842 - 50; // leave room for footer

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp?.user) return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const jaarParam = url.searchParams.get("jaar");
  const jaar = jaarParam ? parseInt(jaarParam, 10) : new Date().getFullYear();
  if (!Number.isFinite(jaar)) return new NextResponse("Invalid jaar", { status: 400 });

  const kwartaalParam = url.searchParams.get("kwartaal");
  const kwartaal =
    kwartaalParam && /^Q[1-4]$/.test(kwartaalParam) ? kwartaalParam : null;

  const yearStart = `${jaar}-01-01`;
  const yearEnd = `${jaar}-12-31`;
  const [
    { data: locations, error: locErr },
    { data: ledgerAccounts, error: laErr },
    { data: gbData, error: gbErr },
    { data: btwData, error: btwErr },
    { data: txData, error: txErr },
  ] = await Promise.all([
    supabase.from("locations").select("*").order("sort_order"),
    supabase.from("ledger_accounts").select("*").order("sort_order"),
    supabase.from("v_grootboek").select("*").eq("jaar", jaar),
    supabase.from("v_btw_quarterly").select("*").eq("jaar", jaar),
    // Transactions only fetched if we render quarterly detail
    kwartaal
      ? supabase
          .from("v_transactions")
          .select("*")
          .gte("datum", yearStart)
          .lte("datum", yearEnd)
          .eq("kwartaal", kwartaal)
          .order("datum")
          .order("boekstuk")
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (locErr || laErr || gbErr || btwErr || txErr) {
    console.error("pdf export query error", { locErr, laErr, gbErr, btwErr, txErr });
    return new NextResponse("Database error", { status: 500 });
  }

  const locs = (locations ?? []) as Location[];
  const accounts = (ledgerAccounts ?? []) as LedgerAccount[];
  const gb = (gbData ?? []) as GbRow[];
  const btw = (btwData ?? []) as BtwRow[];
  const tx = (txData ?? []) as TxRow[] | null;

  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    bufferPages: true, // required for switchToPage / footer pass
    info: {
      Title: kwartaal
        ? `BTW ${kwartaal} ${jaar} — Admin Pap & Sjanet`
        : `Jaaroverzicht ${jaar} — Admin Pap & Sjanet`,
      Author: "Admin Pap & Sjanet",
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  // ---------- Title ----------
  doc.font("Helvetica-Bold").fontSize(20);
  doc.text(
    kwartaal ? `BTW-overzicht ${kwartaal} ${jaar}` : `Jaaroverzicht ${jaar}`,
    PAGE_MARGIN,
    PAGE_MARGIN,
    { width: CONTENT_WIDTH },
  );
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(10).fillColor("#555");
  doc.text("Admin Pap & Sjanet — bedragen exclusief BTW", PAGE_MARGIN, doc.y, {
    width: CONTENT_WIDTH,
  });
  doc.text(
    `Gegenereerd op ${new Date().toLocaleDateString("nl-NL", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })}`,
    PAGE_MARGIN,
    doc.y,
    { width: CONTENT_WIDTH },
  );
  doc.fillColor("black");
  doc.y = doc.y + 18;

  if (kwartaal) {
    renderQuarterly({ doc, locs, btw, tx: tx ?? [], jaar, kwartaal });
  } else {
    renderYearly({ doc, locs, accounts, gb, btw });
  }

  // ---------- Page numbers ----------
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.font("Helvetica").fontSize(8).fillColor("#888");
    // Footer: explicit absolute position, full width centered
    doc.text(`Pagina ${i + 1} van ${range.count}`, PAGE_MARGIN, 842 - 24, {
      width: CONTENT_WIDTH,
      align: "center",
      lineBreak: false,
    });
  }
  doc.flushPages();

  doc.end();
  const pdf = await done;

  const filename = kwartaal
    ? `Admin-Pap-Sjanet-${jaar}-${kwartaal}.pdf`
    : `Admin-Pap-Sjanet-${jaar}.pdf`;
  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

// ============================================================
// Yearly variant
// ============================================================
function renderYearly(args: {
  doc: PDFKit.PDFDocument;
  locs: Location[];
  accounts: LedgerAccount[];
  gb: GbRow[];
  btw: BtwRow[];
}) {
  const { doc, locs, accounts, gb, btw } = args;

  // ledgerId -> locationId -> row
  const gbLookup = new Map<number, Map<number, GbRow>>();
  for (const r of gb) {
    let perLoc = gbLookup.get(r.ledger_account_id);
    if (!perLoc) {
      perLoc = new Map();
      gbLookup.set(r.ledger_account_id, perLoc);
    }
    perLoc.set(r.location_id, r);
  }

  const widths = [195, 80, 80, 88, 80]; // sum = 523
  for (const loc of locs) {
    sectionHeader(doc, `Grootboek — ${loc.name}`);
    const rows: string[][] = [];
    let tIn = 0, tUit = 0, tDeel = 0, tNet = 0;
    for (const acc of accounts) {
      const r = gbLookup.get(acc.id)?.get(loc.id);
      if (!r) continue;
      const inN = Number(r.inkomsten) || 0;
      const uitN = Number(r.uitgaven) || 0;
      const deelN = Number(r.deeluitgaven) || 0;
      const netN = Number(r.netto) || 0;
      if (inN === 0 && uitN === 0 && deelN === 0) continue;
      tIn += inN; tUit += uitN; tDeel += deelN; tNet += netN;
      rows.push([
        `${acc.code}  ${acc.name}`,
        euro(inN), euro(uitN), euro(deelN), euro(netN),
      ]);
    }
    if (rows.length === 0) {
      muted(doc, "Geen mutaties dit jaar.");
      gap(doc, 12);
      continue;
    }
    drawTable(doc, {
      headers: ["Grootboek", "Inkomsten", "Uitgaven", "Deeluitgaven", "Netto"],
      widths,
      rows,
      totals: [`Totaal ${loc.name}`, euro(tIn), euro(tUit), euro(tDeel), euro(tNet)],
    });
    gap(doc, 16);
  }

  // BTW per kwartaal
  if (doc.y > PAGE_BOTTOM - 120) doc.addPage();
  sectionHeader(doc, "BTW per kwartaal");
  muted(
    doc,
    "Deeluitgaven niet meegerekend — boekhouder splitst die aan jaareinde naar % privé/zakelijk.",
  );
  gap(doc, 6);

  const btwWidths = [70, 145, 145, 163]; // sum = 523
  for (const loc of locs) {
    const perLoc = btw
      .filter((r) => r.location_id === loc.id)
      .sort((a, b) => a.kwartaal.localeCompare(b.kwartaal));
    if (perLoc.length === 0) continue;

    if (doc.y > PAGE_BOTTOM - 80) doc.addPage();
    subsectionHeader(doc, loc.name);
    const rows: string[][] = [];
    let tIn = 0, tUit = 0, tNet = 0;
    for (const r of perLoc) {
      const inN = Number(r.btw_inkomsten) || 0;
      const uitN = Number(r.btw_uitgaven) || 0;
      const netN = Number(r.btw_netto) || 0;
      tIn += inN; tUit += uitN; tNet += netN;
      rows.push([r.kwartaal, euro(inN), euro(uitN), euro(netN)]);
    }
    drawTable(doc, {
      headers: ["Kwartaal", "BTW inkomsten", "BTW uitgaven", "BTW netto"],
      widths: btwWidths,
      rows,
      totals: [`Totaal ${loc.name}`, euro(tIn), euro(tUit), euro(tNet)],
    });
    gap(doc, 12);
  }
}

// ============================================================
// Quarterly variant
// ============================================================
function renderQuarterly(args: {
  doc: PDFKit.PDFDocument;
  locs: Location[];
  btw: BtwRow[];
  tx: TxRow[];
  jaar: number;
  kwartaal: string;
}) {
  const { doc, locs, btw, tx, kwartaal } = args;

  // BTW totals for this quarter, per location
  sectionHeader(doc, `BTW ${kwartaal}`);
  muted(
    doc,
    "Deeluitgaven niet meegerekend — boekhouder splitst die aan jaareinde naar % privé/zakelijk.",
  );
  gap(doc, 6);

  const sumWidths = [200, 105, 108, 110]; // sum = 523
  const sumRows: string[][] = [];
  let gIn = 0, gUit = 0, gNet = 0;
  for (const loc of locs) {
    const r = btw.find((b) => b.location_id === loc.id && b.kwartaal === kwartaal);
    const inN = r ? Number(r.btw_inkomsten) || 0 : 0;
    const uitN = r ? Number(r.btw_uitgaven) || 0 : 0;
    const netN = r ? Number(r.btw_netto) || 0 : 0;
    gIn += inN; gUit += uitN; gNet += netN;
    sumRows.push([loc.name, euro(inN), euro(uitN), euro(netN)]);
  }
  drawTable(doc, {
    headers: ["Locatie", "BTW inkomsten", "BTW uitgaven", "BTW netto"],
    widths: sumWidths,
    rows: sumRows,
    totals: ["Totaal", euro(gIn), euro(gUit), euro(gNet)],
  });
  gap(doc, 20);

  // Transactions in this quarter, grouped per location
  for (const loc of locs) {
    const locTx = tx.filter((t) => t.location_id === loc.id);
    if (locTx.length === 0) continue;

    if (doc.y > PAGE_BOTTOM - 80) doc.addPage();
    subsectionHeader(doc, `${loc.name} — ${locTx.length} boeking${locTx.length === 1 ? "" : "en"}`);

    // 6-column transactions table: datum, bk, grootboek, btw code, bedrag, btw
    const txWidths = [55, 35, 175, 65, 96, 97]; // sum = 523
    const rows: string[][] = [];
    for (const t of locTx) {
      const grootboek = t.ledger_code
        ? `${t.ledger_code} ${t.ledger_name ?? ""}`.trim()
        : "—";
      // Combine inkomsten/uitgaven/deeluitgaven into one signed bedrag + label
      let bedrag = 0;
      let btwTotal = 0;
      if (Number(t.bedrag_inkomsten)) {
        bedrag = Number(t.bedrag_inkomsten);
        btwTotal = Number(t.btw_inkomsten) || 0;
      } else if (Number(t.bedrag_uitgaven)) {
        bedrag = -Number(t.bedrag_uitgaven);
        btwTotal = -(Number(t.btw_uitgaven) || 0);
      } else if (Number(t.bedrag_deeluitgaven)) {
        bedrag = -Number(t.bedrag_deeluitgaven);
        btwTotal = -(Number(t.btw_deeluitgaven) || 0);
      }
      rows.push([
        formatDateNL(t.datum),
        t.boekstuk ? String(t.boekstuk) : "—",
        truncate(grootboek, 32),
        t.btw_label ?? "—",
        euro(bedrag),
        euro(btwTotal),
      ]);
    }
    drawTable(doc, {
      headers: ["Datum", "Bk.", "Grootboek", "BTW code", "Bedrag", "BTW"],
      widths: txWidths,
      rows,
    });
    gap(doc, 16);
  }
}

// ============================================================
// Drawing helpers — all use absolute coordinates so cursor leaks
// between sections are impossible.
// ============================================================
function sectionHeader(doc: PDFKit.PDFDocument, text: string) {
  if (doc.y > PAGE_BOTTOM - 60) doc.addPage();
  doc.font("Helvetica-Bold").fontSize(13).fillColor("black");
  doc.text(text, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH, lineBreak: false });
  doc.y = doc.y + 4;
}

function subsectionHeader(doc: PDFKit.PDFDocument, text: string) {
  doc.font("Helvetica-Bold").fontSize(10).fillColor("black");
  doc.text(text, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH, lineBreak: false });
  doc.y = doc.y + 2;
}

function muted(doc: PDFKit.PDFDocument, text: string) {
  doc.font("Helvetica-Oblique").fontSize(8.5).fillColor("#777");
  doc.text(text, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.fillColor("black");
}

function gap(doc: PDFKit.PDFDocument, h: number) {
  doc.y = doc.y + h;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function drawTable(
  doc: PDFKit.PDFDocument,
  opts: {
    headers: string[];
    widths: number[];
    rows: string[][];
    totals?: string[];
  },
) {
  const { headers, widths, rows, totals } = opts;
  const headerH = 18;
  const rowH = 15;
  const startX = PAGE_MARGIN;
  const tableW = widths.reduce((a, b) => a + b, 0);

  // -- Header row --
  let y = doc.y;
  doc.save();
  doc.rect(startX, y, tableW, headerH).fill("#eeeeee");
  doc.restore();
  doc.fillColor("black").font("Helvetica-Bold").fontSize(9);
  drawCells(doc, headers, widths, startX, y + 5);
  // Bottom border on header
  doc
    .save()
    .strokeColor("#cccccc")
    .lineWidth(0.5)
    .moveTo(startX, y + headerH)
    .lineTo(startX + tableW, y + headerH)
    .stroke()
    .restore();
  y += headerH;

  // -- Body rows --
  doc.font("Helvetica").fontSize(9);
  for (let r = 0; r < rows.length; r++) {
    // Page break: also re-draw the header on the new page
    if (y + rowH > PAGE_BOTTOM) {
      doc.addPage();
      y = PAGE_MARGIN;
      // re-draw header
      doc.save();
      doc.rect(startX, y, tableW, headerH).fill("#eeeeee");
      doc.restore();
      doc.fillColor("black").font("Helvetica-Bold").fontSize(9);
      drawCells(doc, headers, widths, startX, y + 5);
      doc
        .save()
        .strokeColor("#cccccc")
        .lineWidth(0.5)
        .moveTo(startX, y + headerH)
        .lineTo(startX + tableW, y + headerH)
        .stroke()
        .restore();
      y += headerH;
      doc.font("Helvetica").fontSize(9);
    }
    if (r % 2 === 1) {
      doc.save();
      doc.rect(startX, y, tableW, rowH).fill("#fafafa");
      doc.restore();
    }
    doc.fillColor("black");
    drawCells(doc, rows[r], widths, startX, y + 4);
    y += rowH;
  }

  // -- Totals row --
  if (totals) {
    if (y + rowH > PAGE_BOTTOM) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    doc.save();
    doc.rect(startX, y, tableW, rowH).fill("#eeeeee");
    doc.restore();
    doc.fillColor("black").font("Helvetica-Bold").fontSize(9);
    drawCells(doc, totals, widths, startX, y + 4);
    y += rowH;
  }

  doc.y = y;
}

function drawCells(
  doc: PDFKit.PDFDocument,
  cells: string[],
  widths: number[],
  startX: number,
  y: number,
) {
  let x = startX;
  for (let i = 0; i < cells.length; i++) {
    doc.text(cells[i], x + 4, y, {
      width: widths[i] - 8,
      align: i === 0 ? "left" : "right",
      lineBreak: false,
      ellipsis: true,
    });
    x += widths[i];
  }
}
