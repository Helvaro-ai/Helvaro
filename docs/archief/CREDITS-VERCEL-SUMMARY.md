# Credit / usage system — Vercel implementation summary

Branch: `feature/vercel-growth`. Design source of truth: `CREDIT-SYSTEM-DESIGN.md`
(unchanged, this build follows it exactly). Nothing in this feature is live
until the owner adds the Airtable fields below — until then the app behaves
**exactly** as it did before this branch, verified explicitly (see
"Verification" section).

## ACTION ITEM — Airtable fields the owner must add

Add these to the **Klanten / Client Config** table (`tblPidTrwGRzRt4LZ`) in
the live Airtable base. Names must match **exactly** (the code addresses them
by name, not field ID, because the IDs don't exist until the owner creates
them):

| Field name | Type | Purpose |
|---|---|---|
| `Credit Allowance` | Number | Per-client monthly credit allowance. Blank/0 = credit system stays inert for that client (unlimited, fail-open). Set this per client to activate. |
| `Credits Used` | Number | Running usage counter for the current period. Managed by the app — don't edit manually except via the admin reset action. |
| `Credit Period` | Long text | JSON envelope: `{"start":"2026-08-01T00:00:00.000Z","alerted80":false,"alerted100":false,"alertedRunaway":false}`. Managed by the app. |
| `Credit Usage By Feature` | Long text | JSON envelope: `{"whatsapp_conversation":120,"image_generation":50,...}` — per-feature breakdown for the current period, used for the admin cost estimate. Managed by the app. |
| `Credit Runaway Ceiling` | Number | Optional. Absolute abuse ceiling (see below). Leave blank to use the default (3x allowance). |

Nothing else is required. No new table, no field-ID lookups to hand back —
the code reads/writes these by name and degrades to a silent no-op the
instant any of them is missing.

**To activate a client**: set `Credit Allowance` on their Client Config
record (e.g. 2000 for Starter, 5000 for Growth, 20000 for Scale fair-use) via
the new admin endpoint (see below) or directly in Airtable. `Credits Used`
and `Credit Period` self-initialize on that client's first recorded usage
after activation — you don't need to seed them.

## What was built

- **`api/_credits.js`** (new, underscore-prefixed — not a Vercel route, route
  count stays at **11**, helper count goes from 3 to 4): `checkCredits()`,
  `recordUsage()`, `getUsageSummary()`, `getAllUsageSummaries()`,
  `setAllowance()`, `addCredits()`, `resetPeriod()`. Full fail-open/fail-closed
  contract and the Airtable-race limitation are documented in its header —
  read that before touching the file.
- **Weighting implemented exactly per the design doc**: lead conversation =
  20 credits, AI image generation = 50, marketing text generation = 5, extra
  AI reply suggestion = 2. Two features not covered by the original 4-row
  table were mapped onto the closest cost analog and documented as an
  explicit decision in the code (not silently invented): `weekly_learning`
  (cron-followup's per-client pattern analysis) = 5 credits (same
  single-Haiku-call cost profile as marketing text), and a set of
  `founder_*` features = 5 (text) / 50 (image) for Sindi's own admin-key-gated
  tools (see "Founder-internal billing" below).
- **Over-limit behaviour, exactly per feature**:
  - `api/whatsapp.js` (lead conversations): **never gates, never blocks.**
    Records usage fire-and-forget, once per lead at the first AI turn
    (`history.length === 1`) — not once per message turn, which would have
    billed 100-160 credits for a normal 5-8 turn conversation against the
    design doc's 20-credit anchor. Registered with `waitUntil()` so it
    survives the container recycling during the existing 25-55s human-delay.
  - `api/leads.js` `suggest-replies`: blocks (HTTP 402,
    `{error:'credit_limit_reached', message}`) when over limit; records 2
    credits on success.
  - `api/admin.js` `ai-advice` / `ai-chat` / `personalized-dm` /
    `linkedin-post`+`content-post` / `generate-content` / `generate-image`
    (the AI-image fallback branch only — the free local card/carousel render
    path is never gated or billed): all block over limit, all billed to the
    `_internal` pseudo project code (see below).
  - `api/cron-followup.js` weekly learning: skips **that one client** and
    continues the loop for every other client when over limit — never aborts
    the whole cron run.
  - Runaway ceiling (default 3x allowance, overridable per client via
    `Credit Runaway Ceiling`): abuse-signal only, alerts Sindi
    (`NOTIFY_EMAIL`), never adds a second enforcement layer beyond the normal
    100% block.
