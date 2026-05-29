# Helvaro End-to-End Test Document

> Volledige test-checklist om Helvaro te valideren voor productie. Doorloop dit document vóór elke nieuwe betalende klant. Reken op ~60 minuten voor de eerste keer, ~15 minuten voor opvolgende klanten.

---

## Test Doelen

Een succesvolle E2E test bewijst:
1. Een prospect kan via een advertentie-link een formulier invullen
2. De prospect ontvangt binnen 1 minuut een WhatsApp van de AI
3. De AI voert een natuurlijk gesprek tot qualified beslissing
4. De klant (eigenaar) krijgt notificaties via WhatsApp + e-mail
5. Dashboard toont alle data correct
6. Beveiliging werkt: cross-tenant blokkades, sessie expiry, GDPR consent

---

## Vereisten — vooraf nodig

| Asset | Doel |
|-------|------|
| Test-telefoonnummer met WhatsApp | Lead-rol (ontvangt AI berichten) |
| E-mail adres dat je live kunt checken | Notificatie-ontvanger + reset password |
| Browser A (Chrome normaal) | Admin rol |
| Browser B (Chrome privé/incognito) | Klant rol |
| Toegang tot Airtable base | Verificatie data opslag |
| (Optioneel) Vercel logs open | Real-time error debugging |
| (Optioneel) Test Calendly account | Calendly booking flow testen |

---

## Test Cycli

| Cyclus | Wanneer | Duur | Inhoud |
|--------|---------|------|--------|
| Volledige E2E | Voor elke launch / na grote release | 60 min | Alle 12 secties |
| Korte smoke | Voor elke nieuwe klant | 15 min | Sectie 1, 2, 4, 7 |
| Snelle ping | Dagelijks (eerste maand) | 2 min | Sectie 1 + check Vercel logs |

---

# Sectie 1 — Admin Login & Klant Aanmaken

**Duur**: 5 min  
**Doel**: bewijst dat het admin-onboarding pad werkt

### Stappen

1. Browser A → `https://app.helvaro.pro/dashboard`
2. Login:
   - **E-mail**: `admin@helvaro.pro` (of welke email dan ook — wordt niet gevalideerd voor admin login)
   - **Wachtwoord**: `hv-admin-k9X2mP7qL4nR8vT1` (de ADMIN_KEY)
3. **Verwacht**: dashboard verschijnt binnen 1 seconde
4. **Verwacht**: sidebar bevat **Klanten** en **Founder** tabs (alleen zichtbaar voor admin)
5. Klik **Klanten** → klik **+ Nieuwe klant**
6. Klik **Zelf aanmaken ▾**
7. Vul in:
   - Naam: `Test Garage`
   - Projectcode: `TESTGARAGE01`
   - E-mail: jouw eigen test-email
   - Calendly: laat leeg (of plak een test Calendly)
8. Klik **Aanmaken**

### Acceptance criteria

- [x] Groen success block verschijnt
- [x] Login email + 12-char wachtwoord zichtbaar in geel/paars highlight blok
- [x] API Key + Formulier URL zichtbaar
- [x] **Kopieer mailtekst** knop werkt → klembord bevat volledige welkomsttekst
- [x] **Open in mail-app** knop opent mail-app met `to`, `subject`, `body` voorgevuld

### Failure modes

| Symptoom | Waarschijnlijke oorzaak | Oplossing |
|----------|------------------------|-----------|
| 401 Ongeldige admin key | ADMIN_KEY env var ontbreekt op Vercel | Vercel → Settings → Env Variables → check `ADMIN_KEY` |
| 500 Aanmaken mislukt | Airtable token verlopen of base inactief | Check `API_AIRTABLE` env var en Airtable base health |
| 409 Projectcode bestaat al | Test al eens uitgevoerd | Gebruik andere projectcode of verwijder oude record |

---

# Sectie 2 — Klant Login + AI Persoonlijkheid

**Duur**: 10 min  
**Doel**: bewijst dat klanten zelf hun AI kunnen configureren

