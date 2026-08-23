import Stripe from "stripe";

let cached: Stripe | null = null;

/**
 * Lazily constructed so pages/routes that never touch payments still
 * work without STRIPE_SECRET_KEY set (e.g. local dev before the user
 * has created a Stripe account). Anything that actually calls this
 * without the key configured gets a clear error instead of a silent
 * no-op or a build-time crash.
 */
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set — payments are configured but no Stripe account is connected yet. See .env.example."
    );
  }
  cached = new Stripe(key, { apiVersion: "2025-02-24.acacia" });
  return cached;
}

/** Absolute base URL for Stripe redirect targets (Account Links, Checkout). */
export function getAppUrl(): string {
  const url = process.env.APP_URL;
  if (!url) {
    throw new Error("APP_URL is not set — required to build Stripe redirect URLs. See .env.example.");
  }
  return url.replace(/\/$/, "");
}
