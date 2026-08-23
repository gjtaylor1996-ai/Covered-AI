import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getVenueMembership } from "@/lib/permissions";

/** Add/remove a favourite — spec §4. Toggles based on current state. */
export async function POST(
  request: NextRequest,
  { params }: { params: { workerId: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "venue_admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const membership = await getVenueMembership(session.userId);
  if (!membership) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const worker = await db.workerProfile.findUnique({ where: { id: params.workerId } });
  if (!worker) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const existing = await db.favourite.findUnique({
    where: { venueId_workerId: { venueId: membership.venueId, workerId: worker.id } },
  });

  if (existing) {
    await db.favourite.delete({ where: { id: existing.id } });
    return NextResponse.json({ isFavourite: false });
  }

  await db.favourite.create({ data: { venueId: membership.venueId, workerId: worker.id } });
  return NextResponse.json({ isFavourite: true });
}
