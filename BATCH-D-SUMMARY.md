# Batch D: Medium-Severity Fixes Summary

Branch: `fix/medium-severity-d` (stacked on `fix/consolidated-ab`, which already
has security batches A+B+C merged)

This batch was started by a prior agent that got ~85% through before being
killed mid-task, leaving uncommitted (but syntactically valid) changes across
`api/admin.js`, `api/auth.js`, `api/leads-list.js`, `api/leads.js`, and
`api/whatsapp.js`. This session reviewed that work, made one architectural
change to how `api/whatsapp.js` was touched (see Finding 12 below), and
finished the remaining `api/cron-followup.js` findings. Everything is now
committed.

## Commits

1. `7e6b61f` fix(security): admin.js CORS/rate-limit/record-ID hardening
2. `ff2e29a` fix(security): auth.js reset-token invalidation + OWNER_PASSWORD docs
3. `5253a6b` fix(security): leads-list.js spoof-proof rate-limit IP
4. `d30b50b` fix(security): leads.js CSV injection, quota, auth, tenant-isolation fixes
5. `ce3ad24` refactor(whatsapp): extract fetchWebsite() into shared api/lib/fetch-website.js
6. `5d8a8fc` fix(security): cron-followup.js SSRF, dedup fail-safe, permanent-skip window

---

## Findings fixed (prior agent's work, reviewed this session)

### 1. CORS tightened to `*.pages.dev` only — `api/admin.js`
`*.workers.dev` was whitelisted alongside `*.pages.dev` but is undocumented
(`docs/architecture.md`/`docs/api-reference.md` only mention `*.pages.dev`)
and unused (no `wrangler.toml`, no Workers deployment anywhere in the repo).
Removed it, left a comment on how to re-add it (and update both docs) if a
real Workers origin ever needs access.

### 2. Spoof-proof rate-limit IP — `api/admin.js`, `api/leads.js`, `api/leads-list.js`
All three files keyed their per-IP rate limiter off `x-forwarded-for`, which
a client can set directly to spoof the key (bypass the limit entirely, or
frame another IP). Switched to `x-vercel-forwarded-for` (set by Vercel's edge
from the real connection, not client-controllable) with `x-forwarded-for` as
a fallback for local dev where there's no Vercel edge in front.

### 3. CSV/Excel formula-injection guard extended — `api/admin.js`, `api/leads.js`
Batch C already added `csvFormulaGuard()` for `leads.js`'s CSV export paths.
This batch applied `escapeFormula()` (the *Airtable-query* escaper, distinct
from the CSV-injection guard) to `leads.js`'s `appointments-list` formula and
`admin.js`'s `list-content` formula, and added a status whitelist to
`list-content` matching the existing `update-content` whitelist.

### 4. Record-ID format validation — `api/admin.js`
`pipeline-update`, `pipeline-delete`, `goal-save`, `goal-delete` only checked
truthiness of `body.id` before using it in an Airtable URL/formula. Now
validated against `^rec[A-Za-z0-9]{14}$` before use.

### 5. Test-message per-tenant daily quota — `api/leads.js`
The `test-message` mode had only the file's shared IP rate limiter protecting
it. Since it sends through the *shared platform* WhatsApp number, one client
hammering it risked the number getting throttled/banned for every client.
Added a 10/day quota keyed by `${projectCode}:${YYYY-MM-DD}`.

### 6. Admin-token short-circuit is GET-only — `api/leads.js`
An admin-authenticated `PATCH`/`POST` used to hit the same unconditional
"empty client" return as `GET`, so a save/send call silently no-op'd while
the caller believed it succeeded. Now only `GET` gets the empty payload;
`PATCH`/`POST` get a `400`.

### 7. `verifySession()` fails closed on missing `exp` — `api/leads.js`
Previously `if (data.exp && Date.now() > data.exp) return null` treated a
token with *no* `exp` field as never-expiring. Every token `auth.js`'s
`signSession()` actually mints always sets `exp`, so a missing/non-numeric
`exp` now means "malformed/hand-crafted token" and is rejected outright.

