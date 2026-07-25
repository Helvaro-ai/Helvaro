# Vercel deploy checklist — `deploy/vercel-hardened`

This branch is going to production, serving real leads. Nothing in this
document has been pushed, deployed, or run against real credentials — every
claim below was verified by reading the code, cross-referencing
`docs/architecture.md`, and local syntax/logic checks (see "Verification
performed" at the bottom).

---

## 1. What's in this branch (plain language)

- **Security hardening (batches A-D, ~30 fixes)** — session-secret now
  fails closed instead of using a default, WhatsApp webhook signatures
  actually block forged requests (was checked but not enforced), 3
  dashboard XSS holes closed, CSV-export formula-injection guard, silent
  WhatsApp-send failures now surface on the dashboard, NL→BE phone-country
  fix, Belgian currency-format parsing fix, GDPR consent now persisted
  server-side, plus 14 more medium-severity fixes. Full detail in
  `BATCH-A/B/C/D-SUMMARY.md`.
- **Herald posting strip** — this app can no longer post to Instagram,
  Facebook, or LinkedIn under any configuration. That capability now lives
  solely on the separate VPS "Herald" service. Previously, removing the
  `MAKE_WEBHOOK_URL`/`AYRSHARE_API_KEY` env vars did NOT stop Vercel from
  posting — there was a silent fallback (`runMetaPoster`) that kept posting
  via the raw Meta Graph API, causing every post to go out twice (once from
  Herald, once from Vercel). That fallback and five other dead functions
  (~438 lines) are now gone entirely. Full detail in
  `STRIP-HERALD-SUMMARY.md`.
- **Compliance backport** — GDPR/AI-Act fixes ported from the (unmerged)
  VPS backend to this live Airtable-based app: admin-authenticated lead
  erasure (anonymize by default, hard-delete on request) and export
  endpoints, the AI now answers honestly when directly asked if it's an AI
  instead of denying it, automatic 6-month anonymization of cold/
  disqualified leads, a code-guaranteed opt-out footer on Envoy's cold
  outreach emails, and a rewritten privacy policy with named sub-processors,
  an international-transfers section, and concrete retention text. Full
  per-file detail in `VERCEL-BACKPORT-SUMMARY.md`.

---

## 2. Function inventory — no capacity problem

**11 routes + 2 helpers = 13 files in `api/`, well under any Vercel plan's
function-count limit (Pro's is far above this):**

```
admin.js  auth.js  cron-followup.js  dashboard.js  demo.js
form-page.js  form.js  leads-list.js  leads.js  privacy.js  whatsapp.js
```
plus `_mailer.js` and `_pgapi.js` — these are Vercel *helper modules*, not
routes. Vercel does not deploy a Serverless Function for any file whose
name starts with `_`; they're just `require()`d by the real route files.

`docs/architecture.md` still says "Vercel Hobby plan = max 12 serverless
functions. We zitten precies op 12." — that note is stale relative to the
current code (there are 11 real routes today, not 12) and moot anyway once
Pro is active. **There is no function-count problem on this branch, on
either plan.** Don't let that stale doc line cause a false alarm during
deploy.

Also confirmed: `api/gcal.js` does **not** exist on this branch (Google
Calendar integration is unmerged, on a different branch) and nothing in
`vercel.json` or any route file references it. Nothing to break here.

---

## 3. Why Pro, and what it actually buys you

**Primary reason: licensing.** Vercel's Hobby plan is officially
non-commercial. This app is about to bill a paying client — Pro resolves
that regardless of any technical need.

**Real technical benefits, secondary:**

- **Higher `maxDuration` ceiling.** Hobby caps functions at 300s even with
  Fluid Compute; Pro allows up to 800s (1800s in beta). This branch uses
  that headroom conservatively — see section 4.
- **Fluid Compute is NOT Pro-exclusive** — it's been the default for new
  Vercel projects since April 2025, and is available on Hobby too. Pro's
  contribution here is the longer `maxDuration` ceiling that Fluid Compute
  can use, not Fluid Compute itself. Still worth an explicit verification
  step below, since this project may predate that default.

### Step: verify Fluid Compute is on

1. Vercel dashboard → this project → **Settings → Functions**.
2. Confirm **Fluid Compute** shows as enabled. If it's off, turn it on —
   there's no downside for this app's workload.
3. This matters because `api/whatsapp.js` and `api/form.js` both use
   `waitUntil()` (from `@vercel/functions`) to keep a deferred WhatsApp
   send alive after the HTTP response is already returned to the caller
   (the 25-55s "human-feeling" delayed send). `waitUntil()` itself works on
   any Vercel deployment — Fluid or not; it only becomes a no-op when there's
   no platform request context at all (e.g. running locally, per the code's
   own comment at the top of `whatsapp.js`). Fluid Compute's contribution
   here is a better execution model for this kind of "respond fast, keep
   working after" workload generally (fewer cold starts, cheaper concurrent
   invocation reuse) — not a hard requirement for `waitUntil()` to function.
   Worth confirming it's on regardless; not a blocker if it somehow isn't.

### Important: `waitUntil` is best-effort, not a delivery guarantee

Do not treat `waitUntil()` as "the message will definitely send." It keeps
the function alive for the delayed work, but it's fire-and-forget — there's
no retry if the underlying send throws in a way that isn't caught, and
Vercel's own guidance is that mission-critical delivery should go through a
proper queue/outbox, not `waitUntil`.

**The real backstop already in this branch is `sweepStuckNewLeads()`** in
`api/cron-followup.js` (runs on every daily cron): it finds any lead still
`'new'` with an empty Conversation History more than 15 minutes after
creation and flags it `waFailed: true` in Notities, which the dashboard
surfaces as **"Niet bereikbaar."** That sweep doesn't trust that the
delayed send happened — it checks. This is why the smoke checks in section
7 include verifying that flag actually surfaces, not just that one WhatsApp
message went through.

A proper outbox/queue for outbound WhatsApp sends would be the robust
long-term fix (see "Known gaps," section 9) — deferred for now; the sweep
is judged sufficient at current lead volume.

### Step: `maxDuration` (already set on this branch, verify after deploy)

`vercel.json` now sets per-function overrides instead of one blanket 60s
for everything:

| Function | maxDuration | Why |
|---|---|---|
| `api/whatsapp.js` | 120s | 25-55s randomized human-delay send + AI call + Airtable read/write following it — was tight against the old 60s ceiling. |
| `api/form.js` | 120s | Fixed 45s pre-send delay + a possible 30s Airtable-429 retry + the WhatsApp send itself — the file's own comment assumed "~15s buffer" with no retry; a retry could blow past 60s. |
| `api/cron-followup.js` | 300s | One invocation walks the stuck-lead sweep, quality-rating check, the new 6-month retention sweep, Monday weekly-report emails, the weekly learning loop, and Envoy's sequential outreach sends — several sequential external API calls in one run. Not user-facing, so extra headroom costs nothing in UX. |
| everything else | 60s (unchanged) | No function outside the three above has any delayed/multi-step work that approaches 60s. |

After the first deploy, spot-check one `whatsapp.js` invocation's duration
in the Vercel dashboard (Functions tab) to confirm it's landing comfortably
inside 120s, and one `cron-followup.js` run to confirm it lands inside
300s — this is an observation step, not a guess.

---

## 4. Required environment variables

**Never print or paste real values into logs, commits, or chat.** This
table only names what's needed and why.

### Core (app breaks without these)
| Var | Used for |
|---|---|
| `API_AIRTABLE` | Airtable API token (Leads/Clients/Users tables) |
| `BASE_AIRTABLE` | Airtable base ID |
| `PHONE_NUMBER_ID`, `WHATSAPP_TOKEN` | WhatsApp Business send API |
| `WA_APP_SECRET` | Verifies the `X-Hub-Signature-256` header on inbound webhooks — **do not deploy without this set**, or signature verification is silently disabled and any forged payload is accepted (batch B fix). |
| `WA_VERIFY_TOKEN` | Meta webhook subscription handshake (`hub.verify_token`) |
| `SESSION_SECRET` (or `ADMIN_KEY` as fallback) | Signs/verifies dashboard session tokens — **fails closed** if neither is set (batch A fix): the app throws rather than signing with a default secret. |
| `ADMIN_KEY` | Admin-only endpoints, incl. the new `lead-delete`/`lead-export` erasure modes |
| `ANTHROPIC_API_KEY` | AI replies (`whatsapp.js`), reply suggestions, content generation |
| `CRON_SECRET` | Protects `/api/cron-followup` so only Vercel's own cron trigger can call it. **Fails closed**: if unset, every request (including Vercel's own scheduled trigger) gets `401` — the retention sweep, weekly reports, learning loop, and Envoy outreach simply never run, with no louder error than a 401 in the function logs. Set this before relying on the daily cron for anything. |

