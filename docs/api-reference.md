# Helvaro API Reference

Alle endpoints op `https://app.helvaro.pro/api/*`.

> Auth header voor klant-endpoints: `x-api-key: <signed-session-token>`
> Auth header voor admin endpoints: `x-api-key: <ADMIN_KEY>` (timing-safe compare)

---

## POST `/api/auth`

Login endpoint. Returns een signed session token.

**Body:**
```json
{ "email": "client@example.com", "password": "..." }
```

**Response (200):**
```json
{
  "success": true,
  "apiKey": "hvs1.eyJ...",
  "clientName": "Acme Renovaties",
  "projectCode": "ACME",
  "calendlyLink": "https://calendly.com/..."
}
```

**Errors:**
- 400 — missing/invalid email or password
- 401 — wrong credentials
- 429 — rate limited (>10 attempts / 15 min / IP)
- 503 — Airtable rate limited

---

## GET `/api/leads`

Returns alle leads voor de authenticated klant + stats.

**Headers:** `x-api-key: <session-token>`

**Response (200):**
```json
{
  "leads": [
    {
      "id": "rec...",
      "naam": "Jan Peeters",
      "telefoon": "32478123456",
      "status": "in_progress",
      "qualified": false,
      "leadScore": 7,
      "reden": "Heeft budget genoemd",
      "samenvatting": "Renovatie 80k voor zomer",
      "capaciteit": "high",
      "urgentie": "high",
      "fit": "strong",
      "bron": "Website",
      "gesprek": "[{\"role\":\"user\",\"content\":\"...\"}]",
      "datum": "2026-05-21T14:00:00Z",
      ...
    }
  ],
  "stats": {
    "total": 12,
    "qualified": 9,
    "booked": 5,
    "conversionRate": 75,
    "thisMonth": 12,
    "avgResponseTime": 240
  },
  "client": { "naam": "Acme", "calendly": "https://..." }
}
```

---

## PATCH `/api/leads?id={recordId}`

Wijzig velden van een lead.

**Headers:** `x-api-key: <session-token>`

**Body (alle velden optioneel):**
```json
{
  "notities": "Belt morgen terug",
  "status": "completed",
  "dealWaarde": "€15.000",
  "verliesReden": "Geen budget"
}
```

**Trigger:** als `dealWaarde` is set → sendResendEmail naar NOTIFY_EMAIL

---

## POST `/api/leads`

Multi-mode endpoint. Mode wordt bepaald door body's `mode` property.

### Mode: `config-get`
Returns de AI Persoonlijkheid van de authenticated klant.

```json
// Request
{ "mode": "config-get" }

// Response
{
  "aiName": "Sara",
  "autoReplyTpl": "Hey {naam}! ...",
  "aiInstructions": "Praat informeel...",
  "website": "https://acme.be",
  "address": "Kerkstraat 12...",
  "sector": "dentist",
  "calendlyLink": "https://...",
  "clientName": "Acme",
  "aiPhotoUrl": "https://...",
  "brandColor": "#16A34A",
  "formIntro": "Custom intro tekst..."
}
```

### Mode: `config-save`
Wijzig de AI config. Whitelisted velden alleen.

```json
{
  "mode": "config-save",
  "aiName": "Sara",
  "autoReplyTpl": "...",
  "aiInstructions": "...",
  "website": "...",
  "address": "...",
  "calendlyLink": "...",
  "sector": "dentist",
  "aiPhotoUrl": "https://...",  // HTTPS only validated
  "brandColor": "#16A34A",       // Hex regex validated
  "formIntro": "..."
}
```

Cache wordt geïnvalideerd na save → volgende request ziet fresh data.

### Mode: `test-message`
Stuur een test WhatsApp naar een nummer.

```json
{
  "mode": "test-message",
  "phone": "0466358427",
  "message": "Hey, dit is een test..."
}
```

### Mode: `suggest-replies`
Claude genereert 3 antwoord-suggesties op basis van een gesprek.

```json
// Request
{ "mode": "suggest-replies", "leadId": "rec..." }

// Response
{ "replies": ["Suggestie 1", "Suggestie 2", "Suggestie 3"] }
```

---

## POST `/api/leads?id={recordId}` (default mode = manual reply)

Stuur een manueel WhatsApp-bericht naar een lead vanuit het dashboard.

**Body:** `{ "message": "tekst" }`

**Response:**
```json
{ "ok": true, "history": [...] }
```

Updates Conversation History met `manual: true` flag op die message.

---

## POST `/api/admin`

Multi-mode admin endpoint (some modes ook beschikbaar voor onboarding).

### Mode: `onboard`
Self-registration via invite link. Vereist `inviteCode`.

