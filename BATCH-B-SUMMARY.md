# Batch B — Reliability Hardening Summary

Branch: `fix/reliability-hardening-b` (worktree `Helvaro-worktrees/fix-batch-b`, based on `main`)
Commits: `ad6d82e`, `76c0c1e`, `e846a81`

Three fixes for the same structural bug: delayed WhatsApp sends in `api/form.js`
and `api/whatsapp.js` ran after the HTTP response was already returned, with no
platform guarantee they'd survive to completion, and (in whatsapp.js) Airtable
was written to as if the send had already succeeded before it was even
attempted.

---

## Fix 1 — Vercel background-execution primitive

**Research question:** this codebase is bare `module.exports = async function
handler(req, res)` Node.js Serverless Functions, not Next.js. Does Next.js's
`after()` apply? What's the actual correct primitive?

**Finding:** `after()` is Next.js-only (App Router route handlers,
Next.js ≥15.1). For everything else — including this codebase's classic
req/res-style handlers — Vercel's own current docs point to `waitUntil()`
from the `@vercel/functions` package. I read the package's own source
(`wait-until.ts` / `get-context.ts` on GitHub) to confirm it doesn't require
the newer Web `fetch(request)` handler signature: it just reads
`globalThis[Symbol.for('@vercel/request-context')]`, a context object the
Vercel Node.js runtime sets per-invocation regardless of what shape the
exported handler is. Confirmed locally that `require('@vercel/functions')`
resolves via CommonJS (no ESM issues) and that calling `waitUntil()` outside
a Vercel runtime is a safe no-op — verified by direct `node -e` execution.

**Applied to both call sites:**
- `api/form.js`: the 45s `setTimeout` sending the opening message is now
  wrapped in a `Promise` and registered via `waitUntil()`, with the callback
  body wrapped in try/catch (a bare `setTimeout(async () => ...)` throwing
  becomes an unhandled rejection, which on modern Node can crash the whole
  Fluid Compute instance — not just this one request).
- `api/whatsapp.js`: the deferred `processMessage()` call (AI turn + 25-55s
  delay + send) is now `const work = processMessage(...); waitUntil(work);
  await work;` — registered explicitly AND still locally awaited, so nothing
  changes on a runtime where `waitUntil()` turns out to be a no-op.

**Confidence: moderate-high, not certain — flagging honestly rather than
guessing.** Two real caveats I could not resolve from inside this worktree:

1. **`waitUntil()`'s actual delivery guarantee is tied to Fluid Compute.**
   Vercel's own Fluid Compute docs list "Background processing... using
   `waitUntil`" as a *Fluid Compute feature*, and the `waitUntil()`
   implementation itself (`getContext().waitUntil?.(promise)`) is a **silent
   no-op** if the runtime doesn't provide that context function — exactly
   the kind of silent failure this whole audit is about. Fluid Compute has
   been the default for *new* Vercel projects since April 23, 2025, but I
   have no way to confirm from this git worktree whether it's actually
   enabled for the live Helvaro project (that's a dashboard/account-level
   setting, and `vercel.json` doesn't currently declare `"fluid": true`
   either way). **Action item for Sindi:** check Vercel Dashboard → Helvaro
   project → Settings → Functions → "Fluid Compute" toggle. If it's off,
   `waitUntil()` degrades to exactly today's behavior (an unenforced hope),
   and Fix 3 (the cron sweep) becomes the *only* real safety net rather than
   defense-in-depth. I deliberately did not touch `vercel.json` to enable it
   myself — that's a deployment-config decision outside the three files I
   was scoped to, and outside what I can verify is safe for the other 9
   functions sharing that config.

2. **`waitUntil()` promises share the function's own `maxDuration`** (60s,
   per `vercel.json`). This doesn't regress anything — the code already
   assumed a 45-60s budget before my changes — but it means `waitUntil()`
   doesn't buy extra time, only a better chance the platform doesn't tear
   the container down mid-delay. whatsapp.js's worst case (25-55s human
   delay + AI call + Airtable + WhatsApp API round trips) was already
   tight against 60s *before* this fix, per the existing comment in
   form.js ("45s delay + processing leaves ~15s buffer"). I did not shrink
   the delay or touch `maxDuration` (out of scope), but if Fluid Compute
   *is* confirmed on, Hobby-tier Fluid allows up to 300s — worth considering
   raising `maxDuration` for just these two functions in a follow-up to
   give real breathing room, now that `waitUntil()` is actually being
   relied on.

