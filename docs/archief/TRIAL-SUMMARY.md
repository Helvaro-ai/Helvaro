# 14-day free trial — implementation summary

Branch: `feature/vercel-growth`. Design source of truth: `TRIAL-DESIGN.md`
(unchanged, this build follows it exactly). Sits alongside the credit
system (`api/_credits.js`, `CREDIT-SYSTEM-DESIGN.md`) without modifying its
public contract — see "The Credit Period field-sharing trick" below for the
one place they intentionally touch.

## What was built

- **`api/_plan.js`** (new, underscore-prefixed — route count stays 11).
  Pure, no I/O: `getPlanState(clientFields)` interprets `Plan Status`
  (`fldIsexYvQUiYMWex`) + `Trial Ends At` (`fldSmqa44VLPlRI9F`) and returns
  `{ status, rawStatus, trialEndsAt, isExpired, isServiceStopped, daysLeft }`.
  Fails OPEN on every ambiguous input (blank status → `active`, unrecognized
  status → `active` + logged, trial with missing/unparseable end date →
  `active` + logged). Also exports `computeTrialEndsAt()` (onboarding: now +
  14 days) and `computeTrialStartMs()` (derives trial start from the end
  date, since only the end is stored).

  **The one subtlety worth calling out**: expiry is DATE-derived, not just
  field-derived. If `Plan Status` still literally says `trial` but
  `Trial Ends At` is in the past, `getPlanState()` returns
  `status: 'expired'` immediately — it doesn't wait for the daily cron to
  flip the field. This is what lets `api/whatsapp.js` (checked on every
  inbound message) never depend on the cron having already run that day.

- **`api/whatsapp.js`** — a new step 3c, right after the existing AI-pause
  check and before conversation history loads. For a client whose
  `getPlanState()` says `isServiceStopped` (expired/cancelled/paused):
  - If `Conversation History` is still empty (brand-new conversation): the
    inbound message is recorded, `Last Message` updated, the owner is
    pinged (WhatsApp + email, fail-soft), and the function returns — **no
    AI call, no reply sent**.
  - If `Conversation History` already has prior turns: falls straight
    through to the normal flow, completely unaffected. A real human
    mid-dialogue is never cut off.
  Credit recording for `whatsapp_conversation` still only fires inside the
  normal flow (first-turn billing), so a lead that never got an AI turn is
  never billed for one.

- **`api/form.js`** — lead creation is completely untouched (same fields,
  same validation, same GDPR consent flow). The client's plan state is
  looked up alongside the existing (already-there) client-config fetch; the
  ONLY behavioral difference for a stopped client is that the deferred
  45s-later automated WhatsApp greeting is skipped (logged, not treated as
  a "Niet bereikbaar" send failure). The lead is created and visible in the
  dashboard identically either way. Owner notifications (the existing
  "new lead" WhatsApp ping + email) are unchanged — they already double as
  the "you have a lead to handle" signal.

- **`api/cron-followup.js`** — `runTrialLifecycle()`, a new step in the
  existing daily handler (runs every day, unlike the Monday-only weekly
  report — trial touchpoints are day-based, not week-based). For every
  Client Config record whose RAW `Plan Status` is literally `trial`:
  1. Past `Trial Ends At` → flips `Plan Status` to `expired`, alerts the
     client (non-alarming: "leads still captured, AI paused") and Sindi.
  2. `daysLeft <= 3` → the "nog 3 dagen" email + cumulative real numbers
     (leads/qualified/appointments/pipeline value) to the client, plus an
     alert to Sindi (`NOTIFY_EMAIL`) — the phone-call trigger.
  3. `>=7 days elapsed` → "wat Helvaro deze week deed" mid-trial email with
     the same cumulative numbers.
  Each of the three is tracked once-only via a JSON marker
  (`{day7Sent, day11Sent, expiredSent}`) — see below for where it lives.
  **Day-11 supersedes day-7**: if a client is discovered already deep in
  trial with neither marker set, day-11 fires and day-7 is marked sent
  *without* actually being sent (never sent out of order, after day-11's
  urgency email). This exact ordering bug was caught by a mocked
  regression test mid-build — see the `fix(trial)` commit for the
  root-cause writeup.

  Also added: **`isServiceStoppedForProject()`**, a per-cron-run cache that
  gates the two loops which send Meta-billed WhatsApp *templates* to leads
  (the 24h-7d "haven't heard back" follow-up, and the appointment-reminder
  loop) so they skip clients whose service has stopped — "don't burn paid
  templates for someone who isn't paying," per the task's explicit
  instruction. Fails open on lookup failure.

  Trial emails reuse `api/leads.js`'s `aggregateReportPeriod()` — the exact
  same honest-numbers aggregation behind the dashboard's Resultaten panel
  — via a named export attached to that file's route-handler function, not
  a second copy of the logic.

- **`api/admin.js`** — `mode=onboard` now also seeds `Plan Status='trial'`
  and `Trial Ends At=now+14d` right alongside the existing Credit Allowance
  seeding, with the identical graceful-degradation contract: if the PATCH
  fails (fields somehow missing), the client is still created, the
  onboarding response and the Sindi signup-notification email both say so
  honestly instead of pretending it worked. Three new admin-key-gated POST
  modes, mirroring the existing `credit-*` admin actions exactly:
  - `plan-extend-trial` `{projectCode, days?}` — pushes `Trial Ends At`
    forward by `days` (default 7) from now and forces `Plan Status` back to
    `trial` (covers reactivating an expired client).
  - `plan-set-active` `{projectCode}` — converts to a paying client:
    `Plan Status='active'`, `Trial Ends At` cleared (`null`, the codebase's
    existing field-clear convention).
  - `plan-set-status` `{projectCode, status}` — sets any valid status
    directly.

