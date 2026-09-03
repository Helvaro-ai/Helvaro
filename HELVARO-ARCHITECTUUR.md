# Helvaro — architectuurbriefing

Plak dit in een nieuwe chat als context. Het beschrijft hoe de app gebouwd is,
hoe hij werkt, en welke regels je moet kennen voordat je iets aanraakt.

---

## 1. Wat het product doet

Helvaro is een WhatsApp-assistent voor Vlaamse (en Waalse/Duitstalige) makelaars.
Een lead stuurt een bericht of vult een formulier in; de assistent antwoordt
binnen de minuut, kwalificeert op budget/timing/fit, en boekt de bezichtiging
rechtstreeks in de Google Agenda van de makelaar.

De assistent heet **Faro** en heeft een eigen persona (valk). Klanten geven hem
zelf een naam ("Mathis"), zodat de lead denkt met een medewerker te praten.

Live op `https://app.helvaro.pro` (repo `Helvaro-ai/Helvaro`, branch `main`).
De marketingsite `https://helvaro.pro` is een **aparte repo**:
`UseHelvaro/Helvaro-Website` -- losse statische HTML/CSS/JS, vijf talen
(nl/fr/en/de/es), geen buildstap.

## 2. Stack — en wat er expres NIET is

- **Vercel serverless functions, vanilla CommonJS.**
- **Geen buildstap. Geen TypeScript. Geen framework. Geen bundler. Geen npm-app-dependencies.**
- Data: **Airtable** (geen SQL-database).
- Auth: **Clerk** (Bearer-token) + een legacy `hvs1.`-HMAC-sessiecookie.
- Betalen: **Stripe**. Meldingen: **OneSignal**.
- Transactionele e-mail: **SMTP** (Namecheap Private Email, via nodemailer).
  Dat is sinds 2026-09-02 de ENIGE weg -- Resend stond als terugval en is eruit.
- Beeld/video: externe modellen via `api/_media-models.js`.

Wat je schrijft, draait. Er is geen transpilatie die je fouten opvangt.

## 3. Kaart van de repo

~94 bestanden in `api/`, ~122.000 regels. **Onderstreepje voorop = geen route**,
alleen een module. Zonder onderstreepje = een echt HTTP-endpoint.

**Endpoints:** `admin` `auth` `cron-followup` `dashboard` `demo` `faro`
`form-page` `form` `leads` `privacy` `stripe` `whatsapp`

**Belangrijkste modules:**
- `_leads-read.js` — het veldschema van een lead + `computeStats()`. Eén
  leesroute die zowel `leads.js` als Faro gebruikt.
- `_credits.js` / `_ledger.js` — creditsysteem. Het grootboek is de waarheid.
- `_stripe.js` / `stripe.js` — betalen; de webhook is de enige plek waar
  credits van geld komen.
- `_wa-send.js` / `_wa-templates.js` — WhatsApp versturen + het sjabloonregister.
- `_gcal.js` — Google Agenda (OAuth, freeBusy, boeken).
- `_i18n.js` — het woordenboek van de app: `{nl, fr, en, de}`. (De website heeft
  er vijf: daar komt `es` bij.)
- `_faro/` — de assistent: `orchestrator`, `tools`, `writes`, `data`, `werk`,
  `scherm`, `rapport`, plus `_faro/ui/` (eigen client, styles, i18n, markup).
- `_ratelimit.js`, `_session.js`, `_clerk.js`, `_revocation.js` — toegang.
- `_crm/` — de koppelingen met de CRM's van klanten: `index.js` is de enige deur
  naar buiten, `vorm.js` maakt van een lead één neutrale vorm, `config.js`
  bewaart hun sleutels versleuteld in de klantrij, en `adapters/` bevat er vijf.
  Faalt zacht: een CRM-storing houdt nooit een WhatsApp-antwoord op.

**Cron:** `/api/cron-followup` dagelijks om 09:00. `maxDuration`: whatsapp en
form 120s, cron-followup 300s, de rest 60s.

