# Covered — app

Real implementation of the Covered hospitality staffing marketplace, built
per `reference/docs/covered-technical-spec.md`. See `../CLAUDE.md` (in the
parent Downloads folder) for the full build brief and phasing rationale.

This is a fresh codebase — `reference/prototypes/*.html` are the click-through
UI/UX mockups that informed the design; they are not extended in place.

## Status: Phase 3 — Payments

Per spec §8.1: Phase 0 (foundations), Phase 1 (core booking loop),
Phase 2 (Reliability Score / Venue Trust Score, two-way feedback), and
Phase 3 (Stripe Connect payments) are built. Phase 3 is **code-complete
but not live-tested** — it needs a real Stripe account, which only you
can create (see "Stripe setup" below). Everything through Phase 2 is
verified against a live database in the browser, not just typechecked;
see `src/lib/scoring.ts` and `src/lib/venue-trust.ts` for the
interpretation notes on two spec ambiguities that surfaced
(venue_confirmation_rate vs. attendance_rate_weighted sharing one
underlying field, and the "late cancellation" tier vs. §3.1's binary
4-hour rule).

What's here:
- **Auth** — email/password signup, login, logout via `/api/auth/*`,
  session as an httpOnly JWT cookie (`src/lib/auth.ts`).
- **Core data model** — full Prisma schema (`prisma/schema.prisma`)
  covering every entity in spec §1 plus the corrections in §8.3
  (`Venue`/`VenueMember`, not the original single-owner `VenueProfile`),
  §8.6 (verification `rejected` path), and §8.8 (versioned
  `TermsAcceptance`).
- **Booking loop** — search/filter candidates, shift creation, offer,
  accept/decline, cancel, manual mark-complete
  (`src/app/api/shifts/**`, `src/app/api/candidates`). The cancel
  endpoint and the "declined offer reopens the shift" behaviour aren't
  in the spec's original API surface (§4) — both are gap-fills needed to
  make the documented state machine (§3.1) actually reachable; see the
  code comments where they're implemented.
- **Trust layer** — Reliability Score (`src/lib/scoring.ts`) and Venue
  Trust Score (`src/lib/venue-trust.ts`), computed server-side per spec
  §2.1/§2.3 and recalculated inline whenever new `ShiftFeedback` /
  `VenueFeedback` lands (§6 — there's no job queue yet, so this runs
  synchronously in the request instead of as a background job).
  `GET /api/workers/me/score` and `GET /api/venues/me/trust-score` expose
  the full breakdown to their own owner; `GET /api/workers/[id]` exposes
  only score/tier/summary to venues, enforcing the data-minimisation rule
  from spec §7 at the API layer.
- **Configurable commercial figures** — `src/config/business-rules.ts`
  reads commission rate, hire-fee tiers, and every scoring-formula
  constant (recency window, late-cancellation notice hours, punctuality
  cap, confidence saturation point) from env, not hardcoded, per
  CLAUDE.md.
- **Payments** — Stripe Connect split-payment flow per spec §5: the
  platform charges the venue (rate + commission) and transfers the
  worker's rate to their Connect account, keeping commission as revenue
  (`src/lib/payments.ts`). Worker payout onboarding
  (`/api/workers/me/stripe/connect`) and venue card setup
  (`/api/venues/me/stripe/setup-checkout`) are hosted Stripe redirects,
  not embedded Elements, to keep the frontend dependency-free. Payment is
  attempted automatically when a shift completes and never blocks
  completion — a shift can complete before either side has finished
  Stripe onboarding, in which case `Payment.status` sits at
  `pending_setup` until a manual retry (`POST /shifts/:id/charge`) or the
  next automatic attempt succeeds. `POST /api/webhooks/stripe` is the
  source of truth for account/payment-method state (the redirect
  handlers do a best-effort sync too, in case the user closes the tab).
  None of this is in the spec's original API surface (§4) — it's the
  minimum needed to make "money actually moves" (§8.1) true.
- **CI** — `.github/workflows/ci.yml` runs typecheck/lint/build against a
  throwaway Postgres service container on every PR.

What's explicitly *not* here yet (later phases): real verification
providers, disputes/appeals, admin panel, permanent-hire flow. Don't
build ahead of the phase — see `../CLAUDE.md`.

## Stripe setup (required to test Phase 3)

1. Create a Stripe account (test mode) at https://dashboard.stripe.com/register.
2. Grab a test secret key from https://dashboard.stripe.com/test/apikeys
   and set `STRIPE_SECRET_KEY` in `.env`.
3. Install the [Stripe CLI](https://docs.stripe.com/stripe-cli), then run
   `stripe listen --forward-to localhost:3000/api/webhooks/stripe` — it
   prints a webhook signing secret; set that as `STRIPE_WEBHOOK_SECRET`.
4. Restart `npm run dev`. Sign up as a worker, click "Connect payouts",
   and complete onboarding with Stripe's test data (any values work in
   test mode). Sign up as a venue, click "Add payment method", and use
   test card `4242 4242 4242 4242` with any future expiry/CVC.
5. Complete a shift between them — `Payment.status` should move through
   `charging` → `charged` → `paid_out`.

## Local setup

Requires Node 20+ and Docker (or any local Postgres).

```bash
cp .env.example .env        # then edit AUTH_SECRET at minimum
docker compose up -d        # starts local Postgres on :5432
npm install
npm run prisma:migrate      # creates the schema in the dev database
npm run dev                 # http://localhost:3000
```

## Environments

Three separate Postgres databases and `.env` files are expected:
development (local, via `docker-compose.yml`), staging, and production.
Each environment's `DATABASE_URL` and `AUTH_SECRET` must be distinct —
never share a database or signing secret across environments. Staging and
production hosting (e.g. Vercel + a managed Postgres provider) isn't
provisioned here since that requires your own cloud accounts; wire up
`AUTH_SECRET`/`DATABASE_URL` as secrets in whatever CI/CD or hosting
platform you choose.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` / `npm run start` | Production build/run |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Next/ESLint |
| `npm run prisma:migrate` | Create/apply a dev migration |
| `npm run prisma:studio` | Browse the database |

## Non-negotiable constraints (see `../CLAUDE.md`)

- No automated process may resolve a `Dispute` or set a reliability score
  outside the documented formula (spec §2, §3.2) — human-in-the-loop only.
- Venues never see a worker's raw shift log or other venues worked for —
  enforce at the API layer, not just the UI.
- A permanent-hire conversion fee must always be offered alongside the
  extended-hire alternative (spec §2.4) — UK Conduct Regulations 2003 reg. 10.
- A DPIA is required before processing behavioural scoring data at real
  volume — flag as a blocker before scaling past a small pilot.