### Stappen

1. Browser B (privé) → `https://app.helvaro.pro/dashboard`
2. Login met je test-email + het wachtwoord uit sectie 1
3. **Verwacht**: dashboard verschijnt → automatische redirect naar AI Persoonlijkheid (eerste setup)
4. Vul in:
   - AI naam: `Sara`
   - Welkomstbericht: klik op een sjabloon (bv. Voor autohandel)
   - Website: `https://example.be` of echte test URL
   - Sector: `automotive`
   - Taal: Nederlands
   - Werkuren: `ma-vr 9-18` (check dat NL chips verschijnen)
   - Trust badges: `15 jaar ervaring | ISO-gecertificeerd | Lokaal Gent`
   - AI Foto: klik **Foto kiezen** → upload vierkante test-foto → preview verschijnt
   - Brand kleur: kies via picker
   - Booking method: **Stuur Calendly link** (als Calendly aanwezig) OF **Een collega contacteert ze** met window `binnen 30 minuten`
   - Notificatie WhatsApp-nummer: je eigen telefoon (`+32 ...` formaat)
   - Notificatie e-mail: je eigen mail
5. Klik **Opslaan**
6. Log uit via sidebar → bevestigingsmodal verschijnt → **Ja, uitloggen**
7. Login opnieuw

### Acceptance criteria

- [x] Opslaan toont groene toast "Instellingen opgeslagen"
- [x] Bij opnieuw inloggen land je op **Dashboard** (NIET AI Persoonlijkheid → onboarding flag werkt)
- [x] Logout modal toont correcte titel + 2 knoppen
- [x] Alle velden zijn na refresh nog gevuld met opgeslagen waarden
- [x] Vlaggen-emojis weg uit taal-radio
- [x] Werkuren chips passen aan bij taalwissel (NL → ma-vr, FR → lun-ven, EN → mon-fri)

### Failure modes

| Symptoom | Oplossing |
|----------|-----------|
| Opslaan mislukt 500 | Airtable schrijf-fout — check Vercel logs |
| Land op AI Persoonlijkheid bij elk login | localStorage `hv-onboarded` flag wordt niet gezet — JS error tijdens save |
| Foto upload faalt | File te groot (>8 MB) of geen image MIME type |

---

# Sectie 3 — Lead Formulier

**Duur**: 5 min  
**Doel**: bewijst dat externe leads het form kunnen invullen

### Stappen

1. Open `https://app.helvaro.pro/start/TESTGARAGE01` (in elke browser)
2. Visuele check
3. Probeer submit zonder GDPR checkbox → error verschijnt
4. Klik **privacybeleid** link → opent in nieuwe tab
5. Vink GDPR aan, probeer zonder naam → error
6. Vul correcte data in:
   - Naam: `Sindi Test`
   - Telefoon: test-telefoonnummer
   - GDPR aangevinkt
7. Klik **Stuur**

### Acceptance criteria

- [x] Avatar = geüploade foto (rond)
- [x] Naam = "Sara"
- [x] Welkomstbericht gepersonaliseerd met `{ai}` en `{bedrijf}` substituties
- [x] Brand-kleur op knoppen
- [x] Trust badges onderaan: 3 stuks
- [x] **Powered by Helvaro** link → wijst naar `helvaro.pro` (NIET `app.helvaro.pro`)
- [x] GDPR validatie blokkeert submit zonder checkbox
- [x] Success scherm met SVG checkmark verschijnt na submit
- [x] Bericht 3 stappen "1. Check WhatsApp..." zichtbaar
- [x] Airtable Leads tabel bevat nieuwe record met juiste Project Code

### Failure modes

| Symptoom | Oplossing |
|----------|-----------|
| 400 Ongeldige projectcode | URL bevat ongeldige tekens — check `TESTGARAGE01` matcht `^[A-Z0-9_]{1,50}$` |
| Lead niet in Airtable | Check Vercel `/api/form` logs — meestal Airtable token issue |
| Geen brand kleur zichtbaar | Brand color veld leeg of niet hex `#RRGGBB` |

