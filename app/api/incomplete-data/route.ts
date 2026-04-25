import { db } from "@/lib/db";

export interface IncompleteRow {
  fhId:      string;
  name:      string;
  city:      string;
  ota:       string;
  otaId:     string | null;
  status:    string | null;
  subStatus: string | null;
  liveDate:  string | null;
  tatError:  number;
  missing:   string[];
}

export async function GET() {
  try {
    const countResult = await db.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) as n FROM property`;
    const count = Number(countResult[0]?.n ?? 0);
    if (count === 0) {
      return Response.json({ error: "No data — click Sync to DB in the topbar first" });
    }

    const rows = await db.$queryRaw<Array<{
      id: string; name: string; city: string | null;
      ota: string; otaId: string | null; status: string | null;
      subStatus: string | null; liveDate: string | null; tatError: number;
    }>>`
      SELECT p.id, p.name, p.city, o.ota, o.ota_id AS "otaId", o.status, o.sub_status AS "subStatus",
             o.live_date AS "liveDate", o.tat_error AS "tatError"
      FROM property p
      JOIN ota_listing o ON o.property_id = p.id
      WHERE (
        -- live listings: otaId, status, or liveDate missing
        (LOWER(COALESCE(o.sub_status,'')) = 'live'
          AND (o.ota_id IS NULL OR o.status IS NULL OR o.live_date IS NULL))
        OR
        -- not-live listings: status or subStatus missing
        (LOWER(COALESCE(o.sub_status,'')) != 'live'
          AND (o.status IS NULL OR o.sub_status IS NULL))
        OR
        -- TAT data errors: negative TAT
        o.tat_error = 1
      )
      ORDER BY p.name, o.ota
    `;

    const out: IncompleteRow[] = [];
    for (const row of rows) {
      const isLive = row.subStatus?.toLowerCase() === "live";
      const missing: string[] = [];

      if (isLive) {
        if (!row.otaId)    missing.push("OTA ID");
        if (!row.status)   missing.push("Status");
        if (!row.liveDate) missing.push("Live Date");
      } else {
        if (!row.status)    missing.push("Status");
        if (!row.subStatus) missing.push("Sub Status");
      }

      if (row.tatError === 1) missing.push("Neg. TAT");

      if (missing.length === 0) continue;

      out.push({
        fhId:      row.id,
        name:      row.name || "—",
        city:      row.city || "",
        ota:       row.ota,
        otaId:     row.otaId,
        status:    row.status,
        subStatus: row.subStatus,
        liveDate:  row.liveDate,
        tatError:  row.tatError,
        missing,
      });
    }

    return Response.json({ rows: out });

  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
