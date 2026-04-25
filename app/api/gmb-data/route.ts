import { db } from "@/lib/db";

export async function GET() {
  try {
    const totalResult = await db.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) as n FROM gmb_tracker`;
    const total = Number(totalResult[0]?.n ?? 0);
    if (total === 0) return Response.json({ empty: true, rows: [], stats: {} });

    const rows = await db.$queryRaw<Array<{
      propertyId: string; propertyName: string; city: string; createdAt: string;
      fhStatus: string; prePost: string; gmbStatus: string; gmbSubStatus: string;
      listingType: string; number: string; reviewLinkTracker: string;
      gmbRating: string; gmbReviewCount: string;
    }>>`
      SELECT property_id AS "propertyId", property_name AS "propertyName", city, created_at AS "createdAt",
             fh_status AS "fhStatus", pre_post AS "prePost",
             gmb_status AS "gmbStatus", gmb_sub_status AS "gmbSubStatus",
             listing_type AS "listingType", number, review_link_tracker AS "reviewLinkTracker",
             gmb_rating AS "gmbRating", gmb_review_count AS "gmbReviewCount"
      FROM gmb_tracker
      ORDER BY CAST(property_id AS INTEGER) ASC
    `;

    // Summary stats
    const stats = {
      total,
      gmbLive:    rows.filter((r) => r.gmbStatus?.toLowerCase() === "live").length,
      gmbNotLive: rows.filter((r) => r.gmbStatus?.toLowerCase() !== "live").length,
      fhLive:     rows.filter((r) => r.fhStatus?.toLowerCase()  === "live").length,
      preset:     rows.filter((r) => r.prePost?.toLowerCase()   === "preset").length,
      postset:    rows.filter((r) => r.prePost?.toLowerCase()   === "postset").length,
      avgRating:  (() => {
        const vals = rows.map((r) => parseFloat(r.gmbRating)).filter((v) => !isNaN(v));
        return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
      })(),
    };

    return Response.json({ rows, stats });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
