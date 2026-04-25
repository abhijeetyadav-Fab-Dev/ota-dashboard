import { db } from "@/lib/db";

export async function GET() {
  try {
    // Live OTA listings from live FH properties only
    const rows = await db.$queryRaw<Array<{
      fhId: string; name: string; city: string;
      fhLiveDate: string | null; liveDate: string | null; ota: string; tat: number;
    }>>`
      SELECT
        p.id          AS "fhId",
        p.name        AS "name",
        p.city        AS "city",
        p.fh_live_date AS "fhLiveDate",
        o.live_date    AS "liveDate",
        o.ota         AS "ota",
        o.tat         AS "tat"
      FROM ota_listing o
      JOIN property p ON p.id = o.property_id
      WHERE p.fh_status = 'Live'
        AND LOWER(COALESCE(o.sub_status, '')) = 'live'
      ORDER BY o.tat DESC
    `;

    // Not-live OTA listings from live FH properties (tat = pending days)
    const notLiveRows = await db.$queryRaw<Array<{
      fhId: string; fhLiveDate: string | null; ota: string; tat: number;
    }>>`
      SELECT
        p.id          AS "fhId",
        p.fh_live_date AS "fhLiveDate",
        o.ota          AS "ota",
        o.tat          AS "tat"
      FROM ota_listing o
      JOIN property p ON p.id = o.property_id
      WHERE p.fh_status = 'Live'
        AND LOWER(COALESCE(o.sub_status, '')) != 'live'
    `;

    // Per-OTA aggregates (live rows only)
    const otaStats: Record<string, { count: number; totalTat: number; maxTat: number }> = {};
    for (const r of rows) {
      if (!otaStats[r.ota]) otaStats[r.ota] = { count: 0, totalTat: 0, maxTat: 0 };
      otaStats[r.ota].count++;
      otaStats[r.ota].totalTat += r.tat;
      if (r.tat > otaStats[r.ota].maxTat) otaStats[r.ota].maxTat = r.tat;
    }
    const otaSummary: Record<string, { count: number; avgTat: number; maxTat: number }> = {};
    for (const [ota, s] of Object.entries(otaStats)) {
      otaSummary[ota] = { count: s.count, avgTat: s.count > 0 ? Math.round(s.totalTat / s.count) : 0, maxTat: s.maxTat };
    }

    // TAT bucket distribution
    const buckets = {
      d0_7:   rows.filter(r => r.tat <= 7).length,
      d8_15:  rows.filter(r => r.tat > 7  && r.tat <= 15).length,
      d16_30: rows.filter(r => r.tat > 15 && r.tat <= 30).length,
      d31_60: rows.filter(r => r.tat > 30 && r.tat <= 60).length,
      d60p:   rows.filter(r => r.tat > 60).length,
    };

    const totalTat = rows.reduce((s, r) => s + r.tat, 0);
    const avgTat   = rows.length > 0 ? Math.round(totalTat / rows.length) : 0;
    const maxTat   = rows.length > 0 ? Math.max(...rows.map(r => r.tat)) : 0;

    return Response.json({ rows, notLiveRows, otaSummary, buckets, total: rows.length, avgTat, maxTat });

  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
