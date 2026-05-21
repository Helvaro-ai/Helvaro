# Helvaro User Guide — voor klanten

Welkom bij Helvaro! Deze gids leidt je door alles wat je in je dashboard kan doen.

---

## 🚀 Eerste keer inloggen

1. **Open de welkomstmail** die je kreeg bij je registratie
2. **Klik op de dashboard-link** of ga naar [app.helvaro.pro](https://app.helvaro.pro)
3. **Log in** met je e-mailadres + wachtwoord
4. Je wordt automatisch naar **AI Persoonlijkheid** gestuurd om je config af te werken

### Eerste setup — wat moet je invullen?

Je krijgt een groene welkomstbanner met **3 verplichte stappen**:

| Stap | Wat | Waarom |
|---|---|---|
| ① **AI naam** | Naam van de "persoon" die met je leads chat | Leads voelen dat ze met een mens praten, niet een bot |
| ② **Welkomstbericht** | Eerste WhatsApp dat je lead ontvangt | Eerste indruk = alles |
| ③ **Website OF AI-instructies** | Context voor de AI | Zo weet de AI waarover ze kan praten |

→ Klik **Opslaan** → je AI is live!

---

## 📋 De Formulier-pagina — hoe deel je je lead-form?

Sidebar → **Formulier** tab. Hier vind je:

### Je unieke lead-form URL
```
https://app.helvaro.pro/start/JOUW_PROJECT_CODE
```

Iedereen die dit formulier invult komt direct in jouw dashboard. Drie manieren om te delen:

### 1. Drijvende WhatsApp-knop op je website (aanbevolen)
Plak deze code net vóór de `</body>` tag van je site:
```html
<script src="https://app.helvaro.pro/form-widget.js"
        data-project="JOUW_PROJECT_CODE"
        data-name="Jouw Bedrijfsnaam"></script>
```
→ Een ronde "chat" knop verschijnt rechtsonder op elke pagina.

### 2. Formulier inbouwen als pagina-onderdeel
```html
<iframe src="https://app.helvaro.pro/start/JOUW_PROJECT_CODE"
        width="100%" height="640" frameborder="0"
        style="border:0;border-radius:12px;max-width:560px"></iframe>
```
→ Toont het formulier rechtstreeks op je pagina (geen pop-up).

### 3. Alleen de link delen
Voor advertenties, e-mail handtekening, Instagram bio, visitekaartjes.

### Bonus features op deze pagina
- **QR-code** (480×480 PNG) — downloadbaar voor flyers
- **Live voorbeeld** — zie exact wat leads krijgen
- **Stuur naar developer** — mailto-knop met code voor je webdev
- **Installatie-handleiding** voor WordPress / Shopify / Wix / Squarespace / Webflow / Framer

---

## 📊 Dashboard — je leads

Sidebar → **Dashboard** tab.

### Wat zie je bovenaan?
- **Form-link banner** — paarse strook met je URL + kopieer-knoppen
- **Stats grid** — totaal aanvragen, gekwalificeerd, afspraken, conversie

### De leads-tabel
Elke rij = 1 lead. Klik om de zijpaneel te openen.

| Kolom | Wat |
|---|---|
| Naam | Voornaam + foto-initiaal |
| Bron | Waar de lead vandaan komt (FB, IG, website, ad) |
| Score | Kwalificatie-score 1-10 (gegenereerd door de AI) |
| Status | Nieuw / Bezig / Klaar / Verloren |
| Datum | Wanneer ingekomen |

### Filters
- **Zoekbalk** (boven de tabel): zoek op naam of telefoon
- **Status filter**: nieuw / bezig / klaar / verloren
- **Gekwalificeerd**: alleen warme leads
- **Bron**: filter op kanaal
- **Opgepikt**: leads die je nog niet hebt opgevolgd

---

## 💬 Lead-detail paneel — wat kan je per lead?

Klik op een lead → het zijpaneel opent.

### Kwalificatie sectie
- **Status dropdown** — verander naar Klaar / Verloren / Bezig
- **Score badge** — 1-10 van de AI
- **Waarom 7/10** — kleurpills voor Fit / Capaciteit / Urgentie
- **Deal waarde** — vul in als je de deal sluit
- **Verlies-reden** — als de status "Verloren" is

### AI Samenvatting
1-2 zinnen van wat de AI uit het gesprek heeft gehaald.

### Details
- Datum, bron, opgepikt-vinkje, booking-link verstuurd, afspraak geboekt

### Snelle acties
- 📞 **Bellen** — opent je telefoon-app
- 💬 **WhatsApp** — opent WhatsApp Web met de naam ingevuld
- ✉️ **Opvolging** — mailto met opvolg-tekst
- 📄 **Offerte** — mailto met offerte-tekst

### WhatsApp Gesprek
**De volledige chat** tussen je lead en de AI — alles wat ze besproken hebben.

- **Blauwe bubbles** = AI antwoorden
- **Grijze bubbles** = lead
- **Groene bubbles "✋ Jij"** = manueel verstuurd door jou vanuit dit dashboard

### 🌟 AI suggesties voor antwoord
Klik de paarse knop → AI genereert **3 korte antwoord-suggesties** op basis van het gesprek. Klik op een suggestie → vult de textarea → editten + Verstuur.

### Antwoord-textarea
Type een bericht → **Verstuur** → wordt direct als WhatsApp naar de lead gestuurd. Je antwoord verschijnt als groene bubble in de chat.

### Notities + Taken
- **Notities** met tijdstempel
- **Taken** met deadline (optioneel)

---

## ⚙️ AI Persoonlijkheid — instellingen van je AI

Sidebar → **AI Persoonlijkheid**.

### Velden die je kan aanpassen

| Veld | Voorbeeld | Wanneer aanpassen |
|---|---|---|
| **AI naam** | Sara De Vos | Permanent (één keer kiezen) |
| **Welkomstbericht** | Hey {naam}! {ai} hier van {bedrijf}... | A/B testen om conversie te verhogen |
| **Extra AI-instructies** | "Praat informeel, vermijd jargon..." | Telkens als je merkt dat de AI iets verkeerd doet |
| **Website** | https://www.acme.be | Zodra je een nieuwe site lanceert |
| **Adres** | Kerkstraat 12, 9000 Gent | Eénmalig |
| **Calendly link** | https://calendly.com/.../intake | Als je je intake-formulier wijzigt |
| **Foto AI-persoon** | URL naar vierkante foto 200×200+ | Foto = leads vertrouwen meer |
| **Brand-kleur** | #16A34A | Past de lead-form aan je brand |
| **Tekst lead-form** | Custom welkomstboodschap | Overschrijft de sector-default |

### Sjablonen voor welkomstbericht
10 voor-gemaakte templates per stijl:
- 👋 Vriendelijk
- 🤝 Professioneel
- ⚡ Kort & krachtig
- ❓ Vraaggericht
- 🏗️ Voor renovatie/bouw
- 🦷 Voor zorg/medisch
- 🏠 Voor vastgoed
- ⚖️ Voor advocaten
- 💰 Vertrouwen + sociaal bewijs
- 🎯 Direct kwalificeren

Klik een sjabloon → textarea wordt ingevuld → pas aan naar wens.

### AI-instructies sjablonen
6 klikbare snippets die je kan **stapelen**:
- 💬 Praat informeel
- 🎩 Praat formeel
- 🚫 Geen prijzen via WhatsApp
- 📋 Vraag altijd 3 dingen
- 🎯 Sluit altijd af met een actie
- 🚦 Diskwalificeer snel

### Live voorbeeld (rechts)
Zie real-time hoe je WhatsApp-bericht eruit gaat zien voor een lead.

### Test send
Vul jouw eigen telefoonnummer in → klik **Test** → je krijgt het welkomstbericht op je telefoon. Zo zie je exact wat je leads krijgen.

---

## 📅 Calendar — afspraken

Sidebar → **Kalender** tab.

- Toont alle Calendly-afspraken die de AI heeft ingepland
- Per dag/week overzicht
- Klik een afspraak → details + actiekop ("naar lead", "annuleren")

**Calendly koppelen (eenmalig):**
1. Profile → Calendly koppelen
2. Authoriseer Helvaro op Calendly
3. Klaar — afspraken stromen automatisch binnen

---

## 📈 Analyse — wat werkt en wat niet

Sidebar → **Analyse** tab.

- **Conversie per kanaal** — welke bron levert de beste leads?
- **Response time** — hoe snel reageert je AI gemiddeld?
- **Score distribution** — hoeveel 9/10's vs 5/10's?
- **Gesprek-samenvatting** — top onderwerpen uit recente leads

---

## 📤 Exports

Sidebar → **Exports** tab.

- **CSV download** van alle leads (filter eerst, dan download)
- **Weekrapport** — vrijdag-overzicht per email
- **Custom dataset** — kies kolommen + datum-range

---

## 👤 Profiel + Instellingen

Sidebar → **Instellingen** tab.

- Je naam, email, project-code
- Calendly status (gekoppeld / niet)
- API key (voor developers)
- Wachtwoord wijzigen — via support email

---

## ⚠️ Veelvoorkomende vragen

### "Mijn lead krijgt geen WhatsApp"
1. Check `app.helvaro.pro/dashboard` → de lead moet wel verschijnen (anders kwam form niet door)
2. Wacht 45-90 seconden — de AI wacht expres om "menselijk" te lijken
3. Check of de telefoon van de lead WhatsApp heeft (niet alle nummers)
4. Mail [hello@helvaro.pro](mailto:hello@helvaro.pro) — wij checken Meta logs

### "De AI antwoordt iets fout"
1. Ga naar AI Persoonlijkheid → Extra AI-instructies
2. Voeg een regel toe die dit specifieke gedrag corrigeert (bv. *"Vermeld nooit concrete prijzen"*)
3. Opslaan → werkt vanaf het volgende gesprek

### "Hoe stop ik een gesprek?"
- Open de lead → status → **Klaar** of **Verloren**
- De AI stuurt geen verdere berichten naar deze lead

### "Kan ik manueel een bericht sturen?"
Ja — open de lead → onder WhatsApp Gesprek → type → **Verstuur**. Dit verstuurt direct via WhatsApp.

### "Wat als 2 leads tegelijkertijd komen?"
De AI handelt onafhankelijke gesprekken parallel af. Geen wachtrij.

### "Krijg ik notificaties?"
- Browser pop-ups bij elke nieuwe lead (na permission)
- Bell-icoon bovenaan dashboard toont count
- Optioneel: email naar je owner-adres (wij configureren)

---

## 🆘 Hulp nodig?

| Type vraag | Contact |
|---|---|
| Bug / iets werkt niet | hello@helvaro.pro |
| AI-gedrag tunen | Probeer eerst zelf in AI Persoonlijkheid; anders mail ons |
| WhatsApp / Meta issues | We checken Meta dashboard logs |
| Calendly koppeling | Profile → Calendly → "Opnieuw koppelen" |
| Factuur / wijzigingen | hello@helvaro.pro |

---

*Laatst bijgewerkt: 2026-05-21*
