# Helvaro — de volledige briefing

Eén document. Plak deel 1 in een nieuwe chat als context voordat je iets aan
de code doet. Deel 2 is de lijst die alleen jij kunt afwerken.

Bijgewerkt na de volledige doorloop op productie van **8 september 2026**,
ingelogd op het echte account, met echte Clerk, echte Stripe, echte Airtable
en een echte Google Agenda. Alles wat hieronder als "gemeten" staat, is in de
browser of tegen de live API gezien — niet uit de code afgeleid.

---
---

# DEEL 1 — DE BRIEFING

## 1. Wat het product doet

Helvaro is een WhatsApp-assistent voor Vlaamse, Waalse en Duitstalige bedrijven
die van een binnenkomend bericht een afspraak moeten maken. Een lead stuurt een
bericht of vult een formulier in; de assistent antwoordt binnen de minuut,
kwalificeert op budget en timing, en boekt de afspraak rechtstreeks in de
Google Agenda van de klant.

Het begon bij makelaars en draait nu op **vijf markten**: vastgoed, autohandel,
bouw, keukens en renovatie.

De assistent heet **Faro**. Klanten geven hem zelf een naam ("Mathis"), zodat de
lead denkt met een medewerker te praten.

- App: `https://app.helvaro.pro` — repo `Helvaro-ai/Helvaro`, branch `main`
- Marketingsite: `https://helvaro.pro` — **aparte repo** `UseHelvaro/Helvaro-Website`,
  losse statische HTML/CSS/JS, vijf talen (nl/fr/en/de/es), geen buildstap

**Prijzen (live in Stripe, geverifieerd):** Starter €249,99 · Growth €499 ·
Scale €799 per maand, allemaal **inclusief btw**. Scale is een vanafprijs.
Credits: 3.000 / 10.000 / 20.000 per maand. Eén leadgesprek ≈ 20 credits,
één Faro-vraag ≈ 16, één AI-beeld 50, video 150–300.

## 2. Stack — en wat er expres NIET is

- **Vercel serverless functions, vanilla CommonJS**
- **Geen buildstap. Geen TypeScript. Geen framework. Geen bundler. Geen
  app-dependencies.** Wat je schrijft, draait. Er is geen transpilatie die je
  fouten opvangt.

- Data: **Airtable** (base "Lead Qualification System"), geen SQL
- Auth: **Clerk** (Bearer-token) + een legacy `hvs1.`-HMAC-sessiecookie
- Betalen: **Stripe** · Meldingen: **OneSignal** · Agenda: **Google Calendar**
- Transactionele e-mail: **SMTP** (Namecheap Private Email, via nodemailer).
  Dat is sinds 2026-09-02 de **enige** weg — Resend stond als terugval en is
  eruit. Faalt SMTP, dan komt er geen mail, en dat staat luid in de logs.

- Beeld/video: externe modellen via `api/_media-models.js`

## 3. Kaart van de repo

**113 bestanden in `api/`, 79.694 regels** (plus 18.595 in `tests/`).
Onderstreepje voorop = module, geen route. Zonder onderstreepje = echt endpoint.

**12 endpoints:** `admin` `auth` `cron-followup` `dashboard` `demo` `faro`
`form-page` `form` `leads` `privacy` `stripe` `whatsapp`

**Belangrijkste modules:**

| module | wat het doet |
| --- | --- |
| `_vertical.js` | in welke markt een klant zit. **De enige plek** die `Vertical`/`Niche` leest |
| `_leads-read.js` | het veldschema van een lead + `computeStats()` |
| `_properties.js` / `_vehicles.js` | de catalogus van de twee markten die er een hebben; spiegelbeelden, met opzet |
| `_project.js` | de projectfiche voor bouw/keuken/renovatie (geen catalogus) |
| `_wens.js` | wat een koper zocht toen de wagen er niet was. Alleen dealership |
| `_credits.js` / `_ledger.js` | creditsysteem. **Het grootboek is de waarheid** |
| `_stripe.js` / `stripe.js` | betalen. De webhook is de enige plek waar credits van geld komen |
| `_wa-send.js` / `_wa-templates.js` | WhatsApp versturen + sjabloonregister |
| `_gcal.js` | Google Agenda: OAuth, freeBusy, boeken, spiegelen, annuleren |
| `_i18n.js` | het woordenboek: `{nl, fr, en, de}` |
| `_faro/` | de assistent: `orchestrator`, `tools`, `writes`, `data`, `werk`, `scherm`, `rapport` + eigen `ui/` |
| `_crm/` | vijf CRM-adapters. `index.js` is de enige deur naar buiten. Faalt zacht |
| `_ratelimit.js` `_session.js` `_clerk.js` `_revocation.js` | toegang |