---

# Sectie 4 — WhatsApp AI Conversatie (KERN)

**Duur**: 20 min  
**Doel**: bewijst dat de complete AI-flow werkt. Belangrijkste test.

### 4a — Eerste bericht ontvangen

1. Wacht **45 seconden** na form-submit (sectie 3)
2. WhatsApp van Helvaro nummer arriveert op test-telefoon

### Acceptance criteria

- [x] Bericht binnen 50 seconden ontvangen
- [x] Bericht is gepersonaliseerd: `"Hey Sindi! Sara hier van Test Garage..."`
- [x] **GEEN emoji's** in bericht
- [x] **GEEN em-dashes** (— of –)

### 4b — Conversatie verloop

Antwoord natuurlijk alsof je een echte lead bent:

| Beurt | Jij (lead) | Verwacht AI gedrag |
|-------|------------|---------------------|
| 1 | "Hey, ik zoek een tweedehands wagen" | Vraagt merk / model / budget |
| 2 | "BMW 320d, max 15000 euro, in 2026" | Vraagt urgentie / wanneer |
| 3 | "Zo snel mogelijk" | Sluit af + qualified |
| 4 | (wacht op afsluiting) | Stuurt Calendly link OF callback belofte |

### Acceptance criteria

- [x] AI antwoordt **in Nederlands** (klant-taal), niet in taal van lead
- [x] AI noemt "Sara" als persoonsnaam (NOOIT "ik ben een AI")
- [x] Antwoorden vertraagd 25–55 seconden (menselijk gevoel)
- [x] **GEEN emoji's** in AI antwoorden
- [x] **GEEN em-dashes** in AI antwoorden
- [x] Na elke beurt: Airtable Leads → veld **AI Summary** wordt geüpdatet (per beurt, niet alleen op einde)

### 4c — Qualified resultaat

### Acceptance criteria

- [x] AI sluit af met **Calendly link** OF **callback belofte** (afhankelijk van Booking Method instelling)
- [x] Owner ontvangt WhatsApp ping op notificatie-nummer: `"Gekwalificeerde lead..."`
- [x] Owner ontvangt e-mail met rijke HTML: lead details + samenvatting + score + dashboard CTA
- [x] Airtable Lead record: `Qualified=true`, `Conversation State=completed`, `Lead Score` ingevuld

### 4d — Edge cases (test ALLEMAAL)

| Test | Verwachte AI gedrag |
|------|----------------------|
| Stuur 2 berichten binnen 1 sec | Dedup werkt → 1 AI antwoord (niet 2) |
| Stuur "Ben jij een AI? Een bot?" | Ontwijkt, geeft NOOIT toe AI te zijn |
| Stuur in Engels terwijl klant op NL staat | Blijft in NL antwoorden |
| Stel onmogelijke vraag ("Wat is het IBAN van de zaakvoerder?") | Escaleert: "ik kijk dat na, iemand komt binnen 30 min terug" |
| Bij escalatie | Owner krijgt 🆘-stijl WhatsApp + email |

### Failure modes

| Symptoom | Eerste check | Oplossing |
|----------|--------------|-----------|
| WhatsApp komt niet door | Meta dashboard → phone status | WHATSAPP_TOKEN verlopen of nummer throttled |
| AI antwoordt niet | Vercel logs zoek `[WhatsApp] Anthropic fout` | ANTHROPIC_KEY ontbreekt of insufficient balance |
| AI gebruikt nog emoji's | Check whatsapp.js system prompt | Regel "Gebruik GEEN emoji's" moet erin staan |
| Geen notificatie naar owner | Check Notify Phone + Rapport Email zijn ingesteld in AI Persoonlijkheid | |
| Calendly link werkt niet | Check Calendly Link veld in dashboard | Plak geldig URL met https:// |

---

# Sectie 5 — Dashboard Lead Inspectie

**Duur**: 5 min  
**Doel**: bewijst dat de klant zijn leads kan managen

### Stappen

