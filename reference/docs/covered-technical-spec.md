# Covered — Technical Specification (Developer Handoff)

This document translates the working prototypes and product decisions made so far into an implementation-ready spec: data models, formulas, state machines, and API surface. It assumes the reader is building the real backend — a developer, an agency, or Claude Code — and already has the prototype files and the companion docs (`covered-reliability-scoring-model.md`, `covered-verification-and-data-protection.md`) as design references.

Nothing here is final — commercial numbers (fee percentages, thresholds) are flagged where they're illustrative placeholders rather than validated figures.

---

## 1. Entities

TypeScript-style interfaces, since they map directly onto either a Postgres schema (with a light ORM like Prisma) or API response shapes. Enums are shown as string unions.

```ts
type UserRole = "worker" | "venue_admin";

interface User {
  id: string;            // uuid
  email: string;
  phone: string | null;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
}

type WorkerRole =
  | "Bartender" | "Waiter/Waitress" | "Head Chef" | "Sous Chef"
  | "Chef de Partie" | "Commis Chef" | "Kitchen Porter"
  | "Event Steward" | "Housekeeper" | "Barista" | "Front of House Manager";

type ReliabilityTier = "rising" | "reliable" | "top_rated";
type VerificationStatus = "pending" | "verified" | "rejected";

interface WorkerProfile {
  id: string;
  userId: string;             // FK -> User
  name: string;
  primaryRole: WorkerRole;
  yearsExperience: number;
  hourlyRate: number;
  postcode: string;
  lat: number | null;
  lng: number | null;
  maxTravelDistanceMi: number;
  availability: WeeklyAvailability;
  rightToWorkStatus: VerificationStatus;
  idVerificationStatus: VerificationStatus;
  dbsStatus: VerificationStatus | "not_required";
  reliabilityScore: number | null;   // null until >= MIN_SHIFTS_FOR_SCORE (10)
  reliabilityTier: ReliabilityTier;  // "rising" whenever score is null
  shiftsCompleted: number;
  noShows: number;
  consentGivenAt: string | null;
  bankAccountConnected: boolean;
  createdAt: string;
}

interface DayAvailability {
  enabled: boolean;
  start: string;   // "17:00"
  end: string;     // "23:00"
}
interface WeeklyAvailability {
  monday: DayAvailability;
  tuesday: DayAvailability;
  wednesday: DayAvailability;
  thursday: DayAvailability;
  friday: DayAvailability;
  saturday: DayAvailability;
  sunday: DayAvailability;
}

type CertType =
  | "food_hygiene_l2" | "food_hygiene_l3" | "personal_licence"
  | "silver_service" | "first_aid" | "sia_badge"
  | "barista_l1" | "barista_l2" | "cellar_management"
  | "coshh" | "wine_basics" | "allergen_trained";

interface Certification {
  id: string;
  workerId: string;      // FK -> WorkerProfile
  type: CertType;
  status: "pending" | "verified" | "expired";
  expiryDate: string | null;
  verifiedAt: string | null;
}

type SubscriptionTier = "pay_as_you_go" | "growth" | "enterprise";

interface VenueProfile {
  id: string;
  userId: string;        // FK -> User
  name: string;
  postcode: string;
  lat: number | null;
  lng: number | null;
  subscriptionTier: SubscriptionTier;
  trustScore: number | null;
  trustTier: ReliabilityTier;
  createdAt: string;
}

type ShiftStatus =
  | "open" | "offered" | "accepted" | "declined"
  | "confirmed" | "completed" | "no_show"
  | "cancelled_by_worker" | "cancelled_by_venue";

interface Shift {
  id: string;
  venueId: string;               // FK -> VenueProfile
  workerId: string | null;       // FK -> WorkerProfile, null until matched
  role: WorkerRole;
  date: string;                  // ISO date
  startTime: string;
  endTime: string;
  hourlyRate: number;
  status: ShiftStatus;
  distanceAtMatchMi: number | null;
  offeredAt: string | null;
  respondBy: string | null;      // deadline for worker response
  createdAt: string;
}

interface ShiftFeedback {          // venue -> worker, post-shift
  id: string;
  shiftId: string;                // FK -> Shift, 1:1
  confirmedAttendance: boolean;    // "did they show up and complete it"
  onTime: boolean;
  minutesLate: number | null;
  submittedAt: string;
}

interface VenueFeedback {          // worker -> venue, post-shift (two-way accountability)
  id: string;
  shiftId: string;                 // FK -> Shift, 1:1
  paidOnTime: boolean;
  breaksGiven: boolean;
  matchedDescription: boolean;
  comment: string | null;          // private to the venue, never shown to other workers
  submittedAt: string;
}

type DisputeTargetType = "shift_feedback" | "venue_feedback";
type DisputeCheckType = "objective" | "subjective";
type DisputeStatus = "pending_review" | "resolved_upheld" | "resolved_excluded";

interface Dispute {
  id: string;
  raisedBy: "worker" | "venue";
  targetType: DisputeTargetType;
  targetId: string;                // FK -> ShiftFeedback.id or VenueFeedback.id
  reason: string;
  note: string;
  checkType: DisputeCheckType | null;  // set once automated triage runs
  evidence: string | null;             // what the automated check found, attached for the reviewer
  status: DisputeStatus;
  resolvedAt: string | null;
  resolvedBy: string | null;           // reviewer user id, once a human decides
  createdAt: string;
}

interface Favourite {
  id: string;
  venueId: string;      // FK -> VenueProfile
  workerId: string;     // FK -> WorkerProfile
  createdAt: string;
}

type FeeOption = "conversion_fee" | "extended_hire";
type HireRequestStatus = "pending_worker_response" | "accepted" | "declined";

interface HireRequest {
  id: string;
  venueId: string;                 // FK -> VenueProfile
  workerId: string;                // FK -> WorkerProfile
  proposedRoleTitle: string;
  proposedSalary: number;
  proposedStartDate: string;
  feeOption: FeeOption;
  feeAmount: number | null;        // null if extended_hire chosen
  shiftsCompletedAtRequest: number; // snapshot, for audit trail
  status: HireRequestStatus;
  respondedAt: string | null;
  createdAt: string;
}
```

