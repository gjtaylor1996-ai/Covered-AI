import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getAdminUser } from "@/lib/permissions";
import { isHubspotConfigured, syncVenueToHubspot } from "@/lib/hubspot";

// Each venue costs about five HubSpot calls, so a batch stays well inside
// a serverless function's time limit. The response says where to resume.
const BATCH_SIZE = 10;

/**
 * Pushes existing venues into HubSpot — the one-off backfill for venues
 * that signed up before the integration was switched on, and a manual
 * repair if a sync was ever missed. Call repeatedly with the returned
 * nextOffset until it is null. Not in the spec.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const admin = await getAdminUser(session.userId);
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isHubspotConfigured()) {
    return NextResponse.json({ error: "hubspot_not_configured" }, { status: 409 });
  }

  const offset = Math.max(0, Number.parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10) || 0);

  const venues = await db.venue.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true },
    skip: offset,
    take: BATCH_SIZE,
  });

  let synced = 0;
  let failed = 0;
  for (const venue of venues) {
    if (await syncVenueToHubspot(venue.id)) synced += 1;
    else failed += 1;
  }

  return NextResponse.json({
    synced,
    failed,
    nextOffset: venues.length === BATCH_SIZE ? offset + BATCH_SIZE : null,
  });
}