- **Founder-internal billing decision**: `ai-advice`/`ai-chat`/
  `personalized-dm`/`generate-content`/`generate-image`/`linkedin-post` in
  `api/admin.js` are Sindi's own ADMIN_KEY-gated tools (business coaching,
  cold-outreach drafting, Herald's autonomous social-media engine) — there is
  no paying client to attribute the spend to. Mirrors the identical decision
  already made in `vps-backend/server/db/credits.js`: billed to a shared
  `_internal` pseudo project code. Since no Client Config row with
  `Project Code = _internal` exists unless Sindi creates one, every one of
  these gates **fails open by default** — this branch changes nothing about
  Herald's live posting or Sindi's own tools today. If she ever wants to cap
  her own internal AI spend, she creates a Client Config row for
  `_internal` with an allowance, exactly like any real client.
- **Client-facing usage bar** (`api/dashboard.js`, sidebar, always visible
  while active): green/amber/red progress bar, human units
  ("1.240 / 2.000 credits · nog ~62 leadgesprekken · 18d over in periode"),
  non-punitive upgrade link when over limit (mailto, no dashboard error
  state). Backed by a new `api/leads.js` mode `credit-usage`. Stays
  `display:none` — the exact original layout — for any client the system is
  inert for. Polled alongside the existing 10-minute dashboard refresh, with
  its own 4-minute internal throttle.
- **Admin view + controls** (`api/admin.js`): `GET /api/admin?section=credits&type=usage-overview`
  returns every client's usage plus an estimated real EUR cost per client
  (derived from the design doc's verified per-feature unit costs, for margin
  visibility) — empty array, not an error, until the fields exist anywhere on
  the base. Three new admin-key-gated POST modes: `credit-set-allowance`,
  `credit-add-credits` (top-up = reduces Credits Used, floored at 0, not a
  permanent allowance change), `credit-reset-period`.
- **Period rollover**: lazy, 30-day rolling window from `Credit Period.start`
  (not calendar-month, to avoid 28-31 day edge cases — undocumented either
  way in the design doc, so recorded here as an explicit implementation
  choice). Handled on read (`checkCredits`, `getUsageSummary` compute the
  rolled-over state without writing) and on write (`recordUsage` persists the
  rollover the first time it fires after the boundary) — no separate cron
  needed.
- **Threshold notifications** at 80% and 100%: fire at most once per period
  each, tracked as persisted flags inside `Credit Period` (not an in-memory
  Set — survives cold starts, unlike the two reference implementations this
  was built from). Email to the client's `Rapport Email` (falls back to
  `NOTIFY_EMAIL`), fail-soft (never throws, never blocks the caller).

## The documented race (read before "fixing" it)

Airtable has no atomic increment. `recordUsage()` is a plain
read-then-write: GET `Credits Used`, add in JS, PATCH the sum back. Two
simultaneous `recordUsage()` calls for the **same client** landing inside the
same read-write window will under-count by whichever amount raced — the
second write clobbers the first. This is documented at length in
`api/_credits.js`'s header, not hidden. It's acceptable at Helvaro's current
volume (a handful of concurrent conversations platform-wide, not per client),
and it only ever loses counted usage, never invents it — same "err toward
under-charging" direction as every other fail-soft decision already in this
codebase. It resolves itself if/when Helvaro moves this onto the
VPS/Postgres backend (`vps-backend/server/db/credits.js` already fixes this
for real with a single atomic `x = x + $1` UPDATE).

## Verification performed

No test framework in this app — verification per the task's own bar:

- `node -c` on every changed/new file: `api/_credits.js`, `api/whatsapp.js`,
  `api/leads.js`, `api/admin.js`, `api/cron-followup.js`, `api/dashboard.js`
  — all clean.
