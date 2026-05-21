# Helvaro — Architectuur

> Hoe het hele systeem in elkaar zit.

---

## Stack overzicht

```
┌────────────────────────────────────────────────────────────┐
│                       app.helvaro.pro                       │
│                        (Vercel Edge)                        │
├────────────────────────────────────────────────────────────┤
│  /dashboard      → api/dashboard.js  (volledige client app) │
│  /start/{CODE}   → api/form-page.js  (per-klant lead form)  │
│  /onboard        → public/onboard.html                      │
│  /api/auth       → api/auth.js       (login)                │
│  /api/leads      → api/leads.js      (CRUD + AI suggesties) │
│  /api/admin      → api/admin.js      (admin ops)            │
│  /api/whatsapp   → api/whatsapp.js   (Meta webhook)         │
│  /api/calendly-* → api/calendly.js   (OAuth + appointments) │
│  /api/form/{C}   → api/form.js       (lead submissions)     │
│  /api/cron-followup → api/cron-followup.js (daily 9u)       │
└────────────────────────────────────────────────────────────┘
                          │
                          ├─→ Airtable (database)
                          ├─→ Meta Graph API (WhatsApp)
                          ├─→ Anthropic API (Claude Haiku)
                          ├─→ Calendly (booking)
                          └─→ Resend (transactional email)
```

**Belangrijke beperking:** Vercel Hobby plan = max **12 serverless functions**. We zitten precies op 12. Nieuwe features moeten via bestaande endpoints.

---

## Data flow — wat gebeurt er bij een nieuwe lead?

```
1. Bezoeker vult /start/HELVARO formulier in
   │
   ▼
2. POST /api/form/HELVARO
   ├── Valideert input (naam, telefoon, projectcode)
   ├── Look-up klant in Airtable Klanten table (cached 5 min)
   ├── Leest AI Name + Auto-Reply Template
   ├── Maakt Lead record in Airtable Leads table
   ├── Returns 200 → bezoeker ziet success-screen
   │
   ▼
3. setTimeout(45000) ←── 45 seconden wachten ("voelt menselijk")
   │
   ▼
4. Stuurt eerste WhatsApp via Meta Graph API
   │  POST graph.facebook.com/v19.0/{PHONE_ID}/messages
   │  body: 'Hey {naam}! {ai} hier van {bedrijf}...'
   │
   ▼
5. Lead antwoordt op WhatsApp
   │
   ▼
6. Meta verstuurt webhook → POST /api/whatsapp
   ├── Verifieert webhook (X-Hub-Signature)
   ├── Vindt Lead record op telefoonnummer
   ├── Leest Conversation History (JSON in Airtable)
   ├── Roept Claude Haiku aan met system prompt:
   │   - Wie ben je (AI Name)
   │   - Voor wie werk je (Client Name)
   │   - Welke vragen stellen (Niche-specifiek)
   │   - AI Instructions per klant
   ├── Claude returns JSON:
   │   { "message": "Wat is je budget?",
   │     "done": false,
   │     "qualified": null,
   │     "leadScore": null }
   ├── Updates Conversation History + State in Airtable
   ├── setTimeout(30000) wacht 30s
   ├── Stuurt AI antwoord via Meta API
   │
   ▼
7. Gesprek herhaalt tot Claude returns:
   { "done": true,
     "qualified": true,
     "reason": "Heeft budget + tijdlijn",
     "summary": "Renovatie 80k, wil starten zomer",
     "ability": "high", "urgency": "high", "fit": "strong",
     "leadScore": 9 }
   │
   ▼
8. Helvaro stuurt Calendly link + adres
   ├── 'Goed. Plannen we een gesprek? Kies hier: {calendly_url}'
   ├── Markeert Booking Link Sent: true
   ├── Notificeert owner via WhatsApp (NOTIFY_PHONE)
   │
   ▼
9. Lead boekt slot op Calendly
   │
   ▼
10. Calendly stuurt webhook (later — via OAuth integratie)
    └── Update lead: Appointment Booked: true
```

---

## Airtable schema

**Base ID:** `apppcJenvfk8e8vTa` ("Lead Qualification System")

### Tabel: **Klanten / Client Config** (`tblPidTrwGRzRt4LZ`)
Eén record per klant. Stores AI config + Calendly + kwalificatie-criteria.

