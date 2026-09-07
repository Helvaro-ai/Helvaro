# Voor je live gaat

Wat er klaar is, en wat alleen jij kan doen.

Dit bestand bestaat omdat "de code is af" en "we kunnen live" twee
verschillende dingen zijn. Alles hieronder onder **Jij** vraagt een sleutel,
een account of een goedkeuring — daar kan geen enkele commit iets aan
veranderen.

> **Belangrijk over `node scripts/preflight.js`:** dat script leest de
> omgeving van de machine waarop het draait. Draai je het op je eigen laptop of
> in een bouwomgeving zonder productiesleutels, dan meldt hij tientallen
> problemen die in Vercel gewoon goed staan. **Draai hem tegen productie**
> (`vercel env pull .env.local` eerst) voordat je één regel hieronder afvinkt.
> Een lijst met fouten uit een lege omgeving zegt niets.

---

## De vier dingen die de kernlus breken

Dit is geen volledige lijst van instellingen — het is de lijst waarbij een
klant die vandaag tekent, morgen niets ziet werken.

### 1. Google-toestemming staat nog op "Testing"

**Gevolg:** elke gekoppelde agenda verloopt na 7 dagen. Niet één keer — elke
week opnieuw, voor elke klant.

Dit is de grootste. De assistent boekt bezichtigingen rechtstreeks in de agenda
van de makelaar, en dat is het hele product. Een week na de onboarding stopt
dat, en de klant merkt het als er iemand voor een dichte deur staat.

De wijziging van 5 september maakt die storing eerlijk (de afspraak wordt nog
steeds geboekt, maar met een waarschuwing in plaats van stilte) — het maakt hem
niet weg. Publiceer het toestemmingsscherm in Google Cloud Console.

**Jij.** Google Cloud Console → OAuth consent screen → Publish app.

### 2. Het Meta-token was dood

Op 3 september stond er een 401 in de logs: *"session has been invalidated
because the user changed their password"*. Op dat moment ging er dus geen
enkele WhatsApp de deur uit.

Twee reparaties zijn intussen gebeurd: de cron liegt niet meer over wat hij
verstuurd heeft, en hij kan er ook niet meer op blijven hangen. Allebei maken
ze een dood token zichtbaar — geen van beide maakt hem geldig.

**Jij.** Controleer of `WHATSAPP_TOKEN` nog werkt. Draai `node
scripts/preflight.js` tegen productie; die zegt het.

### 3. `INTRO_TEMPLATE_NAME`

**Gevolg:** een lead die je formulier invult, wordt aangemaakt en krijgt
**niets**. Dat is de kernlus van het product.

De sjablonen wachten op goedkeuring bij Meta. Zonder een goedgekeurde template
kun je buiten het 24-uursvenster niets sturen, en een lead die net een formulier
invulde zit per definitie buiten dat venster.

**Jij.** Meta-goedkeuring afwachten, dan de naam in Vercel zetten. Idem voor
`FOLLOWUP_`, `REMINDER_` en `NOTIFY_TEMPLATE_NAME` — die zijn minder urgent
(opvolging, herinnering, je eigen ping) maar elk ervan is een stuk product dat
stil uit staat.

### 4. `FARO_WORKSPACE_ENABLED` — aan of uit, maar kies

Staat hij uit, dan geeft de Faro-route 404. Staat hij aan, dan heb je ook
`ANTHROPIC_API_KEY` en `SESSION_SECRET` nodig, anders zegt Faro niets of mag
hij niets uitvoeren.

Dit is de pagina waar iemand na het inloggen landt. Half aan is de slechtste
van de drie mogelijkheden.

**Jij.** Beslis vóór de eerste klant, niet erna.

---

## Verder nog van jou

- **Stripe** — zonder `STRIPE_SECRET_KEY` is er geen betaalweg. Preflight
  waarschuwt als er een `sk_test_` in productie staat.
- **Clerk** — `CLERK_ENABLED`, plus beide sleutels. Staat hij uit, dan draait de
  oude inlog; dat werkt, maar kies bewust welke van de twee live gaat.
- **`WA_APP_SECRET`** — ontbreekt hij, dan worden binnenkomende berichten
  geweigerd. Liever dat dan een ongecontroleerd bericht verwerken, maar het
  betekent wel: een lead die antwoordt, krijgt niets terug.
