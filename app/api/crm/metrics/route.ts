import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");
  const ota        = searchParams.get("ota");
  if (!propertyId || !ota) return Response.json({ error: "propertyId and ota required" }, { status: 400 });

  const rows = await db.$queryRaw<Array<{
    metricKey: string; metricValue: string; updatedBy: string; updatedAt: string;
  }>>`
    SELECT metric_key AS "metricKey", metric_value AS "metricValue", updated_by AS "updatedBy", updated_at AS "updatedAt"
    FROM ota_metrics WHERE property_id = ${propertyId} AND ota = ${ota}
  `;

  const metrics: Record<string, string> = {};
  for (const r of rows) metrics[r.metricKey] = r.metricValue ?? "";

  return Response.json({ metrics });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { propertyId, ota, metricKey, metricValue, valueKey: explicitValueKey } = await req.json();
  if (!propertyId || !ota || !metricKey) {
    return Response.json({ error: "propertyId, ota, metricKey required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Get old value for logging
  const existing = await db.otaMetrics.findFirst({
    where: { propertyId, ota, metricKey },
    select: { metricValue: true },
  });

  // Upsert the metric
  await db.otaMetrics.upsert({
    where: { propertyId_ota_metricKey: { propertyId, ota, metricKey } },
    create: {
      propertyId, ota, metricKey,
      metricValue: metricValue ?? null,
      updatedBy: session.id,
      updatedAt: now,
    },
    update: {
      metricValue: metricValue ?? null,
      updatedBy: session.id,
      updatedAt: now,
    },
  });

  // Only log when the metric VALUE and ALL its companion dates are present.
  // Use explicitValueKey if provided (handles custom date keys like ai_paused_date).
  const isDateKey = metricKey.endsWith("_date");
  const valueKey  = explicitValueKey ?? (isDateKey ? null : metricKey);

  // Only write the log when saving the VALUE key (not a date key)
  if (isDateKey && !explicitValueKey) {
    return Response.json({ ok: true }); // date-only save, no log
  }

  if (!valueKey) return Response.json({ ok: true }); // safety guard

  // Check value is present
  const valueRow = await db.otaMetrics.findFirst({
    where: { propertyId, ota, metricKey: valueKey },
    select: { metricValue: true },
  });

  // Check at least one companion date exists (any key starting with valueKey + "_")
  const dateRows = await db.$queryRaw<Array<{ metricValue: string }>>`
    SELECT metric_value AS "metricValue"
    FROM ota_metrics
    WHERE property_id = ${propertyId} AND ota = ${ota}
      AND metric_key LIKE ${valueKey + "_%"}
      AND metric_value IS NOT NULL AND metric_value != ''
  `;

  const bothPresent = !!(valueRow?.metricValue) && dateRows.length > 0;

  if (bothPresent) {
    const listing = await db.otaListing.findFirst({
      where: { propertyId, ota },
      select: { id: true },
    });

    await db.propertyLog.create({
      data: {
        propertyId,
        otaListingId: listing?.id ?? null,
        userId: session.id,
        action: "metric_updated",
        field: valueKey,
        oldValue: existing?.metricValue ?? null,
        newValue: metricValue ?? null,
        note: null,
        createdAt: now,
      },
    });
  }

  return Response.json({ ok: true });
}
