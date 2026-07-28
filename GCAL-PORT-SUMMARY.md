# Google Calendar Integration — Port Summary

Branch: `feature/vercel-growth` (worktree: `Helvaro-worktrees/vercel-features`)
Ported from `gcal-and-security` (3 commits: `feat` + 2 `fix`), adapted to this
branch's current code. No new Airtable fields (all 4 already exist on the live
base). Function count unchanged. No real API calls made anywhere during
development — verified with a throwaway mocked-fetch script, deleted after
the run, never committed.

## Why

Helvaro's pricing page advertises, on the €149 entry tier: *"Afspraken
rechtstreeks in je Google Agenda."* That feature existed only on an unmerged
branch. This port makes the claim true in the deployable app.

## What was ported, and how it folds into `leads.js`

**`api/_gcal.js` (new file, underscore-prefixed → not a Vercel route).**
Per-client OAuth token exchange/refresh, AES-256-GCM encryption of the stored
refresh token, free/busy query, and event create/update/delete. Nearly
identical to the source branch's version — this module has no dependency on
this app's auth model, so it ported close to verbatim. Every calendar-write
function returns `{ ok, error? }` / `{ ok, eventId? }` and never throws.

**`handleGcal` in `api/leads.js`.** Google originally shipped as a standalone
`api/gcal.js`, which blew Vercel's serverless-function limit on the source
branch and caused a deploy failure. It was folded into `api/leads.js` there,
and this port preserves that: **no `api/gcal.js` was created.** The public
path `/api/gcal` is rewritten to `/api/leads?__gcal=1` in `vercel.json`, and
`leads.js` dispatches to `handleGcal(req, res)` on that flag, before the rate
limiter and the normal leads-auth flow (it has its own auth). This keeps the
Google Cloud Console redirect URI (`/api/gcal?action=callback`) stable even
though the code physically lives in `leads.js`.

Modes:
- `POST {mode:'connect'}` → returns `{ url }`, the Google consent screen URL.
- `GET ?action=callback` → Google's redirect back after consent. Exchanges
  the code, encrypts + stores the refresh token, 302s to `/dashboard?gcal=...`.
- `POST {mode:'status'}` → `{ configured, connected, email }`.
- `POST {mode:'disconnect'}` → clears the stored token + email.

**Function count, verified:** 11 top-level route files in `api/`
(admin, auth, cron-followup, dashboard, demo, form-page, form, leads-list,
leads, privacy, whatsapp) + 3 underscore helper modules (`_mailer.js`,
`_pgapi.js`, and the new `_gcal.js`) which Vercel does not build as
functions. `api/gcal.js` does not exist. Confirmed via `find api -maxdepth 1
-type f -name "*.js"` before finishing.

## Adaptation: no cookies, so `connect` can't be a bare GET redirect

The source branch's `dashboard.js` diff assumed an `hv_session` httpOnly
cookie (from a security batch this worktree never merged). **This worktree
authenticates every dashboard request via a signed session token in the
`x-api-key` header — there is no auth cookie.** A bare
`window.location.href = '/api/gcal?action=connect'` navigation therefore
could not authenticate at all (a top-level navigation can't carry a custom
header).

Adapted design: `connectGoogleCalendar()` (`api/dashboard.js`) first does an
authenticated `fetch('/api/gcal', {mode:'connect'})` to get the (server-signed)
Google consent URL, *then* does `window.location.href = url`. This is
arguably better than the cookie-based design it replaces: the session token
never appears in any URL (no browser history / referrer / access-log
exposure), and `handleGcal`'s POST modes deliberately only accept the modern
signed-session path (not the legacy raw-API-key fallback the main handler
still supports) — a brand-new OAuth-touching feature fails closed rather than
extending trust to older, unsigned tokens.

## CSRF protection on the callback

