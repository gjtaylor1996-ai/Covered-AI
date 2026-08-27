import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { retrieveInquiry, verifyWebhookSignature } from "@/lib/persona";

/**
 * Persona's source of truth for idVerificationStatus. "approved" ->
 * verified. Anything else (declined, failed, needs_review, expired) is
 * left at "pending" rather than auto-rejected — a false negative here
 * blocks someone from getting work, so ambiguous or negative automated
 * results fall through to the admin verification queue instead of an
 * automated rejection. Same admin-assisted, human-in-the-loop pattern
 * as right-to-work/DBS, and the same design this replaced from the old
 * Onfido integration (its "consider" result got the same treatment).
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get("persona-signature");
  const body = await request.text();
  if (!verifyWebhookSignature(body, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const payload = JSON.parse(body) as {
    data: { attributes: { name: string; payload: { data: { id: string; type: string } } } };
  };
  const event = payload.data.attributes;
  if (event.payload.data.type !== "inquiry" || event.name !== "inquiry.approved") {
    return NextResponse.json({ received: true });
  }

  const inquiry = await retrieveInquiry(event.payload.data.id);
  if (inquiry.status === "approved") {
    await db.workerProfile.updateMany({
      where: { personaInquiryId: inquiry.id },
      data: { idVerificationStatus: "verified" },
    });
  }
  // Anything else: leave as "pending" for admin review.

  return NextResponse.json({ received: true });
}
