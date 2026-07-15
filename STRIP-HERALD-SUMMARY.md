# Strip Herald — Vercel-side social posting removal

**Branch:** `fix/strip-vercel-posting` (based on `fix/consolidated-ab`)
**File touched:** `api/cron-followup.js`
**Commit:** `24cc0f4` — `fix(cron): remove Vercel-side social posting pipeline, now Herald-VPS-only`
**Net change:** 443 deletions, 5 insertions → **438 lines removed** (1187 → 749 lines)

## Why

Helvaro's social posting (Instagram/Facebook/LinkedIn) was migrated to a
separate VPS service ("Herald", PM2 + node-cron), which is now the sole
live poster. `api/cron-followup.js` (the Vercel daily cron) still contained
the old Vercel-side posting/content-generation pipeline. The owner removed
`MAKE_WEBHOOK_URL`/`AYRSHARE_API_KEY` expecting that to disable it — it did
not: the poster dispatch was a fallback chain that, with those unset, fell
through to `runMetaPoster()` (posts via Meta Graph API, gated only on
`META_PAGE_TOKEN`). Vercel was therefore still posting on every cron run,
duplicating everything Herald already posts.

## What was removed

Six top-level function definitions (all Herald-legacy, dead code once
Vercel-side posting is disabled) and their handler invocations:

| Function | Approx. original lines | Notes |
|---|---|---|
| `runWeeklyContentGen` | 679–707 | + its section header comment |
| `runMetaPoster` | 724–846 | + its header comment (Meta Graph FB/IG poster) |
| `runAyrsharePoster` | 853–931 | + header comment; had a nested local `ensureImage` |
| `upcomingPostsLow` | 939–951 | + its (Make.com-era) header comment |
| `runMakePoster` | 1065–1145 | had a nested local `ensureImage` |
| `runImageBackfill` | 1152–1187 | + its header comment; was EOF |

And in the handler (`module.exports = async function handler`), three
invocation blocks plus their result variables:

- The content-generation block (`lowBuffer` / `runWeeklyContentGen`, ~181–196)
- The image-backfill block (`runImageBackfill`, ~198–205)
- The poster-dispatch ternary (`MAKE_WEBHOOK_URL` → `AYRSHARE_API_KEY` →
  `runMetaPoster` fallback chain, ~207–218)
- Declarations `let contentResult`, `let imageResult`, `let posterResult`,
  `const lowBuffer`
- The `content`, `images`, `posted` keys in the handler's final JSON
  response object

Also updated the stale top-of-file doc comment (previously described
Facebook/Instagram scheduling behavior that no longer exists in this
file) to note that posting now lives on the VPS Herald service.

## What was kept (untouched, verified still defined AND invoked)

- `sweepStuckNewLeads` — stuck-lead safety-net sweep
- `mergeWaFailedFlag` — helper used by the sweep
- `checkQualityRating` — WhatsApp quality-rating check
- `sendResendEmail` — email helper (SMTP/Resend)
- `sendWeeklyClientReports` / `sendWeeklyReportEmail` — Monday weekly
  client reports
- `runWeeklyLearning` — Monday AI learning loop
- `sendWATemplate` / `sendWA` — WhatsApp send helpers
- **`runOutreach`** — Envoy's cold-email pipeline. Deliberately preserved:
  it was never migrated to the VPS and stays live on Vercel.
- The main handler's WhatsApp nurture follow-up loop (leads created
  24h–7d ago, still `'new'`, no reply yet)

No module-level `const`/`require` was orphaned: `pgFetch` (`./_pgapi`)
and `fetchWebsite` (`./lib/fetch-website`) are both still used by
`runOutreach`, so both requires stay. All other env-var constants
(`ADMIN_KEY`, `MAKE_WEBHOOK_URL`, `AYRSHARE_API_KEY`, `META_PAGE_*`) were
local to the removed functions and disappeared with them — nothing to
clean up at module scope.

## Verification performed (all passed)

```
$ node -c api/cron-followup.js
SYNTAX OK

$ grep -n "runWeeklyContentGen\|runMetaPoster\|runAyrsharePoster\|runMakePoster\|runImageBackfill\|upcomingPostsLow" api/cron-followup.js
(no output — zero references, definitions and calls all gone)

$ grep -rn "runWeeklyContentGen\|runMetaPoster\|runAyrsharePoster\|runMakePoster\|runImageBackfill\|upcomingPostsLow" --include="*.js" . --exclude-dir=node_modules
(no output — confirmed nowhere else in the repo references these either)

$ grep -n "contentResult\|imageResult\|posterResult\|lowBuffer" api/cron-followup.js
(no output — no orphaned result variables)

$ grep -n "runOutreach\|sendWeeklyClientReports\|runWeeklyLearning\|checkQualityRating\|sweepStuckNewLeads" api/cron-followup.js
183:    const outreachResult = await runOutreach(AIRTABLE_TOKEN, BASE_ID).catch(e => {
642:async function runOutreach(airtableToken, baseId) {
169:      weeklyResult = await sendWeeklyClientReports(AIRTABLE_TOKEN, BASE_ID, LEADS_TABLE).catch(e => {
338:async function sendWeeklyClientReports(airtableToken, baseId, leadsTable) {
176:      learningResult = await runWeeklyLearning(AIRTABLE_TOKEN, BASE_ID, LEADS_TABLE).catch(e => {
477:async function runWeeklyLearning(airtableToken, baseId, leadsTable) {
158:    const qualityResult = await checkQualityRating(PHONE_NUMBER_ID, WHATSAPP_TOKEN).catch(e => {
287:async function checkQualityRating(phoneNumberId, token) {
128:    const stuckNewResult = await sweepStuckNewLeads(AIRTABLE_TOKEN, BASE_ID, LEADS_TABLE).catch(e => {
215:async function sweepStuckNewLeads(airtableToken, baseId, leadsTable) {
```

Full top-to-bottom read of the resulting handler confirmed: WhatsApp
follow-up logic present, `sweepStuckNewLeads` called, quality check
called, weekly-report block (Mondays, `now.getUTCDay() === 1`) intact,
learning loop intact, `runOutreach` called, and the handler's final
`res.status(200).json({...})` is coherent with no reference to any
removed result variable.

## Not done (out of scope)

- Not pushed, not deployed.
- No changes to any other worktree or branch.
- No changes to Herald's VPS-side code — this only removes the dead
  Vercel-side duplicate.
