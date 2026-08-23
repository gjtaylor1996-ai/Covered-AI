import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getWorkerProfile } from "@/lib/permissions";
import { getStripe, getAppUrl } from "@/lib/stripe";

/**
 * Starts (or resumes) Stripe Connect Express onboarding for a worker.
 * Returns a one-time onboarding URL to redirect the browser to — not in
 * the spec's original API surface, but Phase 3 (§8.1) payouts can't
 * happen without it.
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

  const stripe = getStripe();
  const appUrl = getAppUrl();

  let accountId = worker.stripeConnectAccountId;
  if (!accountId) {
    const user = await db.user.findUniqueOrThrow({ where: { id: session.userId } });
    const account = await stripe.accounts.create({
      type: "express",
      country: "GB",
      email: user.email,
      business_type: "individual",
      capabilities: { transfers: { requested: true } },
    });
    accountId = account.id;
    await db.workerProfile.update({
      where: { id: worker.id },
      data: { stripeConnectAccountId: accountId },
    });
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/worker/shifts`,
    return_url: `${appUrl}/api/workers/me/stripe/connect/return`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: accountLink.url });
}