---

## Fix 2 — `api/whatsapp.js`: Airtable only reflects what actually happened

Reordered `processMessage()`'s tail: `sendWA()` is now attempted **before**
`updateLead()`, not after. `sendWA()` was changed to return `true`/`false`
(previously fire-and-forget with no signal, and no try/catch — a thrown
network error would have propagated uncaught) and now never throws.

- **On success:** identical to before — history gets the assistant turn,
  Conversation State advances, qualification fields get set on `done`.
- **On failure:** `Conversation History` / `Conversation State` are left
  completely untouched (nothing about the conversation actually moved, so
  nothing is written that implies otherwise), and the lead is flagged via a
  new `mergeWaFailedFlag()` helper.

**`mergeWaFailedFlag()` vs. reusing `form.js`'s `flagWaFailed()` directly:**
`flagWaFailed()` overwrites the Notities field outright, which is safe there
because it only ever runs immediately after lead creation (Notities is
still empty). Here we're mid-conversation, so a blind overwrite could
destroy real staff notes — the new helper merges instead. Cycle-2 review
caught a real edge case in my first draft of this helper: `dashboard.js`'s
`parseNotities()` also accepts bare legacy plain-text notes (pre-JSON
notes, wrapped as `{id:'legacy', text, ts}` on read) — my first version
silently discarded those when merging in the flag. Fixed and verified with
a live smoke test asserting a pre-existing legacy note survives the merge.

Also gated the callback-booking and in-chat-booking flows (sections 11/11b)
on the primary reply having actually sent — otherwise a failed primary
reply could still be followed by a booking confirmation message for a
conversation turn the lead never received, or an appointment getting
silently locked in off a message that never arrived. The owner-facing
"lead qualified" notification (11c) is intentionally **not** gated on
this — it reflects what the lead already said, not whether our reply
reached them, so the owner should still hear about it.

**Known residual gap (in scope discussion, not fixed):** Fix 2 flags
mid-conversation failures synchronously within the same request (protected
by Fix 1's `waitUntil()`). If the *entire container* dies before even
reaching that flagging code — i.e., Fix 1 fails too — a mid-conversation
lead is left at whatever state it was in *before* this turn (accurate, not
corrupted, but also not flagged). Fix 3's sweep only targets `state='new'`
+ empty history, per the explicit scope given, so it does not independently
catch this specific "died mid-turn on message 3+" scenario. This is a real,
narrow gap — flagging it rather than silently expanding scope to cover it.

---

## Fix 3 — `api/cron-followup.js`: stuck-`new`-lead sweep

Added `sweepStuckNewLeads()`, called every cron run (not gated on the 24h
window the main follow-up query uses). Targets:
`Conversation State = 'new'` AND `Conversation History` empty AND
`Created At` older than **15 minutes** AND not already flagged
(`FIND("waFailed", {Notities})=0`).

**Why 15 minutes:** worst-case healthy send is ~90s (45s/55s delay + a
single Airtable 429 retry, per both files' own `atFetch` comments). 15
minutes is a deliberately generous multiple of that, so the sweep only
ever fires on leads that are genuinely stuck, never ones still legitimately
in flight — while still catching failures same-day instead of waiting for
the existing 24-48h re-engagement window.

**Why flag instead of retry-send:** retrying would require duplicating
`form.js`'s per-client Auto-Reply Template + AI Name + language resolution
logic (~40 lines) inside `cron-followup.js`, with real risk of silently
drifting from the actual template over time. Flagging is simpler, safer,
and puts a human in the loop — consistent with this codebase's documented
fail-soft philosophy.

**Pre-existing bug found, NOT fixed (out of scope — not one of the three
named files):** `api/dashboard.js`'s `parseNotities()` (line ~8852) parses
the Notities JSON but reconstructs the returned object as
`{notes, tasks, calls, afspraak}` **without spreading the rest of the
parsed JSON** — so the `waFailed` key that `flagWaFailed()` (form.js, and
now also whatsapp.js / cron-followup.js) writes is silently dropped on
read. The dashboard's "Niet bereikbaar" widget (`renderNietBereikbaar()`,
~line 10595) filters on `parseNotities(lead).waFailed === true`, which per
this bug can never be true. **This means flagged leads are written
correctly but the dashboard currently cannot display them** — this bug
predates this batch (form.js's `flagWaFailed()` already had this same
silent gap before I touched anything) and needs a follow-up fix in
`dashboard.js` (likely a one-line `...d` spread in `parseNotities()`) to
actually close the loop. Recommend this as the first item in Batch C.

---

## Verification performed

- `node -c` on all three modified files, after every edit.
- Live smoke tests (scratchpad, not committed) with `global.fetch` mocked
  and the real handlers invoked end-to-end, including letting real 25-55s
  and 45s `setTimeout`s run to completion:
  - `whatsapp.js`, WhatsApp send **fails**: confirmed the PATCH sent to
    Airtable omits `Conversation History` / Conversation State, includes
    the Notities flag with `waFailed:true`, and preserves a pre-existing
    legacy plain-text note.
  - `whatsapp.js`, WhatsApp send **succeeds**: confirmed byte-identical
    behavior to the pre-fix code (history gets both turns, state advances,
    summary field set, exactly one WhatsApp send).
  - `form.js`, both outcomes: confirmed the HTTP response returns in
    ~0.00s (not blocked by the 45s timer), and the deferred send correctly
    calls `flagWaFailed` on failure / PATCHes Conversation History on
    success once the timer fires.
  - `cron-followup.js`: confirmed the generated Airtable formula string,
    and that both an empty-Notities stuck lead and a legacy-text-note
    stuck lead get flagged correctly (with the legacy note preserved).
- Confirmed `@vercel/functions` resolves via `require()` (CommonJS, no ESM
  interop issue) and is a safe no-op outside a Vercel runtime.

## What changed between review cycles (waitUntil/`after` research — the
piece flagged for extra scrutiny)

