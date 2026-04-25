import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { otaListingId, propertyId, field, value, note } = await req.json();

  if (!otaListingId || !propertyId || !field) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Get current listing data
  const listingData = await db.otaListing.findFirst({
    where: { id: otaListingId, propertyId },
    select: { crmNote: true, status: true, subStatus: true, liveDate: true, ota: true, otaId: true, assignedTo: true, tat: true, tatError: true, listingLink: true, prePost: true },
  });

  if (!listingData) return Response.json({ error: "Listing not found" }, { status: 404 });

  const oldValue = field === "note" ? listingData.crmNote : (listingData as any)[field];

  // Role guard: interns can only update their OTA
  if (session.role === "intern" && session.ota && listingData.ota !== session.ota) {
    return Response.json({ error: "Permission denied" }, { status: 403 });
  }

  // Update the field
  const updateData: Record<string, any> = {
    crmUpdatedAt: now,
    updatedBy: session.id,
  };
  if (field === "note") {
    updateData.crmNote = value;
  } else {
    updateData[field] = value;
  }

  await db.otaListing.update({
    where: { id: otaListingId },
    data: updateData,
  });

  // Write log
  await db.propertyLog.create({
    data: {
      propertyId,
      otaListingId,
      userId: session.id,
      action: field === "note" ? "note_added" : "field_updated",
      field: field === "note" ? null : field,
      oldValue: field === "note" ? null : oldValue,
      newValue: field === "note" ? null : value,
      note: field === "note" ? value : (note ?? null),
      createdAt: now,
    },
  });

  return Response.json({ ok: true, updatedAt: now });
}
