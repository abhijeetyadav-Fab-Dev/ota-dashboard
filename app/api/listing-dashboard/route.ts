import { db } from "@/lib/db";

// Normalize sub-status variants to a canonical label
function normalize(s: string | null): string {
  if (!s) return "Blank";
  const t = s.trim().toLowerCase();
  if (t === "not live" || t === "others - not live") return "Not Live";
  if (t === "pending at go-mmt")  return "Pending at GoMMT";
  if (t === "pending at bdc")     return "Pending at Booking.com";
  if (t === "pending at emt")     return "Pending at EaseMyTrip";
  if (t === "pending at ota")     return "Pending at OTA";
  if (t === "#n/a")               return "Blank";
  return s.trim();
}

// Display order for columns
const COL_ORDER = [
  "Live",
  "Not Live",
  "OTA Team",
  "Pending at GoMMT",
  "Pending at Booking.com",
  "Pending at EaseMyTrip",
  "Pending at OTA",
  "Supply/Operations",
  "Revenue",
  "Exception",
  "Duplicate - Listing Closed",
  "Duplicate - Pending Invoice",
  "Blank",
];

export async function GET() {
  try {
    const countResult = await db.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) as n FROM ota_listing`;
    const count = Number(countResult[0]?.n ?? 0);
    if (count === 0) {
      return Response.json({ error: "No data — sync the DB first" });
    }

    const rows = await db.$queryRaw<Array<{ ota: string; subStatus: string | null; n: bigint }>>`
      SELECT ota, sub_status AS "subStatus", COUNT(*) as n
      FROM ota_listing
      GROUP BY ota, sub_status
    `;

    // Build pivot: { ota -> { subStatus -> count } }
    const pivot: Record<string, Record<string, number>> = {};
    const subStatusSet = new Set<string>();

    for (const row of rows) {
      const label = normalize(row.subStatus);
      subStatusSet.add(label);
      if (!pivot[row.ota]) pivot[row.ota] = {};
      pivot[row.ota][label] = (pivot[row.ota][label] ?? 0) + Number(row.n);
    }

    // Column order: known first, then any extras
    const extras = [...subStatusSet].filter(s => !COL_ORDER.includes(s)).sort();
    const columns = [...COL_ORDER.filter(c => subStatusSet.has(c)), ...extras];

    const otas = Object.keys(pivot).sort((a, b) => (pivot[b]["Live"] ?? 0) - (pivot[a]["Live"] ?? 0));

    // ── KPI stats from Property table ───────────────────────────────────────
    const monthPrefix = new Date().toISOString().slice(0, 7); // e.g. "2026-03"

    const statsResult = await db.$queryRaw<{ live: bigint; soldOut: bigint; total: bigint }>`
      SELECT
        SUM(CASE WHEN fh_status = 'Live'    THEN 1 ELSE 0 END) AS live,
        SUM(CASE WHEN fh_status = 'SoldOut' THEN 1 ELSE 0 END) AS soldOut,
        SUM(CASE WHEN fh_status IN ('Live','SoldOut') THEN 1 ELSE 0 END) AS total
      FROM property
    `;

    const { live, soldOut, total } = statsResult[0];

    const onboardedResult = await db.$queryRaw<Array<{ onboardedThisMonth: bigint }>>`
      SELECT COUNT(*) AS "onboardedThisMonth"
      FROM property
      WHERE fh_live_date LIKE ${monthPrefix + '%'}
    `;

    const mtdResult = await db.$queryRaw<Array<{ mtdListings: bigint }>>`
      SELECT COUNT(*) AS "mtdListings"
      FROM ota_listing
      WHERE live_date LIKE ${monthPrefix + '%'}
    `;

    const { onboardedThisMonth } = onboardedResult[0];
    const { mtdListings } = mtdResult[0];

    const TAT_THRESHOLD = 15;

    const categories = await db.$queryRaw<Array<{
      ota: string; live: bigint; exception: bigint;
      readyToGoLive: bigint; inProcess: bigint; tatExhausted: bigint;
    }>>`
      SELECT ota,
        SUM(CASE WHEN LOWER(sub_status) = 'live' THEN 1 ELSE 0 END) AS live,
        SUM(CASE WHEN LOWER(sub_status) = 'exception' THEN 1 ELSE 0 END) AS exception,
        SUM(CASE WHEN LOWER(COALESCE(status,'')) = 'ready to go live' THEN 1 ELSE 0 END) AS "readyToGoLive",
        SUM(CASE WHEN LOWER(sub_status) != 'live' AND LOWER(COALESCE(sub_status,'')) != 'exception'
                  AND LOWER(COALESCE(status,'')) != 'ready to go live'
                  AND tat <= ${TAT_THRESHOLD} THEN 1 ELSE 0 END) AS "inProcess",
        SUM(CASE WHEN LOWER(sub_status) != 'live' AND LOWER(COALESCE(sub_status,'')) != 'exception'
                  AND LOWER(COALESCE(status,'')) != 'ready to go live'
                  AND tat > ${TAT_THRESHOLD} THEN 1 ELSE 0 END) AS "tatExhausted"
      FROM ota_listing
      GROUP BY ota
      ORDER BY live DESC
    `;

    // ── TAT-exhausted sub-status breakdown (for expandable row) ─────────────
    const tatBreakdownRows = await db.$queryRaw<Array<{ ota: string; subStatus: string | null; n: bigint }>>`
      SELECT ota, sub_status AS "subStatus", COUNT(*) as n
      FROM ota_listing
      WHERE LOWER(sub_status) != 'live'
        AND LOWER(COALESCE(sub_status,'')) != 'exception'
        AND tat > ${TAT_THRESHOLD}
      GROUP BY ota, sub_status
    `;

    const tatBreakdown: Record<string, Record<string, number>> = {};
    const tatSubStatuses = new Set<string>();
    for (const row of tatBreakdownRows) {
      const label = normalize(row.subStatus);
      tatSubStatuses.add(label);
      if (!tatBreakdown[row.ota]) tatBreakdown[row.ota] = {};
      tatBreakdown[row.ota][label] = (tatBreakdown[row.ota][label] ?? 0) + Number(row.n);
    }
    const tatSubStatusList = [...tatSubStatuses].sort();

    // ── TAT stats per OTA (live listings only, for TAT breakdown rows) ─────────
    const tatStatsRows = await db.$queryRaw<Array<{
      ota: string; avgTat: number; d0_7: bigint; d8_15: bigint; d16_30: bigint; d31_60: bigint; d60p: bigint;
    }>>`
      SELECT ota,
        ROUND(AVG(tat)) AS "avgTat",
        SUM(CASE WHEN tat <= 7  THEN 1 ELSE 0 END) AS d0_7,
        SUM(CASE WHEN tat > 7  AND tat <= 15 THEN 1 ELSE 0 END) AS d8_15,
        SUM(CASE WHEN tat > 15 AND tat <= 30 THEN 1 ELSE 0 END) AS d16_30,
        SUM(CASE WHEN tat > 30 AND tat <= 60 THEN 1 ELSE 0 END) AS d31_60,
        SUM(CASE WHEN tat > 60 THEN 1 ELSE 0 END) AS d60p
      FROM ota_listing
      WHERE LOWER(sub_status) = 'live' AND fh_live_date IS NOT NULL
      GROUP BY ota
    `;
    const tatStats: Record<string, { avgTat: number; d0_7: number; d8_15: number; d16_30: number; d31_60: number; d60p: number }> = {};
    for (const r of tatStatsRows) tatStats[r.ota] = { avgTat: r.avgTat, d0_7: Number(r.d0_7), d8_15: Number(r.d8_15), d16_30: Number(r.d16_30), d31_60: Number(r.d31_60), d60p: Number(r.d60p) };

    // ── Sub-status × Status cross-pivot (for OTA detail page breakdown) ─────
    const ssStatusRows = await db.$queryRaw<Array<{ ota: string; subStatus: string | null; status: string | null; n: bigint }>>`
      SELECT ota, sub_status AS "subStatus", status, COUNT(*) as n
      FROM ota_listing
      GROUP BY ota, sub_status, status
    `;
    // shape: { ota → { subStatus → { status → count } } }
    const ssStatusPivot: Record<string, Record<string, Record<string, number>>> = {};
    for (const row of ssStatusRows) {
      const ssLabel = normalize(row.subStatus);
      const stLabel = row.status?.trim() || "Blank";
      if (!ssStatusPivot[row.ota]) ssStatusPivot[row.ota] = {};
      if (!ssStatusPivot[row.ota][ssLabel]) ssStatusPivot[row.ota][ssLabel] = {};
      ssStatusPivot[row.ota][ssLabel][stLabel] = (ssStatusPivot[row.ota][ssLabel][stLabel] ?? 0) + Number(row.n);
    }

    return Response.json({
      pivot, columns, otas,
      stats: {
        live: Number(live), soldOut: Number(soldOut), total: Number(total),
        onboardedThisMonth: Number(onboardedThisMonth), mtdListings: Number(mtdListings)
      },
      categories, tatThreshold: TAT_THRESHOLD, tatBreakdown, tatSubStatusList, tatStats, ssStatusPivot
    });

  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
