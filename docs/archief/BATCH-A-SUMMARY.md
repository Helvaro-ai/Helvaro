# Batch A Security Hardening Summary

Branch: `fix/security-hardening-a` (based on `main`)  
Worktree: `/Users/sindi/Documents/GitHub/Helvaro-worktrees/fix-batch-a`  
Commits: 3 (aef3714, 6fdab26, fa7f5de)

---

## Fix 1: Session-Signing Secret Must Fail Closed

**Files changed:** `api/auth.js`, `api/leads.js`  
**Commit:** `aef3714`

### The Vulnerability

`sessionSecret()` and `resetSecret()` in both files fell back to the hardcoded literal `'helvaro-default-v1'` when both `SESSION_SECRET` and `ADMIN_KEY` env vars were unset. That literal is in source control, so anyone could forge valid session or password-reset tokens for any client — full cross-tenant compromise whenever the environment was misconfigured.

### The Fix

Introduced `signingBase()` helper that throws if neither env var is set. All signing functions now call it instead of using the fallback chain. A misconfigured environment breaks loudly (login returns 500) instead of silently accepting forged sessions.

Also fixed a secondary bug this change would otherwise trigger: the `USERS_CONFIG` login path wrapped `JSON.parse` and `signSession()` in the same try/catch, swallowing the new fail-closed throw as "malformed JSON" and masking it with misleading errors. JSON.parse is now isolated in its own try/catch so the signing failure propagates properly.

In `leads.js`, `verifySession()` already had a catch-all (an unverifiable token just means invalid session), so a missing secret there falls through to the legacy-key path and returns a normal 401 — graceful, not a crash. Added a distinct `[leads] session verification unavailable:` log line for that path.

### Verification

- `node -c api/auth.js && node -c api/leads.js` — syntax OK
- Handler invocation with mocked req/res, env vars toggled:
  - Unconfigured login (USERS_CONFIG path) → 500 with "SESSION_SECRET not configured" logged
  - Unconfigured login (owner-bypass path) → 500
  - Unconfigured leads.js session verification → 401 (falls to legacy path, logged)
  - Configured happy path end-to-end → login issues valid token, leads.js verifies and accepts

---

## Fix 2: WhatsApp Webhook Signature Verification Must Actually Block

**Files changed:** `api/whatsapp.js`  
**Commit:** `6fdab26`

### The Vulnerability

The old code's blocking HMAC verification path only ran when `req.body` was still a raw string. Vercel's Node.js runtime auto-parses `application/json` bodies into `req.body` via a lazy getter, so in production `req.body` is always already an object. The code then fell through to a warn-only path that recomputed the HMAC over `JSON.stringify(req.body)`, which essentially never byte-matches Meta's original payload (key order, whitespace differ) — meaning signature verification blocked nothing.

### The Fix

Read `req` as the plain Node.js `IncomingMessage` stream it still is (the `req.body` getter is lazy, not eagerly computed, so the stream hasn't been consumed yet) BEFORE anything touches `req.body`. This gives the literal bytes Meta signed, allowing the HMAC check to actually verify and block on mismatch. The verified raw bytes are then `JSON.parse`d ourselves to produce the object the rest of the handler needs.

Added `readRawBody()` helper that buffers the stream with a 2 MB cap (Meta payloads are tiny; this guards against abusive oversized POSTs).

### Vercel Raw-Body Mechanism Chosen

**Direct stream reading via `req.on('data')`/`req.on('end')`** — no `vercel.json` change, no env var, no impact on any other `/api` route. This is the documented approach per Vercel's official Node.js runtime docs and matches how Stripe webhook verification is commonly implemented on Vercel. The key insight is that `req.body` is a lazy getter — it doesn't consume the stream until first accessed, so reading the stream first is safe.

**Confidence level: HIGH.** The approach is:
1. Documented by Vercel in their Node.js helpers section
2. Confirmed in multiple GitHub discussions (vercel/vercel#4524, vercel/vercel#5213)
3. The same pattern used for Stripe webhook verification on Vercel
4. Verified via isolated behavioral tests that confirmed valid sigs pass, invalid sigs are rejected (403), and raw bytes match while re-serialization may differ

### Verification

- `node -c api/whatsapp.js` — syntax OK
- Behavioral test with mocked `IncomingMessage` stream (EventEmitter-based):
  - Valid signature → passes
  - Invalid signature → blocked (403)
  - Demonstrated that raw bytes match while re-serialized bytes may differ

---

## Fix 3: Dashboard.js XSS Gaps + leads.js verliesReden Allowlist

**Files changed:** `api/dashboard.js`, `api/leads.js`  
**Commit:** `fa7f5de`

### The Vulnerabilities

**dashboard.js XSS (3 gaps):**
1. `renderActiviteit()` → `typeMap.new.sub`: `l.telefoon` was raw, every sibling field already used `escHtml()`
2. Weekly report click handler (~line 12080): `l.naam` interpolated raw into `<span>` via `innerHTML`
3. `openPanel()` (~line 10068): `lead.reden` interpolated raw, while sibling fields (`lead.samenvatting`, etc.) were escaped

**leads.js enabler:**
The PATCH handler accepted `body.verliesReden` as free text with only a length cap (`.slice(0, 500)`), but the dashboard UI only offers a fixed `<select>` with 6 values. An attacker could POST arbitrary HTML/JS as the reden, which would be stored and rendered unescaped in `openPanel()`.

### The Fix

**dashboard.js:** All 3 gaps now use `escHtml()`.

**leads.js:** Server-side allowlist check matches the exact `<select>` options from dashboard.js:
- `''` (empty)
- `'Prijs te hoog'`
- `'Geen timing'`
- `'Concurrent gekozen'`
- `'Geen interesse'`
- `'Geen reactie'`
- `'Andere reden'`

Unknown values are silently dropped (no 400 response, to avoid leaking which values are valid). Defense in depth — even though `escHtml()` closes the XSS, the boundary validation gap is now closed too.

### Verification

- `node -c api/dashboard.js && node -c api/leads.js` — syntax OK
- Manual inspection of diff confirmed all 3 XSS gaps are fixed
- Allowlist matches exact options from dashboard.js lines 10020-10027

---

## Review Cycles Summary

Each fix went through 3 build-review-refine cycles as instructed. Here's what changed between cycles for the trickiest fix (Fix 2 — webhook):

**Cycle 1:** Initial implementation with `readRawBody()` helper, signature verification using raw bytes, JSON.parse of verified bytes. Found no issues.

**Cycle 2:** Re-reviewed the diff, traced call sites. Confirmed no remaining `req.body` references in business logic (only in comments explaining the old broken behavior). Verified the 2 MB cap is reasonable. No changes needed.

**Cycle 3:** Final review confirmed the approach matches documented Vercel patterns. Ran additional behavioral tests with edge cases (empty body, oversized body rejection). No changes needed — all 3 cycles produced identical code with nothing to improve.

---

## Files Changed (Total)

| File | Fix | Lines Changed |
|------|-----|---------------|
| `api/auth.js` | 1 | +28, -9 |
| `api/leads.js` | 1, 3 | +23, -4 |
| `api/whatsapp.js` | 2 | +66, -20 |
| `api/dashboard.js` | 3 | +3, -3 |

---

## What Was NOT Changed

- No other files were touched
- No refactoring beyond the security fixes
- No vercel.json changes
- No dependency changes
- Existing code conventions (Dutch comments, error response shapes, logging style) preserved exactly
