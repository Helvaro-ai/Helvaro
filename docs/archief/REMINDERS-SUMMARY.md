# Appointment Confirmations + Reminders — Summary

Branch: `feature/vercel-growth` (stacked on `deploy/vercel-hardened`)
Function count unchanged — everything lives in the existing `api/whatsapp.js`, `api/leads.js`, `api/cron-followup.js`.

## What was built

1. **Immediate booking confirmation — AI in-chat path** (`api/whatsapp.js`, section 11b)
   After the AI books an appointment mid-conversation (`BOOK:{...}` block →
   `createAppointment()` succeeds), a freeform WhatsApp confirmation is sent
   right after: date/time (client's language, Brussels tz), business name,
   and address if the client has one configured. Freeform is safe here
   specifically because we're mid-conversation — the lead just messaged us,
   so Meta's 24h customer-service window is open. Wrapped in its own
   try/catch so a confirmation failure is logged distinctly and never reads
   as "appointment creation failed" (the appointment already exists at that
   point).

2. **Booking confirmation — dashboard path** (`api/leads.js`, `appointment-create` mode)
   Dashboard-created appointments have no guarantee the lead has messaged
   recently — the 24h window may well be closed — so this path is **always**
   template-gated (`sendAppointmentConfirmation()`), matching
   `cron-followup.js`'s existing follow-up gating exactly: only send through
   an approved Meta template, skip entirely (with a log, not an error to the
   dashboard user — the appointment itself is created and returned
   successfully regardless) if none is configured.

3. **24h reminder cron** (`api/cron-followup.js`, `runAppointmentReminders()`)
   Wired into the existing daily 09:00 UTC run. Finds booked appointments
   with `Reminder Sent` (`fldadjeKPJ2TLiQSA`) still false, starting within
   the next `REMINDER_WINDOW_HOURS` (33h), sends a template-gated reminder,
   and **locks the idempotency flag before attempting delivery** (see below).

## New environment variables

| Var | Used by | Default |
|---|---|---|
| `BOOKING_TEMPLATE_NAME` | dashboard confirmation | none — feature no-ops without it |
| `BOOKING_TEMPLATE_LANG` | dashboard confirmation | client's `Language` field (nl/fr/en), else `nl` |
| `REMINDER_TEMPLATE_NAME` | 24h reminder cron | none — feature no-ops without it |
| `REMINDER_TEMPLATE_LANG` | 24h reminder cron | client's `Language` field (nl/fr/en), else `nl` |

Both templates need to be created and approved in WhatsApp Manager first —
this is an owner action, not something this code can do. Template body
params passed, in order: `{{1}}` lead's first name, `{{2}}` formatted
date/time, `{{3}}` client/business name. Until these env vars are set, the
dashboard confirmation and the cron reminder both **no-op with a clear log
line** — no risk, no half-built state, no accidental freeform send outside
the 24h window.

## Why the reminder window is 33h, not 24h

The cron runs once per day. A single daily pass can't hit "exactly 24h
before" for every appointment, so the window has to be wider than the 24h
gap between two consecutive runs — otherwise an appointment could fall
through the gap between run N and run N+1 and never get reminded at all.

Run N's window covers `[now, now+33h]`. Run N+1 (24h later) covers
`[now+24h, now+57h]`. The two windows overlap on `[now+24h, now+33h]` — a 9h
margin that also absorbs ordinary cron delay/drift. That overlap guarantees
every appointment is caught by **at least one** run before it starts. An
appointment ~30h out getting reminded on run N instead of waiting for run
N+1 (when it'd only be ~6h out) is harmless — early is fine; `Reminder Sent`
is what actually prevents a double-send, not the window's tightness. This
mirrors the exact same lesson `ago7d` already encodes in this file for the
lead follow-up loop (a single missed/late run must never create a
permanent skip window).

## The idempotency guard — how a reminder can never be sent twice

Deliberately the **opposite order** from the existing follow-up loop above it
in the same file (which marks `Conversation State` *after* sending):

1. `Reminder Sent` is set to `true` via PATCH **first**.
2. Only if that PATCH succeeds does the code proceed to send the WhatsApp
   template.
3. If the PATCH fails, the send is skipped entirely for that appointment
   this run (retried next run, since the flag is still false).

This means the reminder is sent **if and only if** the lock was
successfully acquired first. Even if the process crashes or the container is
recycled between the PATCH and the WhatsApp call, `Reminder Sent` is already
`true`, so `NOT({fldadjeKPJ2TLiQSA})` permanently excludes that appointment
from every future run's query — a double-send is structurally impossible,
not just unlikely. The accepted trade-off is the mirror case: a *confirmed*
send failure (Meta API down) right after a successful PATCH means the flag
is set but the lead never actually got the message — a rare silent miss,
logged clearly (`sendWATemplate` logs internally), preferred over risking a
duplicate. Verified in the scratchpad test harness (see below) — PATCH
always precedes the send call, and a failed PATCH always short-circuits
before any WhatsApp call is made.

## Template gating — same rule in all three places

Every WhatsApp send introduced here that *isn't* provably mid-conversation
goes through an approved Meta template, exactly like the existing follow-up
loop's `FOLLOWUP_TEMPLATE_NAME` gate:

- **AI in-chat confirmation** (`whatsapp.js`) → freeform. Justified: we're
  actively mid-conversation, the lead just texted us.
- **Dashboard confirmation** (`leads.js`) → template only, skip if
  unconfigured.
- **Reminder cron** (`cron-followup.js`) → template only, skip if
  unconfigured.

No path can ever send freeform outside a provably-open 24h window.

## Per-client control — deliberately not built

The task asked for a per-client on/off toggle and/or custom reminder text
*only if it doesn't require a new Airtable field*. It does. There is no
existing "Reminders Enabled" or "Reminder Template" field on the Client
Config table (`tblPidTrwGRzRt4LZ`), and I did not add one — modifying the
live Airtable schema is explicitly out of scope for this batch (owner's
call, same principle as the Airtable retention gap noted in
`cron-followup.js`'s own `runRetentionAnonymization()` comment).

What exists today instead, at zero schema cost:
- **Global on/off**: the presence/absence of `BOOKING_TEMPLATE_NAME` /
  `REMINDER_TEMPLATE_NAME` acts as an all-or-nothing switch across every
  client. This is "default ON" in the sense that once the owner configures
  a template, it applies to all clients immediately with no further code
  change needed.
- **Per-client language**: already respected (see below) via each client's
  existing `Language` field — no new field needed.
- **Custom reminder text**: not currently possible per-client, since the
  message body itself is Meta's pre-approved template copy (Meta requires
  templates to be pre-approved; arbitrary free text isn't an option outside
  the 24h window regardless of who owns the code). A genuine per-client
  toggle or custom template selection would need a new Client Config field
  (e.g. `Reminder Template Name`, `Reminders Enabled` checkbox) — flagging
  this for an owner decision, not building it unilaterally.

## Language

- **Freeform confirmation** (`whatsapp.js`): fully respects the client's
  `Language` field (`fld1iiV9XwSbgAACZ`, nl/fr/en, default nl) — the text is
  fully our own, so no template constraint applies.
- **Template-gated paths** (`leads.js`, `cron-followup.js`): default to the
  client's `Language` field too, since WhatsApp lets a single approved
  template name have multiple approved per-locale variants. If
  `BOOKING_TEMPLATE_LANG` / `REMINDER_TEMPLATE_LANG` is explicitly set, it
  overrides for every client — useful if the owner has, for now, only gotten
  one language variant approved in Meta Business Manager. Verified both
  branches (env override vs. client-language fallback) in the test harness.

## Field IDs used (cross-checked against the task's field list + existing code)

`fldadjeKPJ2TLiQSA` Reminder Sent · `fldxfW4UTI1QBiUsa` Start Time ·
`fldt3zlcrFKGAGw3E` Status · `fldO0Gk82OJ9m6lz7` Lead Phone ·
`fldnCNWPxIX6sYzZP` Lead Name · `fld60vlhoxZYef4U2` Project Code (Appointments) ·
`fldN4dL0bGgfBOXwM` Project Code (Client Config, per `docs/architecture.md`) ·
`fldAnB848Sr5jl6dq` Client Name · `fld1iiV9XwSbgAACZ` Language.

Note: the existing `createAppointment()`/`appointment-create`/
`appointment-update`/`getUpcomingAppointments()` code already writes/reads
the Appointments table mostly by **field name** (`'Start Time'`,
`'Duration'`, `'Status'`, ...), not field ID — an existing, weaker
convention on this one table that predates this change. The new code added
here queries Reminder Sent/Status/Start Time by **field ID** (matching the
task's explicit ask and the Leads/Clients table convention elsewhere in the
codebase) while reading Lead Phone/Lead Name/Project Code with the
`field-ID || field-name` fallback pattern already standard everywhere else
— consistent with how existing appointment code was already written,
without silently changing the reads/writes that table already depended on.

## Verification performed (no real API calls made anywhere)

- `node -c` clean on all three changed files.
- Careful line-by-line re-read of every diff (brace matching, variable
  scope, ownership/Project-Code scoping untouched).
- Two scratchpad-only test harnesses (mocked `fetch`, deleted from the repo
  itself — they never touched the actual `api/*.js` files, only in-memory
  copies with the two Postgres/website-fetch requires stubbed out):
  - `runAppointmentReminders()` (cron): 8/8 passing — window-overlap math,
    no-template skip, PATCH-before-send ordering, PATCH-failure blocks the
    send, field-ID query correctness, phone normalization, date formatting.
  - `sendAppointmentConfirmation()` (dashboard): 5/5 passing — no-template
    skip, invalid-phone skip, correct template params + client-language
    default, env-language override, fail-soft client-lookup-failure still
    sends with sensible defaults.

## What could not be verified without live credentials

- Actual Meta Graph API template delivery (correct template registration,
  approval status, exact `{{1}}`/`{{2}}`/`{{3}}` placeholder mapping in
  whatever copy the owner writes and gets approved) — this can only be
  confirmed once `BOOKING_TEMPLATE_NAME`/`REMINDER_TEMPLATE_NAME` templates
  actually exist in WhatsApp Manager and a real send is attempted.
- Real Airtable behavior for the new `filterByFormula` clauses against the
  live `Appointments` table (field-ID formula syntax matches the pattern
  already proven working elsewhere in this codebase, but wasn't tested
  against the actual live base).
- End-to-end behavior of `waitUntil()`/container lifecycle interactions with
  the new in-chat confirmation send in `whatsapp.js` (it reuses the existing
  `sendWA()` helper and existing `waitUntil()` wrapping around
  `processMessage()`, so it should inherit the same guarantees as the rest
  of that function, but this wasn't independently re-verified against a real
  Vercel deployment).
