import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(_req: Request, { params }: { params: Promise<{ propertyId: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { propertyId } = await params;

  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: { id: true, name: true, city: true, fhStatus: true, fhLiveDate: true },
  });

  if (!property) return Response.json({ error: "Not found" }, { status: 404 });

  // Auto-create OtaListing for GMB if GmbTracker has data and no listing exists yet
  const gmb = await db.gmbTracker.findUnique({
    where: { propertyId },
    select: { gmbStatus: true, gmbSubStatus: true, listingType: true, number: true, reviewLinkTracker: true, gmbRating: true, gmbReviewCount: true, syncedAt: true },
  });

  if (gmb) {
    const existingGmb = await db.otaListing.findFirst({
      where: { propertyId, ota: "GMB" },
      select: { id: true },
    });

    if (!existingGmb) {
      await db.otaListing.create({
        data: {
          propertyId,
          ota: "GMB",
          status: gmb.gmbStatus ?? null,
          subStatus: gmb.gmbSubStatus ?? null,
          syncedAt: gmb.syncedAt,
        },
      });

      // Seed GMB-specific metrics
      const now = new Date().toISOString();
      const seeds: Array<{ key: string; value: string | null }> = [
        { key: "listing_type",       value: gmb.listingType },
        { key: "review_link_status", value: gmb.reviewLinkTracker },
        { key: "gmb_rating",         value: gmb.gmbRating },
        { key: "gmb_review_count",   value: gmb.gmbReviewCount },
      ];
      for (const { key, value } of seeds) {
        if (value) {
          await db.otaMetrics.upsert({
            where: { propertyId_ota_metricKey: { propertyId, ota: "GMB", metricKey: key } },
            create: { propertyId, ota: "GMB", metricKey: key, metricValue: value, updatedAt: now },
            update: { metricValue: value, updatedAt: now },
          });
        }
      }
    }
  }

  const listings = await db.otaListing.findMany({
    where: { propertyId },
    select: {
      id: true, ota: true, status: true, subStatus: true, liveDate: true,
      tat: true, tatError: true, otaId: true, assignedTo: true,
      crmNote: true, crmUpdatedAt: true, prePost: true, listingLink: true,
      assignedToUser: { select: { name: true } },
    },
    orderBy: { ota: "asc" },
  });

  const logs = await db.propertyLog.findMany({
    where: { propertyId },
    select: {
      id: true, otaListingId: true, action: true, field: true,
      oldValue: true, newValue: true, note: true, createdAt: true,
      user: { select: { name: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Transform to match original response shape
  const rows = listings.map(l => ({
    ...l,
    assignedName: l.assignedToUser?.name ?? null,
    otaListingId: l.id,
  }));

  const transformedLogs = logs.map(l => ({
    ...l,
    userName: l.user?.name ?? null,
    userRole: l.user?.role ?? null,
  }));

  return Response.json({ property, listings: rows, logs: transformedLogs });
}
