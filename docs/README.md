# Helvaro — Documentation

> AI-gedreven lead kwalificatie via WhatsApp voor Belgische KMO's.

Centrale index van alle Helvaro-documentatie. Klik door naar het juiste document.

---

## 🧭 Navigatie

### Voor klanten van Helvaro
- **[User Guide](./user-guide.md)** — Hoe werkt het Helvaro dashboard? Volledige walkthrough van login tot lead-opvolging.
- **[FAQ](./faq.md)** — Veelgestelde vragen over WhatsApp, AI gedrag, privacy, prijzen.

### Voor Helvaro founders (Frade + Teljo)
- **[Operations Runbook](./operations.md)** — Dagelijks werk, incident-respons, monitoring.
- **[Marketing Playbook](./marketing-playbook.md)** — Volledige sales + marketing-strategie tot 5 klanten.
- **[Niche Analysis](./niche-analysis.md)** — Alle 20 sectoren gerangschikt op succeskans.
- **[Video Script](./video-script.md)** — 6-scenes explainer script + Higgsfield prompts.

### Voor developers
- **[Architecture](./architecture.md)** — Hoe het systeem in elkaar zit (Vercel + Airtable + Meta + Claude).
- **[API Reference](./api-reference.md)** — Alle endpoints + auth + voorbeelden.

---

## 🚀 Quick links

| Wat | URL |
|---|---|
| Klant-dashboard | https://app.helvaro.pro/dashboard |
| Onboarding voor nieuwe klant | https://app.helvaro.pro/onboard?invite=CODE |
| Lead-form (per klant) | https://app.helvaro.pro/start/PROJECT_CODE |
| Promo animatie | https://app.helvaro.pro/promo |
| Founder dashboard (standalone) | https://founderyou.pages.dev |
| GitHub repo | https://github.com/Helvaro-ai/Helvaro |
| Vercel project | https://vercel.com/helvaros-projects/helvaro |
| Airtable base | apppcJenvfk8e8vTa (Lead Qualification System) |

---

## 🔑 Belangrijke environment variabelen

In Vercel onder Settings → Environment Variables. **Nooit committen.**

| Variabele | Wat | Verplicht |
|---|---|---|
| `API_AIRTABLE` | Personal access token voor Airtable | ✓ |
| `BASE_AIRTABLE` | Base ID `apppcJenvfk8e8vTa` | ✓ |
| `ADMIN_KEY` | Admin secret voor protected endpoints | ✓ |
| `SESSION_SECRET` | HMAC secret voor signed sessions | ✓ |
| `ONBOARD_CODE` | Invite-code voor `/onboard` flow | ✓ |
| `WHATSAPP_TOKEN` | Meta Graph API access token | ✓ |
| `PHONE_NUMBER_ID` | Meta WhatsApp phone number ID | ✓ |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification token | ✓ |
| `ANTHROPIC_API_KEY` | Claude API key | ✓ |
| `RESEND_API_KEY` | Resend voor outbound emails | optioneel |
| `RESEND_FROM` | From-adres (default `Helvaro <noreply@helvaro.pro>`) | optioneel |
| `NOTIFY_EMAIL` | Owner inbox voor lead-meldingen | optioneel |
| `NOTIFY_PHONE` | Owner WhatsApp voor lead-meldingen | optioneel |
| `CALENDLY_CLIENT_ID` | Calendly OAuth app ID | optioneel |
| `CALENDLY_CLIENT_SECRET` | Calendly OAuth secret | optioneel |
| `OWNER_EMAIL` / `OWNER_PASSWORD_HASH` | Legacy owner bypass — vervangen door USERS_CONFIG | legacy |
| `USERS_CONFIG` | JSON met user-accounts (skips Airtable lookup) | optioneel |

---

## 📂 Project structuur

