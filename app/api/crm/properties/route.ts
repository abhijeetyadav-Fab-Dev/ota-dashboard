import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search    = searchParams.get("search") ?? "";
  const otaFilter = searchParams.get("ota")    ?? "all";
  const statusFilter = searchParams.get("status") ?? "all";
  const page      = parseInt(searchParams.get("page") ?? "1", 10);
  const limit     = 50;
  const offset    = (page - 1) * limit;

  // Build WHERE conditions for raw SQL - Prisma handles parameter escaping
  const conditions: string[] = [];

  // Role-based filtering
  if (session.role === "intern" && session.ota) {
    conditions.push(`ol.ota = ${session.ota}`);
  } else if (otaFilter !== "all") {
    conditions.push(`ol.ota = ${otaFilter}`);
  }

  if (statusFilter !== "all") {
    conditions.push(`LOWER(ol.sub_status) = LOWER('${statusFilter}')`);
  }

  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(`(p.name ILIKE '${searchPattern}' OR p.id ILIKE '${searchPattern}' OR p.city ILIKE '${searchPattern}')`);
  }

  const whereClause = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

  const rows = await db.$queryRaw<Array<{
    id: string; name: string; city: string; fhStatus: string; fhLiveDate: string;
    ota: string; status: string; subStatus: string; liveDate: string;
    tat: number; tatError: number; assignedTo: string; crmNote: string;
    crmUpdatedAt: string; assignedName: string; logCount: bigint;
    gmbStatus: string; gmbSubStatus: string; listingType: string;
    gmbRating: string; gmbReviewCount: string;
  }>>`
    SELECT p.id, p.name, p.city, p.fh_status AS "fhStatus", p.fh_live_date AS "fhLiveDate",
           ol.ota, ol.status, ol.sub_status AS "subStatus", ol.live_date AS "liveDate", ol.tat, ol.tat_error AS "tatError",
           ol.assigned_to AS "assignedTo", ol.crm_note AS "crmNote", ol.crm_updated_at AS "crmUpdatedAt",
           u.name AS "assignedName",
           (SELECT COUNT(*) FROM property_log pl WHERE pl.property_id = p.id) AS "logCount",
           g.gmb_status AS "gmbStatus", g.gmb_sub_status AS "gmbSubStatus", g.listing_type AS "listingType", g.gmb_rating AS "gmbRating", g.gmb_review_count AS "gmbReviewCount"
    FROM property p
    JOIN ota_listing ol ON ol.property_id = p.id
    LEFT JOIN users u ON u.id = ol.assigned_to
    LEFT JOIN gmb_tracker g ON g.property_id = p.id
    ${whereClause ? db.$queryRawUnsafe(`${whereClause}`) : db.$queryRawUnsafe(``)}
    ORDER BY p.name ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const totalResult = await db.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*) as n FROM property p
    JOIN ota_listing ol ON ol.property_id = p.id
    ${whereClause ? db.$queryRawUnsafe(`${whereClause}`) : db.$queryRawUnsafe(``)}
  `;

  return Response.json({ rows, total: Number(totalResult[0]?.n ?? 0), page, limit });
}
