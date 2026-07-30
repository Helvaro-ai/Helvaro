# Vercel readiness — feature/vercel-growth (trial system)

Plain pass/fail on everything asked, plus exactly what was run to check it.
No test framework exists in this app (confirmed — no `tests/`, no `jest`/
`mocha`/`vitest` in `package.json`); "verification" below means static
checks (`node -c`, JSON parsing, require-graph walking) and mocked-fetch
functional tests, never a real deploy and never a real Airtable/WhatsApp/
Anthropic call.

## Pass/fail

| Check | Result | How |
|---|---|---|
| `node -c` on every `api/*.js` | **PASS** (16/16) | Looped `node -c` over every file, see below |
| `node -c` on every `api/lib/*.js` | **PASS** (2/2) | `api/lib/card.js`, `api/lib/fetch-website.js` |
| `node -c` on dashboard.js's embedded `<script>` blocks | **PASS** (2/2) | Rendered the actual handler output (mocked req/res, no network) and extracted both inline `<script>` bodies — the outer file is one giant HTML template literal, so `node -c` on the outer file alone can't catch a syntax error inside the client-side JS |
| `vercel.json` parses as JSON | **PASS** | `require('./vercel.json')` succeeds |
| `vercel.json` `functions`/`crons`/`rewrites` match reality | **PASS** | See detail below |
| Route count is exactly 11 | **PASS** | `ls api/*.js \| grep -v '/_'` → 11 files |
| Every local `require()` resolves | **PASS** | Walked every `api/**/*.js`, resolved every `require('./...')`/`require('../...')` against the filesystem — 0 missing |
| No `require()` of an undeclared package | **PASS** | Walked every non-relative `require()`, checked against `package.json` `dependencies` + Node builtins — 0 undeclared (including the scoped `@vercel/functions` package) |
| No top-level `await` | **PASS** (by construction) | Every file here is loaded as CommonJS (no `"type":"module"` in `package.json`, no `.mjs`). Genuine top-level `await` is a hard syntax error in CommonJS, and every file already passed `node -c` above — that check alone proves none exists. A grep for `await` at low indentation was also run as a second signal; every hit is inside a function body |
| No ESM `import` syntax in a `.js` file | **PASS** | `grep -rn "^import "` across `api/` — zero hits |
| No reference to a resurrected `api/gcal.js` | **PASS** | The file doesn't exist (`ls` fails); the only hits for the string `api/gcal.js` are two comments in `api/leads.js` explaining it was folded in (`__gcal=1` rewrite handled inline) — not a require, not a route |
| No `.env` tracked by git | **PASS** | `git ls-files \| grep -i .env` → nothing; no `.env*` file exists anywhere in the working tree at all |

## Detail: `vercel.json` vs. reality

```json
"functions": {
  "api/whatsapp.js":      { "maxDuration": 120, ... },
  "api/form.js":          { "maxDuration": 120, ... },
  "api/cron-followup.js": { "maxDuration": 300, ... },
  "api/**/*.js":          { "maxDuration": 60,  ... }
}
```
All four globs/paths point at files that exist. No new route needed a
longer `maxDuration` override — the trial work added to `whatsapp.js`,
`form.js` and `cron-followup.js` runs inline inside those files' existing
handlers, it didn't add a new endpoint.

```json
"crons": [{ "path": "/api/cron-followup", "schedule": "0 9 * * *" }]
```
Unchanged, points at the same file. `runTrialLifecycle()` was added as one
more step inside that same handler (runs daily, not gated to Mondays like
the weekly report) — no new cron entry needed.

```json
"rewrites": [ ..., { "source": "/api/gcal", "destination": "/api/leads?__gcal=1" }, ... ]
```
Confirmed `api/leads.js` still handles `req.query.__gcal === '1'` at the top
of its handler (`handleGcal(req, res)`) — this rewrite still does something
real, it isn't dangling.

## Route count (the hard constraint)

```
api/admin.js
api/auth.js
api/cron-followup.js
api/dashboard.js
api/demo.js
api/form-page.js
api/form.js
api/leads-list.js
api/leads.js
api/privacy.js
api/whatsapp.js
```
= **11**. One new file was added this branch — `api/_plan.js` — and it's
underscore-prefixed on purpose (same convention as `_credits.js`, `_gcal.js`,
`_mailer.js`, `_pgapi.js`), so it does **not** count as a route. Confirmed
Vercel-side by the exact same `ls api/*.js | grep -v '/_'` check the credit
system's own `CREDITS-VERCEL-SUMMARY.md` used.

