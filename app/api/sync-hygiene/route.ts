import { db } from "@/lib/db";
import { SHEET_ID } from "@/lib/constants";

const TAB = "BDC Hygiene";

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const cols: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === "," && !inQ) { cols.push(cur); cur = ""; }
      else cur += ch;
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

export async function POST() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(TAB)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);

    const rows = parseCSV(await res.text());
    if (rows.length < 2) return Response.json({ synced: 0, message: "Sheet empty" });

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const idx = (name: string) => headers.indexOf(name);

    const iId      = idx("prop id");
    const iName    = idx("prop name");
    const iCity    = idx("city");
    const iBdcId   = idx("bdc id");
    const iScore   = idx("review score");
    const iCount   = idx("review count");
    const iPref    = idx("preferred status");
    const iGenius  = idx("genius level");
    const iPerfSc  = idx("performance score");
    const iPromo   = idx("top promotion");
    const iComm    = idx("commission %");
    const iViews   = idx("views");
    const iConv    = idx("conversion %");
    const iPage    = idx("property page score");
    const iDate    = idx("last checked");

    const col = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
    const syncedAt = new Date().toISOString();
    let synced = 0;

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const bdcId = col(row, iBdcId);
      if (!bdcId || bdcId.toLowerCase() === "nan") continue;

      const reviewScore   = col(row, iScore);
      const reviewCount   = col(row, iCount);
      const preferred     = col(row, iPref);
      const geniusLevel   = col(row, iGenius);
      const perfScore     = col(row, iPerfSc);
      const topPromotion  = col(row, iPromo);
      const commissionPct = col(row, iComm);
      const views         = col(row, iViews);
      const conversionPct = col(row, iConv);
      const pageScore     = col(row, iPage);
      const lastChecked   = col(row, iDate);

      // Only insert if any metric changed (or no prior record)
      const prev = await db.hygieneData.findFirst({
        where: { bdcId },
        orderBy: { id: "desc" },
        select: {
          reviewScore: true, reviewCount: true, preferred: true, geniusLevel: true,
          perfScore: true, topPromotion: true, commissionPct: true, views: true,
          conversionPct: true, pageScore: true,
        },
      });

      const changed = !prev
        || prev.reviewScore   !== reviewScore
        || prev.reviewCount   !== reviewCount
        || prev.preferred     !== preferred
        || prev.geniusLevel   !== geniusLevel
        || prev.perfScore     !== perfScore
        || prev.topPromotion  !== topPromotion
        || prev.commissionPct !== commissionPct
        || prev.views          !== views
        || prev.conversionPct !== conversionPct
        || prev.pageScore     !== pageScore;

      if (changed) {
        await db.hygieneData.create({
          data: {
            propId: col(row, iId) || null,
            bdcId,
            propName: col(row, iName) || null,
            city: col(row, iCity) || null,
            reviewScore,
            reviewCount,
            preferred,
            geniusLevel,
            perfScore,
            topPromotion,
            commissionPct,
            views,
            conversionPct,
            pageScore,
            lastChecked,
            syncedAt,
          },
        });
      }
      synced++;
    }

    return Response.json({ synced, fetchedAt: syncedAt });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
