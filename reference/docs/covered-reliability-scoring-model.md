# Covered — Reliability Scoring Model

## 1. Purpose

The Reliability Score exists to answer one question for a venue manager: **if I book this person, will they actually turn up, on time, and do the job?**

It is not a general "worker rating." It measures attendance behaviour specifically, because attendance failure (no-shows, late cancellations, lateness) is the single most expensive failure mode in hospitality staffing — a gap on the floor or in the kitchen during service can't be un-happened.

Everything else a client cares about (experience, certifications, distance, rate) is handled as a **separate, transparent filter** — never folded into the score, so the score always means the same thing.

## 2. What feeds the score

| Signal | Weight | Why it's included |
|---|---|---|
| Completed shifts vs. no-shows | 35% | The core signal. A no-show with under 4 hours' notice is weighted far more heavily than a cancellation given a week out. |
| Punctuality | 20% | Minutes late per shift, averaged with recency weighting. Persistent 5-minute lateness matters less than one 90-minute lateness during a Saturday dinner service. |
| Late cancellations (with notice) | 15% | Penalised, but far less than a true no-show — cancelling with 48 hours' notice is normal working life, not unreliability. |
| Venue confirmation after shift | 20% | A simple "did they do the job as booked?" confirmation from the venue, separate from a star rating (see §5). |
| Score volatility / shift count | 10% | New workers with few shifts get a provisional score with a visible "Rising" tier rather than a falsely precise number (see §4). |

Distance, years of experience, certifications, hourly rate, and availability are **not** part of the Reliability Score. They're shown alongside it as independent filters, which is why the platform has four separate controls (role, distance, experience, reliability) rather than one blended "best candidate" ranking that hides its own logic.

## 3. Formula (illustrative)

```
raw_score =
    0.35 * attendance_rate_weighted
  + 0.20 * punctuality_index
  + 0.15 * (1 - late_cancellation_rate)
  + 0.20 * venue_confirmation_rate
  + 0.10 * confidence_factor

reliability_score = round(raw_score * 100)
```

- **attendance_rate_weighted**: no-shows in the last 90 days count roughly 3x a no-show from a year ago. Recent behaviour should move the score faster than old behaviour.
- **confidence_factor**: scales toward 1.0 as shift count grows (see §4), so a person with 3 shifts and a person with 300 shifts are never presented with false equivalence.

The exact weights are a starting hypothesis, not a fixed constant — see §7 on why they need to stay tunable per role and per market.

## 4. Cold start: new workers

A worker with fewer than 10 completed shifts is shown as **"Rising"** rather than given a numeric score that looks equally confident to a 500-shift veteran's. This protects two things at once:

- Clients aren't misled by a small sample (one lucky or unlucky shift shouldn't produce a "97" or a "40").
- New, genuinely reliable workers aren't locked out of getting booked at all — "Rising" is a visible, filterable tier, not a penalty box.

Once past the threshold, the score transitions smoothly to the full model rather than jumping.

## 5. Confirmation, not a star rating

Deliberately, venues do **not** leave 1–5 star reviews. Star ratings on gig platforms skew high, are easy to game with social pressure ("please give me 5 stars"), and often measure likeability rather than reliability.

Instead, after each shift the venue answers one binary question: *"Did [name] show up as booked and complete the shift?"* Yes/no, with an optional short note. This is:

- Harder to inflate or extort
- Directly tied to the thing the score claims to measure
- Fast enough that venues will actually do it (under 5 seconds per shift)

## 6. Anti-gaming safeguards

- **Two-sided accountability.** A shift only counts as a "no-show" if the venue also confirms it was properly booked and not cancelled by the venue itself. Venues cancelling on workers doesn't touch worker scores.
- **Outlier review.** A sudden score collapse (e.g. from one bad week) triggers a manual review flag rather than an immediate visible drop, catching cases like illness, family emergency, or a booking error.
- **No score-buying.** Reliability cannot be purchased, boosted, or "featured" — this is the one part of a profile that stays purely behavioural, since it's the trust layer clients rely on most.
- **Appeal path.** Workers can flag a specific shift record as disputed (e.g. venue no-showed on them, or cancelled after they'd already travelled). Disputed shifts are excluded from the score while under review.
- **Rate limiting on venue confirmations.** A venue can't mass-submit negative confirmations for a worker outside of the normal one-per-shift cadence, to prevent coordinated score attacks.

## 7. Why weights need to stay tunable

A no-show for a solo bartender covering a small event is a different scale of problem than a no-show for one of twelve kitchen porters on a wedding. Longer term, the weighting should be able to flex by:

- **Role** — some roles are harder to backfill same-day than others
- **Shift type** — a one-off event booking vs. an ongoing weekly rota slot
- **Market maturity** — early on, with thinner supply, being too strict on new workers actively hurts client fill rates

This is a reason to build the scoring engine as a configurable model from day one, not a reason to launch without one.

## 8. What clients see vs. what's stored

Clients see: the score (0–100), the tier label (Rising / Reliable / Top rated), and a plain-language "why" line (e.g. *"42 completed shifts, 1 no-show logged, 96% on-time"*).

Clients do **not** see: raw punctuality logs, venue notes tied to specific past employers, or any data that would let one venue identify how a worker performed *for a competitor*. The score is portable and anonymised at the source level — this matters both for worker trust and for GDPR data-minimisation (see the companion verification & data protection note).