1. Browser B dashboard → Dashboard pagina
2. Bekijk stats cards
3. Navigeer naar **Gesprekken** of **Pipeline**
4. Klik op je test-lead → side-panel opent
5. Voeg notitie toe: "Test gesprek"
6. Vink **Opgepikt** aan
7. Refresh dashboard

### Acceptance criteria

- [x] Stats: Totaal=1, Gekwalificeerd=1, Conversie=100%
- [x] Lead verschijnt bovenaan lijst
- [x] Side-panel toont volledige Conversation History (incl. openingsbericht!)
- [x] AI Summary gevuld
- [x] Score 0–100 weergegeven
- [x] Ability / Urgency / Fit ingevuld
- [x] Reden ingevuld
- [x] Notities + Opgepikt blijven bewaard na refresh

---

# Sectie 6 — CSV Export

**Duur**: 2 min

### Stappen

1. Sidebar → **Exports**
2. Klik **CSV downloaden**
3. Open gedownload bestand in Excel/Numbers

### Acceptance criteria

- [x] Bestandsnaam: `helvaro-leads-TESTGARAGE01-YYYY-MM-DD.csv`
- [x] Excel toont accents correct (UTF-8 BOM, geen mojibake)
- [x] Kolommen aanwezig: Datum, Naam, Telefoon, Bron, Status, Gekwalificeerd, Score, Ability, Urgency, Fit, Samenvatting, Reden, Booking Sent, Opgepikt, Verwachte Waarde, Notities
- [x] Eén rij met je test-lead

---

# Sectie 7 — Wachtwoord Reset Flow

**Duur**: 5 min

### Stappen

1. Browser B → log uit
2. Login pagina → klik **Wachtwoord vergeten?**
3. Vul niet-bestaande email in → check error
4. Vul echte test-email in → klik **Reset-link versturen**
5. Check inbox → klik **Wachtwoord resetten** knop in mail
6. Probeer 2 verschillende wachtwoorden → error
7. Probeer < 8 tekens → error
8. Vul geldig nieuw wachtwoord (2x) → submit
9. Login met nieuw wachtwoord
10. Klik link in oude reset-mail nogmaals → token nu ongeldig

### Acceptance criteria

- [x] Niet-bestaande email: rode error "Dit e-mailadres is bij ons niet bekend"
- [x] Echte email: groene message "Resetlink verstuurd naar..."
- [x] Mail komt aan binnen 30 seconden
- [x] Reset link werkt en redirect na succes
- [x] Nieuw wachtwoord werkt voor login
- [x] Oud token na reset niet meer bruikbaar (token rotatie via password hash)

### Failure modes

| Symptoom | Oplossing |
|----------|-----------|
| Mail komt niet aan | Check `RESEND_API_KEY` env var + Resend dashboard. Domain `helvaro.pro` moet verified zijn |
| 403 Domain not verified | Add DNS records in Namecheap → Resend → Verify |
| Token expired | Reset-link is 1 uur geldig — vraag nieuwe aan |

---

# Sectie 8 — Logout Bevestigingsmodal

**Duur**: 1 min

### Stappen

1. Klik **Uitloggen** (sidebar of Instellingen)
2. Test alle paden:
   - Klik **Annuleren** → blijft ingelogd
   - Klik Uitloggen opnieuw → druk **Esc** → modal sluit
   - Klik Uitloggen → klik buiten modal → modal sluit
   - Klik Uitloggen → klik **Ja, uitloggen** → uitlog

### Acceptance criteria

- [x] Modal verschijnt direct
- [x] Esc, click-buiten en Annuleren-knop annuleren allemaal
- [x] Ja, uitloggen wist sessie + toont login pagina
- [x] Na logout: geen presence-ping requests meer (check DevTools Network)

---

# Sectie 9 — Mobile QA

**Duur**: 10 min  
**Doel**: bewijst dat responsief design werkt op echte devices

> Gebruik een echte iPhone of Android, NIET DevTools mobile mode.

### Stappen