---

## 2. Core formulas

These are already fully designed in the prototype and the scoring model doc — this section is just the exact math to port into backend code, so nothing gets reinterpreted during implementation.

### 2.1 Reliability Score

```
raw_score =
    0.35 * attendance_rate_weighted   // recent no-shows weighted ~3x older ones
  + 0.20 * punctuality_index
  + 0.15 * (1 - late_cancellation_rate)
  + 0.20 * venue_confirmation_rate
  + 0.10 * confidence_factor         // scales toward 1.0 as shift count grows

reliability_score = round(raw_score * 100)
```

- **Below 10 completed shifts:** display tier as `"rising"` regardless of the numeric score — do not surface a number that looks more confident than the sample size supports.
- **Tier thresholds** (once past the minimum shift count): `>= 93` → `top_rated`, `>= 80` → `reliable`, else → `rising`.
- Distance, experience, and certifications are **never** part of this score — they stay as independent filters. This is a product invariant, not an implementation detail; don't fold them in even if it seems like it would simplify ranking.

### 2.2 Match score (client-side search ranking)

```
match_score = round(
    0.5 * reliability_score
  + 0.3 * max(0, (30 - distance_mi) / 30 * 100)
  + 0.2 * min(experience_years / 12 * 100, 100)
)
```

### 2.3 Venue Trust Score

Same shape as the Reliability Score, deliberately, for consistency across both sides of the marketplace:

```
venue_trust_score = round(
  ( paid_on_time_rate + breaks_given_rate + matched_description_rate ) / 3 * 100
)
```

Tiering uses the same thresholds as §2.1. Individual `VenueFeedback.comment` text is visible only to that venue — never to workers deciding whether to accept a shift, and never to other venues.

### 2.4 Permanent hire conversion fee

```
if shifts_completed_at_request < 15:  rate = 0.20
elif shifts_completed_at_request < 40: rate = 0.12
else:                                   rate = 0.05

fee_amount = proposed_salary * rate
```

**Legal constraint, not optional:** under the UK Conduct of Employment Agencies and Employment Businesses Regulations 2003 (regulation 10), this fee is only enforceable if the venue is also offered the alternative of an extended hire period (modelled here as 8 weeks) at zero fee. The API must always present both options — never charge a fee without the alternative being contractually available. Get this reviewed by an employment lawyer before launch; the rate percentages above are illustrative placeholders, not benchmarked figures.

---

## 3. State machines

### 3.1 Shift

```
open → offered → accepted → confirmed → completed
                → declined
confirmed → no_show | cancelled_by_worker | cancelled_by_venue
```

