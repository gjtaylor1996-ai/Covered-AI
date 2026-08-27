import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getWorkerProfile } from "@/lib/permissions";
import { retrieveInquiry } from "@/lib/persona";
import { getAppUrl } from "@/lib/stripe";

/**
 * Persona redirects the browser here after the hosted flow. Best-effort
 * sync only — the inquiry.approved webhook is the source of truth for
 * idVerificationStatus (see webhooks/persona/route.ts), since a worker
 * can close the tab before this redirect fires.
 */
export async function GET(request: NextRequest) {
  const appUrl = getAppUrl();
  const session = await getSessionFromRequest(request);
  const worker = session ? await getWorkerProfile(session.userId) : null;

  if (worker?.personaInquiryId) {
    const inquiry = await retrieveInquiry(worker.personaInquiryId);
    if (inquiry.status === "approved") {
      await db.workerProfile.update({
        where: { id: worker.id },
        data: { idVerificationStatus: "verified" },
      });
    }
  }

  return NextResponse.redirect(`${appUrl}/worker/shifts`);
}