## What was functionally verified (mocked, never real APIs)

- **`api/_plan.js` `getPlanState()`** — 12 assertions covering: blank status
  → active, empty-string status → active, unknown status → active
  (fail-open + logged), trial + future end date → correct `daysLeft`, trial
  + PAST end date → `expired` **before the cron has run** (the whole point
  of date-derived expiry), trial with missing/unparseable end date → active
  (fail-open), expired/cancelled/paused → `isServiceStopped:true`, explicit
  `active` → not stopped, `computeTrialEndsAt`/`computeTrialStartMs`
  round-trip, name-keyed fields work (not just field-ID-keyed), and a
  defensively-unwrapped object-shaped singleSelect value. All 12 passed.
- **`api/_credits.js` merge-safety** — the fix that lets the trial cron's
  once-only marker share the `Credit Period` field with the credit system's
  own alert flags without either side clobbering the other. 5 assertions
  with a mocked Airtable record store: `recordUsage()` preserves an existing
  `trial` key while updating credit counters; `setTrialMarker()` preserves
  `alerted80`/`start` while writing its own key; `getTrialMarkers()` reads
  the merged state back correctly; `addCredits()` (admin top-up) and
  `resetPeriod()` (admin credit reset) both preserve the trial marker. All
  5 passed.
- **`api/cron-followup.js` `runTrialLifecycle()` end-to-end** — a fully
  mocked Airtable (in-memory record store + PATCH log) and mocked mailer
  (`require.cache` swap, zero real sends), 3 synthetic trial clients (one
  ~2 days left, one ~8 days elapsed, one already past `Trial Ends At`), the
  actual cron handler invoked twice in sequence:
  - Run 1: exactly 1 day-11 email, exactly 1 day-7 email, exactly 1
    expired-flip, each routed to the right recipient.
  - Run 2 (the regression this caught — see the `fix(trial)` commit): zero
    additional sends of any kind, and the day-11 client's markers show
    `day11Sent:true` **and** `day7Sent:true` (superseded, not literally
    sent) rather than receiving a belated, out-of-order day-7 email.
  This test is what found and proved the day-11/day-7 ordering bug fixed in
  this branch — see that commit message for the full root-cause writeup.
- **Nurture/reminder gate (`isServiceStoppedForProject()`)** — a mocked
  2-client run: one client with blank Plan Status (the default every
  pre-trial client has), one `expired`, one otherwise-identical eligible
  lead each (30h old, never replied, template configured). Exactly 1
  WhatsApp template send happened, and it went to the paying client's lead
  — the expired client's lead was correctly skipped, and the blank-status
  client was confirmed completely unaffected. Re-ran the day-7/day-11/
  expired regression suite afterward with no changes to its result.

## What could NOT be verified (honest, no live data/deploy)

- Real Airtable behavior against the LIVE base — every test above mocks
  `fetch`. The Plan Status/Trial Ends At field IDs given in the task
  (`fldIsexYvQUiYMWex`, `fldSmqa44VLPlRI9F`) were used exactly as specified
  but never round-tripped against the real base.
- Real email delivery (SMTP/Resend) — `api/_mailer.js` itself is unchanged
  and already proven elsewhere in this codebase; every test here mocks
  `sendMail()`.
- Real WhatsApp delivery/webhook signature verification for the new
  plan-status intercept in `api/whatsapp.js` — the branch logic was
  exercised by reading + tracing the code against the existing conventions
  in the same file (mirrors the AI-pause branch immediately above it
  line-for-line), not by a live webhook.
- The dashboard trial banner's actual visual rendering (colors, spacing) in
  a real browser — the CSS uses existing design tokens (`--accent`,
  `--warning-rgb`) already used elsewhere in `api/dashboard.js`, and the
  markup was confirmed to render into the real handler output (grepped the
  rendered HTML for the new element ids), but never visually inspected.
- Whether the owner has actually added the Plan Status / Trial Ends At
  options exactly as `trial`/`active`/`expired`/`cancelled`/`paused`
  (lowercase, matching what this code's Airtable formulas and PATCHes
  assume) — the task states these fields already exist with the given IDs,
  but the exact singleSelect option casing on the live base wasn't
  independently confirmed (can't be, without a real API call).
