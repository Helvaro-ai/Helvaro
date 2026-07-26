# Reporting / ROI Summary

Branch: `feature/vercel-growth`

Adds ROI / value reporting to Helvaro's live dashboard and weekly email so a
client paying EUR 497-1000/month can see what Helvaro delivered — leads,
qualification, appointments, and estimated pipeline value — without the
product ever inventing or projecting a number it doesn't have.

## Commits

1. `feat(reporting): add report-summary mode for ROI/value aggregation` — `api/leads.js`
2. `feat(reporting): add Resultaten panel to the client dashboard` — `api/dashboard.js`
3. `feat(reporting): lead weekly client email with ROI headline numbers` — `api/cron-followup.js`

No new `api/*.js` files were created. `api/` still contains exactly 13
functions (verified via `ls api/*.js | wc -l`). No new Airtable fields —
everything below is a read-only aggregation of fields that already exist.

---

## What's reported

Available in three places, all backed by the same aggregation logic:

- **Dashboard "Resultaten" panel** (new nav item, sidebar "Inzicht" section) —
  live, period-selectable, with trend vs the previous period.
- **`api/leads.js` mode `report-summary`** — the API behind the panel. POST,
  session/API-key authenticated, Project-Code-scoped, same as every other
  mode in that file.
- **Weekly Monday client email** (`api/cron-followup.js`,
  `sendWeeklyClientReports`/`sendWeeklyReportEmail`) — now leads with the
  same headline numbers (leads, qualified, appointments, pipeline value)
  ahead of the existing conversion%/response-time tiles, so the value lands
  in the inbox without the client having to log in.

## Exact metric definitions (so nobody later misreads these)

| Metric | Field(s) | Definition |
|---|---|---|
| **Leads Ontvangen** (`leadsReceived`) | `Created At` (fldR0r13EU4RwrtvH) | Count of leads whose `Created At` falls inside the selected window. |
| **Gekwalificeerd** (`qualifiedCount` / `qualifiedRate`) | `Qualified` (fld0hAZJ5wgaXrNTn) | Count where the checkbox is checked; rate = qualified / leadsReceived * 100, rounded to 1 decimal. `null` (shown as "geen data") if leadsReceived is 0 — never a fabricated 0%. |
| **Afspraken Geboekt** (`appointmentsBooked`) | `Appointment Booked` (fldyIGNetqcSEkoaK) | Count where the checkbox is checked. This is a booking count, not a "showed up" / closed-deal count — that distinction already exists elsewhere (Analyse page's show-up rate) and is out of scope here. |
| **Verwachte Pipeline Waarde** (`pipelineValueTotal` / `pipelineValueAvg`) | `Verwachte Waarde` (fldv7qOYvCN1xJfiR) | **This is a client-entered ESTIMATE, not revenue Helvaro generated and not closed/earned revenue.** It is labeled "verwachte pipeline waarde" / "expected pipeline value" everywhere it's shown — never "omzet" (revenue) in any UI or email copy. Only leads where the client actually typed a parseable, positive value are included in the sum/average (`pipelineValueCount`); leads with an empty or unparseable value are **excluded**, never counted as €0 (which would silently deflate the average — the same class of bug batch C fixed for the parser itself). |
| **Gem. Lead Score** (`avgLeadScore`) | `Lead Score` (fldpzQgMuWJLjogiD) | Average over leads where the field is present as a number (`avgLeadScoreCount`). A real score of 0 is possible and is included; only leads the AI hasn't scored *at all* (field absent) are excluded. `null` ("geen data") if no lead in the window has been scored. |
| **Gem. Reactietijd** (`avgResponseTime`) | `Response Time (sec)` (fldUJJ8oSmAMQ9wB3) | Average over leads with a recorded, positive response time (`avgResponseTimeCount`). Missing/zero values are excluded, not averaged in as 0. `null` ("geen data") if none recorded. |

Every "current" figure has a matching "previous" figure computed the exact
same way over the prior equivalent window, used only to render an up/down/
flat trend arrow — never displayed as a number in its own right unless the
user is looking at that period directly.

## Period / trend logic

Implemented in `api/leads.js` (`reportPeriodBounds`, `aggregateReportPeriod`).
All boundaries are computed in **UTC epoch ms**, deliberately not the Vercel
function's local timezone (which is UTC by default anyway, but this removes
the dependency).

- **`this_month`** (default) — current calendar month (`Date.UTC(y, m, 1)`
  through "now") vs the **prior calendar month** (`Date.UTC(y, m-1, 1)`
  through the start of the current month). `Date.UTC` handles the January
  rollover automatically (`m-1` with `m=0` correctly yields December of the
  previous year) — verified with a throwaway script simulating both a
  January date and a normal mid-year date.
- **`last_30_days`** — rolling 30-day window ending "now", compared against
  the 30 days immediately before that window. Not calendar-aligned.