```
Helvaro/
├── api/                          ← Vercel serverless functions (12/12 limiet)
│   ├── admin.js                  ← admin operations + onboarding POST
│   ├── auth.js                   ← login endpoint
│   ├── calendly.js               ← Calendly OAuth + appointments
│   ├── cron-followup.js          ← daily 9u cron voor follow-ups
│   ├── dashboard.js              ← /dashboard HTML (de hele client-app)
│   ├── demo.js                   ← /demo redirect
│   ├── form.js                   ← lead-form submission endpoint
│   ├── form-page.js              ← /start/CODE HTML page (per klant)
│   ├── leads-list.js             ← lead-list endpoint
│   ├── leads.js                  ← leads CRUD + config + suggest-replies + reply
│   ├── privacy.js                ← /privacy + /terms pages
│   └── whatsapp.js               ← Meta webhook receiver + AI runner
│
├── public/                       ← Static assets
│   ├── dashboard.html            ← legacy fallback
│   ├── favicon.png
│   ├── form-widget.js            ← embeddable widget script
│   ├── logo.png
│   ├── onboard.html              ← 3-step client onboarding wizard
│   ├── Untitled_design-removebg-preview.png
│   └── promo.html                ← 28s explainer animation
│
├── docs/                         ← Documentation (deze map)
│   ├── README.md                 ← ⬅️ je bent hier
│   ├── user-guide.md
│   ├── architecture.md
│   ├── api-reference.md
│   ├── operations.md
│   ├── faq.md
│   ├── marketing-playbook.md
│   ├── niche-analysis.md
│   └── video-script.md
│
└── vercel.json                   ← rewrites + cron config
```

---

## 🛠️ Lokaal werken

```bash
# Clone
git clone git@github.com:Helvaro-ai/Helvaro.git
cd Helvaro

# Vercel CLI installeren (eenmalig)
npm i -g vercel

# Lokale dev server (gebruikt productie env vars via Vercel)
vercel dev

# Bereikbaar op http://localhost:3000
```

### Validatie vóór commit

```bash
# Alle API-bestanden moeten valid Node.js syntax hebben
node --check api/admin.js
node --check api/dashboard.js
node --check api/leads.js
# ... etc

# Render-test van dashboard.js (genereert HTML lokaal)
node -e "
const handler = require('./api/dashboard.js');
const req = { headers: {}, method: 'GET' };
const res = { setHeader: () => {}, status: () => res, send: (h) => {
  require('fs').writeFileSync('/tmp/dash.html', h);
}};
handler(req, res);
"
# Daarna: validate de browser JS in de output
awk '/<script>$/{f=1;next} /<\/script>/{f=0} f' /tmp/dash.html | node --check /dev/stdin
```

---

## 🔄 Deploy

Vercel deploy gebeurt automatisch bij elke `git push origin main`. Geen handmatige stap.

```bash
git add .
git commit -m "feat: ..."
git push
# ~30-60s later live op app.helvaro.pro
```

Voor preview deploys (zonder main te raken):
```bash
git checkout -b feature/x
git push origin feature/x
# Vercel maakt automatisch een preview-URL en post die in GitHub
```

---

## 📊 Wat is Helvaro precies?

In één zin:
> *Helvaro is je virtuele salesassistent die elke nieuwe lead binnen 1 minuut persoonlijk beantwoordt via WhatsApp, kwalificeert, en automatisch een afspraak boekt.*

In 30 seconden:
1. Klant plakt Helvaro-formulier op hun website (`/start/CODE` link of widget)
2. Bezoeker vult naam + telefoonnummer in
3. Binnen 1 minuut → AI stuurt persoonlijke WhatsApp van "Sara" (of welke naam de klant kiest)
4. AI heeft een gesprek, stelt kwalificatievragen (budget, timing, fit)
5. Als gekwalificeerd → AI stuurt Calendly-link → afspraak ingepland
6. Klant ziet alleen de warme prospects in hun dashboard

---

## 💬 Contact / support

| Wie | Hoe |
|---|---|
| **Algemene vragen** | hello@helvaro.pro |
| **Frade (sales + outreach)** | LinkedIn / WhatsApp |
| **Teljo (tech + product)** | LinkedIn / WhatsApp |
| **Bug-rapport** | GitHub issue |

---

*Laatst bijgewerkt: 2026-05-21*
