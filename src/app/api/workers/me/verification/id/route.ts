import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getWorkerProfile } from "@/lib/permissions";
import { isWithinResubmissionCooldown } from "@/lib/verification";
import { createApplicant, createCheck, uploadDocument, uploadLivePhoto } from "@/lib/onfido";

/**
 * Submits a passport/photo ID plus a selfie for Onfido document + facial
 * similarity checks. Plain multipart upload rather than embedding
 * Onfido's Web SDK — keeps the frontend dependency-free, same reasoning
 * as the Stripe Checkout redirects in Phase 3. idVerificationStatus
 * stays "pending" until the check.completed webhook resolves it.
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

  const form = await request.formData().catch(() => null);
  const dateOfBirth = form?.get("dateOfBirth");
  const documentFront = form?.get("documentFront");
  const livePhoto = form?.get("livePhoto");
  if (
    typeof dateOfBirth !== "string" ||
    !(documentFront instanceof File) ||
    !(livePhoto instanceof File)
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const nameParts = worker.name.split(" ").filter(Boolean);
  const firstName = nameParts[0] ?? worker.name;
  const lastName = nameParts.slice(1).join(" ") || firstName;

  let applicantId = worker.onfidoApplicantId;
  if (!applicantId) {
    const applicant = await createApplicant(firstName, lastName, dateOfBirth);
    applicantId = applicant.id;
  }

  await uploadDocument(applicantId, documentFront, "front");
  const documentBack = form?.get("documentBack");
  if (documentBack instanceof File) {
    await uploadDocument(applicantId, documentBack, "back");
  }
  await uploadLivePhoto(applicantId, livePhoto);

  const check = await createCheck(applicantId);

  const updated = await db.workerProfile.update({
    where: { id: worker.id },
    data: {
      onfidoApplicantId: applicantId,
      onfidoCheckId: check.id,
      idVerificationStatus: "pending",
      idVerificationSubmittedAt: new Date(),
    },
  });

  return NextResponse.json({ worker: updated });
}