- Transition to `offered` sets `respondBy` (used for the countdown/urgency UI).
- `cancelled_by_worker` inside the notice-period threshold (< 4 hours before start) should flag the shift for reliability scoring; outside that window it should not affect the score at all.
- `completed` is the trigger for creating both `ShiftFeedback` (venue → worker) and prompting `VenueFeedback` (worker → venue).

### 3.2 Dispute

```
pending_review → resolved_upheld | resolved_excluded
```

- On creation, an automated triage step sets `checkType`:
  - `objective` if the target record has a corroborating timestamped source (GPS clock-in/out, payment processor timestamp) — attach it to `evidence` and fast-track.
  - `subjective` otherwise — no automated evidence, standard human review queue.
- **The automated check never sets `status` directly.** It only populates `checkType` and `evidence`. A human (or an explicit admin action in v1) always makes the `resolved_upheld` / `resolved_excluded` call. This is a deliberate Article 22 (UK GDPR) design constraint, not a v2 nice-to-have — see the verification & data protection doc.

### 3.3 Hire request

```
pending_worker_response → accepted | declined
```

- `accepted` should trigger removing the worker from that venue's active casual search results (they're now a direct employee there) while leaving their Covered profile otherwise intact for other venues.

---

## 4. API surface

Grouped by resource. Auth assumed via bearer token on all except `/auth/*`.

### Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/signup` | Creates `User` + role-specific profile stub |
| POST | `/auth/login` | Returns session token |
| POST | `/auth/logout` | Invalidates session |

### Workers
| Method | Path | Notes |
|---|---|---|
| GET | `/workers/me` | Full profile, own view |
| PATCH | `/workers/me` | Update availability, rate, travel radius |
| POST | `/workers/me/certifications` | Submit a cert for verification |
| GET | `/workers/me/score` | Full factor breakdown (self-view only) |
| GET | `/workers/:id` | Public-facing profile as venues see it (score + tier, not raw log) |

### Venues
| Method | Path | Notes |
|---|---|---|
| GET | `/venues/me` | Own profile |
| PATCH | `/venues/me` | Update details, subscription tier |
| GET | `/venues/me/trust-score` | Own trust score breakdown + recent feedback |
| GET | `/venues/me/analytics` | Fill rate, no-show trend, rate benchmark |
| GET | `/venues/me/demand-forecast` | Predicted shift demand, next 7 days |
| POST | `/venues/me/favourites/:workerId` | Add/remove a favourite |

### Search
| Method | Path | Notes |
|---|---|---|
| GET | `/candidates` | Query params: `role`, `maxDistance`, `minExperience`, `minReliability`, `sort` |

### Shifts
| Method | Path | Notes |
|---|---|---|
| POST | `/shifts` | Venue creates an open shift |
| GET | `/shifts/:id` | Detail |
| POST | `/shifts/:id/offer` | Assign to a specific worker → `offered` |
| POST | `/shifts/:id/respond` | Worker accepts/declines |
| POST | `/shifts/:id/complete` | Venue submits `ShiftFeedback` → `completed` |
| POST | `/shifts/:id/rate-venue` | Worker submits `VenueFeedback` |

### Disputes
| Method | Path | Notes |
|---|---|---|
| POST | `/disputes` | Raise a dispute against a feedback record |
| GET | `/disputes/:id` | Detail incl. `checkType` and `evidence` |
| POST | `/disputes/:id/resolve` | Human reviewer action → terminal status |

### Hire requests
| Method | Path | Notes |
|---|---|---|
| POST | `/hire-requests` | Venue creates, computing `feeAmount` server-side from §2.4 |
| POST | `/hire-requests/:id/respond` | Worker accepts/declines |

---

## 5. Third-party integration points

