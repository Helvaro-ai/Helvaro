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

## Wat hier niet in staat

Niemand heeft de volledige gebruikersreizen tegen productie gedraaid —
aanmelden, onboarding, een echte lead, een echte boeking, een echte betaling.
De tests dekken gedrag per onderdeel; ze vervangen niet één keer zelf de reis
lopen met echte sleutels.

Doe dat één keer, met je eigen telefoon en een testkaart van Stripe, voordat de
eerste klant het doet.
