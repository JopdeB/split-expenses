import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LedgerAccount = { id: number; code: string; name: string; sort_order: number };
type Location = { id: number; name: string; sort_order: number };

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

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp?.user) return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const jaarParam = url.searchParams.get("jaar");
  const jaar = jaarParam ? parseInt(jaarParam, 10) : new Date().getFullYear();
  if (!Number.isFinite(jaar)) return new NextResponse("Invalid jaar", { status: 400 });

  const [
    { data: locations, error: locErr },
    { data: ledgerAccounts, error: laErr },
    { data: gbData, error: gbErr },
    { data: btwData, error: btwErr },
  ] = await Promise.all([
    supabase.from("locations").select("*").order("sort_order"),
    supabase.from("ledger_accounts").select("*").order("sort_order"),
    supabase.from("v_grootboek").select("*").eq("jaar", jaar),
    supabase.from("v_btw_quarterly").select("*").eq("jaar", jaar),
  ]);

  if (locErr || laErr || gbErr || btwErr) {
    console.error("pdf export query error", { locErr, laErr, gbErr, btwErr });
    return new NextResponse("Database error", { status: 500 });
  }

  const locs = (locations ?? []) as Location[];
  const accounts = (ledgerAccounts ?? []) as LedgerAccount[];
  const gb = (gbData ?? []) as GbRow[];
  const btw = (btwData ?? []) as BtwRow[];

  // Lookup: ledgerId -> locationId -> totals
  const gbLookup = new Map<number, Map<number, GbRow>>();
  for (const r of gb) {
    let perLoc = gbLookup.get(r.ledger_account_id);
    if (!perLoc) {
      perLoc = new Map();
      gbLookup.set(r.ledger_account_id, perLoc);
    }
    perLoc.set(r.location_id, r);
  }

  const buffers: Buffer[] = [];
  const doc = new PDFDocument({
    size: "A4",
    margin: 36,
    info: {
      Title: `Jaaroverzicht ${jaar} — Admin Pap & Sjanet`,
      Author: "Admin Pap & Sjanet",
    },
  });
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
  });

  // ---------- Title ----------
  doc.font("Helvetica-Bold").fontSize(20).text(`Jaaroverzicht ${jaar}`, { align: "left" });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#555")
    .text("Admin Pap & Sjanet — bedragen exclusief BTW")
    .text(
      `Gegenereerd op ${new Date().toLocaleDateString("nl-NL", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })}`,
    );
  doc.fillColor("black").moveDown(1);

  // ---------- Grootboek per locatie ----------
  for (const loc of locs) {
    if (doc.y > 700) doc.addPage();
    doc.font("Helvetica-Bold").fontSize(14).text(`Grootboek — ${loc.name}`);
    doc.moveDown(0.4);

    const rows: Array<[string, string, string, string, string]> = [];
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
        euro(inN),
        euro(uitN),
        euro(deelN),
        euro(netN),
      ]);
    }
    if (rows.length === 0) {
      doc.font("Helvetica-Oblique").fontSize(9).fillColor("#888").text("Geen mutaties dit jaar.");
      doc.fillColor("black").moveDown(0.6);
      continue;
    }

    drawTable(
      doc,
      ["Grootboek", "Inkomsten", "Uitgaven", "Deeluitgaven", "Netto"],
      [220, 75, 75, 80, 75],
      rows,
      [
        `Totaal ${loc.name}`,
        euro(tIn),
        euro(tUit),
        euro(tDeel),
        euro(tNet),
      ],
    );
    doc.moveDown(0.8);
  }

  // ---------- BTW per kwartaal ----------
  if (doc.y > 600) doc.addPage();
  doc.font("Helvetica-Bold").fontSize(14).text("BTW per kwartaal");
  doc
    .font("Helvetica-Oblique")
    .fontSize(9)
    .fillColor("#666")
    .text(
      "Deeluitgaven niet meegerekend — boekhouder splitst die aan jaareinde naar % privé/zakelijk.",
    );
  doc.fillColor("black").moveDown(0.4);

  for (const loc of locs) {
    const perLoc = btw
      .filter((r) => r.location_id === loc.id)
      .sort((a, b) => a.kwartaal.localeCompare(b.kwartaal));
    if (perLoc.length === 0) continue;

    if (doc.y > 700) doc.addPage();
    doc.font("Helvetica-Bold").fontSize(11).text(loc.name);
    doc.moveDown(0.3);

    const rows: Array<[string, string, string, string]> = [];
    let tIn = 0, tUit = 0, tNet = 0;
    for (const r of perLoc) {
      const inN = Number(r.btw_inkomsten) || 0;
      const uitN = Number(r.btw_uitgaven) || 0;
      const netN = Number(r.btw_netto) || 0;
      tIn += inN; tUit += uitN; tNet += netN;
      rows.push([r.kwartaal, euro(inN), euro(uitN), euro(netN)]);
    }

    drawTable(
      doc,
      ["Kwartaal", "BTW inkomsten", "BTW uitgaven", "BTW netto"],
      [80, 110, 110, 110],
      rows,
      [`Totaal ${loc.name}`, euro(tIn), euro(tUit), euro(tNet)],
    );
    doc.moveDown(0.6);
  }

  // ---------- Page numbers ----------
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const w = doc.page.width;
    const h = doc.page.height;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#888")
      .text(`Pagina ${i + 1} van ${range.count}`, 0, h - 24, {
        width: w,
        align: "center",
      });
  }

  doc.end();
  const pdf = await done;

  const filename = `Admin-Pap-Sjanet-${jaar}.pdf`;
  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