```json
{
  "mode": "onboard",
  "inviteCode": "...",
  "clientName": "Acme",
  "projectCode": "ACME",
  "email": "...",
  "calendlyLink": "...",
  "aiName": "Sara",
  "autoReplyTpl": "...",
  "website": "...",
  "address": "...",
  "aiInstructions": "...",
  "sector": "dentist",
  "phone": "..."
}
```

Response: `{ id, apiKey, projectCode, clientName, formUrl, dashboardUrl }`

### Mode: `invite`
Admin verstuurt invite-email naar een prospect (admin auth required).

### Mode: `test-email`
Resend diagnostic — returns Resend's exacte response zodat je weet WAAROM een send faalt.

```json
{ "mode": "test-email", "to": "test@example.com" }
```

### Mode: `presence-ping`
Heartbeat voor de Live Klanten panel op Founder dashboard. Geen admin-auth nodig — maakt apiKey hash + timestamp in module Map.

```json
{ "mode": "presence-ping", "clientName": "Acme" }
```

### Founder modes (admin-only)
- `pipeline-create` / `pipeline-update` / `pipeline-delete`
- `goal-save` / `goal-delete`
- `ai-advice` (Claude advice for founder dashboard)
- `ai-chat` (coach chat)
- `linkedin-post` / `content-post` (content generation)
- `personalized-dm` (DM generator)

---

## POST `/api/form/{PROJECT_CODE}`

Public endpoint — een nieuwe lead-submission. Wordt aangeroepen door het `/start/{CODE}` formulier.

**Body:**
```json
{
  "name": "Jan Peeters",
  "phone": "+32478123456",
  "bron": "Website"
}
```

**Flow:**
1. Valideert input
2. Maakt Lead record in Airtable
3. Returns 200 *direct* (bezoeker ziet success-screen)
4. Schedule 45s timer
5. Stuurt WhatsApp opening message via Meta API
6. Notificeert owner via WhatsApp (NOTIFY_PHONE)
7. Stuurt email notificatie (Resend, optioneel)

---

## GET `/api/calendly-events?min={iso}&max={iso}`

Returns Calendly afspraken voor de authenticated klant tussen min/max.

---

## GET `/api/calendly-slots?date={YYYY-MM-DD}&type={event}`

Returns beschikbare tijdslots op een dag.

---

## GET `/api/calendly-oauth-start`

Initieert OAuth flow met Calendly. Redirect naar Calendly authorize.

---

## GET `/api/calendly-oauth-callback?code=...&state=...`

OAuth callback. Slaat tokens op in Klanten record.

---

## POST `/api/whatsapp` (Meta webhook)

Webhook receiver van Meta Graph API.

**Verification:** `X-Hub-Signature-256` header — HMAC-SHA256 van payload met `WHATSAPP_VERIFY_TOKEN`.

**Flow:**
1. Verifieert webhook signature (timing-safe)
2. Parsed message van payload
3. Vindt Lead by phone number in Airtable
4. Loads Conversation History
5. Calls Claude with system prompt + history
6. Updates History + parses qualification fields
7. Stuurt AI antwoord via Meta API (na 30s delay)
8. Als qualified → stuurt Calendly link + notificeert owner

**GET** `/api/whatsapp?hub.mode=subscribe&hub.verify_token=X&hub.challenge=Y`
Initial webhook verification door Meta.

---

## GET `/api/cron-followup`

Daily cron (9u UTC). Stuurt opvolg-WhatsApps naar koude leads (>24u stil).

Beschermd via Vercel cron-token. Niet handmatig aanroepbaar van buiten.

---

## GET `/dashboard` → renders `api/dashboard.js`

De volledige client-app als één HTML response. Inline alle CSS + JS.

Headers:
- `Cache-Control: no-store` (config wijzigingen instant zichtbaar)
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`

---

## GET `/start/{CODE}` → renders `api/form-page.js`

De per-klant lead-form pagina. Server-side fetched Klanten config → renders met aiName, clientName, niche, photo, brand color, etc.

Headers: `Cache-Control: no-store` (instant config updates).

---

## GET `/api/demo` / `/api/privacy`

Static-ish pages — privacy policy + demo page.

---

## CORS

Allowed origins op `/api/admin`:
- `https://app.helvaro.pro` (exact)
- `https://founderyou.netlify.app` (exact)
- `https://*.pages.dev` (regex pattern)

Andere endpoints: alleen same-origin.

---

## Rate limiting

Per IP in-memory limiter per endpoint:

| Endpoint | Limiet | Window |
|---|---|---|
| `/api/auth` | 10 attempts | 15 min |
| `/api/leads` (any method) | 60 req | 60s |
| `/api/admin` | 20 req | 60s |
| `/api/form/*` | 5 submissions | 60s |
| `/api/whatsapp` (webhook) | geen | n/a |

429 response bij overschrijding. In-memory map wordt periodiek gecleaned.

---

*Laatst bijgewerkt: 2026-05-22*
