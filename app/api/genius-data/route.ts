import { db } from "@/lib/db";

export async function GET() {
  try {
    const rows = await db.$queryRaw<Array<{
      propId: string; bdcId: string; propName: string; city: string;
      fhStatus: string; bdcStatus: string;
      geniusStatus: string; lastChecked: string; remark: string; syncedAt: string;
    }>>`
      SELECT prop_id AS "propId", bdc_id AS "bdcId", prop_name AS "propName", city, fh_status AS "fhStatus",
             bdc_status AS "bdcStatus",
             genius_status AS "geniusStatus", last_checked AS "lastChecked", remark,
             synced_at AS "syncedAt"
      FROM genius_data
      WHERE id IN (SELECT MAX(id) FROM genius_data GROUP BY bdc_id)
      ORDER BY
        CASE genius_status
          WHEN 'G3' THEN 1 WHEN 'G2' THEN 2 WHEN 'G1' THEN 3
          WHEN 'Not Eligible' THEN 4 WHEN 'Unknown' THEN 5 ELSE 6
        END,
        prop_name ASC
    `;
    return Response.json({ rows, fetchedAt: new Date().toISOString() });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