| Field | ID | Type | Doel |
|---|---|---|---|
| Client Name | `fldAnB848Sr5jl6dq` | text | Bedrijfsnaam |
| Project Code | `fldN4dL0bGgfBOXwM` | text | Unieke ID per klant (uppercase, A-Z 0-9 _) |
| API Key | `fldhmnzVjrb2AyqJr` | text | Legacy auth voor /api/leads (vervangen door signed sessions) |
| Email | `fld2GjRvjpsxI8XD0` | email | Contact mail |
| Phone | `fldecVolseGXtQaAN` | phone | Contact telefoon |
| AI Name | `fldRvoe1JMPOtPWC7` | text | Persoonlijke AI naam (Sara, Tim, ...) |
| Auto-Reply Template | `fldOGdVq6T54xEo6W` | longtext | Eerste WhatsApp bericht (placeholders {naam}/{ai}/{bedrijf}) |
| AI Instructions | `fld1lqHctRbqFGQf5` | longtext | Tone-of-voice + regels voor de AI |
| Website | `fldzBclLhryWQ1veO` | url | AI fetched dit elke conversatie |
| Adres | `fldTvMSdTZOyNgWod` | longtext | Sent bij appointment confirmation |
| Niche | `fld0BsPnDbBOkTHzr` | singleselect | real_estate/dentist/lawyer/finance/other |
| Calendly Link | `fldNEj1ysRgINOOtr` | url | Booking link |
| Calendly Access Token | `fldfClWtZoFkiC8OG` | longtext | OAuth |
| Calendly Refresh Token | `fldJyYDIS277YQQV8` | longtext | OAuth refresh |
| Calendly Token Expiry | `fld0Jh2c8SqWZr0gN` | text | ISO timestamp |
| Plan | `fldx17jwQG202JhYF` | singleselect | Starter/Pro/Enterprise |
| Lead Limiet | `fldnFRoxuY4dqhAnS` | number | Maandelijkse cap |
| Rapport Email | `fldDBJCN6dVMA8jax` | email | Weekly report bestemming |
| Min Ability | `fldgkesMuUUGxZI3n` | longtext | Kwalificatie-rule |
| Max Urgency Window | `fldyim5uWUjRzCYMI` | text | Kwalificatie-rule |
| Active | `fldCbawcED6zZCqIS` | checkbox | Voor pauzering |
| AI Photo URL | `fld7L0Iijq7ti6A6w` | url | Foto voor lead-form avatar (HTTPS-only validated) |
| Brand Color | `fldJAf4aTNlIQVL2q` | text | Hex (#XXXXXX) voor lead-form theme |
| Form Intro Message | `fldxZ5spOeIb5omPr` | longtext | Custom welkomstboodschap op lead-form |

### Tabel: **Leads** (`tbliukTnDAbEDcZmt`)
Eén record per lead. Alles wat we over deze persoon weten.

| Field | ID | Type | Doel |
|---|---|---|---|
| Name | `fldbk0LVNckOU0bqA` | text | Voornaam ingegeven door lead |
| Phone | `fld6YaitW0lMqHUrd` | phone | Telefoonnummer (E.164 zonder +) |
| Project Code | `fldSmczuyUJd26HLe` | text | Link naar Klant |
| Created At | `fldR0r13EU4RwrtvH` | datetime | Submission timestamp |
| Conversation State | `fld8mkrEWcyq7mUip` | singleselect | new / in_progress / completed |
| Conversation History | `fldwDOLZKlAhfigbh` | longtext | JSON-string van messages |
| Last Message | `fldV8PbcsDzvKRiks` | longtext | Snelle preview |
| Qualified | `fld0hAZJ5wgaXrNTn` | checkbox | AI verdict |
| Reason | `fld3NhSENma0okbT7` | longtext | Korte reden (of verlies-reden) |
| AI Summary | `fldqerIiw5qyQjXHr` | longtext | 1-2 zin samenvatting |
| Lead Score | `fldpzQgMuWJLjogiD` | rating (1-10) | Score |
| Ability | `fldrfbTopJvZEYSKP` | singleselect | low/medium/high |
| Urgency | `fldlyLH1DKrWyG3Tr` | singleselect | low/medium/high |
| Fit | `fldqNxsPshvZEBeLr` | singleselect | poor/moderate/strong |
| Booking Link Sent | `fldLeEqwNefdglLis` | checkbox | Calendly verstuurd |
| Appointment Booked | `fldyIGNetqcSEkoaK` | checkbox | Calendly slot geboekt |
| Bron | `fldGoerozqdea4BfU` | singleselect | Website/Facebook/Google/... |
| Notities | `fldoLRI5W12ThTls7` | longtext | Manuele notities door klant |
| Opgepikt | `fld86JQHB6dbuutA7` | checkbox | Manueel opvolg-tracker |
| Verwachte Waarde | `fldv7qOYvCN1xJfiR` | text | Deal-waarde €... |
| Response Time | `fldUJJ8oSmAMQ9wB3` | number | Seconden tussen lead-bericht en AI-reactie |
| Week | `fldaEP0YbDldODmNv` | text | Week-nummer voor weekly reports |
| Client | `fldSU9uaVVHJuFrpL` | recordlink | Link naar Klanten record |

### Tabel: **Users** (`tbl2hrPW7gIx5XF4S`)
Dashboard gebruikers (login accounts). Eén user → één Klant.

| Field | ID | Type |
|---|---|---|
| Email | `fldsqiSy41CCDickr` | email |
| Password Hash | `fldqi8JWgFgJF4X4R` | text |
| Client Name | `fldmKwegSUj1joru3` | text |
| Project Code | `fldbrCpBuQjJBfZsv` | text |
| API Key | `fldxZMgVXSy7EShDL` | text |
| Active | `fldb8sGE3Bslch8f8` | checkbox |
| Created At | `fldXC4Ya1wDfmSCiZ` | datetime |

### Tabel: **Niche Config** (`tblMbeAQBgZJbOIN1`)
AI conversation templates per niche. Bepaalt vragen + diskwalifiers per sector.

---

## Authentication

### Client-side login (dashboard)
1. `POST /api/auth` met `{email, password}`
2. Server checkt Users table (cached 5 min) of USERS_CONFIG env var
3. Server signt een session token met HMAC-SHA256:
   ```
   token = base64url({apiKey, clientName, projectCode, calendlyLink, exp})
           .signed_with(SESSION_SECRET)
   ```
4. Token wordt opgeslagen in `localStorage.hvk`
5. Elke request stuurt `x-api-key: <token>`
6. Server verifies signature → geen Airtable lookup nodig

### Admin endpoints
Beschermd via `ADMIN_KEY` (timing-safe compare). Bv. POST /api/admin → mode-based routing.

### WhatsApp webhook
- Meta verstuurt `X-Hub-Signature-256` header
- Server berekent HMAC-SHA256 van payload met `WHATSAPP_VERIFY_TOKEN`
- Comparison via `crypto.timingSafeEqual`

---

## AI prompting

### Conversation AI (whatsapp.js)
Model: `claude-haiku-4-5-20251001`
- System prompt = klant-specifiek (AI Name + Client Name + Niche-vragen + AI Instructions)
- Conversation messages = de hele history
- Output = JSON met `{message, done?, qualified?, reason?, summary?, leadScore?, ...}`

### Reply suggestions (leads.js → suggest-replies mode)
Model: `claude-haiku-4-5-20251001`
- System prompt = "Geef 3 korte WhatsApp-antwoord suggesties"
- Returns: `{replies: ['suggestie 1', 'suggestie 2', 'suggestie 3']}`

### Lead scoring breakdown
Niet apart — komt mee in de main `done: true` JSON output:
```json
{
  "ability": "high",
  "urgency": "medium",
  "fit": "strong",
  "leadScore": 8
}
```

---

## Belangrijke caches

| Cache | Waar | TTL | Reden |
|---|---|---|---|
| Klant-record lookup | leads.js, form.js, whatsapp.js | 5 min | Reduceer Airtable load |
| Leads list per project | leads.js GET | 90s (op client) | Server polled niet auto |
| Klant config (per session) | dashboard.js | session | Refresh op page reload |
| Signed session token | localStorage | 7 dagen | Lange sessies zonder re-auth |
| Form-page render | API | none (no-store) | Config-wijzigingen instant |

---

## Vercel cron

`vercel.json`:
```json
"crons": [
  { "path": "/api/cron-followup", "schedule": "0 9 * * *" }
]
```

Runs elke ochtend 9u UTC. Stuurt opvolg-WhatsApps naar leads die:
- Status = "in_progress"
- Last message > 24u geleden
- Niet "verloren" of "completed"

---

## CORS

Twee origins zijn whitelisted in `admin.js`:
1. `https://app.helvaro.pro` — main dashboard
2. `https://founderyou.netlify.app` — legacy founder dashboard

Plus pattern-match: alle `*.pages.dev` URLs (Cloudflare Pages voor founder).

---

## Error handling principes

1. **Never crash the user flow** — Airtable down? → cached data. WhatsApp down? → flag in DB.
2. **Log to console, never block** — alle externe calls hebben try/catch
3. **Fail-safe defaults** — ontbrekend env var → graceful fallback, niet 500

---

*Laatst bijgewerkt: 2026-05-22*
