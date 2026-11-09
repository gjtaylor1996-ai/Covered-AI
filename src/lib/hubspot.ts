import { waitUntil } from "@vercel/functions";
import { db } from "@/lib/db";

/**
 * One-way sync of venue signups and milestones into HubSpot's free CRM.
 * The app database stays the source of truth for usage; HubSpot is where
 * outreach, notes and follow-ups live. Not in the spec.
 *
 * Venues only — workers are not sales leads, and keeping their personal
 * data (including verification status) out of a third-party tool is the
 * data-minimisation choice under UK GDPR.
 *
 * Every export here is a no-op without HUBSPOT_ACCESS_TOKEN, and a failed
 * sync is logged but never blocks the request that triggered it.
 */

const DEFAULT_API_BASE = "https://api.hubapi.com";
const REQUEST_TIMEOUT_MS = 6000;

export const VENUE_STAGES = [
  "prospect",
  "signed_up",
  "onboarded",
  "payment_started",
  "first_shift_posted",
  "first_shift_completed",
] as const;
export type VenueStage = (typeof VENUE_STAGES)[number];

export const VENUE_STAGE_LABELS: Record<VenueStage, string> = {
  prospect: "Prospect",
  signed_up: "Signed up",
  onboarded: "Onboarded",
  payment_started: "Payment set-up started",
  first_shift_posted: "First shift posted",
  first_shift_completed: "First shift completed",
};

export function isHubspotConfigured(): boolean {
  return Boolean(process.env.HUBSPOT_ACCESS_TOKEN);
}

export interface VenueFacts {
  onboarded: boolean;
  paymentConnected: boolean;
  shiftsPosted: number;
  shiftsCompleted: number;
}

/**
 * The furthest milestone the venue has reached. Computed from the facts
 * rather than set per event, so milestones can arrive in any order (a
 * venue can connect payment before finishing the wizard) and the stage
 * never moves backwards.
 */
export function venueStageFor(facts: VenueFacts): VenueStage {
  if (facts.shiftsCompleted > 0) return "first_shift_completed";
  if (facts.shiftsPosted > 0) return "first_shift_posted";
  if (facts.paymentConnected) return "payment_started";
  if (facts.onboarded) return "onboarded";
  return "signed_up";
}

class HubspotError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function hs(
  method: "GET" | "POST" | "PATCH" | "PUT",
  path: string,
  body?: unknown,
  okStatuses: number[] = []
): Promise<{ status: number; data: any }> {
  const base = process.env.HUBSPOT_API_BASE || DEFAULT_API_BASE;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok && !okStatuses.includes(res.status)) {
    throw new HubspotError(
      `HubSpot ${method} ${path} -> ${res.status}: ${typeof data === "string" ? data : data?.message ?? "error"}`,
      res.status
    );
  }
  return { status: res.status, data };
}

async function findCompanyId(venueId: string, name: string): Promise<string | null> {
  // The venue id is the stable key once a record has been linked.
  const byId = await hs("POST", "/crm/v3/objects/companies/search", {
    filterGroups: [{ filters: [{ propertyName: "covered_venue_id", operator: "EQ", value: venueId }] }],
    limit: 1,
  });
  if (byId.data?.results?.[0]) return byId.data.results[0].id;

  // Otherwise adopt an imported prospect with the same name, so a venue
  // from the outreach list moves forward instead of being duplicated.
  const byName = await hs("POST", "/crm/v3/objects/companies/search", {
    filterGroups: [
      {
        filters: [
          { propertyName: "name", operator: "EQ", value: name },
          { propertyName: "covered_venue_id", operator: "NOT_HAS_PROPERTY" },
        ],
      },
    ],
    limit: 1,
  });
  return byName.data?.results?.[0]?.id ?? null;
}

async function upsertCompany(venue: {
  id: string;
  name: string;
  postcode: string;
  createdAt: Date;
  stage: VenueStage;
  shiftsPosted: number;
  shiftsCompleted: number;
}): Promise<string> {
  const properties: Record<string, string | number> = {
    covered_venue_id: venue.id,
    covered_stage: venue.stage,
    covered_signed_up_at: venue.createdAt.toISOString().slice(0, 10),
    covered_shifts_posted: venue.shiftsPosted,
    covered_shifts_completed: venue.shiftsCompleted,
  };
  if (venue.postcode) properties.zip = venue.postcode;

  const existingId = await findCompanyId(venue.id, venue.name);
  if (existingId) {
    await hs("PATCH", `/crm/v3/objects/companies/${existingId}`, { properties });
    return existingId;
  }
  const created = await hs("POST", "/crm/v3/objects/companies", {
    properties: { name: venue.name, ...properties },
  });
  return created.data.id;
}

async function upsertContact(email: string, venueName: string): Promise<string> {
  const properties = { email, company: venueName };
  const updated = await hs(
    "PATCH",
    `/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`,
    { properties },
    [404]
  );
  if (updated.status !== 404) return updated.data.id;
  const created = await hs("POST", "/crm/v3/objects/contacts", { properties });
  return created.data.id;
}

async function runSync(venueId: string): Promise<void> {
  const venue = await db.venue.findUnique({
    where: { id: venueId },
    select: {
      id: true,
      name: true,
      postcode: true,
      createdAt: true,
      onboardingCompletedAt: true,
      stripeCustomerId: true,
      members: {
        where: { role: "owner" },
        take: 1,
        select: { user: { select: { email: true } } },
      },
    },
  });
  if (!venue) return;

  const [shiftsPosted, shiftsCompleted] = await Promise.all([
    db.shift.count({ where: { venueId } }),
    db.shift.count({ where: { venueId, status: "completed" } }),
  ]);

  const stage = venueStageFor({
    onboarded: Boolean(venue.onboardingCompletedAt),
    // A Stripe customer exists once the venue starts card set-up — the same
    // definition the admin Signups page uses. It does not prove a card was
    // saved, hence the stage is called "payment started".
    paymentConnected: Boolean(venue.stripeCustomerId),
    shiftsPosted,
    shiftsCompleted,
  });

  const companyId = await upsertCompany({
    id: venue.id,
    name: venue.name,
    postcode: venue.postcode,
    createdAt: venue.createdAt,
    stage,
    shiftsPosted,
    shiftsCompleted,
  });

  const email = venue.members[0]?.user.email;
  if (email) {
    const contactId = await upsertContact(email, venue.name);
    // Default (unlabelled) contact-to-company association.
    await hs("PUT", `/crm/v4/objects/contacts/${contactId}/associations/default/companies/${companyId}`);
  }
}

/** Syncs one venue now. Never throws. Used by the admin backfill. */
export async function syncVenueToHubspot(venueId: string): Promise<boolean> {
  if (!isHubspotConfigured()) return false;
  try {
    await runSync(venueId);
    return true;
  } catch (err) {
    console.error("[hubspot] venue sync failed", venueId, err);
    return false;
  }
}

/**
 * Fire-and-forget sync for request handlers. On Vercel waitUntil keeps the
 * function alive after the response has been sent, so the user never waits
 * on HubSpot; elsewhere the promise simply runs on.
 */
export function scheduleVenueSync(venueId: string): void {
  if (!isHubspotConfigured()) return;
  waitUntil(syncVenueToHubspot(venueId));
}

/** Looks the venue up by Stripe customer id — the webhook only has that. */
export async function scheduleVenueSyncByStripeCustomer(stripeCustomerId: string): Promise<void> {
  if (!isHubspotConfigured()) return;
  const venue = await db.venue.findUnique({ where: { stripeCustomerId }, select: { id: true } });
  if (venue) scheduleVenueSync(venue.id);
}
