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

## Checklist for Deployment

- [ ] All 8 env vars above are set in Vercel
- [ ] `WA_APP_SECRET` matches the value in Meta Developer Console → App → App Secret
- [ ] `WA_VERIFY_TOKEN` matches the token entered in Meta → WhatsApp → Webhooks configuration
- [ ] Vercel project is not publicly writable (only the API routes are exposed)
- [ ] Airtable base is not set to "Anyone with the link can edit"
