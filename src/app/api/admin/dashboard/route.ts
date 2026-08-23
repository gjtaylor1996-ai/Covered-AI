import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getAdminUser } from "@/lib/permissions";

/**
 * "Open dispute count, fill rate, GMV, pending verification backlog —
 * the numbers a small team actually checks daily" — spec §8.2. The spec
 * names these four but doesn't define fill rate exactly; taken here as
 * the share of ever-posted shifts that reached at least accepted
 * (open/offered/declined shifts never got filled). GMV is total shift
 * value actually charged (Payment.status charged or paid_out) — the
 * commission is platform revenue, not GMV, so it's shown separately.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const admin = await getAdminUser(session.userId);
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [openDisputeCount, totalShifts, filledShifts, verificationBacklog, payments] =
    await Promise.all([
      db.dispute.count({ where: { status: "pending_review" } }),
      db.shift.count(),
      db.shift.count({
        where: { status: { notIn: ["open", "offered", "declined"] } },
      }),
      db.workerProfile.count({
        where: {
          OR: [
            { rightToWorkStatus: "pending" },
            { idVerificationStatus: "pending" },
            { dbsStatus: "pending" },
          ],
        },
      }),
      db.payment.findMany({
        where: { status: { in: ["charged", "paid_out"] } },
        select: { totalAmountCents: true, commissionAmountCents: true },
      }),
    ]);

  const gmvCents = payments.reduce((sum, p) => sum + p.totalAmountCents, 0);
  const platformRevenueCents = payments.reduce((sum, p) => sum + p.commissionAmountCents, 0);

  return NextResponse.json({
    openDisputeCount,
    fillRate: totalShifts > 0 ? filledShifts / totalShifts : null,
    gmvCents,
    platformRevenueCents,
    verificationBacklog,
  });
}
