import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getAdminUser, writeAuditLog } from "@/lib/permissions";
import { recalculateReliabilityScore } from "@/lib/scoring";

const schema = z.object({
  status: z.enum(["resolved_upheld", "resolved_excluded"]),
  reason: z.string().min(1),
  expectedUpdatedAt: z.string(),
});

/**
 * Human reviewer action → terminal status — spec §4. The automated
 * triage (§3.2) only ever set checkType/evidence; this is the only
 * place Dispute.status can move to a resolved_* value — a hard
 * requirement (Article 22 UK GDPR / CLAUDE.md), not a convention.
 * Optimistic concurrency per §8.7: two reviewers racing on the same
 * dispute — the second one's expectedUpdatedAt won't match and fails
 * cleanly instead of silently overwriting the first.
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
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { status, reason, expectedUpdatedAt } = parsed.data;

  const dispute = await db.dispute.findUnique({ where: { id: params.id } });
  if (!dispute) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (dispute.status !== "pending_review") {
    return NextResponse.json({ error: "already_resolved" }, { status: 409 });
  }

  const { count } = await db.dispute.updateMany({
    where: { id: dispute.id, updatedAt: new Date(expectedUpdatedAt) },
    data: { status, resolvedAt: new Date(), resolvedBy: session.userId },
  });
  if (count === 0) {
    return NextResponse.json({ error: "stale_dispute" }, { status: 409 });
  }

  await writeAuditLog({
    adminId: admin.id,
    action: "dispute.resolve",
    targetType: "Dispute",
    targetId: dispute.id,
    reason,
    metadata: { status },
  });

  // Resolution can change which shifts count toward the score (see
  // getDisputedShiftIds) — recompute for the affected worker.
  if (dispute.targetType === "shift_feedback") {
    const feedback = await db.shiftFeedback.findUnique({
      where: { id: dispute.targetId },
      include: { shift: true },
    });
    if (feedback?.shift.workerId) {
      await recalculateReliabilityScore(feedback.shift.workerId);
    }
  }

  const updated = await db.dispute.findUnique({ where: { id: dispute.id } });
  return NextResponse.json({ dispute: updated });
}
