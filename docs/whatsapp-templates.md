# De vier WhatsApp-templates

Kopieer deze vier in Meta Business Manager → WhatsApp Manager → Berichtsjablonen
→ Sjabloon maken. Zet daarna de bijbehorende naam in Vercel.

## Waarom dit moet

Een lead die je formulier invult heeft jou nog **nooit** een bericht gestuurd.
Meta's 24-uursvenster is dan dicht, en buiten dat venster is een vrij bericht
niet toegestaan — alleen een goedgekeurde template. Verstuurt Helvaro toch een
vrij bericht, dan wordt het geweigerd en op den duur kost het je het nummer.

Daarom weigert `api/form.js` het bewust: staat `INTRO_TEMPLATE_NAME` niet
ingevuld, dan wordt de lead **wel** aangemaakt en gaat er **niets** uit. Dat
staat luid in het log en de lead krijgt een markering, maar op het scherm ziet
het eruit alsof de lead uit zichzelf zwijgt.

## Regels die Meta afdwingt

- **Het aantal variabelen moet exact kloppen** met wat de code meestuurt. Eén te
  veel of te weinig en Meta weigert élke verzending met die template.
- Een template bestaat **per taal**. Heb je alleen een Nederlandse, zet dan
  `INTRO_TEMPLATE_LANG=nl` — anders probeert de code de taal van de klant en
  krijg je een weigering die eruitziet als een kapotte template.
- Categorie **Utility** waar het kan: goedkoper dan Marketing en sneller
  goedgekeurd. Het intro-bericht is een reactie op een aanvraag, dus Utility is
  hier verdedigbaar. Wijst Meta het af, dien het dan opnieuw in als Marketing.
- Geen variabele aan het begin of het einde van de tekst — Meta weigert dat.

---

## 1. INTRO — het eerste bericht na een formulieraanvraag

**Naam:** `helvaro_intro_nl` · **Taal:** Nederlands · **Categorie:** Utility
**Variabelen:** 3 — `{{1}}` voornaam · `{{2}}` naam van de AI · `{{3}}` bedrijfsnaam

```
Dag {{1}}, u vroeg net info aan bij {{3}}. Ik ben {{2}} en help u even verder via WhatsApp.

Mag ik u drie korte vragen stellen? Dan weet ik meteen welke woningen bij u passen.
```

Voorbeeldwaarden voor de goedkeuring: `Marie` · `Mathis` · `Helvaro`

```
INTRO_TEMPLATE_NAME=helvaro_intro_nl
INTRO_TEMPLATE_LANG=nl
```

---

## 2. FOLLOWUP — de opvolging na 24 uur of 7 dagen

**Naam:** `helvaro_opvolging_nl` · **Taal:** Nederlands · **Categorie:** Utility
**Variabelen:** 1 — `{{1}}` voornaam

```
Dag {{1}}, ik had u eerder een bericht gestuurd over uw aanvraag maar nog niets van u gehoord.

Zoekt u nog? Eén woord is genoeg, dan pik ik het weer op. Liever geen berichten meer? Antwoord STOP.
```

De STOP-zin hoort erin: `api/_optout.js` herkent hem in zes talen en zet de lead
meteen op afgemeld. Meta kijkt hier ook naar bij de beoordeling.

```
FOLLOWUP_TEMPLATE_NAME=helvaro_opvolging_nl
FOLLOWUP_TEMPLATE_LANG=nl
```

---

## 3. REMINDER — 24 uur voor de bezichtiging

**Naam:** `helvaro_herinnering_nl` · **Taal:** Nederlands · **Categorie:** Utility
**Variabelen:** 3 — `{{1}}` voornaam · `{{2}}` tijdstip · `{{3}}` bedrijfsnaam

```
Dag {{1}}, kleine herinnering aan uw bezichtiging bij {{3}}: {{2}}.

Komt het niet meer uit? Laat het hier weten, dan verzet ik het meteen.
```

"Laat het hier weten" is geen holle beleefdheid: de lead kán echt antwoorden en
`api/_afspraken.js` zegt af of verzet dan alles in één keer — de rij in
Airtable, het Google-event en de twee vlaggen op de lead.

```
REMINDER_TEMPLATE_NAME=helvaro_herinnering_nl
REMINDER_TEMPLATE_LANG=nl
```

---

## 4. NOTIFY — jouw eigen ping bij een nieuwe lead

**Naam:** `helvaro_notificatie_nl` · **Taal:** Nederlands · **Categorie:** Utility
**Variabelen:** 3 — `{{1}}` naam van de lead · `{{2}}` telefoonnummer · `{{3}}` bron

```
Nieuwe lead binnen: {{1}} ({{2}}), via {{3}}.

De AI is het gesprek gestart. U ziet de kwalificatie in uw dashboard zodra hij klaar is.
```

Dit gaat naar het nummer in `Notify Phone` op je klantrij. Staat dat veld leeg,
dan gaat er niets uit — ook niet als de template bestaat.

```
NOTIFY_TEMPLATE_NAME=helvaro_notificatie_nl
NOTIFY_TEMPLATE_LANG=nl
```

---

## Nadat Meta ze goedgekeurd heeft

1. Zet de acht variabelen hierboven in Vercel (Production) en deploy opnieuw.
2. Draai `node scripts/preflight.js` — de sectie **whatsapp** vertelt per
   template of hij staat, en wat een lead of jij niet krijgt als hij ontbreekt.
3. Testrit: vul je eigen formulier in met je eigen nummer. Krijg je het
   introbericht, dan sluit de lus.

## Als Meta een template afkeurt

Meestal is het één van drie dingen: een variabele aan het begin of einde van de
tekst, een verkeerd aantal variabelen, of de categorie. Pas aan en dien opnieuw
in — een afkeuring kost je niets behalve tijd, en de code werkt gewoon door met
de templates die wél goedgekeurd zijn.