**Cron:** `/api/cron-followup`, dagelijks 09:00.
**maxDuration:** whatsapp en form 120s, cron-followup 300s, de rest 60s.

## 4. De valkuilen die echt gebeten hebben

### 4.1 `api/dashboard.js` is ÉÉN template literal

18.787 regels, ~1,5 MB uitgestuurde HTML, en het hele bestand is één grote
JS-template-string die de complete app teruggeeft.

- **Backslashes dubbel.** `\s` in de bron wordt een backspace in de pagina.
  Schrijf `\\s`, of vermijd regex-escapes (`indexOf` in plaats van `\b`).

- **Backticks en `${` ontsnappen** — ook in commentaar. Eén backtick in een
  opmerking breekt de hele pagina.

- **`node --check api/dashboard.js` bewijst niets** over de code erin: dat is
  voor Node een string. Gebruik `tests/pagina-parseert.test.js`.

- Eén kapotte regel = de hele app toont het inlogscherm. Is één keer ~5 minuten
  in productie gebeurd.

### 4.2 Airtable weigert een hele PATCH bij één onbekend veld

Bestaat een veldnaam niet, dan geeft Airtable **422 op de héle request** — ook
de velden die wél bestaan. Nieuwe velden dus altijd in een aparte, best-effort
PATCH.

### 4.3 De veld-id-val — lees dit voordat je Airtable-velden aanraakt

`getClientByCode()` haalt op met **`returnFieldsByFieldId=true`**. `record.fields`
is dus gesleuteld op **veld-id**, niet op veldnaam.

Dat betekent dat dit patroon een leugen is:

```js
client.fields['fldVerzonnenId'] || client.fields['Website']   // beide undefined
```

De naam-terugval kán niet werken. Hij ziet eruit als een vangnet en is er geen.

Precies dit is op 8 september gevonden: `website` en `aiInstructions` lazen
**altijd** undefined. De assistent heeft nooit de website van een klant gelezen
en nooit hun instructies gekregen — twee velden die op het aanmeldscherm
prominent staan. `'fldAiInstructions'` is extra gemeen: hij is toevallig precies
even lang als een echt id (`fld` + 14 tekens), dus hij doorstaat elke controle
die alleen naar de vórm kijkt.

`tests/veld-ids.test.js` bewaakt dit nu: de echte veldenlijst van Client Config
staat erin, en elk `fld`-achtig id dat `whatsapp.js` gebruikt moet daarin staan.

### 4.4 Nieuwe modes in plaats van nieuwe routes

Vercel heeft een limiet op het aantal functies. Nieuwe functionaliteit komt als
`body.mode` op een bestaand endpoint: `leads.js` heeft er **44**, `admin.js` **31**.

### 4.5 Multi-tenancy: alles hangt aan `projectCode`

Elk verzoek leidt de tenant af uit de Clerk-claims (`resolveTenant`). Elke mode
faalt **dicht**: geen projectCode = 403. Een `projectCode` die de client
meestuurt wordt **genegeerd** — geverifieerd op productie: meegeven van een
vreemde code gaf gewoon de eigen data terug.

Admin-modes zitten achter een `ADMIN_KEY`-HMAC, gegroepeerd, met de poort bóven
de dispatch. De enige plek waar de tenant níét uit een sessie komt is de
Stripe-webhook; daar hangt alles aan de handtekening.

### 4.6 Vijf markten, één product