// Simple table renderer. First column left-aligned, others right-aligned.
function drawTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  widths: number[],
  rows: string[][],
  totalsRow?: string[],
) {
  const startX = doc.x;
  const rowH = 16;
  const headerH = 18;

  // Header
  doc.font("Helvetica-Bold").fontSize(9);
  let x = startX;
  const headerY = doc.y;
  doc.rect(startX, headerY, sum(widths), headerH).fill("#eeeeee");
  doc.fillColor("black");
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], x + 4, headerY + 5, {
      width: widths[i] - 8,
      align: i === 0 ? "left" : "right",
      lineBreak: false,
    });
    x += widths[i];
  }
  doc.y = headerY + headerH;

  // Body
  doc.font("Helvetica").fontSize(9);
  for (let r = 0; r < rows.length; r++) {
    // Page break if we'd overflow
    if (doc.y + rowH > doc.page.height - 50) {
      doc.addPage();
      doc.y = doc.page.margins.top;
    }
    const y = doc.y;
    if (r % 2 === 1) {
      doc.rect(startX, y, sum(widths), rowH).fill("#fafafa");
      doc.fillColor("black");
    }
    x = startX;
    for (let i = 0; i < rows[r].length; i++) {
      doc.text(rows[r][i], x + 4, y + 4, {
        width: widths[i] - 8,
        align: i === 0 ? "left" : "right",
        lineBreak: false,
      });
      x += widths[i];
    }
    doc.y = y + rowH;
  }

  // Totals
  if (totalsRow) {
    if (doc.y + rowH > doc.page.height - 50) {
      doc.addPage();
      doc.y = doc.page.margins.top;
    }
    const y = doc.y;
    doc.rect(startX, y, sum(widths), rowH).fill("#eeeeee");
    doc.fillColor("black").font("Helvetica-Bold").fontSize(9);
    x = startX;
    for (let i = 0; i < totalsRow.length; i++) {
      doc.text(totalsRow[i], x + 4, y + 4, {
        width: widths[i] - 8,
        align: i === 0 ? "left" : "right",
        lineBreak: false,
      });
      x += widths[i];
    }
    doc.y = y + rowH;
  }
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}
