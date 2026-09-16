# Helvaro — Improvements Review (feature/vercel-growth)

Read-only review. No source files were touched. Scope: the five growth features
(reminders, ROI reporting, human takeover, self-serve onboarding, Google
Calendar) and the two gap-closes (credits, plus general hardening) layered on
top of the existing Vercel app, with emphasis on how they behave *together* —
each was built and self-verified in isolation (see the `*-SUMMARY.md` files),
but nothing has run all six at once, and nothing has run against a real
Airtable/WhatsApp/Anthropic endpoint.

**What I could not verify statically**: everything in this app is verified by
reading code and tracing control flow — there is no test framework and no
live credentials were used (matching every `*-SUMMARY.md`'s own constraint).
Where a finding depends on real Airtable/Meta/Google behavior I've said so
explicitly.

**Already-documented decisions I'm not re-reporting** (confirmed deliberate,
read before flagging anything that looked similar): Airtable's non-atomic
credit increment (`_credits.js` header), `sendWeeklyClientReports()`'s
single-page lead fetch (`REPORTING-SUMMARY.md`), `waitUntil()` being
best-effort, the light-theme deferral, and the console-only erasure log.

---

## 1. Real bugs / correctness — cross-feature seams

### 1.1 CRITICAL — Rescheduling an appointment silently kills its reminder, forever
**`api/leads.js:882-949` (`appointment-update`)**

When a dashboard user reschedules an appointment (`body.startTime` changes),
the handler PATCHes `Start Time`/`Duration`/`Status`/`Notes` (line 903-909)
but never touches `Reminder Sent` (`fldadjeKPJ2TLiQSA`). If the original
appointment time already triggered `runAppointmentReminders()`
(`cron-followup.js:1044`) before it got rescheduled, `Reminder Sent` is
already `true`. The cron's query is `NOT({fldadjeKPJ2TLiQSA})`
(`cron-followup.js:1053`) — once true, that field permanently excludes the
appointment from every future run, regardless of the new `Start Time`.

**Failure scenario**: appointment booked for tomorrow 14:00 → reminder cron
fires at 09:00 the day before, sets `Reminder Sent=true` → business
reschedules to next week via the dashboard (a completely normal, frequent
action) → the lead never receives a reminder for the actual new time. No
error anywhere — the dashboard shows the appointment as rescheduled and
correct, Airtable shows nothing wrong, the cron has nothing to log because
the appointment no longer matches its query at all. This directly undermines
the point of the reminders feature (reduce no-shows) for the single most
common reschedule case, and it's the textbook "silent failure" class this
codebase has a documented history of.

**Fix** (~10 min): in `appointment-update`, when `updateFields['Start Time']`
is set, also set `updateFields[FLD_REMINDER_SENT] = false` (field ID
`fldadjeKPJ2TLiQSA`) so the cron re-evaluates the new time. Arguably also
reset it when `Status` moves back to `booked` from `cancelled`/`no_show` for
the same reason.

### 1.2 MEDIUM — cron-followup's automated sends never check AI-pause / human takeover
**`api/cron-followup.js`** (verified via grep: zero references to `aiPaused`,
`escalated`, or `getAiPauseInfo` anywhere in the file) vs. **`api/whatsapp.js:196-230`**
(the actual pause implementation).