| vertical | catalogus | afspraak heet |
| --- | --- | --- |
| `vastgoed` | Panden | bezichtiging |
| `dealership` | Voertuigen | proefrit |
| `bouw` | *geen* | plaatsbezoek |
| `keuken` | *geen* | opmeting |
| `renovatie` | *geen* | plaatsbezoek |

**Leeg betekent vastgoed, en dat is geen detail.** Elke klant van vóór dit
systeem heeft `Vertical` leeg. Zou leeg iets anders gaan betekenen, dan verliest
elke makelaar op de dag van uitrol zijn pandcontext.

**Vraag `heeftAanbod()`, niet "is het dealership".** De meeste code die
`=== 'dealership'` schrijft, wil weten of er iets is om uit te kiezen.

**Vier lijsten moeten gelijk blijven:** `BEKEND` op de server, `HV_WOORDEN` in de
client, de wizardkaarten en de keuzelijst in Instellingen. `tests/niches.test.js`
bewaakt dat.

> **Let op — bekende scheefstand.** Het publieke `/onboard` biedt **negen**
> sectoren aan (ook tandarts, advocaat, financieel); de app kan er **zes**
> weergeven. Wie tandarts kiest, ziet in Instellingen "Vastgoed" staan. Dat is
> hetzelfde symptoom als de bug die in september voor bouw/keuken/renovatie is
> gerepareerd. Zie deel 2, punt 12.

## 5. Hoe een lead door het systeem loopt

1. Lead stuurt WhatsApp, of vult `form.js` in
2. `api/whatsapp.js` ontvangt de webhook
   - **Ontdubbelen:** `_dedupSeen()` (geheugen, per instantie) én het bericht-id
     in de geschiedenis (gedeeld). Meta hérstuurt bij traagheid

   - `opDeRij()` serialiseert per gesprek, zodat twee berichten van dezelfde lead
     elkaars geschiedenis niet overschrijven

3. Tenant bepalen via het ontvangende `phone_number_id`
4. Geschiedenis laden uit Airtable (`Conversation History`, JSON in één veld)
5. Model antwoordt; kwalificatie en samenvatting worden weggeschreven
6. Bij een boeking: `_gcal.js` controleert vrije tijden en zet de afspraak
7. Credits afgeboekt via `_credits.js` → `_ledger.js`

## 6. Regels die niet onderhandelbaar zijn

- **Nooit doen alsof.** Faro mag geen actie melden die de backend niet heeft
  uitgevoerd. Geen verzonnen tellingen.

- **Geen cijfer zonder grond.** Het weekrapport vergelijkt niet met een lege
  vorige week en doet geen patroonuitspraak onder 8 leads.

- **Het heet geen "AI", het heet "je assistent"** — behalve op drie plekken waar
  het woord verplicht of beschermend is. Tests toetsen die uitzonderingen
  **positief**.

- **Vier talen, altijd.** `nl` `fr` `en` `de`. Server `${T('sleutel')}`, client
  `tr('sleutel', {vars})`, Faro een eigen woordenboek.

- **Nooit een echt telefoonnummer, WABA-id of account-id als voorbeeld** — niet
  in code, niet in documentatie, niet in de chat. Gebruik plaatshouders.

## 7. Testen

**114 testbestanden**, elk een los `node`-script dat `process.exit(1)` doet bij
falen. Geen testrunner, geen jest.

```bash
npm install                                    # anders falen er ~36 op ontbrekende deps
for f in tests/*.test.js; do node "$f" >/dev/null 2>&1 || echo "ROOD: $f"; done
node scripts/faro-check.js                     # let op de EXITCODE
```

> Draai je de tests zónder `node_modules`, dan falen er 36 op ontbrekende
> modules en lijkt er van alles stuk. Dat is de omgeving, niet de code.

**De discipline die telt: mutatietesten.** Zet de bug terug en controleer dat de
test rood wordt. Een test die groen blijft mét de fout erin bewaakt niets — dat
is deze codebase meerdere keren overkomen.

