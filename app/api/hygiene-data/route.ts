import { db } from "@/lib/db";

export async function GET() {
  try {
    const rows = await db.$queryRaw<Array<{
      propId: string; bdcId: string; propName: string; city: string;
      reviewScore: string; reviewCount: string; preferred: string; geniusLevel: string;
      perfScore: string; topPromotion: string; commissionPct: string; views: string;
      conversionPct: string; pageScore: string; lastChecked: string; syncedAt: string;
    }>>`
      SELECT prop_id AS "propId", bdc_id AS "bdcId", prop_name AS "propName", city,
             review_score AS "reviewScore", review_count AS "reviewCount", preferred, genius_level AS "geniusLevel",
             perf_score AS "perfScore", top_promotion AS "topPromotion", commission_pct AS "commissionPct",
             views, conversion_pct AS "conversionPct", page_score AS "pageScore",
             last_checked AS "lastChecked", synced_at AS "syncedAt"
      FROM hygiene_data
      WHERE id IN (SELECT MAX(id) FROM hygiene_data GROUP BY bdc_id)
      ORDER BY prop_name ASC
    `;
    return Response.json({ rows, fetchedAt: new Date().toISOString() });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
