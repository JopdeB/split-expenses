import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";

import { createClient } from "@/lib/supabase/server";
import { db, tables } from "@/lib/db";
import type {
  BtwQuarterRow as BtwRow,
  GrootboekRow as GbRow,
  LedgerAccount,
  Location,
  TransactionWithRefs as TxRow,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const locationParam = url.searchParams.get("location");
  const locationId = locationParam ? parseInt(locationParam, 10) : null;
  if (locationParam && !Number.isFinite(locationId)) {
    return new NextResponse("Invalid location", { status: 400 });
  }

  const yearStart = `${jaar}-01-01`;
  const yearEnd = `${jaar}-12-31`;

  const locsPromise = locationId !== null
    ? db.select().from(tables.locations).where(eq(tables.locations.id, locationId))
    : db.select().from(tables.locations).orderBy(asc(tables.locations.sortOrder));

  const gbFilters: SQL[] = [eq(tables.vGrootboek.jaar, jaar)];
  const btwFilters: SQL[] = [eq(tables.vBtwQuarterly.jaar, jaar)];
  if (locationId !== null) {
    gbFilters.push(eq(tables.vGrootboek.locationId, locationId));
    btwFilters.push(eq(tables.vBtwQuarterly.locationId, locationId));
  }

  const txPromise = kwartaal
    ? (() => {
        const filters: SQL[] = [
          gte(tables.vTransactions.datum, yearStart),
          lte(tables.vTransactions.datum, yearEnd),
          eq(tables.vTransactions.kwartaal, kwartaal),
        ];
        if (locationId !== null) filters.push(eq(tables.vTransactions.locationId, locationId));
        return db
          .select()
          .from(tables.vTransactions)
          .where(and(...filters))
          .orderBy(asc(tables.vTransactions.datum), asc(tables.vTransactions.boekstuk));
      })()
    : Promise.resolve<TxRow[]>([]);

  const [locs, accounts, gb, btw, tx] = await Promise.all([
    locsPromise,
    db.select().from(tables.ledgerAccounts).orderBy(asc(tables.ledgerAccounts.sortOrder)),
    db.select().from(tables.vGrootboek).where(and(...gbFilters)),
    db.select().from(tables.vBtwQuarterly).where(and(...btwFilters)),
    txPromise,
  ]);

  const locationName = locationId !== null && locs.length > 0 ? locs[0].name : null;

  const titleBase = kwartaal
    ? `BTW ${kwartaal} ${jaar}`
    : `Jaaroverzicht ${jaar}`;
  const titleWithLocation = locationName ? `${titleBase} — ${locationName}` : titleBase;

  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    bufferPages: true, // required for switchToPage / footer pass
    info: {
      Title: `${titleWithLocation} — Admin Pap & Sjanet`,
      Author: "Admin Pap & Sjanet",
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  // ---------- Title ----------
  doc.font("Helvetica-Bold").fontSize(20);
  doc.text(
    kwartaal
      ? `BTW-overzicht ${kwartaal} ${jaar}${locationName ? ` — ${locationName}` : ""}`
      : `Jaaroverzicht ${jaar}${locationName ? ` — ${locationName}` : ""}`,
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

  const locSlug = locationName ? `-${slugify(locationName)}` : "";
  const filename = kwartaal
    ? `Admin-Pap-Sjanet-${jaar}-${kwartaal}${locSlug}.pdf`
    : `Admin-Pap-Sjanet-${jaar}${locSlug}.pdf`;
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
    let perLoc = gbLookup.get(r.ledgerAccountId);
    if (!perLoc) {
      perLoc = new Map();
      gbLookup.set(r.ledgerAccountId, perLoc);
    }
    perLoc.set(r.locationId, r);
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
      .filter((r) => r.locationId === loc.id)
      .sort((a, b) => a.kwartaal.localeCompare(b.kwartaal));
    if (perLoc.length === 0) continue;

    if (doc.y > PAGE_BOTTOM - 80) doc.addPage();
    subsectionHeader(doc, loc.name);
    const rows: string[][] = [];
    let tIn = 0, tUit = 0, tNet = 0;
    for (const r of perLoc) {
      const inN = Number(r.btwInkomsten) || 0;
      const uitN = Number(r.btwUitgaven) || 0;
      const netN = Number(r.btwNetto) || 0;
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
    const r = btw.find((b) => b.locationId === loc.id && b.kwartaal === kwartaal);
    const inN = r ? Number(r.btwInkomsten) || 0 : 0;
    const uitN = r ? Number(r.btwUitgaven) || 0 : 0;
    const netN = r ? Number(r.btwNetto) || 0 : 0;
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
    const locTx = tx.filter((t) => t.locationId === loc.id);
    if (locTx.length === 0) continue;

    if (doc.y > PAGE_BOTTOM - 80) doc.addPage();
    subsectionHeader(doc, `${loc.name} — ${locTx.length} boeking${locTx.length === 1 ? "" : "en"}`);

    // 6-column transactions table: datum, bk, grootboek, btw code, bedrag, btw
    const txWidths = [55, 35, 175, 65, 96, 97]; // sum = 523
    const rows: string[][] = [];
    for (const t of locTx) {
      const grootboek = t.ledgerCode
        ? `${t.ledgerCode} ${t.ledgerName ?? ""}`.trim()
        : "—";
      // Combine inkomsten/uitgaven/deeluitgaven into one signed bedrag + label
      let bedrag = 0;
      let btwTotal = 0;
      if (Number(t.bedragInkomsten)) {
        bedrag = Number(t.bedragInkomsten);
        btwTotal = Number(t.btwInkomsten) || 0;
      } else if (Number(t.bedragUitgaven)) {
        bedrag = -Number(t.bedragUitgaven);
        btwTotal = -(Number(t.btwUitgaven) || 0);
      } else if (Number(t.bedragDeeluitgaven)) {
        bedrag = -Number(t.bedragDeeluitgaven);
        btwTotal = -(Number(t.btwDeeluitgaven) || 0);
      }
      rows.push([
        formatDateNL(t.datum),
        t.boekstuk ? String(t.boekstuk) : "—",
        truncate(grootboek, 32),
        t.btwLabel ?? "—",
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

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