**Toets gedrag, geen bewoording.** En let op een valkuil die twee keer voorkwam
tijdens het schrijven van de septembertests: een test die op de bróntekst zoekt,
slaat ook aan op het **commentaar** dat uitlegt waarom de bug weg is. Strip
`/* */`, `//` én `<!-- -->` voordat je op code zoekt.

## 8. Verifiëren doe je in de echte browser

Niet op localhost: op `https://app.helvaro.pro`, na de deploy. Een aanroep die in
de broncode STAAT is nog geen aanroep die DRAAIT — dat verschil is hier drie keer
misgegaan met dezelfde bug. Zeg nooit dat iets werkt zonder het gezien te hebben.

## 9. Omgevingsvariabelen

De code leest er ~100.

- **Kritiek:** `API_AIRTABLE` + `BASE_AIRTABLE`, `CLERK_SECRET_KEY` +
  `CLERK_PUBLISHABLE_KEY`, `SESSION_SECRET`, `ADMIN_KEY`, `WHATSAPP_TOKEN` +
  `PHONE_NUMBER_ID`, `ANTHROPIC_API_KEY`

- **Faalt LUID** (console.error in de Vercel-logs die zegt wat er mist):
  `UPSTASH_REDIS_REST_URL`/`_TOKEN`, `SMTP_HOST`/`_USER`/`_PASS`,
  `STRIPE_SECRET_KEY`, `PG_API_URL`/`_TOKEN`

- **Faalt STIL:** de meeste `*_TEMPLATE_NAME`/`_LANG`, de beeldsleutels,
  `PEXELS_API_KEY`

Die luide meldingen zijn met opzet: een ontbrekende sleutel die alleen een lege
`{ ok: false }` teruggeeft, wordt pas maanden later ontdekt.

## 10. Stand van zaken — gemeten op 8 september 2026

### Werkt, met eigen ogen gezien

- Aanmelden, uitloggen, opnieuw inloggen, verversen — **geen inloglus**, de
  markt blijft staan

- Alle 14 schermen renderen, geen consolefouten, geen horizontale overloop
- Alle zes de markten wisselen correct; de catalogus verdwijnt bij
  bouw/keuken/renovatie

- Autohandel werkt end-to-end: `Vertical = dealership` staat in Airtable, de
  zijbalk zegt Voertuigen, de lege staat spreekt over wagens

- Faro: antwoordt zinnig, matcht de taal, vraagt door in plaats van te gokken,
  toont een bevestigingskaart en voert daarna echt uit. Credits kloppen (300 → 284)

- Google Agenda: boeken spiegelt naar Google, dubbel boeken geeft **409**,
  annuleren haalt het Google-event weg

- Tenant-isolatie houdt. Admin-API geeft 401. De back-office wordt echt uit de
  klant-HTML geknipt

- Kopieerknoppen zijn eerlijk: ze zeggen het als kopiëren niet lukte

### Gerepareerd op 8 september (branch `fix/e2e-productie-bevindingen`)

1. **Dubbel boeken kon gewoon.** De 409-controle zat achter `if (gToken)` — zonder
   gekoppelde agenda stond er niets tussen. Erger: `Appointment ID` wordt afgeleid
   van het tijdstip, dus beide records kregen dezelfde id. Nu een eigen controle
   die altijd draait.

2. **Een dealer klikte op "Voertuigen" en kreeg "Panden" boven het scherm.** De kop
   in de topbalk en de tooltip van de ingeklapte zijbalk liepen niet mee.

3. **29 labels op `/onboard` zonder `for`.** Een schermlezer las bij de
   sectorkeuze alleen "keuzelijst". Plus drie knopjes van 23px.

4. **Het privacybeleid noemde Resend** (weg uit de code) en **noemde Stripe,
   Google en OneSignal niet**, terwijl het beweerde volledig te zijn.

5. **De assistent las nooit de website en nooit de instructies van de klant**
   (zie 4.3). Dit is de zwaarste van de vijf.

6. Het pipelinedoel liep via een blokkerende `prompt()` in hardgecodeerd
   Nederlands.

**114/114 groen, faro-check groen.** Elke reparatie is teruggedraaid en rood
gezien voordat hij gecommit werd.