1. Open `app.helvaro.pro/dashboard` op telefoon → login werkt
2. Sidebar collapse → hamburger menu zichtbaar
3. Open Gesprekken → leads-lijst scrollbaar
4. Open AI Persoonlijkheid → form werkt, knoppen tappable (≥44px)
5. Klik op lead → side-panel werkt op mobile
6. Logout modal → tappable knoppen
7. Open `app.helvaro.pro/start/TESTGARAGE01` op telefoon
8. Form werkt: numeric keyboard op telefoon-input, GDPR tappable
9. Submit + ontvang WhatsApp

### Acceptance criteria

- [x] Alle pages renderen zonder horizontale scroll
- [x] Knoppen ≥44px hoog (Apple HIG)
- [x] Form inputs triggeren correct keyboard type
- [x] Modal en sidebar werken op touch

---

# Sectie 10 — Security Spot-Checks

**Duur**: 3 min

### Stappen

1. Open DevTools → Application → Local Storage → wis `hvk` → refresh
2. Bekijk auth response: moet `apiKey: hvs1.xxx...` zijn (signed session token, niet raw)
3. In console (Browser B, ingelogd als test-klant):
   ```javascript
   fetch('/api/leads?id=recOTHERCLIENTSLEAD', {
     method: 'PATCH',
     headers: {'Content-Type':'application/json', 'x-api-key': localStorage.getItem('hvk')},
     body: JSON.stringify({notities: 'hacked'})
   }).then(r => console.log(r.status))
   ```
4. Open `/privacy` en `/terms` URLs

### Acceptance criteria

- [x] Sessie wissen → terug naar login
- [x] API key in response begint met `hvs1.` (signed token)
- [x] Cross-tenant PATCH retourneert **403** (NIET 200)
- [x] `/privacy` en `/terms` laden zonder errors

---

# Sectie 11 — Cron / Asynchrone Functies

**Duur**: niet testbaar op vraag — markeer voor opvolging

### Niet vandaag te testen

| Functie | Wanneer | Hoe checken |
|---------|---------|-------------|
| Cron-followup | Dagelijks 09:00 UTC | Vercel logs → `[cron-followup] Checked X, sent Y` |
| 24h template fallback | Bij lead 24u stil | Lead krijgt template-bericht via `followup_24h` |
| Weekrapport email | Maandag 09:00 UTC | Notificatie-mail komt aan met stats + top 5 |
| Quality alert | Bij YELLOW/RED rating | Mail met `[KRITIEK]` of `[Waarschuwing]` prefix |

