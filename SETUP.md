# Setup checklist — what you need to do

This app is fully built (all six spec phases) and runs against a real
database. Everything in this list is something only you can do — an
account only you can own, a legal/compliance call only you can make, or
a decision the spec deliberately left for a human. Nothing here is
optional busywork; each item blocks a specific piece of real
functionality until it's done.

## Already done for you

- ✅ **Node.js 20+** — installed (v24.19.0) via winget.
- ✅ **Database** — a free Neon Postgres project is live and wired into
  `.env` as `DATABASE_URL`. All migrations are applied.
- ✅ **Auth secret** — `AUTH_SECRET` in `.env` is already a real random
  value, not a placeholder.
- ✅ **Codebase** — committed to a local git repo at `covered-app/`
  (5 commits, one per build phase). Not pushed anywhere; you own that
  decision (see "Optional: push to a remote" at the bottom).

Everything below is genuinely on you.

---

## 1. Stripe — required for payments (Phase 3) to actually charge/pay anyone

Right now, completed shifts sit at `Payment.status = "pending_setup"`
forever because there's no Stripe account behind `STRIPE_SECRET_KEY`.

1. Go to **[dashboard.stripe.com/register](https://dashboard.stripe.com/register)** and create an account (test mode is the default — no card required, no business verification needed to start testing).
2. **Dashboard → Developers → API keys** — copy the **test** secret key (starts `sk_test_`).
3. Open `covered-app/.env` and set:
   ```
   STRIPE_SECRET_KEY="sk_test_..."
   ```
4. Install the [Stripe CLI](https://docs.stripe.com/stripe-cli) (`winget install Stripe.StripeCli` works on Windows), then run, in a separate terminal, from the `covered-app` folder:
   ```bash
   stripe login
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
   This prints a webhook signing secret (`whsec_...`). Put it in `.env`:
   ```
   STRIPE_WEBHOOK_SECRET="whsec_..."
   ```
   Leave this `stripe listen` command running whenever you're testing payments locally — it's what forwards Stripe's events to your dev server.
5. Restart `npm run dev` so the new env vars load.
6. Test it: sign up as a worker → "Connect payouts" → Stripe's onboarding form accepts any fake test data (e.g. DOB, a fake UK address, test bank details `GB29 NWBK 6016 1331 9268 19`). Sign up as a venue → "Add payment method" → use test card `4242 4242 4242 4242`, any future expiry, any CVC. Complete a shift between them and watch `Payment.status` move through the states on the shift detail page.

**Later, for real production use:** you'll need to activate the Stripe account (business details, bank account) and switch to live keys — that's a bigger step than this checklist covers, and shouldn't happen before the legal items in section 4 are resolved.

## 2. Onfido — required for ID verification (Phase 4) to resolve automatically

Right now, ID verification submissions fail immediately because
`ONFIDO_API_TOKEN` is empty.

1. Go to **[onfido.com](https://onfido.com)** and sign up — self-serve, sandbox/test mode, no sales call needed.
2. **Dashboard → Developers → API tokens** — copy the **test** token.
3. In `.env`:
   ```
   ONFIDO_API_TOKEN="test_..."
   ```
4. Webhook setup needs your dev server to be reachable from the internet (Onfido can't call `localhost`). Install [ngrok](https://ngrok.com/download) (free tier is fine), then:
   ```bash
   ngrok http 3000
   ```
   This gives you a public URL like `https://abcd1234.ngrok-free.app`. Update `.env`:
   ```
   APP_URL="https://abcd1234.ngrok-free.app"
   ```
5. **Onfido Dashboard → Developers → Webhooks** — add a webhook pointed at `{APP_URL}/api/webhooks/onfido` (using the ngrok URL from step 4), subscribed to the `check.completed` event. Copy its signing token into `.env`:
   ```
   ONFIDO_WEBHOOK_TOKEN="..."
   ```
6. Restart `npm run dev` (keep `ngrok` running in its own terminal alongside it). Sign up as a worker, fill in the ID verification form with any image files — Onfido's sandbox accepts arbitrary test images and returns a result (usually "clear") within seconds.

Note: `ngrok`'s free-tier URL changes every time you restart it, so you'll need to re-do step 5 (or step 4+5) each time you restart `ngrok` for local testing. This is only a local-dev inconvenience — in staging/production, `APP_URL` is your real deployed domain and stays stable.

## 3. Admin account — required to review verifications and resolve disputes

There's no public admin signup by design (spec §8.2 assumes admins are
provisioned out-of-band, not self-registered). From the `covered-app`
folder:

```bash
npm run admin:create -- you@example.com "a-real-password" ops_manager
```

Role options: `reviewer` (can verify/reject and resolve disputes),
`ops_manager` (all of that plus account suspension), `super_admin`.
Use `ops_manager` for yourself if you want the full admin panel
(`/admin/verification`, `/admin/disputes`, `/admin/dashboard`)
available without hitting permission walls.

## 4. Right to work & DBS — an ongoing process, not a one-time setup

Unlike Stripe/Onfido, these two **can't** be automated — there's no
API to sign up for (see the README's "Admin-assisted verification"
section for why). This isn't a technical setup step so much as an
operational commitment: whoever holds the admin account needs to
actually:

- For right to work: when a worker submits a share code, go to
  **[gov.uk/view-right-to-work](https://www.gov.uk/view-right-to-work)**, enter the code and the worker's date of birth (both visible in `/admin/verification`), and record what the government service says.
- For DBS: check the worker's submitted application reference against
  whatever DBS umbrella body your business has a relationship with (you
  don't have one yet — see below) — or, if you're not DBS-registered
  yet, treat every DBS-required role as blocked until you are.

**If you plan to actually place workers in DBS-required roles**
(`EventSteward` by default — see `REQUIRES_DBS_ROLES` in `.env`), you
need to become a DBS Registered Body or go through an umbrella
organisation (e.g. uCheck, Access Group, Sterling). That's a business
application process with its own timeline, separate from anything in
this codebase. Until then, either don't advertise those roles or plan
to manually reject any DBS submission until you're actually able to
check it.

## 5. Two legal items CLAUDE.md and the spec both flag as blockers

Neither of these is something I can do — they need a professional, not
code:

- **DPIA (Data Protection Impact Assessment)** — required before
  processing behavioural scoring data (the Reliability Score) at real
  volume, per UK GDPR and CLAUDE.md's explicit instruction. Needed
  before you scale past a small, consenting pilot group. This is a
  compliance exercise you'd typically do with a data protection
  advisor, not a code change.
- **Employment lawyer review of the permanent-hire fee** — the spec
  (technical spec §2.4) explicitly says: "Get this reviewed by an
  employment lawyer before launch; the rate percentages... are
  illustrative placeholders, not benchmarked figures." The fee tiers
  (`HIRE_FEE_RATE_TIER_1/2/3` in `.env`) are trivially editable once you
  have real numbers — see `src/config/business-rules.ts`.

## 6. When you're ready to deploy beyond your own machine

Not needed to keep testing locally, but worth knowing before you show
this to anyone else:

- **Staging/production hosting** — nothing is deployed yet. The README's
  "Environments" section recommends Vercel (for the Next.js app) plus a
  separate managed Postgres per environment (Neon supports multiple
  projects/branches if you want to stay on the same provider). Each
  environment needs its own `DATABASE_URL` and `AUTH_SECRET` — never
  share those between dev/staging/production.
- **Stripe/Onfido live mode** — separate live API keys and webhooks per
  environment, only after the legal items above are resolved.
- **A real `APP_URL`** — your actual domain, once you have one, instead
  of `localhost` or an `ngrok` tunnel.

---

## Optional: push this to a remote (GitHub, etc.)

The repo is local-only right now. If you want it on GitHub:

```bash
gh repo create covered-app --private --source=. --remote=origin
git push -u origin master
```

I won't do this without you asking — pushing code is a "visible to
others" action I check in for explicitly, and it's your call whether
this stays local or gets a remote at all.