### Nog stuk of onbekend

- **Het Meta-token is dood.** 401 opnieuw op 8 september om 09:00. Zolang dat zo
  is, vertrekt er geen enkele WhatsApp en werkt de kernlus niet.

- **Stripe klantportaal valt om zodra er een echte klant is.** In livemode
  bestaat er geen billing-portal-configuratie, en de code geeft geen
  `configuration` mee. Nu nog gemaskeerd door een eerdere controle.

- **`PG_API_URL`/`_TOKEN` niet gezet** — marketingposts, outreach en
  social-health doen stil niets.

- **`WABA_ID` niet gezet** — templatekostprijs onbekend; versturen werkt wel.
- **Geen foutmonitoring.** Een 500 om 23:00 staat in de Vercel-logs en verder
  nergens.

- **Geen SPF-record op `helvaro.pro`.** DKIM en DMARC staan er wel.
- **Geen ondernemingsnummer en zetel** op `/privacy` en `/terms`.
- **Geen enkele CRM-adapter heeft ooit tegen een echte API gedraaid.**
- **De Airtable-backup is nooit teruggezet.** Een backup die je nooit hebt
  teruggezet is een aanname.

- **Nooit een echte betaling door Stripe gegaan** — nul klanten, nul sessies.
- **Het logged-in dashboard is nooit op een echte 390px-viewport gezien.** De
  publieke schermen wel, zonder overloop.

- **`dashboard.js` opsplitsen** is de grootste openstaande schuld.

---
---

# DEEL 2 — WAT JIJ MOET DOEN

Op volgorde. Alles hierboven kan geen enkele commit oplossen: het vraagt een
sleutel, een account of een goedkeuring.

## Blok A — hierzonder verkoopt het product niets

### 1. Vervang het WhatsApp-token ⚠️ blokkeert alles

**Waarom:** op 3 én 8 september stond er `401 — session has been invalidated
because the user changed your password`. Er gaat op dit moment geen enkele
WhatsApp de deur uit. Een lead die je formulier invult krijgt niets.

**Doen:**

1. `developers.facebook.com` → je app → **Business Settings → System Users**
2. Maak (of kies) een systeemgebruiker, **Generate New Token**
3. Kies de app, zet `whatsapp_business_messaging` en
   `whatsapp_business_management` aan

4. Kies **geen** verloopdatum (een tijdelijk token is precies hoe je hier
   beland bent)

5. Vercel → project `helvaro` → Settings → Environment Variables →
   `WHATSAPP_TOKEN` vervangen → **redeploy**

**Verifiëren:** vul je eigen leadformulier in met je eigen nummer. Binnen een
minuut een WhatsApp? Zo niet: Vercel-logs, zoek op `[quality] Meta fout`.

### 2. Publiceer het Google-toestemmingsscherm ⚠️ elke agenda verloopt wekelijks

**Waarom:** de OAuth staat op **Testing**. Elke gekoppelde agenda verloopt na
**7 dagen** — niet één keer, elke week opnieuw, voor elke klant. Ik heb bij het
koppelen zelf het scherm "Google hasn't verified this app" gezien.

En het is erger dan een verlopen koppeling: de bescherming tegen dubbel boeken
hing volledig aan dat token. Mijn reparatie dicht dat gat, maar de koppeling
zelf blijft wekelijks omvallen tot dit gepubliceerd is.

**Doen:**

1. `console.cloud.google.com` → je project → **APIs & Services → OAuth consent screen**
2. **Publish app**
3. Scopes `calendar.events` en `calendar.readonly` zijn *sensitive*: reken op
   een verificatie met een demo-video en een privacybeleid-URL. Begin hier
   vandaag aan, het duurt weken.

**Verifiëren:** koppel opnieuw en kijk over 8 dagen of hij nog werkt.

### 3. Zet de Stripe-klantportaal-configuratie aan ⚠️ breekt bij je eerste klant

