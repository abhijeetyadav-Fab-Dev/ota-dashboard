import { db } from "@/lib/db";
import { NextRequest } from "next/server";

function escapeSql(str: string | null): string {
  if (str === null) return "NULL";
  return "'" + str.replace(/'/g, "''") + "'";
}

export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams;
    const page   = Math.max(1, parseInt(sp.get("page") ?? "1",  10));
    const size   = Math.min(100, parseInt(sp.get("size") ?? "50", 10));
    const search   = (sp.get("search")   ?? "").trim();
    const category = (sp.get("category") ?? "").trim();
    const otaList  = (sp.get("otas") ?? "").split(",").map(s => s.trim()).filter(Boolean);
    const sssList  = (sp.get("sss")  ?? "").split(",").map(s => s.trim()).filter(Boolean);
    const fhMonth  = (sp.get("fhMonth") ?? "").trim();
    const offset   = (page - 1) * size;

    const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    let conditions: string[] = [];

    if (category === "live") {
      conditions.push("LOWER(COALESCE(o.sub_status,'')) = 'live'");
    } else if (category === "exception") {
      conditions.push("LOWER(COALESCE(o.sub_status,'')) = 'exception'");
    } else if (category !== "all" && category !== "") {
      conditions.push("(LOWER(o.sub_status) != 'live' OR o.sub_status IS NULL)");
      conditions.push("LOWER(COALESCE(o.sub_status,'')) != 'exception'");
      if (category === "inProcess")    conditions.push("o.tat <= 15");
      if (category === "tatExhausted") conditions.push("o.tat > 15");
    }

    if (search) {
      conditions.push(`(p.name LIKE ${escapeSql('%' + search + '%')} OR o.property_id LIKE ${escapeSql('%' + search + '%')})`);
    }
    if (otaList.length > 0) {
      conditions.push(`o.ota IN (${otaList.map(escapeSql).join(",")})`);
    }
    if (sssList.length > 0) {
      const rawVals = sssList.flatMap(l => {
        const lower = l.toLowerCase();
        if (lower === "not live") return ["not live", "others - not live"];
        if (lower === "pending at go-mmt") return ["pending at go-mmt"];
        if (lower === "pending at booking.com") return ["pending at bdc"];
        if (lower === "pending at easemytrip") return ["pending at emt"];
        if (lower === "pending at ota") return ["pending at ota"];
        if (lower === "blank") return ["#n/a", ""];
        return [lower];
      });
      conditions.push(`LOWER(COALESCE(o.sub_status,'')) IN (${rawVals.map(escapeSql).join(",")})`);
    }
    if (fhMonth) {
      const [mon, yr] = fhMonth.split(" ");
      const mi = MONTH_NAMES.indexOf(mon ?? "");
      if (mi >= 0 && yr) {
        conditions.push(`p.fh_live_date LIKE '${yr}-${String(mi + 1).padStart(2, "0")}-%'`);
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "WHERE 1=1";

    const rows = await db.$queryRaw`
      SELECT o.property_id AS "propertyId", p.name, p.city, p.fh_live_date AS "fhLiveDate",
             o.ota, o.status, o.sub_status AS "subStatus", o.live_date AS "liveDate", o.tat, o.tat_error AS "tatError"
      FROM ota_listing o
      JOIN property p ON p.id = o.property_id
      WHERE ${db.$queryRawUnsafe(where)}
      ORDER BY o.tat DESC, p.name, o.ota
      LIMIT ${size} OFFSET ${offset}
    `;

    const countRows = await db.$queryRaw`
      SELECT COUNT(*) as n FROM ota_listing o
      JOIN property p ON p.id = o.property_id
      WHERE ${db.$queryRawUnsafe(where)}
    `;

    return Response.json({ 
      rows, 
      total: Number(countRows[0]?.n ?? 0), 
      page, 
      size, 
      pages: Math.ceil(Number(countRows[0]?.n ?? 0) / size) 
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}