`gcalSignState(projectCode)` / `gcalVerifyState(state)` HMAC-sign
`{p: projectCode, t: timestamp}` with the same `sessionSecret()` (derived
from `SESSION_SECRET`/`ADMIN_KEY`, throws — fails closed — if neither is set)
every session token in this app is signed with. `state` has a 10-minute TTL
and is verified with `crypto.timingSafeEqual`. Verified: a tampered
signature and an expired timestamp both redirect to
`/dashboard?gcal=invalid_state` rather than accepting the callback.

## Booking mirroring

Both paths a booking can be created/changed on now mirror to Google,
best-effort, wrapped in their own `try/catch` **after** the Airtable write
already succeeded:

- **`api/whatsapp.js`** (AI in-chat booking): after `createAppointment()`
  succeeds and the freeform confirmation is sent, mirrors the booking via
  `_gcal.createEvent()` and stores the returned event ID back on the
  Appointments record (new `setApptGoogleEvent()` helper). This path only
  ever *creates* — the in-chat flow has no reschedule/cancel today, so
  there's nothing to mirror-update here (matches the source branch).
- **`api/leads.js`** (dashboard appointment CRUD): `appointment-create`
  mirrors the same way and now returns `googleEventId` in its response.
  `appointment-update` fetches the full existing record (not just the
  ownership-check field it fetched before) so it has the stored
  `Google Event ID`; if the update cancels the appointment it calls
  `_gcal.deleteEvent()`, if it changes `Start Time`/`Duration` it calls
  `_gcal.updateEvent()`. (Status changes to `completed`/`no_show` with no
  time change don't touch Google — same as the source branch; a future pass
  could also clear those off the calendar.)

## Availability

`api/whatsapp.js`'s in-chat booking path already builds an
`existingAppointments` list from the Appointments table for the AI's prompt
context. It now also fetches the client's Google free/busy for the next 14
days (`_gcal.freeBusy`) and appends those intervals to the same list, labeled
"(Google agenda, bezet)" — the AI sees one merged availability picture and
never proposes a slot the client is already busy on in Google, without any
change to how the AI's prompt is built downstream.

## Dashboard UI

`api/dashboard.js`: a "Google Agenda" section in Instellingen (between
Support and Gevaar zone), matching the existing settings-section pattern —
connect/disconnect buttons, connected-account email display. The OAuth round
trip's `?gcal=connected|denied|error|invalid_state|unconfigured|client_not_found`
redirect param is handled the same way the existing Calendly redirect
handling already is (toast + clean the URL via `history.replaceState`).

## Fail-soft guarantees (verified, see below)

- **A client who never connected Google**: every `_gcal`-touching helper
  short-circuits to `{ token: '' }` before any network call. Booking,
  confirmation, and availability behave exactly as before this port.
- **Google down/erroring at any point** (OAuth refresh, free/busy, event
  create/update/delete): every call site is wrapped in its own `try/catch`,
  logs and swallows. The Airtable appointment is the source of truth and is
  never rolled back or blocked because of a Google failure. Verified for
  both `appointment-create` and `appointment-update` (cancel path) — Google
  thrown network errors, the Airtable write still completes, the HTTP
  response is still 200 `{ ok: true, ... }`.
- **Refresh token**: AES-256-GCM at rest (`v1:` prefix), decrypted in-memory
  only for the duration of a token-refresh call, never logged (grepped every
  `console.*` call touching `refresh`/`token` — none print a token value,
  only `.message` or non-sensitive context). Encryption **fails closed**: if
  `GOOGLE_TOKEN_KEY`/`SESSION_SECRET`/`ADMIN_KEY` are all unset,
  `_gcal.encryptToken()` throws, which the OAuth callback catches and
  redirects to `/dashboard?gcal=error` — it never falls through to store the
  refresh token in plaintext. A response with no `refresh_token` from Google
  (e.g. a re-consent edge case) is treated the same way — never marks
  "connected" without something to encrypt.

## Verification performed

`node -c` on every changed file (clean). A throwaway mocked-fetch script
(deleted after the run, never committed, `global.fetch` fully mocked — no
real Google/Airtable calls) loaded the real `api/leads.js` and `api/_gcal.js`
modules and exercised, against the actual code:

