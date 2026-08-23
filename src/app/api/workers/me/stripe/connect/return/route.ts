import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getWorkerProfile } from "@/lib/permissions";
import { getStripe, getAppUrl } from "@/lib/stripe";

/**
 * Stripe redirects the browser here after onboarding. This is a
 * best-effort sync (the account.updated webhook is the source of truth
 * for bankAccountConnected — see webhooks/stripe/route.ts — since a
 * user can close the tab before this redirect fires).
 */
export async function GET(request: NextRequest) {
  const appUrl = getAppUrl();
  const session = await getSessionFromRequest(request);
  const worker = session ? await getWorkerProfile(session.userId) : null;

  if (worker?.stripeConnectAccountId) {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(worker.stripeConnectAccountId);
    await db.workerProfile.update({
      where: { id: worker.id },
      data: { bankAccountConnected: account.payouts_enabled ?? false },
    });
  }

  return NextResponse.redirect(`${appUrl}/worker/shifts`);
}
