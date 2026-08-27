import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getWorkerProfile } from "@/lib/permissions";
import { isWithinResubmissionCooldown } from "@/lib/verification";
import { createInquiry, generateOneTimeLink } from "@/lib/persona";
import { getAppUrl } from "@/lib/stripe";

/**
 * Starts (or resumes) Persona ID verification. Returns a one-time
 * hosted-flow URL to redirect the browser to — same redirect pattern as
 * Stripe Connect onboarding, and for the same reason: document + selfie
 * capture happens on the provider's own infrastructure, not ours.
 * idVerificationStatus stays "pending" until the inquiry.approved
 * webhook resolves it (or the return redirect's best-effort sync does).
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "worker") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const worker = await getWorkerProfile(session.userId);
  if (!worker) {
    return NextResponse.json({ error: "no_worker_profile" }, { status: 403 });
  }

  if (
    worker.idVerificationStatus === "rejected" &&
    isWithinResubmissionCooldown(worker.idVerificationSubmittedAt)
  ) {
    return NextResponse.json({ error: "resubmission_cooldown" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const dateOfBirth = body?.dateOfBirth;
  if (typeof dateOfBirth !== "string" || !dateOfBirth) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const nameParts = worker.name.split(" ").filter(Boolean);
  const firstName = nameParts[0] ?? worker.name;
  const lastName = nameParts.slice(1).join(" ") || firstName;

  const returnUrl = `${getAppUrl()}/api/workers/me/verification/id/return`;

  let inquiryId = worker.personaInquiryId;
  let oneTimeLink: string | null;
  if (!inquiryId) {
    const inquiry = await createInquiry(firstName, lastName, dateOfBirth, returnUrl);
    inquiryId = inquiry.id;
    oneTimeLink = inquiry.oneTimeLink;
  } else {
    oneTimeLink = await generateOneTimeLink(inquiryId);
  }

  if (!oneTimeLink) {
    return NextResponse.json({ error: "persona_link_unavailable" }, { status: 502 });
  }

  const updated = await db.workerProfile.update({
    where: { id: worker.id },
    data: {
      personaInquiryId: inquiryId,
      idVerificationStatus: "pending",
      idVerificationSubmittedAt: new Date(),
    },
  });

  return NextResponse.json({ worker: updated, url: oneTimeLink });
}
