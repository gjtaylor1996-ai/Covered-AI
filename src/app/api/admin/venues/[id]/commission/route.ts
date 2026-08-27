import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getAdminUser, writeAuditLog } from "@/lib/permissions";

const schema = z.object({
  // Fraction, e.g. 0.10 for 10%. null clears the override, reverting
  // the venue to the platform default (COMMISSION_RATE).
  commissionRateOverride: z.number().min(0).max(1).nullable(),
  reason: z.string().min(1),
});

/**
 * Sets or clears a venue's negotiated commission rate — a business
 * decision, not something a fixed global constant can express.
 * Restricted to ops_manager+ (same tier as account suspension, per the
 * permission matrix §8.4) since it directly changes platform revenue.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const admin = await getAdminUser(session.userId);
  if (!admin || admin.role === "reviewer") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const venue = await db.venue.findUnique({ where: { id: params.id } });
  if (!venue) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const updated = await db.venue.update({
    where: { id: venue.id },
    data: { commissionRateOverride: parsed.data.commissionRateOverride },
  });

  await writeAuditLog({
    adminId: admin.id,
    action: "venue.commission_override",
    targetType: "Venue",
    targetId: venue.id,
    reason: parsed.data.reason,
  });

  return NextResponse.json({
    venue: { id: updated.id, name: updated.name, commissionRateOverride: updated.commissionRateOverride },
  });
}