- **De CRM-koppelingen zijn nooit tegen een echte API gedraaid.** Alle vijf de
  leveranciers zijn geblokkeerd vanuit de bouwomgeving. `node
  scripts/crm-check.js` doet dat wel, read-only, zodra er sleutels staan. Doe
  dat vóórdat je dit aan een klant belooft.
- **`WABA_ID`** — zonder dit blijft de kostprijs per template onbekend, en
  MARKETING kost meer dan het dubbele van UTILITY. Verzenden werkt wel.

---

## Wat er in code klaar is

Vier controles, allemaal groen op het moment van schrijven:

```
node scripts/faro-check.js                 # ontwerpschaal, i18n, uitgestuurde JS
for t in tests/*.test.js; do node "$t"; done
node scripts/preflight.js                  # tegen PRODUCTIE draaien, zie boven
node scripts/faro-dev.js                   # en zelf in de browser kijken
```

De laatste staat er niet voor de vorm. Drie van de bevindingen van deze week
kwamen uit het openen van de app en het opmeten van elementen — niet uit het
lezen van de code. Meerdere rapporten in deze codebase bleken bij natrekken
niet te kloppen; meten scheelt werk aan dingen die niet stuk zijn.

### Recent dichtgezet

- Een agenda die niet gelezen kon worden gold als een lege agenda — boekt nog
  steeds, maar zegt het nu.
- De opvolgcron kon blijven hangen op Meta, en meldde eerder verzendingen die
  nooit vertrokken.
- Faro boekte een gesprek soms niet af en bewaarde het antwoord niet, doordat
  het werk na het antwoord mocht wegvallen.
- Een afgemelde lead kon vanuit het dashboard alsnog bericht krijgen.
- Kopiëren zei niet of het gelukt was; drie knoppen waren te klein om te raken.

Zie `CHANGELOG.md` voor wat elk daarvan betekende.

---

## De 20-puntenlijst, nagelopen

Een rondgaande checklist voor app-lanceringen, punt voor punt tegen deze
codebase gehouden. Vijf punten gaan over de App Store en gelden hier niet — een
webapp heeft geen SDK-declaratie en geen "restore purchases". Die staan er toch
bij, met wat het web-equivalent is.

| # | Punt | Stand |
|---|---|---|
| 1 | Beta test | **Jij** — nog niemand heeft de hele reis met echte sleutels gelopen |
| 2 | Crash reports | **Gat** — geen foutmonitoring; alleen Vercel-logs die niemand leest |
| 3 | Delete account | ✅ Verwijdert nu echt en meteen (`api/_wissen.js`), niet meer alleen een aanvraag |
| 4 | Privacy policy | ✅ `/privacy` en `/terms` |
| 5 | Declare SDKs | n.v.t. (App Store) — web-equivalent is de CSP, die staat er |
| 6 | SPF, DKIM, DMARC | **Gat — SPF ontbreekt.** Zie hieronder |
| 7 | Testing signup | **Jij** — `PUBLIC_SIGNUP_ENABLED` staat uit; test hem één keer aan |
| 8 | Cap API $$$ | ⚠️ Per klant begrensd via credits; **geen hard € plafond bij de provider** |
| 9 | LLM credit balance | **Jij** — niets bewaakt het saldo bij Anthropic. Zet daar een alert |
| 10 | Move off free tiers | **Jij** — Vercel staat op Pro; Airtable en Upstash zelf nakijken |
| 11 | DB Restore | ⚠️ `scripts/airtable-backup.js` is er nu. **Nooit teruggezet** — zie hieronder |
| 12 | Ship kill switch | ✅ `AI_UIT=1` stopt alle AI-uitgaven zonder deploy |
| 13 | OTA hot fix | n.v.t. — elke deploy is meteen live |
| 14 | Support email | ✅ Support-modus in de app, verstuurt via SMTP met reply-to |
| 15 | Use biz address | **Gat** — "Helvaro BV" staat er, ondernemingsnummer en zetel niet |
| 16 | Use demo account | ✅ `/demo` |
| 17 | Restore purchases | n.v.t. — web-equivalent is het Stripe-klantportaal, dat er is |
| 18 | Swap test keys | ✅ Preflight waarschuwt bij een `sk_test_` in productie |
| 19 | Phase releases | n.v.t. bij één omgeving; Vercel-rollback is de terugweg |
| 20 | Never Friday | ✅ Vandaag is het geen vrijdag |

