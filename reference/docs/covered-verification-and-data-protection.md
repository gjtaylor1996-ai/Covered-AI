# Covered — Verification & Data Protection Note

This covers two connected things: what needs verifying before a candidate can appear on the platform, and how that data is handled under UK GDPR.

## 1. What gets verified, and how

| Check | Source | Frequency |
|---|---|---|
| Right to work in the UK | Home Office online right-to-work checking service (share code) | At sign-up, and re-checked before visa/BRP expiry |
| Identity | Certified ID document check (passport/BRP) via a licensed IDV provider | At sign-up |
| Basic/enhanced DBS check | DBS (via an umbrella body/responsible organisation) — only for roles requiring it, e.g. some event or hotel security roles | At sign-up; DBS update service checked periodically |
| Food hygiene certification | Certificate number/QR check against the awarding body (e.g. CIEH, RSPH, Highfield) | At sign-up, re-verified on renewal |
| Personal licence (alcohol) | Cross-check against the issuing local authority's licensing register | At sign-up |
| SIA licence (event stewarding/security) | SIA public register check by licence number | At sign-up, monitored for expiry/revocation |
| First aid certification | Certificate/provider check | At sign-up, re-verified on renewal |
| Bank details for payment | Open Banking-based verification, not manual sort code/account entry | At sign-up |

The platform verifies the **existence and validity** of a certificate against the issuing body — it does not assess someone's competence, since that's what the reliability score and venue feedback are for over time.

Certifications with an expiry date automatically move a profile to "unverified" for that specific credential when they lapse, rather than silently keeping it live — a client should never see a Personal Licence badge that's expired.

## 2. Lawful basis (UK GDPR)

| Data | Lawful basis | Notes |
|---|---|---|
| ID, right-to-work, DBS | Legal obligation / contract (Art. 6(1)(b)/(c)) | Necessary to lawfully place someone in work |
| Attendance & shift history (feeds reliability score) | Legitimate interests (Art. 6(1)(f)) | Balancing test needed: interest in trustworthy staffing vs. worker's interest in not being over-surveilled — see §4 |
| Certifications | Contract (Art. 6(1)(b)) | Needed to match someone to roles requiring them |
| Marketing communications | Consent (Art. 6(1)(a)) | Separate, unbundled opt-in — never bundled with sign-up terms |
| DBS/criminal records data specifically | Also needs a Schedule 1 DPA 2018 condition | This is "special category"-adjacent under UK law; treat with the same care as special category data even though it's technically separate |

## 3. Data minimisation in practice

This is where the reliability model and the data protection posture connect directly:

- Clients see a **score and a plain-language summary**, never raw attendance logs, never which specific other venues a worker has worked for, and never internal notes tied to a named past employer. This limits data exposure and avoids one venue effectively building a dossier on a worker via another venue's records.
- Venue-side confirmation notes ("didn't show up," "excellent, would rebook") are retained against the shift record for scoring purposes but are not shown verbatim to other clients — only their effect on the aggregate score.
- Location data used for distance matching should be **postcode-level, not live GPS tracking** — precise enough to filter by commute distance, without collecting continuous location data nobody asked for.

## 4. The reliability score as a data protection question, specifically

Because the score is built from behavioural history and materially affects whether someone gets offered work, it sits close to "automated decision-making with legal or similarly significant effects" under Art. 22 UK GDPR, even though a human client makes the final booking choice.

To stay on the right side of this:

- The score should **inform, not replace**, a human decision — clients choose who to book; the platform doesn't auto-book people.
- Workers should be able to **see their own score breakdown** and request human review of a specific disputed shift (this also lines up with the anti-gaming appeal path in the scoring model note).
- A **Data Protection Impact Assessment (DPIA)** should be carried out before launch, given the scale of behavioural profiling involved and the effect on someone's ability to get work.

## 5. Retention

- Shift attendance records feeding the score: retained while the account is active plus a defined period after (e.g. 24 months) to allow disputes and reference checks, then anonymised or deleted.
- Right-to-work and DBS records: retained per Home Office / DBS statutory guidance minimums, not indefinitely.
- Deactivated accounts: personal data deleted or anonymised on a set schedule, aggregated/anonymised statistics can be retained (e.g. "average time-to-fill by role") since these no longer identify anyone.

## 6. Worker rights in practice

- **Access**: a worker can see their full reliability breakdown, not just the headline number.
- **Rectification/erasure**: disputed shift records go through the appeal path from the scoring note rather than instant unilateral deletion (since that would let anyone erase inconvenient history), but genuine errors get corrected.
- **Portability**: since the score is meant to travel with the worker rather than lock them into one platform, exportable summary data (not raw logs from individual venues) supports this without leaking third-party data.

## 7. Multi-sided consent, kept separate

Given the number of parties involved (workers, client venues, end guests at some events, e.g. Ascot-style large public events), each relationship needs its own clear notice and lawful basis rather than one blanket privacy policy paragraph:

- Workers: covered above.
- Client venues: standard B2B contract data, staff usage data for billing/reporting.
- Any bystanders/guests photographed or recorded incidentally at event venues: out of scope for this platform's own processing, but worth flagging to clients that their own venue-side obligations (e.g. CCTV, event photography) are separate from Covered's.

This note assumes a UK-only launch. Expansion into the EU or elsewhere would need a jurisdiction-by-jurisdiction review, since DBS-equivalent checks, licensing regimes, and data protection specifics all vary.
