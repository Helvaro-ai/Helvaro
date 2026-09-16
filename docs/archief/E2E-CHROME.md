# Live test in Chrome — script voor de volgende sessie

Dit is bedoeld om te plakken in **Claude in de desktop-app** (die heeft de
connectors "Claude in Chrome" / "Control Chrome"), niet in Claude Code in de
cloud. Die laatste draait in een VM zonder toegang tot je browser, en
`app.helvaro.pro` is daar bovendien geblokkeerd door de netwerkpolicy.

Alles hieronder is wat er **niet** lokaal te testen viel: echte Clerk-login,
echte Stripe, echte WhatsApp, echte Airtable, echte e-mail.

---

## Voor je begint

- [ ] Zet `PUBLIC_SIGNUP_ENABLED` aan als je het aanmelden zelf wil testen, of
      maak een uitnodigingslink via het adminscherm.
- [ ] Weet dat je **echte data in productie** maakt. Er is nu een werkende
      "account verwijderen" (Instellingen), dus je kunt opruimen.
- [ ] Houd de Vercel-logs open in een tweede tabblad. De helft van de fouten in
      dit product is stil en staat alleen daar.

---

## 1. Aanmelden en onboarding

```
Open https://app.helvaro.pro/onboard?invite=<code>
```

- [ ] Vul het formulier in met `saidsendi26@gmail.com`
- [ ] **Kies bij Sector "Autohandel"** — dit is net gerepareerd; vóór vandaag
      stonden autohandel, bouw, keukens en renovatie er niet in
- [ ] Loop alle zes de stappen door. Let op stappen zonder titel of lege
      schermen
- [ ] Rond af en controleer of je de inloggegevens per mail krijgt
- [ ] **Komt die mail aan, of in spam?** Dat is de SPF-vraag uit `LAUNCH.md` —
      zonder SPF-record is spam het te verwachten resultaat

## 2. Inloggen

- [ ] Log in met de gemailde gegevens
- [ ] Log uit, log opnieuw in
- [ ] Ververs de pagina — blijf je ingelogd?
- [ ] Probeer "wachtwoord vergeten". **Komt die mail aan?**

## 3. Het dashboard als autohandelaar

Omdat je autohandel koos, hoort het dashboard over **wagens** te praten en niet
over panden.

- [ ] Zegt de zijbalk "Voertuigen" en niet "Panden"?
- [ ] Klik elk item in de zijbalk aan. Alle 16 schermen renderen lokaal; hier
      gaat het om of ze met echte (lege) data ook kloppen
- [ ] Een leeg dashboard hoort iets nuttigs te zeggen, geen leeg vlak

## 4. Van markt wisselen

- [ ] Instellingen → wissel naar Bouw
- [ ] Verandert het dashboard mee? (projectfiche in plaats van voorraad)
- [ ] Wissel terug naar Autohandel — komt je eerdere invoer terug?

## 5. Faro

- [ ] Werkt Faro überhaupt? Staat `FARO_WORKSPACE_ENABLED` op 1?
- [ ] Stel een vraag over je leads
- [ ] Vraag hem iets uit te voeren dat bevestiging vraagt, en **bevestig**.
      Zonder `SESSION_SECRET` faalt dat dicht en oogt het als een kapotte knop
- [ ] Klopt het aantal credits dat wordt afgeschreven?

## 6. De kernlus — dit is de belangrijkste

- [ ] Vul je eigen leadformulier in (`/start/<code>`) met je eigen 06-nummer
- [ ] **Krijg je binnen een minuut een WhatsApp?** Zo niet: `INTRO_TEMPLATE_NAME`
      of een dood Meta-token. Zie `LAUNCH.md`
- [ ] Antwoord op die WhatsApp. Antwoordt de assistent zinnig?
- [ ] Laat hem een bezichtiging inplannen
- [ ] **Staat die afspraak in je Google Agenda?**
- [ ] Staat er "[LET OP] agenda niet gelezen" bij? Dan is je Google-koppeling
      verlopen — verwacht, zolang de OAuth op Testing staat

## 7. Agenda

- [ ] Boek zelf een afspraak vanuit het dashboard
- [ ] Boek er nog een op hetzelfde moment → hoort geweigerd te worden (409)
- [ ] Verbreek de Google-koppeling en boek opnieuw → hoort te boeken **met** de
      melding "Even nakijken" (net gebouwd)

## 8. Betalen

- [ ] Koop credits bij met een Stripe-testkaart (`4242 4242 4242 4242`)
- [ ] Komen de credits erbij?
- [ ] Open het klantportaal via Instellingen
- [ ] Zeg het abonnement op en kijk of de app dat oppikt
- [ ] **Let op:** de Stripe-connector stond op `needs_reconnect`

## 9. Mobiel

Dezelfde ronde op je telefoon, of Chrome DevTools op 390px:

- [ ] Onboarding
- [ ] Zijbalk en navigatie
- [ ] Een lead openen en bellen
- [ ] Faro

## 10. Verwijderen

- [ ] Verwijder het testaccount via Instellingen
- [ ] Is alles echt weg?

---

## Wat lokaal al getest is (niet overdoen)

Alle 16 schermen renderen, geen horizontale overloop op 1440 en 390, geen
bedieningselement zonder toegankelijke naam, geen raakdoel onder de 24 pixels,
geen JS-uitzonderingen, alle zes de markten wisselen zonder consolefouten, en
Faro's invoerveld reageert. 108 testbestanden groen, `faro-check` groen.

Wat lokaal **niet** kon: Clerk, Stripe, WhatsApp, Airtable, e-mail, Google
Agenda. Precies de lijst hierboven.
