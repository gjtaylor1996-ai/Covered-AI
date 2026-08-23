# Covered — app

Real implementation of the Covered hospitality staffing marketplace, built
per `reference/docs/covered-technical-spec.md`. See `../CLAUDE.md` (in the
parent Downloads folder) for the full build brief and phasing rationale.

This is a fresh codebase — `reference/prototypes/*.html` are the click-through
UI/UX mockups that informed the design; they are not extended in place.

## Status: all six spec phases built

Per spec §8.1: Phase 0 (foundations), Phase 1 (core booking loop),
Phase 2 (Reliability Score / Venue Trust Score), Phase 3 (Stripe Connect
payments), Phase 4 (ID/right-to-work/DBS verification), Phase 5
(dispute queue + admin panel), and Phase 6 (permanent-hire flow,
analytics, demand forecast, quick actions) are all built. Phase 3 and
Phase 4's Onfido piece are **code-complete but not live-tested** — both
need a real external account only you can create (see "Stripe setup" /
"Onfido setup" below, and `SETUP.md` for the consolidated list).
Everything else — Phases 0, 1, 2, 5, and 6 in full — is **verified live**
against the database in the browser, not just typechecked. Phase 6
highlights: the permanent-hire flow was walked through end to end
(propose → worker accepts → fee calculated correctly at £4,800 for a
£24,000 salary and 2 completed shifts → worker confirmed excluded from
that venue's search but still visible to a second venue, per spec
§3.3); the prototype's exact three quick-action presets
(`covered.html`'s `applyQuickAction`) were matched and verified,
including weekend-availability filtering and kitchen-role grouping.
See `src/lib/scoring.ts` and `src/lib/venue-trust.ts` for interpretation
notes on two Phase 2 spec ambiguities (venue_confirmation_rate vs.
attendance_rate_weighted sharing one underlying field, and the
"late cancellation" tier vs. §3.1's binary 4-hour rule).

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
- **Verification** — spec §8.1 Phase 4. ID verification runs through
  Onfido (`src/lib/onfido.ts`): a worker uploads a photo ID and a selfie
  via plain multipart upload (no Onfido SDK embedded, same
  dependency-free approach as Stripe), Onfido runs document + facial
  similarity checks, and `POST /api/webhooks/onfido` resolves
  `idVerificationStatus` — "clear" verifies, anything else (including
  Onfido's own "consider" result) stays pending for a human to look at,
  rather than auto-rejecting a possible false negative. Right to work
  and DBS checks have **no self-serve API in the real world** — see
  "Admin-assisted verification" below — so a worker submits their
  gov.uk share code or DBS application reference
  (`/api/workers/me/verification/{right-to-work,dbs}`) and it sits at
  "pending" until an admin confirms it via
  `POST /api/admin/verification/[workerId]/override`, logged to
  `AdminAuditLog` with who/what/when/why per spec §8.2. The admin queue
  UI is at `/admin/verification`; bootstrap an admin with
  `npm run admin:create -- <email> <password> [role]` since there's no
  public admin signup. A rejected right-to-work/ID check blocks a worker
  from every search result; a rejected DBS only blocks roles that
  actually require one (`REQUIRES_DBS_ROLES` in `.env`) — both enforced
  in `/api/candidates`, spec §8.6.
- **Disputes & admin tooling** — spec §3.2/§4/§8.2. A worker or venue
  disputes a `ShiftFeedback`/`VenueFeedback` record via `POST
  /api/disputes`; automated triage (`src/lib/disputes.ts`) classifies it
  `objective` (a genuinely independent, tamper-resistant timestamp
  exists — in practice, that's a charged Stripe payment on the shift;
  the spec's other example, GPS clock-in/out, was deliberately never
  built, since the verification doc §3 explicitly says location data
  should be postcode-level, not live GPS tracking) or `subjective`
  (nothing to go on but both parties' word). **The triage step never
  sets `status` — only a human can, via `POST
  /api/admin/disputes/[id]/resolve`**, enforced in code, not just
  policy: this is the UK GDPR Article 22 constraint from CLAUDE.md
  actually implemented. Resolution uses optimistic concurrency (§8.7) —
  a stale `expectedUpdatedAt` fails the request cleanly instead of
  silently overwriting a concurrent reviewer's decision. A disputed
  shift is excluded from the Reliability Score while `pending_review`;
  `resolved_excluded` keeps it out permanently, `resolved_upheld` puts
  it back — the spec's scoring doc only says "while under review," but
  a resolution that changes nothing doesn't fit either status's name,
  so this is a considered reading, not an oversight. The admin panel
  (`/admin/dashboard`, `/admin/disputes`, plus the existing
  `/admin/verification`) adds account suspension
  (`POST /api/admin/accounts/[id]/suspend`, restricted to ops_manager+
  per the permission matrix §8.4, blocks login and drops the account
  from candidate search) and the four ops numbers spec §8.2 names
  explicitly (open disputes, fill rate, GMV, verification backlog).
  Every admin action — verification override, dispute resolution,
  suspension — writes to `AdminAuditLog` (§8.2's "who, what, when, why").
- **Depth features (Phase 6)** — spec §2.4/§3.3/§4. The permanent-hire
  flow (`POST /api/hire-requests`, `POST /api/hire-requests/[id]/respond`)
  computes the conversion fee server-side
  (`calculateHireFee` in `src/config/business-rules.ts`) and the venue
  UI always renders both the fee and the extended-hire alternative
  together (never just the fee) — the UK Conduct of Employment Agencies
  and Employment Businesses Regulations 2003 reg. 10 constraint from
  CLAUDE.md. Accepting drops the worker from that specific venue's
  `/api/candidates` results (a query-time filter, not a stored flag, so
  there's nothing to keep in sync if a hire ever falls through) while
  leaving them visible to every other venue, per spec §3.3. Match score
  (`src/lib/matching.ts`) implements spec §2.2 honestly: the distance
  term is neutral (not faked) since geocoding was never built. Quick
  actions and the "book again" row match the prototype's actual
  behaviour (`covered.html`'s `applyQuickAction` and `#book-again-row`)
  rather than inventing new ones — "Need someone tonight" is
  `minReliability=85` + match sort, "Weekend cover" filters on real
  Saturday/Sunday availability (which needed `PATCH /workers/me` to
  finally accept `availability`, spec §4, never wired up before this
  phase), "Kitchen roles" expands to the prototype's exact five-role
  group, and "book again" chains favourite → shift creation → offer
  into the one tap the prototype's copy promises. Venue analytics
  (`/api/venues/me/analytics`) and the demand forecast
  (`/api/venues/me/demand-forecast`) are documented with the exact
  definition used for each number the spec names but doesn't define
  (fill rate, rate benchmark, the forecast's naive seasonal-average
  method) rather than left implicit.
- **CI** — `.github/workflows/ci.yml` runs typecheck/lint/build against a
  throwaway Postgres service container on every PR.

Everything in the spec's six-phase plan is now built. Still out of
scope, flagged rather than silently skipped: the separate
`Certification` model (food hygiene, personal licence, etc.) and its
expiry sweep, which was never part of any single phase's named scope
and is a large enough surface (submission, per-body verification, a
daily expiry cron) to deserve its own pass; real geocoding (distance
filtering and the match-score distance term are both no-ops without
it); a real job queue (score/trust recalculation, dispute triage, and
payment attempts all run inline in the request rather than as
background jobs, per spec §6); and the known limitation noted inline in
the suspend endpoint (an already-active session isn't revoked
mid-session — stateless JWTs with no session store — only new logins
are blocked). See `SETUP.md` for what you need to do to actually run
and test all of this yourself.

## Admin-assisted verification (why, not just how)

The Home Office's right-to-work check has no public API — the actual
mechanism is a worker generating a 9-character share code at
gov.uk/prove-right-to-work, which the checking party looks up manually at
gov.uk/view-right-to-work. DBS checks require being a registered
umbrella body or working through one commercially — also not a
self-serve API signup. Both are fundamentally different blockers than
Stripe/Onfido (which just need a test account you can create yourself in
minutes): there is no sandbox to test against, at any tier, without an
actual business relationship. CLAUDE.md itself allows verification to
"stay partly manual... for a small pilot," so this is the intended shape
for now, not a shortcut — the code tracks submissions and enforces the
resubmission cooldown (§8.6) either way, a human just makes the final
call instead of a webhook.

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

## Onfido setup (required to test ID verification)

1. Create an Onfido account (sandbox/test mode) at https://onfido.com —
   self-serve, no sales contact needed.
2. Dashboard > Developers > API tokens — copy the **test** token into
   `ONFIDO_API_TOKEN`.
3. Dashboard > Developers > Webhooks — create one pointed at
   `{APP_URL}/api/webhooks/onfido`, subscribed to `check.completed`, and
   put its signing token in `ONFIDO_WEBHOOK_TOKEN`. Locally this needs a
   tunnel (e.g. `ngrok http 3000`) since Onfido can't reach `localhost`.
4. Restart `npm run dev`. Sign up as a worker, fill in the ID
   verification form with any photo files — Onfido's sandbox accepts
   arbitrary test images and returns a result within seconds.

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