### Email (SMTP primary, Resend fallback)
| Var | Used for |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Namecheap Private Email — primary transport |
| `SMTP_FROM` | Optional, defaults to `SMTP_USER` |
| `RESEND_API_KEY`, `RESEND_FROM` | Fallback if SMTP send fails |
| `REPLY_TO` | Optional reply-to override for Envoy outreach mail |

### New in this batch — compliance footer (Envoy outreach)
| Var | Used for |
|---|---|
| `LEGAL_ENTITY_NAME` | Defaults to `'Helvaro BV'` if unset — safe default, matches the Terms of Service copy. |
| `LEGAL_ADDRESS` | **No safe default.** Renders as a visible `[LEGAL_ADDRESS niet ingesteld — zet env var LEGAL_ADDRESS]` placeholder in every outreach email footer until set. Set this before Envoy sends any real outreach mail post-deploy. |
| `VAT_NUMBER` | No default, silently omitted from the footer if unset (not a visible placeholder — optional but recommended). |

### Optional / feature-specific
| Var | Used for |
|---|---|
| `PG_API_URL`, `PG_API_TOKEN`, `PG_API_INSECURE` | VPS Postgres facade for Marketing Posts / Outreach / Appointments (Envoy dedup + content-gen storage) |
| `APIFY_TOKEN` | Envoy's lead-sourcing (Apify actor task) |
| `OPENAI_API_KEY` / `OPENAI`, `POLLINATIONS_TOKEN`, `PEXELS_API_KEY` | Optional image sourcing for the /social content generator |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage for generated images |
| `NOTIFY_EMAIL`, `NOTIFY_PHONE` | Global fallback notify targets (per-client Airtable config takes priority) |
| `FOLLOWUP_TEMPLATE_NAME`, `FOLLOWUP_TEMPLATE_LANG` | WhatsApp template for the >24h freeform-window follow-up |
| `ONBOARD_CODE` | Client onboarding invite-link code |
| `USERS_CONFIG`, `OWNER_*` | Env-var-based user store / owner bypass (legacy path, superseded by Airtable Users table where configured) |
| `AUTO_PUBLISH` | Set to `'false'` to keep generated marketing content in draft status instead of auto-approved |