## 4. De vier dingen die je echt moet weten

### 4.1 `api/dashboard.js` is ÉÉN template literal
25.000+ regels, ~1,3 MB uitgestuurde HTML, en het hele bestand is één grote
JS-template-string die de complete app teruggeeft.

Gevolgen, allemaal echt gebeurd:
- **Backslashes moeten dubbel.** `\s` in de bron wordt een backspace in de
  pagina. Schrijf `\\s`, of vermijd regex-escapes (`indexOf` in plaats van `\b`).
- **Backticks en `${` moeten ontsnapt** — ook in commentaar. Een backtick in een
  opmerking breekt de hele pagina.
- **`node --check api/dashboard.js` bewijst niets** over de code erin: dat is
  voor Node gewoon een string. Gebruik `tests/pagina-parseert.test.js`, die elk
  `<script>`-blok door de echte parser haalt.
- Eén kapotte regel = de hele app toont het inlogscherm. Dat is één keer
  ~5 minuten in productie gebeurd.

### 4.2 Airtable weigert een hele PATCH bij één onbekend veld
Bestaat een veldnaam niet in het schema, dan geeft Airtable 422 op de héle
request — ook de velden die wel bestaan. **Nieuwe velden dus altijd in een
aparte, best-effort PATCH**, nooit meegeven in een bestaande.

### 4.3 Nieuwe modes in plaats van nieuwe routes
Vercel heeft een limiet op het aantal functies. Nieuwe functionaliteit komt er
als `body.mode` bij op een bestaand endpoint (`leads.js` heeft er 36,
`admin.js` 29), niet als een nieuw bestand.

### 4.4 Multi-tenancy: alles hangt aan `projectCode`
Elk verzoek leidt de tenant af uit de Clerk-claims (`resolveTenant`). Elke mode
faalt **dicht**: geen projectCode = 403. Admin-modes zitten achter een
`ADMIN_KEY`-HMAC, gegroepeerd (`CREDIT_ADMIN_MODES`, `PLAN_ADMIN_MODES`,
`FOUNDER_MODES`) — de poort staat bóven de dispatch, niet per mode.

De enige plek waar de tenant níét uit een sessie komt is de Stripe-webhook;
daar hangt alles aan de handtekening.

## 5. Hoe een lead door het systeem loopt

1. Lead stuurt WhatsApp (of vult `form.js` in).
2. `api/whatsapp.js` ontvangt de webhook.
   - **Ontdubbelen**: `_dedupSeen()` (geheugen, per instantie) én het bericht-id
     in de gespreksgeschiedenis (gedeeld). Meta hérstuurt bij traagheid.
   - `opDeRij()` serialiseert per gesprek, zodat twee berichten van dezelfde
     lead elkaars geschiedenis niet overschrijven.
3. Tenant bepalen via het ontvangende `phone_number_id`.
4. Geschiedenis laden uit Airtable (`Conversation History`, JSON in één veld).
5. Model antwoordt; kwalificatie en samenvatting worden weggeschreven.
6. Bij een boeking: `_gcal.js` controleert vrije tijden en zet de afspraak.
7. Credits afgeboekt via `_credits.js` → `_ledger.js`.

## 6. Regels die niet onderhandelbaar zijn

- **Nooit doen alsof.** Faro mag geen actie melden die de backend niet heeft
  uitgevoerd. Geen verzonnen tellingen: er is bewust géén "follow-ups verstuurd",
  omdat `cron-followup.js` alleen `Conversation State` zet — en de lead die zelf
  antwoordt zet datzelfde veld.
- **Geen cijfer zonder grond.** Het weekrapport vergelijkt niet met een lege
  vorige week ("+100%" vanaf nul is verzonnen) en doet geen patroonuitspraak
  onder 8 leads.
- **Het heet geen "AI", het heet "je assistent"** — behalve op drie plekken waar
  het woord verplicht of beschermend is: de AI-beeldmarkering, de
  beeldgenerator zelf, en de zin waarin de assistent tegenover een lead toegeeft
  dat hij een AI is. Tests toetsen die uitzonderingen **positief**.