The takeover feature stops `processMessage()` from calling the AI or sending
an AI reply once a human has paused a lead (`whatsapp.js` step 3b). But the
daily follow-up loop (`cron-followup.js:81-147`, "we hebben je bericht
gekregen maar nog niks teruggehoord") is a *separate* automated WhatsApp send
path that only checks `Conversation State === 'new'` and zero user replies —
it has no idea a human has taken the lead over. The overlap window is narrow
(a lead has to be paused while still status `new` with 0 replies — plausible
if a staff member proactively takes over a fresh lead before it's replied),
but when it happens the automated nudge undermines exactly the "a human is
driving now" guarantee the takeover feature promises. Appointment reminders
(`runAppointmentReminders`) are transactional, not conversational, so leaving
those unguarded by `aiPaused` is reasonable — but the main follow-up loop and
`sweepStuckNewLeads` are conversational nudges and should respect the pause.

**Fix** (~30 min): in the main follow-up loop, before sending, fetch/check
`getAiPauseInfo(lead.fields['Notities'])` (duplicate the tiny helper, matching
this file's existing per-file-duplication convention) and skip paused leads.

### 1.3 MEDIUM — Dashboard appointment booking has no double-booking protection against Google Calendar
**`api/leads.js:777-880` (`appointment-create`)** vs **`api/whatsapp.js:293-312`**

The AI in-chat booking path merges the client's Google Calendar free/busy
into `existingAppointments` before the AI proposes a slot
(`whatsapp.js:293-312`, "the AI never proposes a slot they're already busy on
in Google"). The dashboard's manual `appointment-create` mode has no
equivalent — it creates the Airtable appointment and *then* mirrors it to
Google (`leads.js:856`), but never checks Google availability first. A staff
member booking manually through the dashboard can double-book against an
event that's only on the owner's personal Google Calendar. This is an
inconsistency between two paths that do "the same thing" but were built in
different passes; I could not verify whether the dashboard's slot-picker UI
independently surfaces busy blocks (that would mitigate this at the UI layer
even without a server-side check) — worth confirming before treating this as
low-risk.

**Fix** (~1-2h): either surface Google busy blocks in the dashboard's
appointment-create date/time picker (client-side, same data source
`whatsapp.js` already fetches), or add a server-side free/busy check to
`appointment-create` that warns (not blocks — a staff member may legitimately
want to override).

### 1.4 MEDIUM — Google Calendar sync is one-way; a client's own cancellation is invisible
**`api/_gcal.js` / `api/leads.js` / `api/cron-followup.js`**

Every mirroring path documented in `GCAL-PORT-SUMMARY.md` is Airtable →
Google. There is no Google push-notification/webhook channel and no
reconciliation poll in the other direction. If a client cancels or moves an
appointment directly in their own Google Calendar (the natural thing to do —
it's their calendar, and they didn't necessarily open the Helvaro dashboard
to do it), Airtable's `Status`/`Start Time` never changes, and
`runAppointmentReminders()` will still WhatsApp the lead a reminder for an
appointment the business already cancelled. Not something this batch was
scoped to build (a real Google webhook integration is non-trivial), but worth
naming explicitly as a known gap rather than an assumption of correctness.

**Fix**: idea-level, not urgent pre-launch. A cheap partial mitigation: before
sending a reminder, do a live `_gcal.freeBusy()` check for that exact slot and
skip (with a log) if it comes back as free when it should be busy — signals a
likely external cancellation without needing a full webhook integration.

---

## 2. Silent failures

Covered as part of 1.1 (the reschedule/reminder interaction is the clearest
instance found) and 1.2. No other new `.catch(() => {})` or empty `catch {}`
block in the new code was found to be swallowing something that should
surface — the credit-recording fire-and-forget catches
(`whatsapp.js:333`, `cron-followup.js:818`, `admin.js:461/501/...`) are all
consistent with `_credits.js`'s own documented fail-open contract
(`recordUsage()` never throws; these are belt-and-braces only) and each one
still logs internally inside `_credits.js` on the actual Airtable failure —
not a silent-failure pattern, a deliberate one.

One adjacent, pre-existing (not new) single point of failure worth flagging
because *new* features now depend on it more heavily than before:
`api/_mailer.js`'s `sendMail()` fails soft to a `console.error` with no
secondary channel. The credit system's 80%/100%/runaway alerts, the quality-
rating alert, and the weekly report all now route through this one function —
if both `SMTP_*` and `RESEND_API_KEY` are misconfigured or the mailbox
degrades, every one of those signals disappears with nothing but a Vercel log
line. **Idea, not urgent**: a WhatsApp ping to `NOTIFY_PHONE` as a fallback
channel for the handful of truly critical alerts (quality RED, runaway
credits) would remove the single point of failure for the alerts that matter
most.

---

## 3. Security

New code was checked specifically for missing ownership/Project-Code scoping,
injection, and secrets in logs — the `ai-pause`/`ai-resume` modes
(`leads.js:1096-1099`), `appointment-update`'s ownership check
(`leads.js:887-902`), the credit admin routes (`admin.js:274-303`,
`admin.js:1194-1198,1252-1257`), and `_gcal.js`'s state-signing/token
encryption are all correctly scoped and match this file's existing patterns —
no new gap found there.

### 3.1 MEDIUM — Self-serve onboarding uses one static, non-expiring, shared invite code
**`api/admin.js:216, 894-916, 902`**

`ONBOARD_CODE` is a single env var, compared with `safeEqual()` (good — no
timing leak), but it is:
- **shared across every invite** — not unique per prospect, not single-use,
  no expiry (`admin.js:914`: `!ONBOARD_CODE || !safeEqual(provided, ONBOARD_CODE)`).
- **transmitted as a bare URL query parameter** in the invite email
  (`admin.js:902`: `` `https://app.helvaro.pro/onboard?invite=${encodeURIComponent(ONBOARD_CODE)}` ``),
  so it lands in the recipient's inbox, any link-preview crawler their mail
  client runs, and browser history on whatever device opens it.

The only mitigation is a generic IP rate limit (20 req/60s,
`admin.js:28-35`), which does not prevent a leaked code from being used
slowly, indefinitely, from anywhere. One leak (forwarded email, screenshot,
a corporate email-security scanner that pre-fetches links) means anyone can
self-serve-create a fully active WhatsApp AI client indefinitely, until Sindi
rotates the env var — which also invalidates every invite currently in
flight. Combined with 3.2 below, an account created this way starts fully
unmetered.

**Fix** (~1-2h): generate a per-invite random token stored on (or alongside)
the Client Config the `mode=invite` email creates, single-use, short TTL
(e.g. 14 days), checked instead of the static code. Lower effort stopgap:
rotate `ONBOARD_CODE` periodically and treat it like a password, not a
permanent secret.

### 3.2 MEDIUM — Self-serve onboarding never sets a Credit Allowance, and nobody is told a client signed up
**`api/admin.js:910-1191`** (grepped for `Credit Allowance`/`FIELD.ALLOWANCE`/any
notify call in the entire onboard-handling block — none found)

A client created via the self-serve wizard activates with a fully live
WhatsApp AI number and zero `Credit Allowance` set. Per `_credits.js`'s
documented contract, blank allowance means the credit system stays
completely inert for that client: no 80%/100% cost alerts, no entry in the
admin usage-overview's *meaningful* rows (it'll show `configured:false`), no
signal to Sindi that real Anthropic/WhatsApp spend is happening, until she
manually runs `credit-set-allowance` for that specific project code. There is
also no email/WhatsApp notification anywhere in the onboard success path
telling her a new client signed up at all — she'd have to check the admin
client list herself. The self-serve wizard's entire purpose is to let her
onboard clients without being personally involved in setup, but that also
means the one manual step that currently protects her margin (setting an
allowance) is the one step onboarding doesn't do for her.

**Fix** (~30 min): default every self-serve-created client to a sane
`Credit Allowance` (e.g. the Starter tier's 2000) at creation time, and send
`NOTIFY_EMAIL`/`NOTIFY_PHONE` a one-line ping ("new client X onboarded via
self-serve, code Y") on success.

---

## 4. Cost / efficiency

### 4.1 HIGH — cron-followup's Monday chain has no pagination and no time budget; scales badly
**`api/cron-followup.js`** (grepped: zero occurrences of `offset` anywhere in
this file, `api/admin.js`, `api/whatsapp.js`, or `api/_credits.js` — only
`api/leads.js` implements offset-loop pagination)

Every Airtable list query in this file is capped at `pageSize=50` or `100`
with no follow-up `offset` request:
- main follow-up query (`:87`, cap 50)
- `sweepStuckNewLeads` (`:271`, cap 50)
- `runRetentionAnonymization` (`:369`, cap 50)
- `runAppointmentReminders` (`:1055`, cap 50)
- `sendWeeklyClientReports`'s clients query (`:527`, cap 100 — already
  flagged as deliberate for the *leads* half of that function in
  `REPORTING-SUMMARY.md`, but the *clients* query has the same shape and
  wasn't discussed there)
- `runWeeklyLearning`'s clients query (`:707`, cap 100) and its per-client
  leads query (`:724`, cap 100)
- `runOutreach`'s outreach-table query (`:909`, cap 100)

At today's volume (zero paying clients) this is a non-issue. At "10x volume"
it becomes two different problems:

1. **Silent truncation.** Anything past record 50/100 for a given query
   simply never gets processed that run. The lead follow-up and retention
   sweeps are self-healing (a lead not reached today is caught tomorrow,
   documented in-file), but `runAppointmentReminders` is *not* self-healing
   in the same way — its eligibility is a moving 33h time window
   (`REMINDER_WINDOW_HOURS`), not an open-ended backlog. If more than 50
   appointments fall inside that window on a given day, appointments past
   the 50th silently get no reminder at all before their start time, with no
   log distinguishing "0 eligible" from "51+ eligible, 1 dropped."

2. **maxDuration risk on Mondays.** `vercel.json` gives this function 300s.
   On Mondays it runs, strictly sequentially: the main loop (500ms/lead) →
   stuck sweep (300ms/lead) → reminders (300ms/appt) → retention
   (200ms/lead) → quality check → `sendWeeklyClientReports` (network fetch +
   email send + 300ms/client) → `runWeeklyLearning` (one Anthropic call +
   500ms/client — the single most expensive step) → `runOutreach`. None of
   this is parallelized. With, say, 50-100 active clients, `runWeeklyLearning`
   alone (Anthropic latency + fixed delay per client) plausibly runs
   150-350s on its own, on top of everything ahead of it in the chain. A
   timeout here doesn't fail loudly — it's a Vercel function timeout with no
   owner-facing alert, and because clients are processed in Airtable's
   default record order, **the same clients (whichever are earliest in the
   table) get their weekly report/learning every single Monday, and whichever
   are latest silently never do**, indefinitely, until someone notices the
   pattern.

**Fix** (Medium effort, ~half a day): (a) add `offset`-loop pagination to at
least `runAppointmentReminders` and the main follow-up query, since those two
are the ones where a dropped record isn't self-healing; (b) parallelize
per-client work in `sendWeeklyClientReports`/`runWeeklyLearning` with a
concurrency cap (`Promise.all` in batches of ~5) instead of a strict serial
loop; (c) add a wall-clock budget check (e.g. bail out of the Monday-only
steps if already past ~200s) that logs which clients were skipped, so a
timeout becomes a visible, actionable log line instead of an invisible one.

### 4.2 LOW — Admin client list and credit overview also cap at 100 with no pagination
**`api/admin.js:1261` (client list), `api/_credits.js:541` (`getAllUsageSummaries`)**

Same shape as 4.1 but on operator-facing endpoints, not a cron — at >100
total clients, the admin dashboard's client list and the credit usage
overview would silently show a partial set with no "and N more" indicator.
Not urgent at current or near-term client counts; flagging so it's not
forgotten once the client base actually grows past 100.

---

## 5. Reliability / ops

Covered above (4.1's maxDuration risk is as much a reliability finding as a
cost one). One additional item:

### 5.1 LOW — `runAppointmentReminders`'s per-run client cache doesn't help across appointments for different clients in the same run, but does correctly dedupe within one — verified fine, no action needed
(Checked because it looked like a possible N+1; it isn't — `clientCache` at
`cron-followup.js:1087` correctly keys by `projectCode` and this is the right
call. Recorded here only so it's clear this was checked, not missed.)

---

## 6. UX / product gaps

### 6.1 HIGH — Credit-limit-reached errors show the client a raw error code instead of the actual message
**`api/dashboard.js`** — confirmed at four call sites, all reading `d.error`
where the corresponding backend mode returns `{error:'credit_limit_reached', message: '<human text>'}`:

| Dashboard call site | Backend mode | Backend response |
|---|---|---|
| `dashboard.js:10978` (`loadReplySuggestions`) | `leads.js` `suggest-replies` | `leads.js:1007` |
| `dashboard.js:14769` (personalized DM generator) | `admin.js` `personalized-dm` | `admin.js:677` |
| `dashboard.js:15208` (content/carousel generator) | `admin.js` `content-post` | `admin.js:510` |
| `dashboard.js:15341` (AI coach chat) | `admin.js` `ai-advice`/`ai-chat` | `admin.js:421,470` |

Every one of these does `toast(d.error || '...', 'error')`. When the backend
returns `{error:'credit_limit_reached', message:'Je hebt je maandelijkse
limiet bereikt...'}` (or whatever the actual copy is), the toast shows the
literal string **"credit_limit_reached"** to the user — a raw internal error
code, not the friendly message `_credits.js`/`admin.js` clearly intended to
be shown. This is the exact scenario a paying client hits first when the
credit system actually does its job (blocking a discretionary feature at
100%): instead of a clear "you're over your limit, here's how to upgrade"
message, they see a cryptic code and reasonably conclude the product is
broken. Given the owner is about to onboard her first paying client at
~€249/mo, this is precisely the kind of small thing that turns a
non-event (hit a soft limit) into a support ticket or a bad first impression.

**Fix** (~10 min): `toast(d.message || d.error || '...', 'error')` at each of
the four sites (and worth grepping `dashboard.js` for any other call into a
credit-gated `admin.js`/`leads.js` mode — `generate-content` and
`generate-image` are also credit-gated per `admin.js:753,870` and may have
the same call-site pattern; I did not confirm their exact dashboard call
sites but the fix is identical wherever they are).

### 6.2 MEDIUM — See 3.2: no confirmation/notification when a self-serve client signs up
Listed under Security since the root cause is the same missing code path, but
it's equally a product gap: Sindi has no positive signal a new client exists
until she happens to check the admin panel.

### 6.3 LOW — Onboarding wizard's "Wat nu?" screen is honest about template approval, which is good, but nothing tracks whether the owner actually did it
`ONBOARDING-SUMMARY.md` correctly notes the wizard tells the new client that
booking confirmations/reminders/follow-ups need an approved Meta template
and won't work until then. There's no dashboard indicator anywhere (checked
the "Instellingen" area referenced in `GCAL-PORT-SUMMARY.md`/`REMINDERS-SUMMARY.md`)
showing *whether* `BOOKING_TEMPLATE_NAME`/`REMINDER_TEMPLATE_NAME`/`FOLLOWUP_TEMPLATE_NAME`
are actually configured — a client could go weeks without confirmations/reminders
working and have no way to tell from the product itself that this is why.
**Idea**: a simple admin-only "template health" line (configured Y/N per env
var) on the admin client list or a status endpoint would close this without
needing per-client Meta template state.

---

## 7. Consistency / maintainability

### 7.1 LOW — `parseDealValueServer` / `escapeFormula` / `formatApptDateTime` / `normalizePhoneForWA` duplication is now 3-4x, not 2x
Already an acknowledged, deliberate convention in this codebase (no shared
module between `api/*.js` files) — not re-flagging the pattern itself, but
noting it's now spread across more files than before (`leads.js`,
`cron-followup.js`, and in `whatsapp.js`'s case the booking-confirmation
helpers too). Each copy is currently correctly cross-referenced in comments
per the `*-SUMMARY.md` files' own verification claims — the risk is purely
that the *next* person to fix a bug in one of these (e.g. another currency-
parsing edge case) has to remember to grep for all copies, which is easy to
miss under time pressure. **Idea, not urgent**: if this pattern grows past 4
copies of the same logic, it's worth the one-time cost of extracting a
`api/lib/format-helpers.js` (the codebase already has `api/lib/` for
`fetch-website.js`) that every `api/*.js` file can `require()` — Vercel
functions bundle their own dependencies per-function, so this doesn't
increase function count or violate the "each file is standalone" constraint,
it just removes the copy-paste risk.

### 7.2 LOW — Two different idempotency-flag orderings for two very similar features, intentionally — worth a one-line note where they'd be compared
The main follow-up loop marks `Conversation State` *after* sending
(`cron-followup.js:130-141`); the appointment reminder marks `Reminder Sent`
*before* sending (`cron-followup.js:1145-1158`). Both orderings are
individually well-reasoned and explained in their own comments (a follow-up
without an attempt yet made is more idempotent-safe to retry than an
appointment reminder can afford to be sent twice). Not a bug, but if a future
change touches either loop, it's worth a one-line cross-reference comment in
each pointing at the other, since "this file does the opposite thing 1000
lines away, on purpose" is exactly the kind of context that gets lost when a
different person/agent touches the file next.

---

## Top 10 — what I'd do next, in order

Ranked for a solo founder with zero paying clients, about to onboard the
first one, limited time. Ordered by (churn/trust risk prevented) ÷ (effort).

1. **Fix the reschedule → dead reminder bug** (§1.1, `api/leads.js` around
   line 907). ~10 min. This is the one finding that actively breaks a
   just-built, headline feature (reminders) the moment it's used in the most
   normal way possible (someone reschedules). Fix before this feature is
   demoed to anyone.
2. **Fix the credit-limit-reached toast showing a raw error code** (§6.1,
   `api/dashboard.js`, 4 sites). ~10 min. Directly hits the first paying
   client's first bad-day experience with the product.
3. **Default a Credit Allowance + send a signup notification on self-serve
   onboarding** (§3.2, `api/admin.js`). ~30 min. Protects margin the moment
   the self-serve wizard is actually used for its intended purpose (onboarding
   without her involvement) — right now that same "without her involvement"
   property is exactly what leaves her blind to both cost and signups.
3.5. Note these two are ~equally cheap and address the same root cause
   (onboarding built without wiring into credits/notifications) — worth
   doing together in one pass.
4. **Make cron-followup's automated nudges respect AI-pause** (§1.2,
   `api/cron-followup.js`). ~30 min. Cheap insurance against the takeover
   feature's core promise ("a human is driving now") silently breaking.
5. **Rotate/harden the ONBOARD_CODE distribution** (§3.1). Cheapest version:
   just start treating the current `ONBOARD_CODE` value as compromised the
   moment it's emailed to a first real prospect, and put "add per-invite
   tokens" on the near-term backlog rather than the someday list — the
   current design is fine for "a handful of trusted invites Sindi personally
   sends," which is the real near-term usage, but the code as written doesn't
   express that constraint anywhere, so it's easy to forget once someone else
   sends an invite.
6. **Add a time budget / early-exit to the Monday cron chain** (§4.1c). Not
   urgent at 0 clients, but cheap to add now and expensive to debug later ("why
   did client X stop getting weekly reports 3 months ago" is a much worse
   support conversation than a log line today). Do this before client count
   crosses roughly 30-40 active accounts, not after.
7. **Add offset pagination to `runAppointmentReminders` specifically**
   (§4.1, part 1). This is the one unpaginated cron query where a dropped
   record is a genuinely missed reminder (not self-healing like the others),
   directly undermining the reminders feature's whole point. Bundle with #1.
8. **Check Google free/busy (or at least surface it) on the dashboard's
   manual appointment-create path** (§1.3). Medium effort; do once there's an
   actual client connecting Google Calendar and booking manually through the
   dashboard, not before.
9. **A secondary alert channel (WhatsApp) for mailer failures on the truly
   critical alerts** (quality RED, runaway credits) (§2). Cheap insurance,
   not urgent — do opportunistically.
10. **Template-health visibility in the admin panel** (§6.3) — lets Sindi
   catch "client's reminders have been silently off for 3 weeks because the
   Meta template was never approved" without having to remember to ask. Do
   once there's more than one or two real clients to keep track of.

Everything else in this report (§1.4 Google two-way sync, §4.2 admin
pagination at >100 clients, §7.1/7.2 maintainability notes) is genuinely
"someday" — correct to leave alone at current scale, worth revisiting once
there's real client volume to justify the effort.