- **`api/leads.js`** — new client-facing POST mode `plan-status`, backing
  the dashboard banner: returns `{show:false}` for active/cancelled/paused
  (and the fail-open default), or `{show:true, status, daysLeft,
  trialEndsAt}` for trial/expired. Same fail-open-hides-the-widget contract
  as the existing `credit-usage` mode right next to it.

- **`api/dashboard.js`** — a trial banner on the Dashboard page, above the
  existing form-link banner, `display:none` by default. While on trial:
  days remaining + an "Upgrade nu" mailto CTA. While expired: a deliberately
  **non-alarming** explanation ("leads komen gewoon binnen, de AI
  beantwoordt ze alleen niet meer automatisch") + a "Heractiveer account"
  mailto CTA — never phrased as an error, matching TRIAL-DESIGN.md §3's
  "the value gap made visible and honest, not a broken product" framing.
  Matches the existing Sand/enterprise-dark tokens (`--accent`,
  `--warning-rgb`), polled on the same throttled cadence as the credit
  widget. No `escHtml` calls changed (still 139), no existing element
  id/class touched, no new external origins (mailto isn't a fetch origin).

## Exact expiry behaviour

| | Trial | Expired/cancelled/paused |
|---|---|---|
| Lead form (`api/form.js`) | works normally | works normally, lead created, only the automated WA greeting is skipped |
| Inbound WhatsApp, brand-new conversation | AI answers | message recorded, owner pinged, **no AI reply** |
| Inbound WhatsApp, conversation already in flight | AI answers | **AI still finishes the conversation** — never cut off mid-dialogue |
| Cron nurture (follow-up template, appointment reminder) | sends normally | **skipped** — no paid template burned |
| Cron trial-lifecycle emails (day-7/day-11/expired) | sends per schedule | n/a — those are trial-only touchpoints |
| Dashboard | trial banner + days left | banner explains capture-still-works, non-alarming |

Blank `Plan Status` (every client onboarded before today) behaves
identically to `active` everywhere — verified explicitly for all four write
sites (`_plan.js`, `whatsapp.js`, `form.js`, the cron loops).

## The once-only mechanism

Three markers (`day7Sent`, `day11Sent`, `expiredSent`) live inside the
**same `Credit Period` field** the credit system already owns
(`fldCZAhZw6jXOSTXq`), under a `trial: {...}` sub-key — per the task's
explicit "do NOT add Airtable fields" instruction, mirroring how that field
already tracks the credit system's own `alerted80`/`alerted100` flags.

**The Credit Period field-sharing trick.** Two independent subsystems now
write to one JSON envelope. To make that safe, `api/_credits.js` was
changed (small, surgical, backward-compatible) so every one of its own
writers (`recordUsage`, `maybeAlertThresholds`, `addCredits`, `resetPeriod`)
spreads the FULL raw parsed JSON first, then overrides only the 4 keys it
actually owns — instead of reconstructing the envelope from those 4 keys
alone, which would have silently dropped the trial cron's `trial` key on
every credit event. Two new exports, `getTrialMarkers()`/`setTrialMarker()`,
own the read/merge/write of the `trial` sub-key symmetrically. Verified with
a mocked-Airtable test: `recordUsage()` preserves an existing trial marker,
`setTrialMarker()` preserves existing credit-alert flags, and both admin
actions (`addCredits`, `resetPeriod`) preserve the trial marker too. All 5
assertions passed.

## What still needs the owner

- **Confirm the live singleSelect option casing** on `Plan Status` matches
  exactly `trial`/`active`/`expired`/`cancelled`/`paused` (lowercase) — this
  code's Airtable formulas assume it. Wasn't independently verifiable
  without a real API call.
- **Decide whether the day-7 email is on** — it's built and wired, but this
  is a real client-facing email; worth a quick read of its copy
  (`sendTrialProgressEmail()` in `api/cron-followup.js`) before the first
  real trial client reaches day 7.
- **`NOTIFY_EMAIL`** must be set for the day-11 phone-call trigger and the
  expiry alert to reach Sindi — same env var the credit system's threshold
  alerts already use, no new config needed if it's already set.
- **`REMINDER_TEMPLATE_NAME`/`FOLLOWUP_TEMPLATE_NAME`** (existing env vars,
  unrelated to this branch) still gate whether the two nurture loops send
  anything at all, trial-aware or not — no change to that existing
  requirement.
- **A scoping judgment call, flagged for review, not silently decided**:
  `sendWeeklyClientReports()` (the existing Monday weekly-report email)
  was NOT gated by plan status — the task's instruction specifically named
  "paid WhatsApp templates," and that function sends email, not WhatsApp.
  If the owner wants expired clients to stop receiving the weekly report
  too, that's a one-line addition using the same `isServiceStoppedForProject()`
  helper already in the file.
- **Extending a trial mid-flight**: use the new `plan-extend-trial` admin
  action rather than editing `Trial Ends At` directly in Airtable — it also
  forces `Plan Status` back to `trial`, which matters if the client already
  flipped to `expired`.

## What's NOT verified (honest, no live data/deploy)

Everything in `VERCEL-READINESS.md`'s own "could NOT be verified" section
applies here too — no test framework exists in this app, nothing here has
run against the real Airtable base, real WhatsApp, or real email delivery.
In addition, specific to the trial feature:

- The actual copy/tone of the day-7 and day-11 emails hasn't been read by
  a human yet (see "what still needs the owner" above).
- The dashboard banner's real visual appearance in a browser (colors,
  spacing) — confirmed to render into the actual handler output and use
  existing design tokens, never visually inspected.
- Real-world timing: `daysLeft`/elapsed-days math was unit-tested against
  synthetic dates, never against a trial that actually ran for 14 real
  days with the cron firing daily in between.