### 6. SPF ontbreekt — dit is de scherpste van de lijst

Nagekeken in het echte DNS van `helvaro.pro`:

```
MX      smtp.google.com          → je ontvangt via Google Workspace
DKIM    default, google          → aanwezig
DMARC   v=DMARC1; p=none         → aanwezig, alleen meekijken
SPF     —                        → BESTAAT NIET
```

Zonder SPF-record kan iedereen post versturen die van jouw domein lijkt te
komen, en jouw eigen post heeft één authenticatie minder. Sinds begin 2024
eisen Google en Yahoo minstens SPF óf DKIM; je hebt DKIM, dus het is geen
totale blokkade — maar het is wel precies de post die moet aankomen:
wachtwoordherstel, e-mailbevestiging, het antwoord op een supportvraag.

Er is een addertje dat erger is dan het ontbrekende record zelf: **verstuurt de
app via een andere SMTP-server dan Google, dan is die post door niets gedekt** —
niet door Google's DKIM (die tekent alleen wat via Google gaat) en niet door
SPF (dat er niet is). `preflight` waarschuwt daar nu apart voor.

**Actie:** één TXT-record op de root van `helvaro.pro`:

```
v=spf1 include:_spf.google.com ~all
```

Verstuur je (ook) via een andere server, neem die er dan bij op. Een
SPF-record dat de echte verzender niet noemt is erger dan geen. Daarna
`node scripts/preflight.js` — de e-mailsectie zegt of het klopt.

### 11. Er is nu een backup, en dat is nog geen restore

`node scripts/airtable-backup.js` haalt elke tabel op en zet hem als JSON weg.
Hij vraagt het schema aan Airtable in plaats van een lijst tabel-id's mee te
dragen, want een backup die stilzwijgend een nieuwe tabel overslaat is erger
dan geen backup. Lukt dat schema niet, dan stopt hij. Faalt één tabel, dan
eindigt hij met exitcode 1 en `volledig: false`.

Hij schrijft **nooit** naar Airtable; een test bewaakt dat.

**Actie, en dit is de helft die telt:** draai hem één keer echt, en zet daarna
één tabel terug in een lege testbase. Terugzetten is geen omgekeerde van dit
script — gekoppelde records verwijzen naar record-id's die bij een herimport
nieuw worden, dus dat vraagt een volgorde en een vertaaltabel. Een backup die
je nooit hebt teruggezet is een aanname.

Nodig: een Airtable-token met `data.records:read` én `schema.bases:read`.

### 2 en 15 — de twee die ik niet voor je kon oplossen

**Foutmonitoring** ontbreekt. Er is geen Sentry of iets vergelijkbaars; als een
klant om 23:00 een 500 krijgt, staat dat in de Vercel-logs en verder nergens.
Ik heb het bewust niet ingebouwd: deze codebase heeft met opzet geen
app-dependencies en geen buildstap (`HELVARO-ARCHITECTUUR.md` §2), en daar een
SDK in duwen is een architectuurbeslissing en geen opruimactie. Het goedkoopste
alternatief dat wél bij deze codebase past is een `console.error` met een vast
voorvoegsel plus een Vercel-logdrain naar je mail — dezelfde vorm als
`[Credits][RECONCILE]` al gebruikt.

**Bedrijfsgegevens.** Op `/terms` en `/privacy` staat "Helvaro BV", maar geen
ondernemingsnummer en geen maatschappelijke zetel. Voor een Belgische
onderneming die online diensten verkoopt is dat verplicht (Wetboek Economisch
Recht, boek XII). Ik heb daar geen nummer ingevuld, want een verzonnen of
gegokt ondernemingsnummer op een juridische pagina is erger dan een ontbrekend
nummer. Vul je KBO-nummer en zetel in bij de bestaande "Helvaro BV"-regels in
`api/privacy.js`.

## Wat hier niet in staat

Niemand heeft de volledige gebruikersreizen tegen productie gedraaid —
aanmelden, onboarding, een echte lead, een echte boeking, een echte betaling.
De tests dekken gedrag per onderdeel; ze vervangen niet één keer zelf de reis
lopen met echte sleutels.

Doe dat één keer, met je eigen telefoon en een testkaart van Stripe, voordat de
eerste klant het doet.