### 8. Appointment-create cross-tenant ownership check — `api/leads.js`
`body.leadId` was linked to a new appointment after only an ID-shape check —
no verification the lead actually belonged to the authenticated client. Any
tenant could link an appointment to another tenant's lead by
guessing/enumerating a record ID. Added an ownership fetch-and-compare
(`Project Code` on the lead vs. the caller's `projectCode`) before linking.

### 9. `sendWA()` result checked for owner pings — `api/whatsapp.js`
The escalation ping and qualified-lead notification to the owner used
`sendWA(...).catch(() => {})`, but `sendWA()` never throws (it already
catches its own errors and resolves `false`) — so that `.catch()` was dead
code and a failed owner ping was silently swallowed. Now the resolved
boolean is checked and a call-site-specific error is logged on failure, so
"owner never got pinged about this escalation" is traceable in server logs.

### 10. `OWNER_PASSWORD_HASH` documented as intentional plaintext — `api/auth.js`
The owner-bypass login path compares `OWNER_PASSWORD_HASH` with `safeEqual()`
(plaintext comparison), despite the name implying a bcrypt hash like the
`Password Hash` field on real user records. **Judgment call, kept as-is**:
converting this to a bcrypt comparison without first confirming and rotating
the actual value stored in the Vercel env would silently break owner login
in production. Renamed the local var to `OWNER_PASSWORD_PLAINTEXT` and left
an explicit comment. See "Residual gaps" below.

### 11. Reset-token invalidation on new issuance — `api/auth.js`
Previously a reset token stayed valid for its full 1h TTL even after the
user requested a *newer* reset link — an old, possibly-leaked link kept
working. Fixed by mixing a monotonic per-instance sequence number into the
HMAC signing key (`resetSecret(passwordHash, issuedMarker)`), tracked per
email in `_lastResetIssued`. When a newer token is signed for an email, the
signing key used to verify an older token changes, so the older token's
signature stops matching even though its own HMAC/expiry would otherwise
still pass. See "Residual gaps" below for the known limitation of this
approach.

---

## Findings fixed this session

### 12. `api/whatsapp.js` restructuring reverted; `fetchWebsite()` extracted to a shared module — the Task 1 decision

**What the prior agent did:** wrapped the entire webhook-handler body in a new
`webhookHandler(req, res)` function, made `module.exports` a one-line
delegator to it, and added `module.exports.fetchWebsite = fetchWebsite`
purely so `cron-followup.js` could `require('./whatsapp')` and reuse
`fetchWebsite()`'s SSRF protections for its own outreach website fetch (a
genuine Medium finding, M4 below).