- `api/dashboard.js`'s two embedded `<script>` blocks (the outer file is a
  giant HTML template string, so `node -c` on the outer file alone can't
  catch a syntax error inside the client-side JS) were extracted from the
  actual rendered handler output and separately `node -c`'d — both clean.
  Confirmed the new widget markup (`#credit-usage-widget`, `#credit-usage-fill`,
  `#credit-usage-sub`) renders into the HTML.
- Route count confirmed unchanged at 11 (`ls api/*.js | grep -v '^api/_'`).
- A throwaway mocked-fetch script (`/private/tmp/.../verify-credits.js` —
  deleted after the run, never committed, never touched a real API) proved,
  with assertions:
  - Schema entirely absent (today's live deploy state): `checkCredits`
    allows, `recordUsage` writes nothing, `getUsageSummary` returns
    `{active:false}`, `getAllUsageSummaries` returns `[]` — not fabricated
    zero-rows.
  - An over-limit client's lead conversation is still recorded and allowed
    to exceed its allowance (never blocked, never capped), while the SAME
    client's image-generation and reply-suggestion checks are blocked with a
    friendly message.
  - Credit weights are summed exactly as documented (20+50+5+2=77 across one
    of each core feature), with a correct per-feature breakdown.
  - 80% and 100% threshold emails each fire exactly once per period — proven
    by triggering the crossing twice and asserting the email count doesn't
    grow on the second trigger.
  - A stale (30+ day old) period is read as rolled-over by `checkCredits`
    without writing anything, and `recordUsage` performs the actual rollover
    (resets `Credits Used` and the per-feature breakdown) on the first write
    after the boundary, rather than adding on top of stale data.
  - A client with the schema present globally but no allowance set on their
    own record fails open for them specifically, while still appearing in
    the admin overview as `configured:false` (distinct from a client that
    genuinely doesn't exist yet).
  - `_internal` (founder tools) fails open with no Client Config row for it.
- 19/19 assertions passed.

## Follow-up — self-serve onboarding now seeds an allowance (fix(onboarding))

`api/admin.js`'s `mode=onboard` path (see `IMPROVEMENTS-REVIEW.md` §3.2) used
to create a Client Config record with no `Credit Allowance` at all, which per
this doc's own contract left the credit system permanently inert for exactly
the clients onboarded without Sindi's involvement — the one scenario the
wizard exists for. Two gaps closed, onboarding-only (the plain admin-create
path is unchanged):

- **Default allowance on create**: onboarding now calls `_credits.js`'s
  `setAllowance()` right after the Client Config record is created, defaulting
  to the **Starter tier's 2.000 credits** (§3 above). Overridable via
  `body.creditAllowance` in the onboarding payload, then falls back to the
  `DEFAULT_CREDIT_ALLOWANCE` env var, then 2000. Same fail-open contract as
  everywhere else in this system: if `Credit Allowance` doesn't exist yet on
  the live base, the PATCH is rejected (Airtable `UNKNOWN_FIELD_NAME`),
  caught, logged — the client is still created successfully either way.
- **Owner notification on signup**: a fail-soft email to `NOTIFY_EMAIL` on
  every self-serve signup (client name, project code, email, niche, and the
  allowance that was set — or an explicit "not set" flag if the field is
  still missing). Uses the same `api/_mailer.js` `sendMail()` already proven
  above; a notification failure can never fail the onboarding request.

No new Airtable fields were added by this change — it only writes to the
`Credit Allowance` field the owner still needs to add per the ACTION ITEM at
the top of this file.

## What's NOT verified (can't be, without live data/deploy)

- Real Airtable behaviour when PATCHing a genuinely nonexistent field name
  (the mock simulates a 422, matching documented Airtable REST behaviour, but
  this wasn't run against the live base — intentionally, per the "never make
  real API calls" constraint).
- The actual dashboard widget's visual rendering (colors, layout) in a real
  browser — CSS was written to match the existing `--green`/`--orange`/`--red`
  design tokens already used elsewhere in `api/dashboard.js`, but not visually
  inspected.
- Real email delivery for the 80%/100%/runaway alerts (mocked in the
  verification script; `api/_mailer.js` itself is unchanged and already
  proven elsewhere in this codebase).
- Behaviour once the owner actually adds the fields and sets a real client's
  allowance — everything above tests the code path, not the live Airtable
  base.
