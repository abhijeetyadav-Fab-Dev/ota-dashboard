import { db } from "@/lib/db";

function monthKey(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function normalizeSubStatus(s: string | null) {
  if (!s) return "Blank";
  const t = s.trim().toLowerCase();
  if (t === "not live" || t === "others - not live") return "Not Live";
  if (t === "pending at go-mmt") return "Pending at GoMMT";
  if (t === "pending at bdc") return "Pending at Booking.com";
  if (t === "pending at emt") return "Pending at EaseMyTrip";
  if (t === "#n/a") return "Blank";
  return s.trim();
}

type MonthlyPoint = {
  month: string;
  liveListings: number;
  onboarded: number;
  soldRns: number;
  soldRevenue: number;
};

export async function GET() {
  try {
    // Get all table counts using information_schema for PostgreSQL
    const tableNames = await db.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    const tableCounts = await Promise.all(
      tableNames.map(async ({ table_name }) => {
        const result = await db.$queryRaw<Array<{ n: bigint }>>`
          SELECT COUNT(*) as n FROM ${db.$queryRawUnsafe(table_name)}
        `;
        return { table: table_name, rows: Number(result[0]?.n ?? 0) };
      })
    );

    const totals = await db.$queryRaw<{
      properties: bigint;
      otaListings: bigint;
      liveListings: bigint;
      exceptionListings: bigint;
      tatBreaches: bigint;
      avgTat: number | null;
      avgPendingTat: number | null;
    }>`
      SELECT
        (SELECT COUNT(*) FROM property) AS properties,
        (SELECT COUNT(*) FROM ota_listing) AS "otaListings",
        (SELECT COUNT(*) FROM ota_listing WHERE LOWER(COALESCE(sub_status, '')) = 'live') AS "liveListings",
        (SELECT COUNT(*) FROM ota_listing WHERE LOWER(COALESCE(sub_status, '')) = 'exception') AS "exceptionListings",
        (SELECT COUNT(*) FROM ota_listing WHERE tat > 15 AND LOWER(COALESCE(sub_status, '')) NOT IN ('live', 'exception')) AS "tatBreaches",
        (SELECT ROUND(AVG(tat), 1) FROM ota_listing WHERE LOWER(COALESCE(sub_status, '')) = 'live' AND fh_live_date IS NOT NULL) AS "avgTat",
        (SELECT ROUND(AVG(tat), 1) FROM ota_listing WHERE LOWER(COALESCE(sub_status, '')) NOT IN ('live', 'exception')) AS "avgPendingTat"
    `;

    const totalsRow = totals[0];
    const totalOtaListings = Number(totalsRow?.otaListings ?? 0);
    const totalLive = Number(totalsRow?.liveListings ?? 0);
    const totalException = Number(totalsRow?.exceptionListings ?? 0);
    const liveRate = totalOtaListings > 0 ? Number((((totalLive + totalException) / totalOtaListings) * 100).toFixed(1)) : 0;

    const otaBreakdown = await db.$queryRaw<Array<{
      ota: string; live: bigint; exception: bigint; inProcess: bigint; tatExhausted: bigint;
    }>>`
      SELECT ota,
        SUM(CASE WHEN LOWER(COALESCE(sub_status, '')) = 'live' THEN 1 ELSE 0 END) AS live,
        SUM(CASE WHEN LOWER(COALESCE(sub_status, '')) = 'exception' THEN 1 ELSE 0 END) AS exception,
        SUM(CASE WHEN LOWER(COALESCE(sub_status, '')) NOT IN ('live', 'exception') AND tat <= 15 THEN 1 ELSE 0 END) AS "inProcess",
        SUM(CASE WHEN LOWER(COALESCE(sub_status, '')) NOT IN ('live', 'exception') AND tat > 15 THEN 1 ELSE 0 END) AS "tatExhausted"
      FROM ota_listing
      GROUP BY ota
      ORDER BY COUNT(*) DESC
    `;

    const cityRows = await db.$queryRaw<Array<{
      city: string; listings: bigint; live: bigint; exception: bigint; avgTat: number | null;
    }>>`
      SELECT
        COALESCE(NULLIF(TRIM(p.city), ''), 'Unknown') AS city,
        COUNT(*) AS listings,
        SUM(CASE WHEN LOWER(COALESCE(o.sub_status, '')) = 'live' THEN 1 ELSE 0 END) AS live,
        SUM(CASE WHEN LOWER(COALESCE(o.sub_status, '')) = 'exception' THEN 1 ELSE 0 END) AS exception,
        ROUND(AVG(CASE WHEN o.tat > 0 THEN o.tat END), 1) AS "avgTat"
      FROM ota_listing o
      JOIN property p ON p.id = o.property_id
      GROUP BY COALESCE(NULLIF(TRIM(p.city), ''), 'Unknown')
      HAVING COUNT(*) > 0
      ORDER BY listings DESC
      LIMIT 10
    `;

    const cities = cityRows.map((r) => ({
      ...r,
      listings: Number(r.listings),
      live: Number(r.live),
      exception: Number(r.exception),
      liveRate: r.listings > 0 ? Number((((Number(r.live) + Number(r.exception)) / Number(r.listings)) * 100).toFixed(1)) : 0,
    }));

    const subStatusRaw = await db.$queryRaw<Array<{ subStatus: string | null; total: bigint }>>`
      SELECT sub_status AS "subStatus", COUNT(*) AS total
      FROM ota_listing
      GROUP BY sub_status
      ORDER BY total DESC
    `;

    const subStatusMap = new Map<string, number>();
    for (const row of subStatusRaw) {
      const key = normalizeSubStatus(row.subStatus);
      subStatusMap.set(key, (subStatusMap.get(key) ?? 0) + Number(row.total));
    }
    const subStatusDistribution = [...subStatusMap.entries()]
      .map(([subStatus, total]) => ({ subStatus, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const monthlyMap = new Map<string, MonthlyPoint>();
    const liveRows = await db.$queryRaw<Array<{ liveDate: string }>>`
      SELECT live_date AS "liveDate"
      FROM ota_listing
      WHERE live_date IS NOT NULL
      ORDER BY live_date
    `;
    for (const row of liveRows) {
      const month = monthKey(row.liveDate);
      const current = monthlyMap.get(month) ?? { month, liveListings: 0, onboarded: 0, soldRns: 0, soldRevenue: 0 };
      current.liveListings += 1;
      monthlyMap.set(month, current);
    }

    const onboardedRows = await db.$queryRaw<Array<{ fhLiveDate: string }>>`
      SELECT fh_live_date AS "fhLiveDate"
      FROM property
      WHERE fh_live_date IS NOT NULL
      ORDER BY fh_live_date
    `;
    for (const row of onboardedRows) {
      const month = monthKey(row.fhLiveDate);
      const current = monthlyMap.get(month) ?? { month, liveListings: 0, onboarded: 0, soldRns: 0, soldRevenue: 0 };
      current.onboarded += 1;
      monthlyMap.set(month, current);
    }

    const soldRows = await db.$queryRaw<Array<{ sold_date: string; soldRns: bigint; soldRevenue: number }>>`
      SELECT sold_date AS "sold_date", SUM(rns) as "soldRns", ROUND(SUM(revenue), 0) as "soldRevenue"
      FROM rns_sold
      GROUP BY sold_date
      ORDER BY sold_date
    `;
    for (const row of soldRows) {
      const month = monthKey(row.sold_date);
      const current = monthlyMap.get(month) ?? { month, liveListings: 0, onboarded: 0, soldRns: 0, soldRevenue: 0 };
      current.soldRns += Number(row.soldRns ?? 0);
      current.soldRevenue += Number(row.soldRevenue ?? 0);
      monthlyMap.set(month, current);
    }

    const monthlyTrend = [...monthlyMap.values()]
      .sort((a, b) => {
        const da = new Date(`01 ${a.month}`);
        const dbb = new Date(`01 ${b.month}`);
        return da.getTime() - dbb.getTime();
      })
      .slice(-12);

    let biggestRise: { month: string; delta: number } | null = null;
    let biggestDrop: { month: string; delta: number } | null = null;
    for (let i = 1; i < monthlyTrend.length; i += 1) {
      const delta = monthlyTrend[i].liveListings - monthlyTrend[i - 1].liveListings;
      if (!biggestRise || delta > biggestRise.delta) biggestRise = { month: monthlyTrend[i].month, delta };
      if (!biggestDrop || delta < biggestDrop.delta) biggestDrop = { month: monthlyTrend[i].month, delta };
    }

    const lowestCity = [...cities]
      .filter((c) => c.listings >= 20)
      .sort((a, b) => a.liveRate - b.liveRate)[0] ?? null;

    const topOta = [...otaBreakdown]
      .sort((a, b) => (Number(b.live) + Number(b.exception) + Number(b.inProcess) + Number(b.tatExhausted)) - (Number(a.live) + Number(a.exception) + Number(a.inProcess) + Number(a.tatExhausted)))[0] ?? null;

    const executiveSummary = [
      `${Number(totalsRow?.properties ?? 0).toLocaleString()} FH properties map to ${totalOtaListings.toLocaleString()} OTA listings, with an effective live rate of ${liveRate}%.`,
      topOta ? `${topOta.ota} currently carries the largest listing base, making it the highest-impact channel for operational improvements.` : "No OTA channel summary is available yet.",
      totalsRow?.avgTat !== null ? `Average live listing TAT is ${totalsRow.avgTat} days, while pending listings average ${totalsRow.avgPendingTat ?? 0} days.` : "TAT metrics are incomplete, so turnaround insight is limited.",
      biggestDrop && biggestDrop.delta < 0 ? `The sharpest monthly decline in listings occurred in ${biggestDrop.month} (${biggestDrop.delta.toLocaleString()}).` : "No significant monthly listing drop was detected in the latest 12-month view.",
      lowestCity ? `${lowestCity.city} shows the weakest live performance among large cities at ${lowestCity.liveRate}% live rate and should be reviewed first.` : "No city-level risk segment crossed the minimum volume threshold.",
      `There are ${Number(totalsRow?.tatBreaches ?? 0).toLocaleString()} listings beyond the TAT threshold, so backlog clearance should remain a priority.`
    ];

    const recommendations = [
      `Prioritize TAT-breached listings first, especially in cities and OTAs with the lowest live rate.`,
      `Use the OTA mix and sub-status distribution to assign owner-specific cleanup for Revenue, Supply/Operations, and pending-at-OTA buckets.`,
      `Track listing growth monthly against onboarding and sold RNS to separate inventory expansion from performance gains.`,
    ];

    return Response.json({
      profile: { tables: tableCounts.length, tableCounts },
      kpis: {
        properties: Number(totalsRow?.properties ?? 0),
        otaListings: totalOtaListings,
        liveListings: totalLive,
        exceptionListings: totalException,
        tatBreaches: Number(totalsRow?.tatBreaches ?? 0),
        avgTat: totalsRow?.avgTat ?? null,
        avgPendingTat: totalsRow?.avgPendingTat ?? null,
        liveRate,
      },
      charts: {
        monthlyTrend,
        otaBreakdown: otaBreakdown.map(r => ({
          ...r,
          live: Number(r.live),
          exception: Number(r.exception),
          inProcess: Number(r.inProcess),
          tatExhausted: Number(r.tatExhausted),
        })),
        cities,
        subStatusDistribution,
      },
      insights: {
        biggestRise,
        biggestDrop,
        lowestCity,
        topOta,
      },
      executiveSummary,
      recommendations,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
