import { db } from "@/lib/db";
import { GMB_SHEET_ID } from "@/lib/constants";
import { parseCSV } from "@/lib/sheets";

export async function POST() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${GMB_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent("New Tracker")}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);

    const csv = await res.text();
    const { cols, rows } = parseCSV(csv);

    // Map header names to indices (case-insensitive)
    const idx = (name: string) => cols.findIndex((c) => c.toLowerCase() === name.toLowerCase());
    const iId       = idx("property_id");
    const iName     = idx("property_name");
    const iCity     = idx("property_city");
    const iCreated  = idx("created_at");
    const iStatus   = idx("STATUS");
    const iPrePost  = idx("Pre/Post");
    const iGmbSt    = idx("GMB Status");
    const iGmbSub   = idx("GMB Sub Status");
    const iListType = idx("Listing Type");
    const iNumber   = idx("Number");
    const iReview   = idx("Review Link Tracker");
    const iRating   = idx("GMB Reviews");
    const iCount    = idx("GMB Ratings");

    const syncedAt = new Date().toISOString();
    let count = 0;

    for (const row of rows) {
      const pid = row[iId]?.trim();
      if (!pid) continue;

      await db.gmbTracker.upsert({
        where: { propertyId: pid },
        create: {
          propertyId: pid,
          propertyName: row[iName] ?? null,
          city: row[iCity] ?? null,
          createdAt: row[iCreated] ?? null,
          fhStatus: row[iStatus] ?? null,
          prePost: row[iPrePost] ?? null,
          gmbStatus: row[iGmbSt] ?? null,
          gmbSubStatus: row[iGmbSub] ?? null,
          listingType: row[iListType] ?? null,
          number: row[iNumber] ?? null,
          reviewLinkTracker: row[iReview] ?? null,
          gmbRating: row[iRating] ?? null,
          gmbReviewCount: row[iCount] ?? null,
          syncedAt,
        },
        update: {
          propertyName: row[iName] ?? null,
          city: row[iCity] ?? null,
          createdAt: row[iCreated] ?? null,
          fhStatus: row[iStatus] ?? null,
          prePost: row[iPrePost] ?? null,
          gmbStatus: row[iGmbSt] ?? null,
          gmbSubStatus: row[iGmbSub] ?? null,
          listingType: row[iListType] ?? null,
          number: row[iNumber] ?? null,
          reviewLinkTracker: row[iReview] ?? null,
          gmbRating: row[iRating] ?? null,
          gmbReviewCount: row[iCount] ?? null,
          syncedAt,
        },
      });
      count++;
    }

    return Response.json({ ok: true, synced: count, log: `✓ GMB Tracker synced — ${count} rows upserted.` });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
