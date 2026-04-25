import { db } from "@/lib/db";

export async function GET() {
  const propCountResult = await db.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) as n FROM property`;
  const propCount = Number(propCountResult[0]?.n ?? 0);
  if (propCount === 0) {
    return Response.json({
      error: "No data — click Sync to DB first",
      properties: [],
      fetchedAt: new Date().toISOString(),
      source: "empty",
    });
  }

  const props = await db.$queryRaw<Array<{
    id: string; name: string; city: string | null;
    fhLiveDate: string | null; fhStatus: string | null;
  }>>`
    SELECT id, name, city, fh_live_date AS "fhLiveDate", fh_status AS "fhStatus"
    FROM property WHERE fh_status IN ('Live', 'SoldOut') ORDER BY id ASC
  `;

  const otaRows = await db.$queryRaw<Array<{
    propertyId: string; ota: string;
    status: string | null; subStatus: string | null;
    liveDate: string | null; otaId: string | null;
  }>>`
    SELECT property_id AS "propertyId", ota, status, sub_status AS "subStatus",
           live_date AS "liveDate", ota_id AS "otaId"
    FROM ota_listing
  `;

  const otaMap = new Map<string, Record<string, {
    status: string | null; subStatus: string | null;
    liveDate: string | null; otaId: string | null;
  }>>();
  for (const row of otaRows) {
    if (!otaMap.has(row.propertyId)) otaMap.set(row.propertyId, {});
    otaMap.get(row.propertyId)![row.ota] = {
      status: row.status, subStatus: row.subStatus,
      liveDate: row.liveDate, otaId: row.otaId,
    };
  }

  const properties = props.map((p) => ({
    fhId:       p.id,
    name:       p.name,
    city:       p.city ?? "",
    fhLiveDate: p.fhLiveDate,
    fhStatus:   p.fhStatus,
    otas:       otaMap.get(p.id) ?? {},
  }));

  return Response.json({
    properties,
    fetchedAt: new Date().toISOString(),
    source: "db",
  });
}
