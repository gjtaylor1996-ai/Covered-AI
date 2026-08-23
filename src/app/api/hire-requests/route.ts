import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getVenueMembership, getWorkerProfile } from "@/lib/permissions";
import { calculateHireFee } from "@/config/business-rules";

const schema = z.object({
  workerId: z.string().uuid(),
  proposedRoleTitle: z.string().min(1),
  proposedSalary: z.number().positive(),
  proposedStartDate: z.string(),
  feeOption: z.enum(["conversion_fee", "extended_hire"]),
});

/**
 * Venue creates, computing feeAmount server-side from §2.4 — spec §4.
 * Permission matrix §8.4: owner/manager only, not staff. The
 * UK Conduct of Employment Agencies and Employment Businesses
 * Regulations 2003 reg. 10 constraint from CLAUDE.md — the fee is only
 * enforceable if the extended-hire alternative is offered alongside it
 * — is a UI-level guarantee (both options must always be presented
 * together, never just the fee) rather than something a single POST
 * body can enforce; see the venue hire-request form, which always
 * renders both.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "venue_admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const membership = await getVenueMembership(session.userId);
  if (!membership || (membership.role !== "owner" && membership.role !== "manager")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { workerId, proposedRoleTitle, proposedSalary, proposedStartDate, feeOption } = parsed.data;

  const worker = await db.workerProfile.findUnique({ where: { id: workerId } });
  if (!worker) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const existing = await db.hireRequest.findFirst({
    where: { venueId: membership.venueId, workerId, status: "pending_worker_response" },
  });
  if (existing) {
    return NextResponse.json({ error: "already_pending" }, { status: 409 });
  }

  const feeAmount =
    feeOption === "conversion_fee"
      ? calculateHireFee(proposedSalary, worker.shiftsCompleted)
      : null;

  const hireRequest = await db.hireRequest.create({
    data: {
      venueId: membership.venueId,
      workerId,
      proposedRoleTitle,
      proposedSalary,
      proposedStartDate: new Date(proposedStartDate),
      feeOption,
      feeAmount,
      shiftsCompletedAtRequest: worker.shiftsCompleted,
      status: "pending_worker_response",
    },
  });

  return NextResponse.json({ hireRequest }, { status: 201 });
}

/** Own view — not separately named in spec §4, but both sides need a way to list these. */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  if (session.role === "venue_admin") {
    const membership = await getVenueMembership(session.userId);
    if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const hireRequests = await db.hireRequest.findMany({
      where: { venueId: membership.venueId },
      include: { worker: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ hireRequests });
  }

  const worker = await getWorkerProfile(session.userId);
  if (!worker) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const hireRequests = await db.hireRequest.findMany({
    where: { workerId: worker.id },
    include: { venue: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ hireRequests });
}
