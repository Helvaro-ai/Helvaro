# Helvaro — Operations Runbook

> Dagelijkse + emergency workflows voor Frade & Teljo.

---

## 🌅 Dagelijkse routine (9u00)

### Frade (sales)
- ☐ Open `app.helvaro.pro/dashboard` → check vannacht binnengekomen leads
- ☐ Open Founder Dashboard → Live Klanten panel → wie is online vandaag?
- ☐ Bel/WhatsApp warme leads (score ≥7) van gisteren
- ☐ 20 LinkedIn DMs verstuurd via script uit `marketing-playbook.md`
- ☐ Check Calendly-agenda → wie heeft demo vandaag?

### Teljo (tech)
- ☐ Check Vercel runtime logs → errors gisteren?
- ☐ Check Airtable Leads tabel → records met "WhatsApp Failed" flag?
- ☐ 30 cold emails verstuurd via Apollo
- ☐ Check Meta Business Manager → quality score van WhatsApp number

### Beide
- ☐ Sync 30 min — wat werkt, wat niet? Bug-list update?

---

## 🚨 Incident response

### "Een klant zegt: mijn AI antwoordt niet"

**Stap 1 — Identificeer**
```
Vraag: welke lead? Naam + telefoon + tijdstip.
Open Airtable Leads tabel → filter op telefoon → check Conversation State
```

**Stap 2 — Diagnose**

| Symptoom | Oorzaak | Fix |
|---|---|---|
| Lead bestaat niet in Airtable | Form submission gefaald | Check Vercel logs `/api/form/CODE` |
| Lead bestaat, State = "new", geen messages | WhatsApp opening message gefaald | Check Vercel logs voor `[WhatsApp] Sturen naar X mislukt` |
| Lead bestaat, History = [], State = "in_progress" | Webhook ontvangt geen berichten | Check Meta dashboard webhook delivery |
| History toont alleen user-messages | Claude call faalt | Check `ANTHROPIC_API_KEY` env var, check Anthropic status |
| AI antwoordt maar zegt rare dingen | Prompt te vaag | Verbeter AI Instructions van die klant |

**Stap 3 — Quick fixes**

- Klant naam/email klopt: `app.helvaro.pro/dashboard` → AI Persoonlijkheid → check setup compleet
- Lead phone format: moet zonder + zijn, met landcode (32466...)
- Test send: gebruik "Test" knop op AI Persoonlijkheid → krijgt jij bericht?

### "WhatsApp business number is geblokt"

**Symptoom:** Meta Graph API returns 403 of "messaging limit reached"

**Acties:**
1. Open Meta Business Manager → WhatsApp Manager → check quality rating
2. Als RED: pause alle outbound 24u. Geen exceptions.
3. Als ORANGE: limit naar 50 berichten/dag tot terug GREEN
4. Update opening template: minder direct/aggressief → meer vraag-gestuurd
5. Check spam reports: <2 per dag is acceptabel
6. **Nooit** dezelfde tekst naar 100+ leads sturen → triggers spam-detect

### "Airtable rate limit (429)"

**Symptoom:** `/api/leads` returns 503 "Systeem is druk"

**Acties:**
1. Wacht 30 sec — onze code heeft retry-logic
2. Als persistent: check `_userCache` size — kan vol zitten
3. Reduceer poll-interval in dashboard.js van 10min → 15min temporary
4. Upgrade Airtable plan als nodig (€20/mnd voor 200K req/mnd)

### "Vercel deploy faalde"

```bash
# Check status
gh run list --limit 5

# Check build logs
vercel logs --since 1h

# Rollback naar vorige werkende versie
git revert HEAD --no-edit && git push

# Of via Vercel UI: Deployments → previous → "Promote to Production"
```

### "Klant kan niet inloggen"

| Symptoom | Oorzaak | Fix |
|---|---|---|
| "Verkeerd email/wachtwoord" | Wachtwoord vergeten | Reset hash in Airtable Users tabel |
| "Te veel pogingen" (429) | Rate limit getriggered | Wacht 15 min, of restart Vercel function |
| "Verbindingsfout" | Vercel function timeout | Check logs, kan Airtable-issue zijn |
| Inloggen werkt, dashboard wit | Browser JS error | DevTools console → screenshot → mail Teljo |

---

## 💾 Backup & data export

### Wekelijks (vrijdag 17u)
1. Open Airtable → Klanten + Leads tabellen
2. Export elke tabel als CSV (rechtsboven → Download CSV)
3. Upload naar Google Drive map `Helvaro Backups / YYYY-WW`
4. Bewaar 12 weken historiek

### Maandelijks
1. Volledige base-snapshot via Airtable Snapshot feature (Help menu)
2. Bewaar 24 maanden

---

## 📈 Monitoring

### Wat checken, hoe vaak