**Why that was rejected:** `api/whatsapp.js` is the single most critical file
in the app — the live Meta webhook, including batch A's raw-body-reading /
signature-verification fix. Restructuring it (adding an extra function layer,
changing `module.exports`'s shape) is meaningful blast radius for an SSRF fix
that has nothing to do with the webhook itself. Worse, `require('./whatsapp')`
from `cron-followup.js` would execute whatsapp.js's entire module-init
(module-scoped `_dedupCache`, `_leadCache`, `_clientCache`, all the `const`
env-var reads) as a side effect, just to reach one helper function.

**What this session did instead (the "Preferred" option from the task):**
extracted `fetchWebsite()` and its SSRF guards verbatim into a new module,
`api/lib/fetch-website.js`, parameterized with `{ tag, maxChars }` so each
caller keeps its own log prefix and truncation length. Both `whatsapp.js` and
`cron-followup.js` now `require('./lib/fetch-website')` — a plain,
side-effect-free import (matches the existing `api/lib/card.js` pattern
already used by `admin.js`). `whatsapp.js`'s `module.exports` was reverted to
the original single `async function handler(req, res) { ... }` — no wrapper,
no extra export.

**Verification performed:**
- `node -c api/whatsapp.js`, `node -c api/cron-followup.js`,
  `node -c api/lib/fetch-website.js` all pass.
- Read `api/whatsapp.js` top-to-bottom after the revert: the GET
  webhook-verification branch and the POST raw-body-read →
  HMAC-signature-verify → `JSON.parse` → `res.status(200).send('OK')` →
  `processMessage()` flow (added in batch A) are byte-for-byte unchanged
  from before this batch — confirmed via `grep -n "module.exports"` (single
  match) and a full diff review showing only: the new `require` at the top,
  one call-site tweak (`fetchWebsite(website, { tag: '[WhatsApp]' })`), the
  `sendWA()` boolean-check fix (finding 9), a stale-comment fix (finding 13
  below), and removal of the now-dead local `fetchWebsite()` function.
- Confirmed no remaining references to `require('./whatsapp')` or
  `.fetchWebsite` anywhere in `api/`.

### 13. `cron-followup.js` — M4: SSRF-protect the outreach website fetch

`runOutreach()` fetched `l.website` — a URL from third-party, Apify-scraped
business-listing data, i.e. untrusted input the same way a lead-supplied URL
would be — with a raw, unprotected `fetch(l.website, { redirect: 'follow' })`.
Replaced with the shared `fetchWebsite(l.website, { tag: '[outreach]',
maxChars: 3500 })` from finding 12, which adds the protocol whitelist,
private-IP/metadata blocklist, no-redirect-follow, and 5s timeout that
`whatsapp.js` already had. As a side effect this also now strips
`<script>`/`<style>` tag *contents* (not just tags) before the text is fed
into the outreach-email prompt, which the old raw-fetch path didn't do.

### 14. `cron-followup.js` — M3: dedup-fetch fail-safe, not fail-soft

`runOutreach()`'s dedup step (fetch already-contacted emails from the
Outreach table) had a bare `catch {}` — on any transient DB error, `seen`
silently stayed empty, and the very next step would then treat *every* fresh
Apify lead as new, including businesses already cold-emailed (or that already
replied "not interested").

**Judgment call — fails CLOSED, matches the spirit but not the letter of the
file's usual fail-soft philosophy:** re-emailing a business we've already
contacted is a worse, harder-to-undo outcome (reputational risk, potential
spam complaints) than skipping one day's outreach. Since this cron runs
daily and `MAX_PER_RUN` is only 2 leads/run, skipping a run is cheap — the
same leads get picked up correctly-deduped on the next run. Added a
`console.error` on the failure path and an early `return { skipped:
'dedup_fetch_failed' }` that aborts the whole `runOutreach()` call before any
emails are sent.

### 15. `cron-followup.js` — M2: permanent-skip follow-up window widened

The follow-up query selected leads created strictly between 24h and 48h ago,
still `'new'`, running once a day. If a run threw before reaching this query,
or hit the existing `429` early-return, every lead sitting in that 24h-48h
band aged past 48h before the *next* run — falling permanently outside the
window, so they'd never get a follow-up.

**Fix:** widened the upper bound from 48h to 7 days (`ago48h` → `ago7d`).
This is safe against duplicate sends because the lead's `Conversation State`
field flips `'new'` → `'in_progress'` the moment a follow-up actually sends
(pre-existing logic, unchanged) — so a successfully-followed-up lead drops
out of the `{fld8mkrEWcyq7mUip}="new"` filter on its own regardless of how
wide the age window is. Widening only gives a missed run up to a week to be
caught by a later one, instead of dropping the lead forever.

**Residual/judgment-call note on this fix:** the existing PATCH-to-
`in_progress` call (which marks a follow-up as sent) already had no retry —
if it silently failed (line ~108, `if (!pRes.ok) console.error(...)`), the
lead stayed `'new'`. Before this fix, that meant at most one further no-op
day (next day the lead would age past 48h and drop out entirely, with a
lucky/unlucky single silent miss). After this fix, a lead whose
mark-as-sent PATCH keeps failing could now be re-sent the WhatsApp *template*
follow-up on each of up to ~6 more daily runs, instead of just one, until
either the PATCH succeeds or the lead ages past 7 days. This is judged an
acceptable trade-off (Airtable PATCH failures are rare/transient in
practice, and repeat template sends — not freeform — carry low
account-risk), not silently ignored: flagging it here per the task's
instruction to surface trade-offs rather than resolve them quietly.

### 16. `api/whatsapp.js` dedup-cache TTL comment corrected