**Waarom:** in **livemode** bestaat er geen billing-portal-configuratie, en de
code geeft geen `configuration` mee. De eerste klant die op "Facturen &
opzeggen" klikt, krijgt een fout. Nu nog verborgen achter een eerdere controle
("nog geen betaalgeschiedenis").

**Doen:** `dashboard.stripe.com/settings/billing/portal` — **in livemode, niet
test** — instellingen opslaan. Zet aan: factuurgeschiedenis, betaalmethode
bijwerken, abonnement opzeggen.

**Verifiëren:** `stripe.com/docs` → of gewoon: zodra er één klant is, klik de
knop zelf.

### 4. Controleer of er een LIVE Stripe-sleutel staat

**Waarom:** in de logs stond `[stripe] TEST-sleutel in PRODUCTIE — klanten kunnen
"betalen" zonder dat er geld binnenkomt`. Ik kon de huidige waarde niet lezen
(secret). Er zijn nul live klanten en nul live checkout-sessies ooit, wat
past bij "nog niemand heeft betaald" én bij "de sleutel is test".

**Doen:** Vercel → `STRIPE_SECRET_KEY` → moet met `sk_live_` beginnen.

### 5. Merge de reparaties

```bash
git checkout main
git merge --ff-only origin/fix/e2e-productie-bevindingen
git push origin main
```

Vijf commits, 114/114 groen. Daarin zit de reparatie waardoor de assistent
eindelijk de website en de instructies van je klanten leest.

## Blok B — hierzonder verlies je vertrouwen

### 6. Zet een SPF-record

**Waarom:** `helvaro.pro` heeft **geen SPF**. Wel MX (Google), wel DKIM, wel
DMARC (`p=none`). Sinds 2024 eisen Google en Yahoo minstens SPF óf DKIM — je
hebt DKIM, dus het is geen blokkade, maar het gaat wél om precies de post die
moet aankomen: wachtwoordherstel, e-mailbevestiging, support.

En er zit een addertje: je verstuurt via **Namecheap**, niet via Google. Die
post is door niets gedekt — Google's DKIM tekent alleen wat via Google gaat.

**Doen:** één TXT-record op de root van `helvaro.pro`. Neem je echte verzender
erbij; een SPF-record dat de echte verzender niet noemt is erger dan geen:

```text
v=spf1 include:_spf.google.com include:spf.privateemail.com ~all
```

**Verifiëren:** `dig +short TXT helvaro.pro`, daarna
`node scripts/preflight.js` tegen productie.

### 7. Vul je ondernemingsnummer en zetel in

**Waarom:** op `/privacy` en `/terms` staat "Helvaro BV", zonder KBO-nummer en
zonder maatschappelijke zetel. Voor een Belgische onderneming die online
diensten verkoopt is dat verplicht (WER, boek XII). Ik heb er bewust niets
ingevuld — een gegokt ondernemingsnummer op een juridische pagina is erger dan
een ontbrekend nummer.

**Doen:** `api/privacy.js`, bij de bestaande "Helvaro BV"-regels.

### 8. Controleer één e-mailadres in het privacybeleid

De gegevensbeschermingscontactpersoon staat op **`usehelvaro.pro`**, terwijl al
het andere op `helvaro.pro` staat. Is dat domein nog van jou en wordt die
mailbox gelezen? Zo niet: dat is het adres waarop AVG-verzoeken binnenkomen.

### 9. Zet foutmonitoring op

**Waarom:** krijgt een klant om 23:00 een 500, dan staat dat in de Vercel-logs
en verder nergens. De logs zijn bovendien traag: tijdens deze test liepen
meerdere log-queries in een time-out.

**Doen:** de goedkoopste vorm die bij deze codebase past (geen dependencies,
geen buildstap) is een **Vercel-logdrain naar je mail**, filterend op een vast
voorvoegsel — dezelfde vorm die `[Credits][RECONCILE]` al gebruikt. Een
Sentry-SDK inbouwen is een architectuurbeslissing, geen opruimactie.

### 10. Zet een uitgavenalarm bij Anthropic

Niets bewaakt het saldo. Credits begrenzen de klant, maar er is **geen hard
€-plafond bij de leverancier**.