- **Vier talen, altijd.** `nl` `fr` `en` `de`. Server: `${T('sleutel')}`.
  Client: `tr('sleutel', {vars})`. Faro heeft een eigen woordenboek in
  `_faro/ui/i18n.js` met een kleine `t`.
- **Nooit een echt telefoonnummer, WABA-id of account-id als voorbeeld** — niet
  in code, niet in documentatie, niet in de chat. Gebruik plaatshouders.

## 7. Testen

73 testbestanden, elk een los `node`-script dat `process.exit(1)` doet bij
falen. Geen testrunner, geen jest.

```bash
for f in tests/*.test.js; do node "$f" >/dev/null 2>&1 || echo "ROOD: $f"; done
node scripts/faro-check.js    # let op de EXITCODE, niet op de laatste regel
```

**De discipline die telt: mutatietesten.** Zet de bug terug en controleer dat de
test rood wordt. Een test die groen blijft met de fout erin bewaakt niets — dat
is deze codebase meerdere keren overkomen.

**Toets gedrag, geen bewoording.** Tests die op een letterlijke zin ankerden
braken zodra die zin vertaald werd, terwijl het gedrag ongewijzigd was.

## 8. Verifiëren doe je in de echte browser

Niet op localhost: op `https://app.helvaro.pro`, na de deploy. Een aanroep die
in de broncode STAAT is nog geen aanroep die DRAAIT — dat verschil is hier drie
keer misgegaan met dezelfde bug. Lees computed styles, tel elementen, druk op
toetsen. Zeg nooit dat iets werkt zonder het gezien te hebben.

## 8b. Omgevingsvariabelen

De code leest er ~100. Wat je moet weten:

- **Kritiek** (app werkt niet zonder): `API_AIRTABLE` + `BASE_AIRTABLE`,
  `CLERK_SECRET_KEY` + `CLERK_PUBLISHABLE_KEY`, `SESSION_SECRET`, `ADMIN_KEY`,
  `WHATSAPP_TOKEN` + `PHONE_NUMBER_ID`, `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`.
- **Faalt LUID** als hij ontbreekt (met een console.error in de Vercel-logs die
  zegt wat er mist): `UPSTASH_REDIS_REST_URL`/`_TOKEN`, `SMTP_HOST`/`_USER`/
  `_PASS`, `STRIPE_SECRET_KEY` (waarschuwt bij een sk_test_ in productie),
  `PG_API_URL`/`_TOKEN`.
- **Faalt STIL** als hij ontbreekt: de meeste `*_TEMPLATE_NAME`/`_LANG`, de
  KLING/beeld-sleutels, `PEXELS_API_KEY`.

Die luide meldingen zijn met opzet zo gebouwd: een ontbrekende sleutel die
alleen een lege `{ ok: false }` teruggeeft, wordt pas maanden later ontdekt.

## 9. Wat er nog open staat

- Google Agenda-OAuth staat nog op **Testing** (tokens verlopen na 7 dagen).
- WhatsApp-sjablonen wachten op goedkeuring bij Meta.
- `_waes.js` (eigen WhatsApp-nummer per klant) is compleet maar bewust nog niet
  aangesloten — wacht op Tech Provider-status.
- De CRM-koppeling heeft nog geen scherm: koppelen gaat via de modes
  `crm-status` / `crm-connect` / `crm-disconnect` / `crm-sync` op `api/leads.js`.
- De Whise-adapter is bewust een weigering en geen gok — zie de kop van
  `api/_crm/adapters/whise.js` voor wat er van Whise nodig is.
- **Actie voor de eigenaar:** het veld `CRM Koppelingen` (Long text) moet nog op
  de tabel Client Config worden aangemaakt, anders kan er niets gekoppeld worden.
- `dashboard.js` opsplitsen is de grootste openstaande schuld. Hoog risico:
  doe het alleen bewust, met de parse-test als vangnet.