| Need | Suggested provider(s) | Notes |
|---|---|---|
| Identity / ID verification | Onfido, Persona | At signup |
| Right to work | Home Office online checking service | Re-check before visa/BRP expiry |
| DBS checks | An umbrella/responsible organisation's API | Only for roles that require it |
| Payments (commission + payouts) | Stripe Connect | Split payment: worker gets their rate, venue is charged rate + commission |
| Notifications | SendGrid/Twilio (email/SMS), Firebase Cloud Messaging (push) | Shift countdowns, dispute updates, hire offers |
| Geocoding | Google/Mapbox geocoding API | Postcode → lat/lng for real distance filtering (the prototype's "distance" is a placeholder formula) |

---

## 6. Background jobs

- **Score recalculation** — triggered on new `ShiftFeedback`; recompute `reliabilityScore` and `reliabilityTier`.
- **Venue trust recalculation** — triggered on new `VenueFeedback`.
- **Certification expiry sweep** — daily cron; flip `Certification.status` to `expired` past `expiryDate`, cascading to hide the credential from venue-facing profiles.
- **Automated dispute triage** — triggered on `Dispute` creation; classify `checkType`, attach `evidence` if objective.
- **Shift response deadline reminders** — notify worker as `respondBy` approaches; auto-expire the offer if unanswered.

---

## 7. Non-functional constraints carried over from earlier design docs

- **Data minimisation:** venues never see a worker's raw shift log or which other venues they've worked for — only the score, tier, and a plain-language summary. Enforce this at the API layer, not just in the frontend.
- **DPIA before scaling:** a Data Protection Impact Assessment is a prerequisite for processing behavioural scoring data at real volume, per the verification & data protection doc — not a formality to skip for a pilot.
- **Human-in-the-loop, always:** no automated process may set a `Dispute` to a resolved state or unilaterally adjust a `reliabilityScore` outside the documented formula — this is both a product principle and a UK GDPR Article 22 consideration.
- **Retention:** shift/attendance records retained while the account is active plus a defined window (illustrative: 24 months) for dispute purposes, then anonymised — see the verification doc for the fuller policy.

---

## 8. Addendum: closing the handoff gaps

The sections above describe what the system does. This section covers what a dev team needs to actually start — build order, the internal tooling nobody had specified, a data model correction, and edge cases the original state machines glossed over.

### 8.1 MVP phasing plan

Six phases, each one shippable and testable before the next starts — not six features built in parallel.

| Phase | Scope | "Done" looks like |
|---|---|---|
| **0 — Foundations** | Auth, core data model (User, WorkerProfile, Venue, VenueMember), staging + production environments, CI/CD | A real account can be created and logged into; nothing else works yet |
| **1 — Core booking loop** | Search/filter, shift creation, offer, accept/decline, manual "mark complete" (no scoring yet) | A venue can post a shift and a worker can be booked for it, start to finish, with a human doing what automation will later do |
| **2 — Trust layer** | Reliability Score and Venue Trust Score computed server-side from real shift data; two-way post-shift feedback | Scores actually move based on real completed shifts, matching the formulas in §2 |
| **3 — Payments** | Stripe Connect: commission collection, worker payouts | Money actually moves, not just gets logged |
| **4 — Verification** | Real ID/right-to-work/DBS integrations, replacing manual verification from Phase 0 | A new worker's verification status updates automatically, not via someone manually flipping a database flag |
| **5 — Disputes & admin tooling** | The automated triage logic, the dispute queue, and the internal admin panel (§8.2) | A real reviewer can see a real queue and resolve a real case without touching the database directly |
| **6 — Depth features** | Permanent hire flow, predictive demand, full analytics, quick actions | Everything else already designed and demoed in the prototypes |

The pilot described in the roadmap slide should launch on **Phase 2 or 3**, not Phase 6 — verification can stay partly manual and disputes can be resolved by a founder directly for a small pilot. Building all six phases before talking to a single real venue defeats the point of piloting.

### 8.2 Admin / internal ops panel

Nothing in the original spec describes the tool a human reviewer actually uses — and the entire dispute and verification design depends on that human existing. This needs its own (internal-only, not customer-facing) interface.

```ts
type AdminRole = "reviewer" | "ops_manager" | "super_admin";

interface AdminUser {
  id: string;
  userId: string;        // FK -> User
  role: AdminRole;
  createdAt: string;
}
```

**Screens needed, minimum viable:**
- **Dispute queue** — list filterable by `checkType` and `status`, detail view showing the original record, the raised reason/note, and any attached `evidence`, with resolve actions
- **Verification review queue** — for anything that comes back ambiguous or rejected from an automated provider and needs a person to look at it
- **Account management** — suspend a worker or venue account, manually override a verification status with a logged reason
- **Basic ops dashboard** — open dispute count, fill rate, GMV, pending verification backlog — the numbers a small team actually checks daily

**Additional endpoints:**

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/disputes` | Filterable queue, admin auth required |
| GET | `/admin/verification-queue` | Items needing manual review |
| POST | `/admin/accounts/:id/suspend` | With a required reason, logged |
| POST | `/admin/verification/:id/override` | Manual override, logged with admin user id and reason |

Every admin action here should write an audit log entry (who, what, when, why) — this is the kind of thing that's cheap to build in from day one and expensive to retrofit once you need it for a dispute about a dispute.

### 8.3 Corrected data model: multi-user venue accounts

The original `VenueProfile` was modeled 1:1 with `User`, but the privacy policy and product both assume multiple staff can access one venue's account. Split it:

```ts
interface Venue {
  id: string;
  name: string;
  postcode: string;
  lat: number | null;
  lng: number | null;
  subscriptionTier: SubscriptionTier;
  trustScore: number | null;
  trustTier: ReliabilityTier;
  createdAt: string;
}

type VenueMemberRole = "owner" | "manager" | "staff";

interface VenueMember {
  id: string;
  venueId: string;         // FK -> Venue
  userId: string;          // FK -> User
  role: VenueMemberRole;
  invitedAt: string;
  joinedAt: string | null; // null until the invited person accepts
}
```

Every API endpoint under `/venues/me/*` in §4 now resolves "me" via the requesting user's `VenueMember` row, not a direct `Venue.userId` field — this changes the auth middleware, not the endpoint list itself.

### 8.4 Role-based permission matrix

| Action | Owner | Manager | Staff | Worker | Reviewer/Admin |
|---|---|---|---|---|---|
| Post/edit shifts | ✓ | ✓ | ✓ | | |
| View venue analytics & trust score | ✓ | ✓ | | | ✓ |
| Change subscription tier / billing | ✓ | | | | |
| Invite/remove venue members | ✓ | | | | |
| Create a permanent hire request | ✓ | ✓ | | | |
| Accept/decline a shift | | | | ✓ | |
| Rate a venue / dispute a record | | | | ✓ | |
| Resolve a dispute | | | | | ✓ |
| Suspend an account | | | | | ✓ (ops_manager+) |

Worth treating this table as a starting draft, not gospel — the exact staff/manager split is a product decision as much as an engineering one, and it's easier to loosen permissions later than tighten them after venues have gotten used to broader access.

### 8.5 Platform decision: responsive web, not native, for the MVP

This was left open in the original spec and shouldn't stay open once building starts. Recommendation: **build both the venue dashboard and worker app as a responsive web app (e.g., Next.js), not native iOS/Android**, for the MVP phases (0–5 above). Reasoning:
- Faster to ship and iterate during a pilot, where the product itself is still changing weekly
- No app store review delays blocking urgent fixes
- A "add to home screen" PWA pattern covers most of what a pilot-stage worker actually needs from "an app"
- Native becomes worth the real cost once there's retention data justifying it — not before

Revisit this explicitly as a Phase 6+ decision, informed by real usage data, rather than defaulting to native because the prototype looked like a phone app.

### 8.6 Verification state machine — the missing rejected path

The original `VerificationStatus` type (`pending | verified`) never accounted for a real rejection. Corrected:

```ts
type VerificationStatus = "pending" | "verified" | "rejected";
```

```
pending → verified
pending → rejected → (worker resubmits) → pending
```

- A `rejected` status on `rightToWorkStatus` or `idVerificationStatus` should block the worker from appearing in any venue search, full stop — not just lower their ranking.
- A `rejected` `dbsStatus` should only block roles that actually require a DBS check, not the worker's whole profile.
- Resubmission should be rate-limited (e.g., a cool-down between attempts) to discourage repeated low-quality submissions rather than a genuine correction.

### 8.7 Race conditions and concurrency

Three specific scenarios the state machines didn't address:

- **Double-booking:** two venues attempting to offer overlapping shifts to the same worker. Handle with a server-side conflict check at offer time (reject an offer that overlaps an already-`accepted`/`confirmed` shift for that worker) plus a database-level constraint as the backstop, not just an application-level check.
- **Expiring offers:** a shift sitting in `offered` past its `respondBy` deadline needs a background job to flip it back to `open` automatically — this was implied by the countdown UI in the prototype but never stated as a system requirement.
- **Concurrent dispute resolution:** two reviewers acting on the same dispute simultaneously. Use optimistic concurrency (a version/updatedAt check on the `Dispute` record) so the second resolution attempt fails cleanly rather than silently overwriting the first.

### 8.8 Terms of service acceptance

`WorkerProfile.consentGivenAt` exists; nothing equivalent exists for venues, and neither is versioned. Given terms will change over time, track acceptance as its own record rather than a single timestamp field:

```ts
interface TermsAcceptance {
  id: string;
  userId: string;
  termsVersion: string;   // e.g. "2026-09-01"
  acceptedAt: string;
}
```

This makes "which version of the terms did this person actually agree to" answerable later — something a single boolean or timestamp field can't do once the terms have changed more than once.