---

## 5. Step-by-step deploy

1. **Do not run this from this session** — the owner runs these from her
   own machine/CI with her own Vercel auth. This is documentation, not an
   instruction to this agent.
2. Confirm all env vars from section 4 are set on the Vercel project
   (Production environment), especially `WA_APP_SECRET`, `SESSION_SECRET`,
   `ADMIN_KEY`, `CRON_SECRET`, and — before Envoy's outreach cron runs for
   real — `LEGAL_ADDRESS`.
3. Verify Fluid Compute is enabled (section 3).
4. Deploy a **preview deployment first** (push the branch, or `vercel`
   without `--prod`). Do not target production on the first deploy.
5. Run the full smoke-check list (section 7) against the preview URL.
6. Only once every smoke check passes: **promote the preview to
   production** (`vercel promote <deployment-url>`, or via the dashboard's
   "Promote to Production" action on that exact deployment).
7. Re-run the smoke checks against the production domain after promotion —
   promotion swaps traffic, so this is a distinct verification step, not a
   formality.

---

## 6. Rollback plan

Vercel keeps every previous production deployment addressable. If anything
goes wrong after promoting:

1. Vercel dashboard → **Deployments**.
2. Find the last known-good production deployment (the one before this
   promotion).
3. Click **"Promote to Production"** on that deployment (or "Instant
   Rollback" if offered directly) — this is atomic and near-instant, no
   rebuild needed.
4. Investigate the failure against the *preview* deployment (still live,
   separate URL), not production.

No database migration accompanies this deploy (Airtable schema is
unchanged), so rollback has no data-consistency concerns — the anonymize/
retention/export logic only ever writes to existing fields.

---

## 7. Post-deploy smoke checks

Run these against the **preview** URL first, then again against
**production** after promotion. Use test data, not a real prospect's phone
number, wherever the check involves an actual send.

1. **Forged webhook signature → 403.**
   ```
   curl -i -X POST https://<preview-url>/api/whatsapp \
     -H "Content-Type: application/json" \
     -H "X-Hub-Signature-256: sha256=0000000000000000000000000000000000000000000000000000000000000000" \
     -d '{"entry":[]}'
   ```
   Expect **`403 Forbidden`**. If this returns `200`, `WA_APP_SECRET` is
   missing or signature verification regressed — stop and fix before
   sending any real traffic.

2. **A real inbound WhatsApp message → AI reply delivered.** Send a test
   message from a real WhatsApp number registered as a test lead. Confirm
   a reply arrives within the expected 25-90s window (delay + processing).

3. **"Ben jij een AI?" → answers honestly.** In that same test
   conversation, directly ask the AI if it's an AI/bot/chatbot. It must
   answer honestly (e.g. "Klopt, ik ben de AI-assistent van...") — it must
   **not** deny being an AI or claim to be human.

4. **If the delayed send doesn't arrive:** confirm the safety net catches
   it. Wait 15+ minutes, trigger the cron manually (or wait for the daily
   run), and confirm the test lead shows **"Niet bereikbaar"** on the
   dashboard rather than silently vanishing.

5. **Lead export + anonymize work.** Using the admin token, POST
   `mode: 'lead-export'` for a test lead's record ID and `projectCode`,
   confirm the full record + conversation history comes back. Then POST
   `mode: 'lead-delete'` (default `anonymize`) for the same lead, confirm
   `200 OK`, then re-fetch the lead from the dashboard and confirm Name/
   Phone/Conversation History/Last Message/AI Summary/Notities are scrubbed
   while Lead Score/Qualified/Ability/Urgency/Fit are unchanged.

6. **Privacy page shows the new text.** Visit `/privacy` on the deployed
   URL. Confirm sections 5 ("Wie verwerkt uw gegevens") and 6
   ("Internationale doorgifte") are present, and the retention text in
   section 4 states the concrete 6-month figure, not the old generic "as
   long as necessary" line.

7. **Confirm the daily cron does NOT post to social (Herald-only).**
   ```
   grep -n "runMetaPoster\|runMakePoster\|runAyrsharePoster\|MAKE_WEBHOOK_URL\|AYRSHARE_API_KEY" api/cron-followup.js
   ```
   Expect **no output** (already verified true on this branch — re-run
   this after any future edit to `cron-followup.js` as a standing check,
   not just at this deploy). Separately, watch Instagram/Facebook/LinkedIn
   after the first live cron run and confirm only Herald's post appears,
   not a duplicate.

---

## 8. Verification performed during this review (all local, no real API calls)

- `node -c` on every route + helper file (`api/*.js`, `api/lib/*.js`) —
  all pass.
- `node -e "JSON.parse(...)"` on `vercel.json` — valid.
- A local, mocked-`fetch`-free script (read the real source, never
  executed against Airtable) verified: the 6-month cutoff-date math, all
  seven retention-eligibility branches (qualified guard, recency guard,
  active-lead guard, both terminal states, empty-history case, idempotency
  guard) against synthetic lead records, and that the anonymize field set
  in `leads.js`'s `lead-delete` mode is byte-identical to the one in
  `cron-followup.js`'s retention sweep. Script was deleted after use —
  never committed, never wired into the app.
- Cross-referenced every field ID used in the new erasure/retention code
  against `docs/architecture.md`'s Airtable schema table.
- Confirmed via `grep` (repo-wide, not just `cron-followup.js`) that zero
  references remain to `runMetaPoster`/`runMakePoster`/`runAyrsharePoster`/
  `MAKE_WEBHOOK_URL`/`AYRSHARE_API_KEY`/any Instagram-Graph publish
  endpoint.
- Confirmed `api/gcal.js` does not exist and nothing references it.
- Confirmed function count (11 routes, 2 underscore-prefixed helpers).

---

## 9. Known gaps / follow-ups (honest, not hidden)

- **Erasure audit log is console-only.** Every `[erasure]` action (delete,
  anonymize, export, retention-anonymize) logs to Vercel function logs with
  id/projectCode/actor/timestamp, but there's no durable, queryable table —
  Airtable has no append-only log primitive, and adding one is a schema
  change to the live base that needs Sindi's sign-off, not something to do
  silently in this batch.
- **`LEGAL_ADDRESS` / `VAT_NUMBER` are placeholders.** The outreach
  footer's legal-entity address renders as a visible bracketed placeholder
  until Sindi sets the real values via env var; VAT number is optional but
  recommended. Do this before Envoy's outreach cron sends real mail.
- **Lawyer review pending.** `docs/verwerkersovereenkomst-DPA.md` is
  explicitly marked as a template, not legal advice; the privacy-policy
  rewrite in this batch is a good-faith accuracy fix (matching what the
  code actually does), not a substitute for legal review before heavy
  reliance.
- **`waitUntil` is best-effort, not a delivery guarantee** (section 3). The
  current backstop is `sweepStuckNewLeads()`'s 15-minute check, judged
  sufficient at current lead volume. A proper outbox/queue for outbound
  WhatsApp sends is the more robust long-term fix — deferred by owner
  decision, not because it isn't a real gap.
- **`Created At` is a recency proxy, not a true last-activity timestamp**
  for the retention sweep — Airtable's Leads table has no last-modified
  field. Documented in `cron-followup.js`'s own comment; adding an
  Airtable "Last Modified Time" field would close this but is again a
  schema change requiring Sindi's approval.
- **The VPS backend remains the eventual target.** This Vercel/Airtable app
  is the live production system today; `feature/vps-backend` (Postgres,
  not merged here) is a separate, more complete rewrite still in progress.
  Marketing Posts, Outreach, and Appointments have already partially moved
  to that VPS's Postgres via the `_pgapi.js` facade — Leads/Clients/Users
  have not.
- **`docs/architecture.md` has minor stale spots** unrelated to this
  batch's changes — e.g. the "Hobby plan = max 12 functions, we're at
  exactly 12" note (actual current count is 11) and the Conversation State
  enum listing (`new/in_progress/completed`, missing `verloren`, which is a
  real value used throughout `dashboard.js`). Neither affects this deploy;
  flagging for a future docs pass.
