# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: the owner or sales lead of a small Belgian firm (solo/duo up to a
few staff) in one of five verticals — vastgoed (makelaars), automotive
(dealers), bouw, keuken, renovatie. No vertical dominates; product decisions
optimise for all five equally (confirmed 2026-09-18).

Situation: they are on the road, on a werf, in a showroom or at a bezichtiging.
Inbound leads arrive by WhatsApp, web form or portal (Immoweb, AutoScout24) at
all hours, and a reply that comes hours later loses the deal. Their job is to
turn inbound enquiries into booked appointments and closed sales without being
glued to a phone.

Secondary users:
- **Helvaro admin/founders** (Sindi; Frade + Teljo referenced in docs) — operate
  the platform, watch costs, clients, health.
- **End customers of the client** — the lead on the other side of the WhatsApp
  conversation; they never see the dashboard, only the conversation and
  (optionally) a lead form at `/start/<code>`.

## Product Purpose

Helvaro answers a client's inbound leads on WhatsApp within seconds, qualifies
them (budget, timing, type of project/vehicle/property, address, …), and books
the appointment directly in the client's Google Calendar. The client sees the
qualified lead, the conversation and the appointment in one dashboard and can
take over any conversation by hand.

Success for a client: fewer missed leads, faster first response, more booked
appointments with less time on the phone. Success for Helvaro: paying clients
(3 as of 2026-09-17) who keep their subscription because the assistant closes
appointments they would otherwise have lost.

## Positioning

Confirmed mechanisms a neighbouring product could not truthfully copy
(2026-09-18):

1. **Qualifies AND books.** The assistant runs the whole intake on WhatsApp and
   places the appointment in the owner's own Google Calendar itself — no "we'll
   call you back" handoff.
2. **Vertical-specific intake.** Qualification logic is per vertical (vehicle
   slots and test-drives for dealers, property and bezichtiging for makelaars,
   project type/budget/start date for bouw/keuken/renovatie). Not a generic
   chatbot with a logo.
3. **Faro as product character.** Faro — the mascot and in-app assistant — is
   part of Helvaro's identity. Customer-facing copy never calls the product
   "AI"; it describes what Faro/Helvaro does.
4. **Owner takes over anytime.** Human handoff mid-conversation ("Neem over")
   is a core promise, not an escape hatch.

## Operating Context

- Live at `app.helvaro.pro` (Vercel Pro, serverless functions in `api/`).
  Marketing site and app share the deployment.
- Data: Airtable base (multi-tenant, per-client project code) with a Postgres
  layer (`api/_pgapi.js`) for parts of the model; Vercel Blob for media.
- Auth: Clerk (`api/_clerk.js`) plus session/admin key model; admin area behind
  `ADMIN_KEY`.
- Channels: WhatsApp Business (Meta Cloud API; Tech Provider review pending),
  web lead form (`/start/<code>`, embeddable `form-widget.js`), portal intake
  (AutoScout24 for dealers).
- Integrations: Google Calendar (booking), Google Drive (admin back-office
  sync), Stripe (subscriptions, credits, VAT), OneSignal (push), Resend/SMTP
  mail, Anthropic (conversation), image/video generation (Kling and others via
  `_media-models.js`, `_video-adapters.js`).
- Rituals: cron follow-ups (`cron-followup.js`), weekly report mail to clients,
  daily admin Drive sync, `CHANGELOG.md` in Dutch as the owner-facing record of
  every change.
- Languages in the app and site today: **nl, fr, en, de** (`api/_i18n.js`,
  `api/_lang.js`). Dutch is the owner's and default language.
- Local dev harness: `node scripts/faro-dev.js` → http://localhost:4321 with an
  auth stub and fixture data; `node scripts/faro-check.js` static checks.

## Capabilities and Constraints

Confirmed functionality:
- Dashboard with leads/pipeline, conversations (reply box + "Neem over"),
  appointments/calendar, activity, results/analytics, forms, campaigns,
  vehicles (dealers), properties (makelaars), media generation (image; video
  panel present, scope open), Faro workspace, settings, billing/credits,
  onboarding via invite.
- Admin area: clients, costs (`_kosten.js`), founder page, ops overview, Drive
  sync, templates.