- State sign/verify: valid, tampered (rejected), expired (rejected)
- Token encrypt/decrypt round-trip, including a tampered-ciphertext case
  (GCM auth tag rejects it, decrypts to `''`, never throws)
- Full `connect` → `callback` OAuth round trip against mocked Google
  responses: refresh token stored **encrypted**, decrypts back to exactly
  what "Google" returned; email parsed from the mocked `id_token`
- `status` / `disconnect`, including Airtable itself throwing (clean 500,
  no crash)
- `appointment-create` mirrors to a mocked Google Calendar and writes
  `Google Event ID` back onto the Airtable record
- `appointment-create` with a **mocked Google failure**: appointment is
  still created, response is still `200 {ok:true, id, apptId}`,
  `googleEventId` is empty (not silently faked)
- `appointment-update` (cancel): Google event deleted on success; on a
  **mocked Google failure**, the Airtable status update still completes and
  the response is still `200 {ok:true}`
- A client with no Google connection: appointment-create succeeds with zero
  Google calls attempted
- `_gcal.freeBusy()` / `_gcal.createEvent()` directly, against a rejecting
  `fetch`: `freeBusy` returns `[]`, `createEvent` returns `{ok:false}` — both
  without throwing

`api/whatsapp.js`'s new Google code was verified by `node -c`, by loading the
real module (via a sibling worktree's already-installed `@vercel/functions`
dependency, read-only, nothing written there) to confirm it requires
cleanly, and by code review: `gcalAccess()` and `setApptGoogleEvent()` are
structurally identical to the `leads.js` equivalents that *were* exercised
above (same `_gcal` calls, same fail-soft `try/catch` shape), and every call
site sits in its own `try/catch` block placed strictly after the step it
must never block (appointment already created, confirmation already sent).
End-to-end webhook execution wasn't run — that requires mocking Meta's
signature verification, the Anthropic call, and the WhatsApp Send API, which
is out of scope for a Google Calendar port and would touch code this task
didn't change.

## What the owner (Sindi) needs to do before this is live

The feature is fully wired but **dormant** — `_gcal.isConfigured()` requires
all three of `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
`GOOGLE_REDIRECT_URI`; until they're set, `handleGcal` redirects/responds
with `configured: false` and no other code path calls Google at all.

1. **Google Cloud Console**: create (or reuse) a project → APIs & Services →
   OAuth consent screen (External, add the Calendar scopes below) → Credentials
   → Create OAuth client ID → Web application.
   - Authorized redirect URI: `https://app.helvaro.pro/api/gcal?action=callback`
   - Scopes needed: `openid`, `email`,
     `https://www.googleapis.com/auth/calendar.events`,
     `https://www.googleapis.com/auth/calendar.readonly`
   - Enable the **Google Calendar API** for the project.
2. **Vercel env vars** (Production, and Preview if you want to test there):
   - `GOOGLE_CLIENT_ID` — from the OAuth client above
   - `GOOGLE_CLIENT_SECRET` — from the OAuth client above
   - `GOOGLE_REDIRECT_URI` = `https://app.helvaro.pro/api/gcal?action=callback`
     (must match the Console entry exactly)
   - `GOOGLE_TOKEN_KEY` — any long random secret, dedicated to this
     (falls back to `SESSION_SECRET`/`ADMIN_KEY` if unset, but a dedicated
     key means rotating it doesn't also invalidate every login session)
3. Ship it, then connect one test client's calendar from Instellingen to
   confirm the consent screen and callback work end-to-end — that live
   round trip is the one thing this port genuinely cannot verify without
   real Google credentials.

## Unverifiable without live Google credentials

- The actual Google consent screen rendering/UX and real refresh-token
  issuance behavior (offline access, `prompt=consent` forcing a fresh
  refresh token on re-consent).
- Real Google API rate limits / quota behavior under production load.
- Whether the Google Cloud OAuth consent screen needs verification (it will,
  once usage grows past Google's unverified-app user cap) — worth flagging
  to Sindi separately, not a code concern.
