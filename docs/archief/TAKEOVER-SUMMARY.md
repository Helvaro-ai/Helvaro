# Human Takeover / Live Inbox — Summary

Branch: `feature/vercel-growth` (stacked on `deploy/vercel-hardened`)
Function count unchanged — everything lives in the existing `api/whatsapp.js`, `api/leads.js`, `api/dashboard.js`.
No new Airtable fields. No real API calls made anywhere during development.

## The problem this closes

The AI qualifies leads over WhatsApp and escalates to the owner when it needs
a human ("iemand komt binnen 30 min bij je terug"). Until now, nothing
stopped the AI from replying to the lead's *next* message even after the
owner had manually stepped in — a promised human follow-up could collide
with the AI still talking. This batch adds a pause/resume mechanism, wires
it into the AI's message loop, extends the existing manual-reply endpoint
with Meta's 24h safety rule, and surfaces takeover-needed leads in the
dashboard.

## Where the pause flag lives, and why

`aiPaused: { at, by }` is merged into the lead's existing Notities JSON
envelope (`fldoLRI5W12ThTls7`) — the same field/mechanism `waFailed` already
uses (see `api/whatsapp.js`'s pre-existing `mergeWaFailedFlag`). No new
Airtable field, per the task's hard constraint. Three helpers guarantee this
is additive, never destructive:

- **`getAiPauseInfo(raw)`** (`api/whatsapp.js`) — read-only. Returns the
  `{at, by}` object or `null`. Never mutates.
- **`mergeNotitiesPatch(raw, patch)`** (`api/leads.js`) — a small generalization
  of the existing `mergeWaFailedFlag` pattern: parses the envelope (or wraps
  legacy plain text as a `{id:'legacy', text, ts}` note, exactly like
  `mergeWaFailedFlag` and `dashboard.js`'s `parseNotities` already do), then
  applies a patch of top-level keys — `undefined` deletes a key, anything
  else sets it. Used for both `ai-pause`/`ai-resume` (sets/deletes
  `aiPaused`) and clearing `escalated` on a manual reply.
- **`mergeEscalatedFlag(raw, question)` / `clearEscalatedFlag(raw)`**
  (`api/whatsapp.js`) — same merge contract, kept as separate single-purpose
  functions per this file's existing convention of not sharing helpers across
  files (see the pre-existing comment on `mergeWaFailedFlag`/`escapeFormula`
  duplication).

**Verified `parseNotities` already preserves unknown keys on read**
(`api/dashboard.js`): it does `{ ...d, notes: ..., tasks: ..., calls: ...,
afspraak: ... }` — the `...d` spread means `aiPaused`/`escalated` round-trip
through the dashboard untouched even before this change, confirming the
pre-existing "prior fix added a `...d` spread for exactly this reason"
comment above it is accurate and this feature can safely build on it.
`serializeNotities` spreads `...data` first before re-applying known keys,
so the same round-trip holds on write too.

## AI-skip behavior (`api/whatsapp.js`, step 3b)

`processMessage()` checks `getAiPauseInfo()` right after the existing
"conversation already completed" check (step 3) and before conversation
history is loaded for the AI path (step 4). If paused:

1. The inbound message is still appended to `Conversation History` (own
   `pausedHistory` array, capped at 20 like the AI path) and `Last Message`
   is still updated — **nothing is lost**.
2. `runAI()` is **never called** and **no AI reply is sent** — the function
   returns immediately after persisting.
3. A fail-soft WhatsApp nudge goes to the owner ("paused lead just wrote"),
   using the same `sendWA()` contract as the escalation/qualified pings
   further down (never throws, resolves `false` and logs on failure — a
   notify failure can never break message handling).

Confirmed in a mocked-fetch harness: a paused lead's message is recorded,
Anthropic is never called, no WhatsApp send goes to the lead's own phone
(only the owner-notify send fires), and a subsequent `ai-resume` restores
normal AI handling for the next message.

## Escalated-lead tracking (bonus, needed to "surface prominently")

The task asked the dashboard to surface escalated leads prominently
alongside `waFailed` ones, reusing the existing rendering. There was no
persistent "this lead escalated" marker before this change — escalation only
fired a one-time WhatsApp/email ping. Added `escalated: {at, question}` to
the same Notities envelope (`mergeEscalatedFlag`, same merge contract) so it
survives past the ping. Cleared two ways, both intentional:

- **A human sends a manual reply** (`api/leads.js` mode C) — clears it via
  `mergeNotitiesPatch(raw, {escalated: undefined})`, since a human actually
  answered.
- **Opportunistic cleanup** (`api/whatsapp.js`, the `else` branch next to the
  escalation block) — if a *later* turn doesn't escalate again, any stale
  `escalated` marker from a prior turn is cleared. Without this, a
  conversation that resolved itself (lead moved on, never got a manual
  reply) would sit in the "Actie nodig" widget forever. Verified in a second
  mocked-fetch harness: a lead with a pre-set `escalated` marker has it
  cleared after one normal (non-escalating) AI turn, with `notes`/`tasks`/
  `calls` untouched.

Both write paths use the same stale-baseline guard: if `updateFields[NOTITIES_FIELD]`
was already touched this turn (the `sendOk === false` / `waFailed` merge in
step 10), that fresher in-memory value is used as the merge baseline instead
of the original `lead.fields` snapshot — otherwise a `waFailed` flag written
moments earlier in the same turn could be clobbered by a merge computed from
stale data.

## 24h/template gating on manual replies (`api/leads.js`, mode C)

The existing manual-reply endpoint (`POST /api/leads?id=recXXX`, body
`{message}`) previously sent freeform unconditionally, with no 24h check at
all — a real risk to the shared WhatsApp number that pre-dates this task.
Fixed to mirror the existing `FOLLOWUP_TEMPLATE_NAME` gating pattern
(`cron-followup.js`'s follow-up loop, `sendAppointmentConfirmation()`):

- Scans the lead's `Conversation History` backward for the last `role:
  'user'` entry with a numeric `ts`.
- **Inside 24h** → freeform send, unchanged behavior.
- **Outside 24h, or unknown** → tries `MANUAL_REPLY_TEMPLATE_NAME` (falls
  back to the already-configured `FOLLOWUP_TEMPLATE_NAME`, so no new Meta
  approval is required to get this working day one) and sends that approved
  template (with the lead's first name as `{{1}}`) **instead of** the typed
  text — a manually typed message can't be squeezed into a fixed,
  pre-approved template body, so we're honest about what actually reached
  the lead. The Conversation History entry and the dashboard bubble are both
  tagged `template: true` / "Jij (template)" so the thread never implies the
  lead read words they didn't.
- **No template configured** → refuses with a clear Dutch error (409),
  telling the operator to configure a template or wait for the lead to write
  again. Never risks the shared number.

**Why "unknown" fails closed:** `ts` on user-role history entries is only
stamped going forward (`api/whatsapp.js`'s `processMessage()`, step 4, now
adds `ts: Date.now()`). Conversations that predate this deploy have no `ts`
on their inbound entries, so the code can't prove they're inside the window
— it treats that as expired rather than assuming freeform is still safe.
**This is a real rollout consideration, not just a test artifact**: every
lead who was mid-conversation *before* this deploy will have their next
manual reply refused (or template-substituted, if configured) until that
specific lead sends one more inbound message post-deploy, at which point a
`ts` exists and the window check works normally. This could not be verified
against live traffic — flagging it explicitly so Sindi/the owner isn't
surprised if manual replies briefly need a template or a fresh inbound
message right after this ships.

A successful manual reply (freeform or template) also clears any
`escalated` marker via `mergeNotitiesPatch`, since a human just responded.

## Dashboard changes (`api/dashboard.js`)

- **Takeover bar** in the lead panel's WhatsApp Gesprek section: "AI actief"
  (green) or "Mens aan het roer" (orange, with "sinds … · by …"), plus an
  escalated badge (shown only when *not* paused, to avoid redundant chips)
  with the original question as a tooltip, and a **Neem over / Geef AI
  terug** button wired to the new `ai-pause`/`ai-resume` modes. The button
  optimistically updates the lead's local Notities and re-renders the panel
  so it reflects immediately, without waiting for the next poll — same
  pattern `sendWhatsAppReply()` already used for `lead.gesprek`.
- **Reply box** gets a distinct border/placeholder while paused ("Jij bent
  nu aan het roer…") so it's obviously the right place to respond.
- **"Actie nodig" widget** (renamed from "Niet bereikbaar via WhatsApp",
  same `#nb-widget`/`#nb-list` elements — no separate inbox invented): now
  also lists escalated leads (tagged, sorted before `waFailed` ones since a
  promised 30-min callback is more time-sensitive), and every item opens the
  lead panel directly (`onclick` → `openPanel`), with "Bellen" still
  available via `stopPropagation`.
- **Incidental fix, found while extending this exact function**: the widget
  previously read `lead.fields['fld...']`, but `api/leads.js`'s GET response
  never includes a raw `fields` object — it returns flattened keys
  (`naam`, `telefoon`, `datum`, …). That access was always `undefined`,
  silently producing "(onbekend)" and no phone number for every item, for as
  long as this widget has existed. Fixed to read the correct flattened
  fields, since I was already rewriting this function to add escalated
  support.

## Self-review checklist (3 cycles, per the task)

- Can a paused lead ever get an AI reply? — No: the pause check returns
  before `runAI()` is reached; verified with a mocked-fetch test asserting
  Anthropic is never called and no WhatsApp send targets the lead's own
  phone.
- Is inbound history still recorded when paused? — Yes, verified (message
  appended, `Last Message` updated).
- Does the Notities merge preserve every pre-existing key incl. legacy plain
  text? — Yes for `aiPaused` and `escalated`, both directions (set/clear),
  verified against a fixture with existing notes/tasks/calls/afspraak, and
  a separate fixture with a legacy plain-text (non-JSON) Notities value.
- Does `parseNotities` preserve unknown keys on read? — Yes, confirmed by
  reading its existing `...d` spread (no code change needed there).
- Is the 24h/template gating correct on manual sends? — Yes: inside-window
  freeform, outside-window template substitution when configured, outside-
  window refusal when not, and fail-closed on missing `ts` — all four paths
  verified.
- Project-Code scoping on every new mode? — Yes: `ai-pause`/`ai-resume`
  follow the identical ownership-check pattern as PATCH/appointment-create/
  mode C (fetch record, compare `fldSmczuyUJd26HLe` to the authenticated
  `projectCode`, 403 on mismatch, 404 if not found).
- Function count unchanged? — Yes, still 13 files under `api/`.
- `node -c` clean? — Yes, all three changed files, after every edit.

## Verification performed (no real API calls made anywhere)

Two scratchpad-only mocked-`fetch` harnesses (written, run, then deleted —
never committed, never touched a real Airtable/Meta/Anthropic endpoint):

1. Pause/resume lifecycle: non-paused lead still triggers the AI → `ai-pause`
   merges the flag while preserving notes/tasks/calls/afspraak → a paused
   lead's next message is recorded with zero AI calls and zero AI-to-lead
   sends → `ai-resume` clears the flag while preserving the same data →
   the following message triggers the AI again → a legacy plain-text
   Notities value survives an `ai-pause` merge as a `{id:'legacy'}` note →
   manual reply inside the 24h window sends freeform → manual reply outside
   the window is refused with no template configured → manual reply outside
   the window sends the configured template instead → a conversation with
   no `ts` on its inbound entries fails closed. 10/10 passing.
2. Opportunistic escalated-cleanup: a lead with a pre-existing `escalated`
   marker has it cleared after one non-escalating AI turn, with unrelated
   Notities keys (a pre-existing note) left untouched. 1/1 passing.

## What could not be verified without live data

- Real Airtable behavior for the `ai-pause`/`ai-resume` PATCH against the
  live Notities field, and real dashboard rendering of the takeover bar/
  Actie Nodig widget in an actual browser (mocked-fetch tests exercise the
  server logic and JSON shapes, not the rendered HTML/CSS).
- The rollout gap described above under 24h gating: every in-flight
  conversation's manual-reply behavior immediately after this deploys, until
  each lead sends one more message and a `ts`-stamped entry exists.
- Whether a warm `api/whatsapp.js` Vercel instance's existing 3-minute
  in-memory lead cache (`LEAD_TTL`, pre-existing) could delay a pause/resume
  from taking effect for a lead it had already cached recently — this is a
  property of the pre-existing cache design, not something this change
  introduces, but it means a pause is not guaranteed instantaneous across
  every warm instance. Not something the mocked test harness could exercise
  faithfully (a real harness would need two genuinely separate processes to
  reproduce Vercel's per-function isolation).
