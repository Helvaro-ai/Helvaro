# Security

This document describes the security measures built into the Helvaro platform and how to report vulnerabilities.

---

## Reporting a Vulnerability

If you find a security issue, **do not open a public GitHub issue**. Contact us directly at the email address on [helvaro.pro](https://helvaro.pro). We will respond within 48 hours.

---

## Protections in Place

### 1. WhatsApp Webhook Signature Verification (`api/whatsapp.js`)

Every POST from Meta is verified with an HMAC-SHA256 signature using the `WA_APP_SECRET` environment variable.

- The `x-hub-signature-256` header is compared using **timing-safe equality** (`crypto.timingSafeEqual`) to prevent timing attacks.
- Requests with an invalid or missing signature are rejected with `403 Forbidden`.
- Without this, anyone on the internet could send fake WhatsApp messages to the bot.

**Required env var:** `WA_APP_SECRET` (your Meta App Secret)

### 2. Webhook Verify Token (`api/whatsapp.js`)

The Meta webhook verification handshake checks a shared secret token.

- Token is read from `WA_VERIFY_TOKEN` env var — **never hardcoded in source**.
- Mismatched tokens return `403 Forbidden`.

**Required env var:** `WA_VERIFY_TOKEN`

### 3. Airtable Formula Injection Prevention (all API files)

User-supplied values are **escaped** before being embedded in Airtable `filterByFormula` strings. Without escaping, a crafted phone number or project code could manipulate the query logic.

The `escapeFormula()` helper escapes backslashes and double-quotes:

```js
function escapeFormula(val) {
  return String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
```

Applied in: `api/auth.js`, `api/form.js`, `api/leads.js`, `api/whatsapp.js`

### 4. Input Validation & Length Limits (all API files)

All user input is validated and capped before processing:

| Field | Max length | Validation |
|---|---|---|
| Email | 254 chars | Regex: valid email shape |
| Password | 200 chars | — |
| Name | 100 chars | Required |
| Phone | 30 chars | Required |
| Source (bron) | 50 chars | — |
| Project code | 50 chars | `^[A-Z0-9_]{1,50}$` |
| API key | 100 chars | `^[A-Za-z0-9\-_]{8,100}$` |
| Notes | 5 000 chars | — |
| WhatsApp message | 2 000 chars | — |
| Airtable record ID | exact | `^rec[A-Za-z0-9]{14}$` |

Requests that fail validation are rejected with `400 Bad Request` **before** any database call.

### 5. Control Character Sanitization (`api/form.js`, `api/whatsapp.js`)

User-supplied text that is embedded in WhatsApp messages is stripped of control characters (`\x00-\x1F`, `\x7F`) to prevent message injection or terminal escape sequences:

```js
function sanitize(val) {
  return String(val || '').replace(/[\x00-\x1F\x7F]/g, '').slice(0, 100);
}
```

### 6. API Key Authentication (`api/leads.js`)

The dashboard API requires an `x-api-key` header. The key is looked up against the Clients table in Airtable.

- Key format is validated with a regex before the database query (fail-fast, no unnecessary DB calls).
- Each client can only read their own leads — filtered by `{Project Code}` tied to their key.

### 7. No Internal Error Leakage (all API files)

`500` responses return a generic Dutch-language message. Raw `err.message` strings are **never** returned to the client — they are only written to server logs (Vercel Functions logs).

### 8. No Secret in Source Code

All secrets are read from environment variables:

| Variable | Purpose |
|---|---|
| `API_Airtable` | Airtable Personal Access Token |
| `BASE_AIRTABLE` | Airtable Base ID |
| `ANTHROPIC_API_KEY` | Claude AI API key |
| `WHATSAPP_TOKEN` | Meta Graph API token |
| `PHONE_NUMBER_ID` | WhatsApp Phone Number ID |
| `NOTIFY_PHONE` | Owner's WhatsApp number for alerts |
| `WA_VERIFY_TOKEN` | Meta webhook verify token |
| `WA_APP_SECRET` | Meta App Secret (signature verification) |

Set all of these in the **Vercel Dashboard → Project → Settings → Environment Variables**.

### 9. CORS

- Public endpoints (`/api/form`, `/api/auth`) use `Access-Control-Allow-Origin: *` — required so the embeddable form widget works on any client website.
- The leads dashboard endpoint also allows `*` — access is gated by API key, not origin.

---

## 2026-09-19 — Security attack pass (Fase 10)

A deliberate, API-level attack pass against `api/leads.js`, `api/auth.js`,
`api/admin.js`, `api/whatsapp.js`, `api/stripe.js`, `api/form.js`,
`api/_gcal.js`/`api/_drive.js`, and `api/_crm/*`. See
`tests/idor-matrix.test.js` and `tests/wachtwoord-reset-orakel.test.js` for
the executable proof; this section is the summary.

**What this pass covered:**

- **Cross-tenant IDOR** across every `body.mode` in `api/leads.js` that
  accepts a record id or code (leads, appointments, vehicles, properties,
  CRM sync, billing, config, activity log). Verified by code reading +
  existing per-feature tests (`tests/properties.test.js`,
  `tests/dealership.test.js`, `tests/voertuigslot.test.js`, …), and by two
  new executable cases in `tests/idor-matrix.test.js` that had no prior
  cross-tenant test: `appointment-update` and `appointment-create` (linking
  a lead by id).
- **Admin/privilege checks**: `isAdminToken()` timing-safe compare
  (`api/_session.js`, `api/admin.js`, `api/leads.js`); admin token only ever
  read from a header/cookie via `_session.readToken()`, never from a query
  string; plan/price/credit amounts always recomputed server-side, never
  trusted from the client (`api/_plans.js`, `api/_credits.js`).
- **Webhook replay**: Stripe signature verification + idempotent booking via
  `api/_ledger.js` reference (`stripe:<session id>`, see
  `tests/stripe-webhook.test.js`); WhatsApp signature verification fails
  CLOSED when `WA_APP_SECRET` is unset (503, not an open endpoint) and
  message-id dedup (`api/whatsapp.js`).
- **SSRF**: every client-supplied URL Helvaro's server fetches itself
  (CRM webhook/API/My Domain in `api/_crm/adres.js`; property/vehicle
  import in `api/_lib/fetch-website.js`) is resolved and checked against
  private/link-local/metadata IP ranges, with `redirect: 'manual'` so a
  public host can't 307 its way to an internal one.
- **Auth**: session cookie is `HttpOnly; Secure; SameSite=Lax` with a
  double-submit CSRF token (`api/_session.js`); reset tokens expire in 1h
  and are invalidated on use (bound to the password hash, which rotates);
  admin/login rate-limited at 40/15min per IP, shared across instances via
  Upstash when configured (`api/_ratelimit.js`).
- **Info leakage**: `500` responses never include `err.message`
  (`api/_errors.js`); admin `customer-detail` scoping previously fixed.

**Found and fixed in this pass:**

1. **User enumeration via password reset / resend-verification**
   (`api/auth.js`, MEDIUM) — `request-reset` and `resend-verification`
   returned a distinct 404 for an unregistered email vs. 200 for a real
   account, defeating the neutral-error pattern the plain login endpoint
   already used correctly. Both now return an identical response
   regardless of account existence. *Residual, accepted*: the
   `email_not_verified` 403 branch of `request-reset` still confirms an
   account exists but is unverified — a smaller, lower-value oracle than
   the fixed one, and removing it would cost real UX (the verification
   gate itself is intentional). See `tests/wachtwoord-reset-orakel.test.js`.
2. **Admin lead-delete/lead-export unreachable** (`api/leads.js`, functional
   regression discovered while building the IDOR matrix — fails closed, no
   data exposure, but the GDPR erasure/export path 401'd unconditionally
   regardless of a correct admin key). Fixed: the legacy client-API-key
   lookup is now skipped once the admin token has already authenticated.
   See `tests/idor-matrix.test.js`.

**Not exercisable with the mocks available in this pass** (see
`tests/idor-matrix.test.js`'s closing section for the reasoning): `crm-sync`
cross-tenant leadId check (requires a working `_crm/config.js` mock),
image/video job cross-tenant status reads (job state lives outside
Airtable), and the gcal/drive OAuth `?action=callback` exchange (requires a
signed state token *and* a mocked Google token exchange).

---

## 2026-09-19 — Platform integrity: search, retention, environment (items 7-9)

### 7. Server-side lead search

`api/leads.js`'s GET lead-list (the dashboard's main data source) previously
returned the tenant's full lead list and left filtering to the browser — fine
at a few hundred leads, but the SAME `MAX_PAGES=20` cap that already
truncates the unfiltered list would also silently truncate what a search
could ever see. `?search=` now filters server-side, in Airtable, via
`buildLeadSearchFormula()`: name, phone, notes (which also carries the
property tag — see `_leads-read.js`'s `mapLead()`), conversation history, and
the record id itself. Tenant-scoped (`AND()`'d with the existing Project Code
clause, never OR'd), formula-escaped (`escapeFormula()`, the same helper
section 3 above documents), and paginated the same way the unfiltered list
already is. There is no email field on the Lead record (only on Clients), so
email is not searchable here; vehicle is stored on the Appointment, not the
Lead, and is out of scope for a single-table query. Proven in
`tests/leads-search.test.js`, including a formula-injection attempt (`") ,
TRUE(), SEARCH(LOWER("` — quotes, parens and a comma, the characters that
would break a `SEARCH()` string open) that is shown, structurally, to survive
`escapeFormula()` intact and, functionally, to match zero records and never
cross a tenant boundary.

### 8. Data retention — facts (brief §78/§79)

Facts only, no legal-compliance claims — see `api/privacy.js` for what is
promised to leads/customers, `api/_wissen.js` and `api/cron-followup.js` for
what the code actually does.

| Data | Where it lives | Kept for | Mechanism |
|---|---|---|---|
| Qualified leads | Leads table (Airtable) | As long as the customer relationship needs it — no automatic expiry | — |
| Unqualified/cold leads | Leads table | Anonymized after 6 months of inactivity; the anonymized row itself is then hard-deleted after a further **90 days by default** (`RETENTIE_OPRUIM_DAGEN`), but only once **`RETENTIE_OPRUIMEN=1`** is set | `runRetentionAnonymization()` then `runRetentionPurge()`, both in `api/cron-followup.js`, daily cron |
| Admin-erasure lead (GDPR request via `lead-delete`) | Leads table | Same as above — `method: 'anonymize'` (default) leaves the same purgeable husk; `method: 'hard-delete'` removes the row immediately | `api/leads.js`'s `lead-delete` mode |
| Signup-fraud signals (IP, device fingerprint) | Client Config table | 30 days, always on (not gated by `RETENTIE_OPRUIMEN`) | `runSignupSignalsRetention()`, `api/cron-followup.js` |
| Generated property images | Vercel Blob, `property/<projectCode>/…` | Tenant's lifetime; purged immediately on account deletion | `api/_wissen.js`'s `wisTenantMedia()` |
| Orphaned property images (tenant fully gone, e.g. deleted before this existed) | Vercel Blob | Swept once older than `RETENTIE_OPRUIM_DAGEN`, only with `RETENTIE_OPRUIMEN=1` | `runMediaRetentionPurge()`, `api/cron-followup.js` |
| Account deletion (`wisAlles`) | 9 Airtable tables (Leads, Appointments, properties, vehicles, campaigns, credit_transactions, Users, ai_conversations, ai_messages) + Client Config row + Clerk login + Stripe subscription + Vercel Blob media | Deleted synchronously, on request, best-effort per step (one table's failure doesn't stop the rest — see the report it returns) | `api/_wissen.js` |
| Stripe customer & invoices | Stripe, not Airtable | Stripe's own retention (accounting records; the duty is Helvaro's, not the customer's) | Never touched by `wisAlles()` — by design, see `_wissen.js`'s file header |

**Retention purge is dry-run by default.** `runRetentionPurge()` and
`runMediaRetentionPurge()` always compute and log exactly what they would
delete; nothing is actually removed until `RETENTIE_OPRUIMEN=1` is set. This
is the one destructive, irreversible step in the whole retention chain (an
Airtable `DELETE`/blob `del()`, not a PATCH that clears fields), so it ships
off by default — see `VERCEL-DEPLOY-CHECKLIST.md`'s action item. Proven in
`tests/retentie-opruimen.test.js`.

**Known gaps, documented rather than fixed in this batch:**
- No per-tenant retention override exists on Client Config today; `RETENTIE_OPRUIM_DAGEN` is one fixed default for every tenant.
- `anonymizedAt` is only recorded starting with this batch (both anonymize call sites now write it into Notities as JSON instead of clearing the field to `''`). A lead anonymized before that falls back to Created At, which is always earlier-or-equal to the true anonymize date — the safe direction, but not exact.
- Blob-storage churn for a still-active tenant (an image regenerated and replaced) is not cleaned up — only a fully-deleted tenant's orphaned media is swept. Closing that needs per-property reference-checking against Airtable that this batch didn't have room for, and getting it wrong risks deleting an image someone is still looking at.
- `api/privacy.js` §5 documents anonymization but not the eventual hard-delete of the husk added here. That is public legal copy and this batch does not edit it — flagged for the owner to decide whether/how to update it once `RETENTIE_OPRUIMEN` is turned on.

### 9. Environment configuration & dependency audit

See `VERCEL-DEPLOY-CHECKLIST.md`'s new **Environment variables** section for
the full `process.env.*` inventory (required / optional / local-only) and the
Stripe test-vs-live boot warning. `npm audit` / `depcheck` results are also
in that checklist's **Dependency audit** section.

---

## Checklist for Deployment

- [ ] All 8 env vars above are set in Vercel
- [ ] `WA_APP_SECRET` matches the value in Meta Developer Console → App → App Secret
- [ ] `WA_VERIFY_TOKEN` matches the token entered in Meta → WhatsApp → Webhooks configuration
- [ ] Vercel project is not publicly writable (only the API routes are exposed)
- [ ] Airtable base is not set to "Anyone with the link can edit"