- Credit system (`CREDIT-SYSTEM-DESIGN.md`), trial design (`TRIAL-DESIGN.md`),
  VAT handling, plan tiers.
- Existing test suite: `tests/*.test.js` (137 green on 2026-09-17), including a
  live tenant-isolation test against Airtable.

Technical constraints future work must respect:
- `api/dashboard.js` is a single ~20k-line template literal; output JS must be
  validated with `scripts/faro-check.js` after every edit. CSS/JS were split
  into cached static assets on 2026-09-16 (H1).
- Routes are expensive; new behaviour hangs on `body.mode` of an existing
  route unless technically impossible (`api/stripe.js` is the documented
  exception — raw body signature).
- Colours come from tokens only; text uses `*-ink` tokens, surfaces use fill
  tokens; sizes use the `--sp-*` / `--r-*` scale (enforced by `faro-check.js`).
- Do not remove or replace Clerk, Stripe, Airtable/Postgres, WhatsApp, Google
  Calendar, CRM integrations, vertical logic, customer data or working APIs.
  Smallest safe migration only.
- Never trust IDs, org IDs, roles, plans or credits from the frontend; every
  sensitive operation verifies the session and resource ownership server-side.

Terminology (Dutch is canonical in UI and changelog): lead, gesprek,
afspraak, bezichtiging, proefrit, pand, voertuig, project, credits, plan,
Neem over, Faro.

Explicitly undecided product facts:
- Whether **es** (Spanish) is added as a fifth language — mentioned in the
  2026-09-17 brief, not in the codebase. Decide before i18n work.
- Video generation scope (ships today as visible-but-empty "coming soon").
- Which vertical pages the marketing site gets beyond the current real-estate
  weighting (brief asks for vastgoed / dealership / bouw / keuken / renovatie).

## Brand Commitments

- Name: **Helvaro**. Assistant/mascot: **Faro**.
- Voice: plain, operational Dutch (and its fr/en/de equivalents); outcomes and
  workflows, no generic AI marketing language; the product never calls itself
  "AI" in customer copy.
- Existing design system: `DESIGN-SYSTEM.md` — "Sand / Enterprise Dark",
  single sand accent used sparingly, references Linear/Stripe/Notion/Vercel;
  bans purple gradients, AI glow, neon, glassmorphism, heavy shadows. This is
  the incumbent visual authority; whether it is preserved, expanded or replaced
  is decided in new-work, not here.
- Faro assets: `docs/MASCOT-PROMPT.md`, `docs/FARO.md`, `~/Downloads/Faro`;
  the 1–2 s Faro login intro clip (`api/_intro.js`) is a kept product moment.

## Evidence on Hand

- Product truth: the live app, `docs/user-guide.md`, `docs/faq.md`,
  `docs/architecture.md`, `docs/api-reference.md`, `docs/crm.md`,
  `docs/niche-analysis.md` (20 sectors scored), `docs/marketing-playbook.md`.
- Assets: Faro mascot artwork and intro clip (above); fonts in `api/fonts/`.
- Legal: `docs/verwerkersovereenkomst-DPA.md`, `api/privacy.js`.
- **Absent — must not be fabricated:** named customers, testimonials, logos,
  case studies, press, and citable usage numbers. The 3 paying clients exist
  but none has confirmed consent to be named or quoted (2026-09-18: owner gave
  no answer; treat as no). Any figure shown must be measured from real data.

## Product Principles

1. **Booked, not just answered.** Every flow ends in an appointment or a clear
   next step for the owner; a conversation that stalls is a defect.
2. **One product, five workflows.** Verticals differ in intake, not in
   identity; never fork Helvaro into five products.
3. **The owner stays in control.** Takeover, visibility and reversibility are
   product features, not admin tools.
4. **Truth over polish.** No fake progress, costs, analytics, monitoring or
   social proof; label estimates as estimates.
5. **Operational calm.** The dashboard tells the owner what needs attention
   now; everything else recedes.

## Accessibility & Inclusion

- Contrast is enforced by token rules (measure text against the surface it
  actually sits on); an axe scan was run 2026-09-16 with all findings fixed.
- Animations (Faro intro, generation states) must respect
  `prefers-reduced-motion`.
- Desktop/web SaaS quality is primary; smaller screens must not regress
  (phone pass at 390×844 is part of the harness check).
