import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { retrieveCheck, verifyWebhookSignature } from "@/lib/onfido";

/**
 * Onfido's source of truth for idVerificationStatus. "clear" -> verified.
 * Anything else (including "consider", Onfido's own "needs a human to
 * look at this" result) is left at "pending" rather than auto-rejected —
 * a false negative here blocks someone from getting work, so ambiguous
 * results fall through to the admin verification queue instead of an
 * automated rejection. This is the same admin-assisted pattern as
 * right-to-work/DBS, just for the one case Onfido itself flags as
 * uncertain rather than every case.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-sha2-signature");
  const body = await request.text();
  if (!verifyWebhookSignature(body, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const payload = JSON.parse(body) as {
    payload: { resource_type: string; action: string; object: { id: string } };
  };
  if (payload.payload.resource_type !== "check" || payload.payload.action !== "check.completed") {
    return NextResponse.json({ received: true });
  }

  const check = await retrieveCheck(payload.payload.object.id);
  if (check.result === "clear") {
    await db.workerProfile.updateMany({
      where: { onfidoCheckId: check.id },
      data: { idVerificationStatus: "verified" },
    });
  }
  // "consider" or anything else: leave as "pending" for admin review.

  return NextResponse.json({ received: true });
}
