import { db } from "@/lib/db";
import { OTAS } from "@/lib/constants";

function firstOfMonth(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function dodWindow(now: Date): { labels: string[]; dates: string[] } {
  const labels: string[] = [];
  const dates: string[] = [];
  for (let i = 14; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    labels.push(`${d.getDate()}/${d.getMonth() + 1}`);
    dates.push(d.toISOString().slice(0, 10));
  }
  return { labels, dates };
}

export async function GET() {
  try {
    const now = new Date();

    const countResult = await db.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) as n FROM property`;
    const count = Number(countResult[0]?.n ?? 0);
    if (count === 0) {
      return Response.json({ error: "No data — click Sync to DB in the topbar first" });
    }

    // FH live count — Live + SoldOut (active properties)
    const fhLiveResult = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*) as n FROM property WHERE LOWER(fh_status) IN ('live', 'soldout')
    `;
    const fhLive = Number(fhLiveResult[0]?.n ?? 0);

    const firstOfMon = firstOfMonth(now);

    // Exception OTAs: count 'ready to go live' as live (OTAs not yet formally signed)
    const EXCEPTION_OTAS = ["Ixigo", "Akbar Travels"];

    // Per-OTA metrics — only for active FH properties, using subStatus='live' as canonical signal
    const otaRows = await db.$queryRaw<Array<{
      ota: string; otaLiveCnt: bigint; trackerLiveCnt: bigint;
      trackerMtdCnt: bigint; adjustedLiveCnt: bigint;
    }>>`
      SELECT o.ota,
        SUM(CASE WHEN LOWER(o.sub_status) = 'live' THEN 1 ELSE 0 END) AS "otaLiveCnt",
        SUM(CASE WHEN LOWER(o.sub_status) = 'live' THEN 1 ELSE 0 END) AS "trackerLiveCnt",
        SUM(CASE WHEN o.live_date IS NOT NULL AND o.live_date >= ${firstOfMon} THEN 1 ELSE 0 END) AS "trackerMtdCnt",
        SUM(CASE WHEN LOWER(o.sub_status) IN ('live', 'ready to go live') THEN 1 ELSE 0 END) AS "adjustedLiveCnt"
      FROM ota_listing o
      JOIN property p ON p.id = o.property_id
      WHERE LOWER(p.fh_status) IN ('live', 'soldout')
      GROUP BY o.ota
    `;

    const otaLive:         Record<string, number> = {};
    const adjustedOtaLive: Record<string, number> = {};
    const trackerLive:     Record<string, number> = {};
    const trackerMtd:      Record<string, number> = {};
    for (const ota of OTAS) { otaLive[ota] = 0; adjustedOtaLive[ota] = 0; trackerLive[ota] = 0; trackerMtd[ota] = 0; }
    for (const r of otaRows) {
      otaLive[r.ota]          = Number(r.otaLiveCnt);
      adjustedOtaLive[r.ota]  = EXCEPTION_OTAS.includes(r.ota) ? Number(r.adjustedLiveCnt) : Number(r.otaLiveCnt);
      trackerLive[r.ota]      = Number(r.trackerLiveCnt);
      trackerMtd[r.ota]       = Number(r.trackerMtdCnt);
    }

    // DoD — last 15 days per OTA
    const { labels: dodLabels, dates: refDates } = dodWindow(now);
    const cutoff15 = refDates[0];

    const dodRows = await db.$queryRaw<Array<{ ota: string; d: string; cnt: bigint }>>`
      SELECT ota, DATE(live_date) AS d, COUNT(*) AS cnt
      FROM ota_listing
      WHERE live_date IS NOT NULL AND DATE(live_date) >= ${cutoff15}
      GROUP BY ota, DATE(live_date)
    `;

    const dodByOta: Record<string, number[]> = {};
    for (const ota of OTAS) dodByOta[ota] = new Array(15).fill(0);
    for (const row of dodRows) {
      const idx = refDates.indexOf(row.d);
      if (idx !== -1 && dodByOta[row.ota]) dodByOta[row.ota][idx] = Number(row.cnt);
    }

    // In-TAT / After-TAT counts + avg TAT per OTA (threshold = 15 days, live listings only)
    const tatCountRows = await db.$queryRaw<Array<{
      ota: string; inTatCnt: bigint; afterTatCnt: bigint; avgTat: number | null;
    }>>`
      SELECT o.ota,
        SUM(CASE WHEN LOWER(o.sub_status) = 'live' AND o.tat <= 15 AND o.tat_error = 0 THEN 1 ELSE 0 END) AS "inTatCnt",
        SUM(CASE WHEN LOWER(o.sub_status) = 'live' AND o.tat > 15 THEN 1 ELSE 0 END) AS "afterTatCnt",
        ROUND(AVG(CASE WHEN LOWER(o.sub_status) = 'live' AND o.tat_error = 0 THEN o.tat END)) AS "avgTat"
      FROM ota_listing o
      JOIN property p ON p.id = o.property_id
      WHERE LOWER(p.fh_status) IN ('live', 'soldout')
      GROUP BY o.ota
    `;

    const tatCounts: Record<string, { inTat: number; afterTat: number; avgTat: number | null }> = {};
    for (const ota of OTAS) tatCounts[ota] = { inTat: 0, afterTat: 0, avgTat: null };
    for (const r of tatCountRows) {
      tatCounts[r.ota] = { inTat: Number(r.inTatCnt), afterTat: Number(r.afterTatCnt), avgTat: r.avgTat ?? null };
    }

    // Ready-to-go-live count per OTA (no fhStatus filter — RTGL can predate FH live)
    const rtglRows = await db.$queryRaw<Array<{ ota: string; cnt: bigint }>>`
      SELECT o.ota, COUNT(*) AS cnt
      FROM ota_listing o
      WHERE LOWER(o.status) IN ('ready to go live', 'ready to go live ')
      GROUP BY o.ota
    `;

    const rtglCounts: Record<string, number> = {};
    for (const r of rtglRows) rtglCounts[r.ota] = Number(r.cnt);

    // Monthly in-TAT / after-TAT breakdown per OTA (L12M)
    const l12mCutoff = new Date(now);
    l12mCutoff.setMonth(l12mCutoff.getMonth() - 11);
    const l12mCutoffStr = `${l12mCutoff.getFullYear()}-${String(l12mCutoff.getMonth() + 1).padStart(2, "0")}-01`;

    const tatMonthlyRows = await db.$queryRaw<Array<{
      ota: string; month: string; inTatCnt: bigint; afterTatCnt: bigint;
    }>>`
      SELECT o.ota,
        TO_CHAR(o.live_date, 'YYYY-MM') AS month,
        SUM(CASE WHEN o.tat <= 15 AND o.tat_error = 0 THEN 1 ELSE 0 END) AS "inTatCnt",
        SUM(CASE WHEN o.tat > 15 THEN 1 ELSE 0 END) AS "afterTatCnt"
      FROM ota_listing o
      JOIN property p ON p.id = o.property_id
      WHERE LOWER(p.fh_status) IN ('live', 'soldout')
        AND o.live_date IS NOT NULL
        AND o.live_date >= ${l12mCutoffStr}
      GROUP BY o.ota, TO_CHAR(o.live_date, 'YYYY-MM')
    `;

    const tatMonthly: Record<string, Record<string, { inTat: number; afterTat: number }>> = {};
    for (const ota of OTAS) tatMonthly[ota] = {};
    for (const r of tatMonthlyRows) {
      if (!tatMonthly[r.ota]) tatMonthly[r.ota] = {};
      tatMonthly[r.ota][r.month] = { inTat: Number(r.inTatCnt), afterTat: Number(r.afterTatCnt) };
    }

    // TAT per OTA
    const tatRows = await db.$queryRaw<Array<{ ota: string; avgTat: number | null }>>`
      SELECT o.ota,
        ROUND(AVG(o.live_date::date - p.fh_live_date::date)) AS "avgTat"
      FROM ota_listing o
      JOIN property p ON p.id = o.property_id
      WHERE o.live_date IS NOT NULL AND p.fh_live_date IS NOT NULL
        AND o.live_date::date >= p.fh_live_date::date
      GROUP BY o.ota
    `;

    const tatByOta: Record<string, number | null> = {};
    for (const ota of OTAS) tatByOta[ota] = null;
    for (const row of tatRows) {
      tatByOta[row.ota] = row.avgTat !== null ? Math.round(row.avgTat) : null;
    }

    // Full daily DOD for L12M — used for month×day matrix in individual tab
    const dodFullRows = await db.$queryRaw<Array<{ ota: string; d: string; cnt: bigint }>>`
      SELECT ota, DATE(live_date) AS d, COUNT(*) AS cnt
      FROM ota_listing
      WHERE live_date IS NOT NULL AND live_date >= ${l12mCutoffStr}
      GROUP BY ota, DATE(live_date)
    `;

    const dodFull: Record<string, Record<string, number>> = {};
    for (const r of dodFullRows) {
      if (!dodFull[r.ota]) dodFull[r.ota] = {};
      dodFull[r.ota][r.d] = Number(r.cnt);
    }

    return Response.json({
      fhLive,
      otaLive,
      adjustedOtaLive,
      trackerMtd,
      trackerLive,
      tatCounts,
      tatMonthly,
      rtglCounts,
      dodFull,
      dod: { labels: dodLabels, byOta: dodByOta },
      tatByOta,
      fhColFound: "fhLiveDate",
    });

  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