## Blok C — voordat je het aan een klant belooft

### 11. Draai de CRM-controle

**Geen enkele van de vijf CRM-adapters heeft ooit tegen een echte API gedraaid** —
de netwerkpolicy van de bouwomgeving blokkeert ze allemaal.

```bash
node scripts/crm-check.js     # read-only, zodra er sleutels staan
```

### 12. Beslis over de negen sectoren

`/onboard` biedt negen sectoren; de app kan er zes weergeven. Tandarts, advocaat
en financieel worden stil "Vastgoed". Kies er één van:

- **de drie uit `/onboard` halen** (kleinste ingreep, meteen eerlijk), of
- **ze in `WIZARD_MARKTEN` opnemen** zodat Instellingen ze kan tonen

### 13. Zet de backup één keer echt terug

`node scripts/airtable-backup.js` bestaat en schrijft nooit naar Airtable.
Maar **terugzetten is geen omgekeerde van dit script**: gekoppelde records
verwijzen naar record-id's die bij een herimport nieuw worden. Dat vraagt een
volgorde en een vertaaltabel. Zet één tabel terug in een lege testbase.
Nodig: een token met `data.records:read` én `schema.bases:read`.

### 14. Zet de ontbrekende variabelen

| variabele | gevolg als hij ontbreekt |
| --- | --- |
| `PG_API_URL` + `PG_API_TOKEN` | marketingposts, outreach en social-health doen stil niets |
| `WABA_ID` | templatekostprijs onbekend (MARKETING kost >2× UTILITY). Versturen werkt wel |
| `ONESIGNAL_APP_ID` | de API-key staat er wel, de app-id niet — meldingen half aan |

### 15. Beslis over `FARO_WORKSPACE_ENABLED`

Staat nu **aan** (geverifieerd: de route antwoordt, Faro werkt). Hij heeft ook
`ANTHROPIC_API_KEY` en `SESSION_SECRET` nodig — allebei gezet. Niets te doen,
tenzij je hem uit wil.

## Blok D — de drie dingen die ik niet kón testen

Deze staan er niet omdat ze moeilijk waren, maar omdat ik ze niet mág of kan.

### 16. De kernlus, met je eigen telefoon

Vul `/start/<jouw projectcode>` in met je eigen nummer. Krijg je binnen een
minuut een WhatsApp? Antwoord erop. Laat een afspraak inplannen. Staat die in
je agenda? **Doe dit pas na punt 1**, anders komt er sowieso niets.

### 17. Een echte betaling

Koop credits bij met testkaart `4242 4242 4242 4242`, en open daarna het
klantportaal (punt 3). Ik kan geen kaartnummers invoeren.

### 18. Account verwijderen

Instellingen → Remove. Ik heb dit **niet** gedaan: het enige beschikbare account
was je echte Frade-account, en dat verwijderen zou echte data vernietigen. Test
het met een wegwerpaccount.

---

## Opruimen na de test van 8 september

- Twee **geannuleerde** afspraken op 19 september (project `CPVWQ14A33`) — ze
  laten mooi zien dat twee records dezelfde `Appointment ID` kregen

- Eén **gearchiveerd** voertuig `V1` (BMW M4 Competition), met een notitie dat
  het een testrecord is

- Google Agenda staat nu gekoppeld aan het Frade-account. Is dat niet de agenda
  die je wilt gebruiken, koppel hem dan los en opnieuw met de juiste

## Vaste commando's

```bash
npm install
for f in tests/*.test.js; do node "$f" >/dev/null 2>&1 || echo "ROOD: $f"; done
node scripts/faro-check.js
npx vercel env pull .env.local --environment=production   # daarna .env.local wissen
node scripts/preflight.js        # ALLEEN tegen productie zinvol
node scripts/crm-check.js
node scripts/airtable-backup.js
```

> `preflight.js` leest de omgeving van de machine waarop hij draait. Op je
> laptop zonder productiesleutels meldt hij tientallen problemen die in Vercel
> gewoon goed staan. Een lijst met fouten uit een lege omgeving zegt niets.