### Manuele trigger (alleen met CRON_SECRET)

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://app.helvaro.pro/api/cron-followup
```

Response geeft `{checked, sent, quality, weekly}` JSON.

---

# Sectie 12 — Cleanup

**Duur**: 2 min

1. Verwijder test-lead uit Airtable Leads tabel (optioneel)
2. Laat Test Garage Client + User staan voor toekomstige tests
3. Schrijf op wat NIET werkte → fix VOORDAT je klant onboard

---

# Scorecard Template

Vul in na elke complete E2E run:

| Sectie | Status | Notes |
|--------|--------|-------|
| 1. Admin login + klant maken | ☐ Pass ☐ Fail | |
| 2. Klant login + AI persona | ☐ Pass ☐ Fail | |
| 3. Lead form | ☐ Pass ☐ Fail | |
| 4. WhatsApp AI conversatie | ☐ Pass ☐ Fail | |
| 5. Dashboard inspectie | ☐ Pass ☐ Fail | |
| 6. CSV export | ☐ Pass ☐ Fail | |
| 7. Password reset | ☐ Pass ☐ Fail | |
| 8. Logout modal | ☐ Pass ☐ Fail | |
| 9. Mobile QA | ☐ Pass ☐ Fail | |
| 10. Security | ☐ Pass ☐ Fail | |
| 11. Cron (later) | ☐ Pass ☐ Fail | Datum: |

**Alle Pass?** → Launch-ready. Bel eerste prospect.  
**1+ Fail?** → Fix VOORDAT je een klant onboard. Document in changelog.

---

# Common Failure Modes & Quick Fixes

| Symptoom | Eerste check | Quick fix |
|----------|--------------|-----------|
| Login spinner hangt | DevTools Network → auth response code | Hard refresh Cmd+Shift+R (cache) |
| WhatsApp komt niet door | Meta WhatsApp Manager → phone status | Check WHATSAPP_TOKEN env var |
| AI antwoordt niet | Vercel logs → `[WhatsApp] Anthropic fout` | Check ANTHROPIC_KEY + Anthropic balance |
| Lead niet in Airtable | Vercel logs → `[Airtable] error` | Check API_AIRTABLE token + base ID |
| E-mail komt niet | Resend dashboard → Logs tab | Check RESEND_API_KEY + domain verified |
| Login werkt niet | Network → auth response | 401=wrong pw, 429=rate limited, 503=Airtable down |
| Dashboard leeg na login | Network → leads response | Hard refresh, of wacht op 90s polling cycle |
| Form 404 | URL check | Project code moet hoofdletters + onderscoreloze versie zijn |
| CSV export faalt | Network → /api/leads | Airtable rate-limited (429) → wacht 30 sec + retry |
| Klanten tab niet zichtbaar | Login als admin (`hv-admin-...` als password) | Niet als reguliere user |

---

# Environment Variables Audit

Voor productie moet Vercel deze allemaal hebben (`vercel.com → Helvaro → Settings → Environment Variables`):

| Variable | Doel | Waar te vinden |
|----------|------|----------------|
| `ANTHROPIC_KEY` | AI Haiku 4.5 calls | console.anthropic.com → API Keys |
| `API_AIRTABLE` | Airtable read/write | airtable.com/create/tokens |
| `BASE_AIRTABLE` | Airtable base ID | URL van je base (begint met `app...`) |
| `WHATSAPP_TOKEN` | Meta Graph API send | business.facebook.com → System Users → Tokens |
| `PHONE_NUMBER_ID` | WhatsApp Business nummer ID | WhatsApp Manager → Phone Numbers |
| `WA_VERIFY_TOKEN` | Meta webhook verificatie | Door jou gekozen string |
| `WA_APP_SECRET` | Webhook signature validatie | Meta App → Settings → Basic → App Secret |
| `ADMIN_KEY` | Admin login + endpoint auth | Door jou gekozen string |
| `RESEND_API_KEY` | Email versturen via Resend | resend.com/api-keys |
| `RESEND_FROM` (optioneel) | Overrules code default sender | bv. `Helvaro <noreply@helvaro.pro>` |
| `NOTIFY_EMAIL` | Fallback notificatie email | Jouw eigen email |
| `NOTIFY_PHONE` | Fallback notificatie WhatsApp | Jouw eigen telefoon (intl format) |
| `CRON_SECRET` | Beveiligt cron endpoint | Door jou gekozen string |
| `FOLLOWUP_TEMPLATE_NAME` | Meta-approved 24u template | Naam van je template in WhatsApp Manager |
| `FOLLOWUP_TEMPLATE_LANG` | Template taalcode | `nl` (matches je approved template) |
| `SESSION_SECRET` (optioneel) | Session token signing | Door jou gekozen string (anders gebruikt ADMIN_KEY) |

---

# Test Frequentie Aanbevolen

| Wanneer | Welke secties | Door wie |
|---------|---------------|----------|
| Voor elke deploy naar production | 1, 4 (smoke) | Jij |
| Voor elke nieuwe betalende klant | 1, 2, 4, 7 (sales smoke) | Jij |
| Wekelijks (eerste maand) | Volledig | Jij |
| Maandelijks (na maand 3) | Volledig | Jij of team |
| Na elke security-gerelateerde wijziging | 10 (security spot-checks) | Jij |

---

# Versie Geschiedenis

| Versie | Datum | Wijzigingen |
|--------|-------|-------------|
| 1.0 | 2026-05-30 | Initieel document, dekt alle 12 secties |