- **`all_time`** — window from epoch 0 through "now". Has **no previous
  period** (`hasPrevious: false`, `previous: null` in the response) — there
  is nothing meaningful to compare "all time" against, so no trend is shown
  for this option, by design, not by omission.

Trend rendering (`resultatenTrend()` in `api/dashboard.js`) shows nothing
(not a 0% or a fabricated arrow) whenever either side of the comparison is
`null`. A `lowerIsBetter` flag flips the color logic for response time, so a
faster (lower) average correctly renders green, not red.

## Honest-numbers rules — how they're enforced in code

- **Never invents/extrapolates/projects revenue.** Every number is a direct
  aggregation over Airtable fields that already exist; there is no
  multiplier, no "estimated revenue," no forecasting anywhere in this diff.
- **"Verwachte Waarde" is never called revenue.** Checked across all three
  surfaces: dashboard panel copy ("Verwachte pipeline waarde"), the
  disclaimer line under the dashboard stat grid, the API field names
  (`pipelineValueTotal`/`Avg`, not `revenue*`), and the weekly email (both
  the tile label and an explicit disclaimer paragraph underneath it).
- **Missing fields degrade gracefully.** Verified with a throwaway mocked
  script (not committed — deleted after use, per instructions) covering:
  a lead with no `Verwachte Waarde` (excluded from pipeline avg, not
  counted as €0), a lead with no `Lead Score` at all (excluded from score
  avg, not averaged in as 0), and a lead outside the selected window
  (correctly excluded from `leadsReceived`). All three test cases + 10
  currency-format samples + 2 month-boundary tests passed.
- **Currency parsing is reused, not reinvented.** `dashboard.js`'s
  `parseDealValue()` (the batch C fix for Belgian/Dutch formatting, e.g.
  `"€ 1.500,00"` must parse to `1500`, not `1.5`) lives inside a client-side
  `<script>` block embedded in a giant Node template literal — it cannot be
  `require()`'d from a server-side file. Consistent with this codebase's
  existing convention of duplicating small helpers per file when there's no
  shared module (see `escapeFormula`/`formatApptDateTime`/
  `normalizePhoneForWA` already duplicated across `api/leads.js` and
  `api/cron-followup.js`), the exact same parsing logic was copied
  byte-for-byte into `parseDealValueServer()` in both `api/leads.js` and
  `api/cron-followup.js`, each with a comment cross-referencing the other
  two copies so a future fix to the Belgian-format bug doesn't get applied
  to only one of the three.

## What couldn't be verified without live data

- **Airtable field IDs**: the field IDs used (`fldv7qOYvCN1xJfiR`,
  `fldpzQgMuWJLjogiD`, `fld0hAZJ5wgaXrNTn`, `fldyIGNetqcSEkoaK`,
  `fldUJJ8oSmAMQ9wB3`, `fldR0r13EU4RwrtvH`, `fldSmczuyUJd26HLe`) match the
  task description and `docs/architecture.md`, and the response-object
  lookups follow the exact same "field ID first, field name as fallback"
  pattern already used everywhere else in `api/leads.js` — but this was not
  verified against a live Airtable response (no real API calls were made,
  per constraints). If Airtable's base schema has since diverged from
  `docs/architecture.md`, the field-name fallback (e.g. `'Verwachte
  Waarde'`, `'Lead Score'`) is what will actually resolve values today,
  matching how the existing GET path in the same file already works.
- **Weekly email pagination**: `sendWeeklyClientReports()` fetches leads for
  each client with a single `pageSize=100` request (no offset loop) — a
  pre-existing limitation of that function, unchanged by this batch. It only
  becomes a real undercount if a single client receives more than 100 new
  leads in one week, which no current Helvaro client is close to. Flagging
  it here rather than silently expanding scope to rebuild that function's
  fetch loop, since the task asked to extend the email's headline numbers,
  not rebuild its data-fetching.
- **Rendered dashboard visuals**: the new "Resultaten" panel was verified by
  `node -c` (whole file parses, including the embedded client script), a
  full read-back of the diff, and confirming no duplicate DOM ids were
  introduced — but it was not rendered in an actual browser, since this
  batch works only in the frozen worktree with no dev/preview server
  running and no deploy.

## Verification performed

- `node -c api/leads.js`, `node -c api/dashboard.js`, `node -c
  api/cron-followup.js` — all clean, both before and after each edit.
- `ls api/*.js | wc -l` — confirmed still 13.
- Grepped for duplicate DOM ids (`nav-resultaten`, `page-resultaten`,
  `resultaten-*`) — none found.
- Grepped `parseDealValue` repo-wide — confirmed exactly 3 copies (the
  original client-side one in `dashboard.js`, and the 2 new server-side
  mirrors), all cross-referenced in comments.
- A throwaway Node script (scratchpad only, deleted after use, no real API
  calls) verified: 10 currency-parsing samples against known-good expected
  values, the January/July month-boundary math, and the aggregation
  function's honest-degrade behavior on a small mocked record set.