The core conclusion — `waitUntil()` from `@vercel/functions`, not
Next.js's `after()`, applies to this classic req/res-style codebase — did
not change across the three cycles; the initial research (reading Vercel's
current docs + the package's own source) held up. What **did** change
across cycles:

1. **Cycle 1 → 2:** initially I only registered `waitUntil()` in
   `whatsapp.js`'s top-level dispatch. Re-tracing the actual call graph
   confirmed the early-return paths (lead not found, conversation already
   completed) are *inside* the same `processMessage()` promise already
   being registered, so no additional wrapping was needed there — but this
   required deliberately re-verifying rather than assuming.
2. **Cycle 2:** identified the Fluid-Compute dependency and the
   silent-no-op behavior by reading `wait-until.ts`'s source directly
   (`getContext().waitUntil?.(...)`), rather than trusting the docs prose
   alone — this is the finding that turned into the "confidence: moderate,
   not certain" section above instead of a confident "this is fully
   solved" claim.
3. **Cycle 3:** no further changes to the waitUntil mechanism itself;
   cycle 3 for this piece was spent on live-testing it (real 45-55s waits,
   mocked `fetch`) rather than re-reading code, to get behavioral proof
   rather than just static confidence.

The `mergeWaFailedFlag()` helper (Fix 2/3) is the piece that actually
changed *implementation* between cycles: cycle 2's live-testing mindset
prompted me to test a "legacy plain-text Notities" input, which the
first draft silently discarded — that's a real bug that would have shipped
without the deliberate edge-case pass.

## Files touched

- `api/whatsapp.js` — Fix 1 (waitUntil dispatch wrapper) + Fix 2 (send-then-persist reorder, `sendWA` returns boolean, `mergeWaFailedFlag` helper, `sendOk` guards on booking flows).
- `api/form.js` — Fix 1 (waitUntil-wrapped deferred send, try/catch hardening).
- `api/cron-followup.js` — Fix 3 (`sweepStuckNewLeads`, `mergeWaFailedFlag`).
- `package.json` — added `@vercel/functions` dependency (required for Fix 1).
- `package-lock.json` — generated locally by `npm install` for testing; **left untracked/uncommitted**, since this repo has never committed a lockfile before and introducing one wasn't part of the ask.

Not touched: `vercel.json` (Fluid Compute toggle — flagged above as a
follow-up decision for Sindi), `api/dashboard.js` (pre-existing
`parseNotities()` bug — flagged above as a Batch C item).
