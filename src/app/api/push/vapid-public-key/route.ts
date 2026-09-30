import { NextResponse } from "next/server";

/**
 * The VAPID public key, for the browser's `pushManager.subscribe`
 * (applicationServerKey). Served at request time rather than baked in at
 * build time via NEXT_PUBLIC_* — the key isn't secret (that's the
 * private key's job), and this way it works the moment VAPID_PUBLIC_KEY
 * is set in the environment, no rebuild required. No auth: a worker
 * needs this before they've necessarily done anything else on the page.
 */
export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  return NextResponse.json({ publicKey });
}