The comment above the webhook's dedup check said "60-second TTL via
timestamp pairs." The actual `_dedupSeen()` implementation only garbage-
collects entries older than 5 minutes (`300_000`ms), and only once the cache
exceeds 500 entries — there's no fixed per-entry TTL. Corrected the comment
to describe the real GC behavior instead of a number that never matched the
code.

---

## Residual gaps / judgment calls (flagged, not silently resolved)

1. **Reset-token invalidation is per-serverless-instance state (finding
   11).** `_lastResetIssued` is an in-memory `Map`, not shared across
   concurrent Vercel instances or cold starts — same category of limitation
   as the existing `_userCache`. If two reset requests for the same email
   land on two different warm instances, the instance that never observed
   the newer issuance still verifies the older token successfully. Closing
   this fully needs persisted per-user state (an Airtable "Last Reset Issued
   At" column, or external shared state like Redis) — not implemented here
   without first confirming an Airtable schema change is safe to make. In
   practice this still closes the common case: a user re-requesting a reset
   link minutes apart, which usually lands on the same warm instance.

2. **`OWNER_PASSWORD_HASH` stays plaintext-compared (finding 10).**
   Documented, not "fixed" into bcrypt — doing so without first confirming
   and rotating the actual Vercel env value would silently break owner
   login. Flagging this again here so it isn't missed: if a real hash value
   ever gets stored in that env var, the `safeEqual()` plaintext comparison
   in `api/auth.js` needs to change to a `bcrypt.compare()` call at the same
   time, or owner login breaks silently.

3. **M3 dedup fail-safe vs. the file's usual fail-soft convention (finding
   14).** Most of `cron-followup.js` deliberately treats individual-step
   failures as non-fatal (`.catch(e => { console.error(...); return null;
   })` around each of the weekly-report/learning/content-gen/poster/etc.
   steps, so one broken subsystem never blocks the others). The dedup-fetch
   fix breaks that pattern on purpose for `runOutreach()` specifically,
   because the failure mode here (duplicate cold email to an already-
   contacted business) is qualitatively worse than "this one subsystem
   didn't run today." Not extended to any other step in the file.

4. **M2 window-widening side effect on stuck PATCH failures** — see the
   residual note under finding 15 above.

5. **`api/leads-list.js` removal deferred.** Flagged by the original audit
   as probably-dead code, but not removed — Sindi still needs to confirm
   it's truly unused before deletion. Its rate-limit fix (finding 2) was
   still applied in place since the file is live in the meantime.

6. **Herald-legacy posting/content-gen code in `cron-followup.js`**
   (~38% of the file: `runMetaPoster`, `runAyrsharePoster`, `runMakePoster`,
   `runWeeklyContentGen`, `upcomingPostsLow`, `runImageBackfill`, etc.) was
   explicitly out of scope this session — untouched, pending Sindi's env-var
   check per the task instructions.

---

## Verification performed

- `node -c` on every changed/added file: `api/admin.js`, `api/auth.js`,
  `api/leads-list.js`, `api/leads.js`, `api/whatsapp.js`,
  `api/cron-followup.js`, `api/lib/fetch-website.js` — all pass.
- Full top-to-bottom read of `api/whatsapp.js` after the Task 1 revert,
  confirming the webhook's GET-verification and POST raw-body/signature
  paths are unchanged from before this batch.
- Confirmed no remaining `require('./whatsapp')` or `.fetchWebsite`
  references anywhere in `api/` (the extraction fully replaced the earlier
  approach, nothing left half-migrated).
- Confirmed `api/lib/*` requires are an existing, working pattern in this
  repo (`api/admin.js` already requires `./lib/card`) and covered by
  `vercel.json`'s `"api/**/*.js"` function glob — no config change needed
  for the new `api/lib/fetch-website.js`.
- Reviewed the prior agent's 11 findings in full (all diffs read end-to-end,
  cross-referenced call sites and existing helpers like `escapeFormula` /
  `csvFormulaGuard` for consistency) even though they were not this
  session's primary focus, per the task's instruction to give them a review
  pass since they never got their own 3 cycles.