| Metric | Waar | Frequentie | Action threshold |
|---|---|---|---|
| Aantal nieuwe leads/dag | Founder dashboard | Dagelijks 9u | <5/dag voor 3 dagen → marketing actie |
| Conversie naar gekwalificeerd | Founder dashboard | Wekelijks vr | <50% → AI Instructions tunen per klant |
| Avg response time | Analyse pagina | Wekelijks | >5 min → tech-bug, check whatsapp.js delay |
| Vercel function errors | Vercel dashboard → Logs | Dagelijks | >10/dag → root cause investigation |
| Meta WhatsApp quality | Meta Business Manager | Dagelijks | ORANGE/RED → escalation |
| Airtable usage | Airtable workspace | Wekelijks | >80% van plan → upgrade |
| Anthropic spend | console.anthropic.com | Wekelijks | >€10/dag → check usage spike |

---

## 🔧 Veelgebruikte commands

### Een test-lead maken voor demo
```bash
curl -X POST https://app.helvaro.pro/api/form/HELVARO \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","phone":"+32478123456","bron":"Test"}'
```

### Een Resend test-email triggeren
```bash
curl -X POST https://app.helvaro.pro/api/admin \
  -H "x-api-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"mode":"test-email","to":"hello@helvaro.pro"}'
```

### Cron job manueel triggeren
```bash
curl https://app.helvaro.pro/api/cron-followup
```

### Force config refresh van klant
```bash
# Login als die klant, hard-refresh dashboard (Cmd+Shift+R)
# Of via API:
curl -X POST https://app.helvaro.pro/api/leads \
  -H "x-api-key: <client-session-token>" \
  -H "Content-Type: application/json" \
  -d '{"mode":"config-get"}'
```

---

## 🛠️ Common code maintenance

### Een klant toevoegen handmatig

**Optie A: Via admin onboarding flow**
1. Genereer invite link: `https://app.helvaro.pro/onboard?invite=$ONBOARD_CODE`
2. Stuur naar klant → ze vullen 3-step wizard in

**Optie B: Direct in Airtable**
1. Klanten tabel → +Add → vul alle velden in
2. Genereer API Key handmatig (random 32 chars)
3. Mail klant met login-instructies

### Een lead manueel kwalificeren
Airtable Leads → vink Qualified=true → vul Reason + Summary → set Lead Score

### Een lead pauzeren (geen verdere AI-berichten)
Airtable Leads → Conversation State = "completed"

### AI gedrag wijzigen voor 1 klant
**NIET in code aanpassen.** Wel:
1. App dashboard → AI Persoonlijkheid → AI Instructions
2. Specifieke regel toevoegen: *"Vraag nooit naar mailadres in eerste 3 berichten"*
3. Opslaan → werkt vanaf het volgende gesprek

### AI gedrag wijzigen voor IEDEREEN
1. Open `api/whatsapp.js` → zoek `Je bent ${aiName}, sales bij ${clientName}`
2. Voorzichtig wijzigen — dit is de base system prompt voor ALLE klanten
3. Test lokaal: `node --check`, render-test
4. Commit + push → live na 30s

---

## 📋 Klant-uitsluitingen (do NOT onboard)

| Wie | Reden |
|---|---|
| Banks / financiële instellingen | Compliance-risico (FSMA, AML) |
| Apotheken / medisch farma | FAGG-regelgeving rond AI-comm |
| Anyone die spam vraagt | Helvaro tagged direct als spam-tool |
| Concurrenten | (Geen voor nu, maar later relevant) |

---

## 🎯 KPI targets — wat is "goed"?

| Metric | Maand 1 | Maand 3 | Maand 6 | Maand 12 |
|---|---|---|---|---|
| Betalende klanten | 5 | 15 | 40 | 100 |
| MRR | €5.000 | €15.000 | €40.000 | €100.000 |
| Avg leads per klant/mnd | 20 | 30 | 40 | 50 |
| Kwalificatie-% | 60% | 70% | 75% | 78% |
| Churn maandelijks | <10% | <7% | <5% | <3% |

---

## 🆘 Emergency contacts

| Wie | Wanneer | Hoe |
|---|---|---|
| **Vercel support** | App is plat, build faalt structureel | help@vercel.com (paid plan = sneller) |
| **Meta WhatsApp support** | Number geblokt, webhook broken | facebook.com/business/help |
| **Airtable support** | Data corruption, base ontoegankelijk | support@airtable.com |
| **Anthropic** | API consistent 5xx | support@anthropic.com |
| **Resend** | Geen emails uitgaan | support@resend.com |

---

## 📝 Post-incident protocol

Na elk groot incident (>30 min downtime):

1. **Write-up binnen 24u** in `docs/incidents/YYYY-MM-DD-incident.md`
   - Wat gebeurde er?
   - Wanneer ontdekt?
   - Root cause?
   - Fix toegepast?
   - Hoe voorkomen in de toekomst?

2. **Maatregel toevoegen aan runbook** als pattern terugkomt

3. **Klant-communicatie** indien nodig:
   - Stuur transparante update binnen 2u
   - Bied SLA-credit aan bij paid plans

---

*Laatst bijgewerkt: 2026-05-22*
