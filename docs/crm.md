# CRM-koppelingen — handleiding voor de beheerder

> Wat je moet weten om dit aan te zetten, te controleren, en te repareren als
> een klant zegt dat zijn leads niet aankomen.

---

## 0. Voor je dit aan iemand belooft

**Draai eerst dit, één keer, met een echte sleutel:**

```bash
node scripts/crm-check.js hubspot        # of pipedrive / salesforce / webhook
```

Geen enkele adapter heeft ooit tegen een echte CRM-API gedraaid. De vorm van
elk verzoek is nagetrokken in documentatie, maar de bouwomgeving mag geen van de
leveranciers bereiken. Dit script is het verschil tussen "zou moeten werken" en
"werkt". Het LEEST alleen; er komt niets bij in het CRM van een klant.

Faalt er iets, dan zegt het script welke aanname sneuvelde en wat de leverancier
in plaats daarvan terugstuurde. Elke aanname staat met naam in de kop van de
adapter in `api/_crm/adapters/`.

## 1. Wat er al klaar staat

| | |
|---|---|
| Airtable-veld | `CRM Koppelingen` op Client Config (`fld5UwV0QS8m7UAHF`, Long text) — **bestaat** |
| Encryptiesleutel | `CRM_TOKEN_KEY`, anders `SESSION_SECRET`. Eén van beide is genoeg |
| Scherm | Instellingen → *Je CRM* |
| Modes | `crm-status` / `crm-connect` / `crm-disconnect` / `crm-sync` op `/api/leads` |

## 2. Een klant koppelen

De klant doet dit zelf in Instellingen → *Je CRM*. Wat hij nodig heeft:

| CRM | Wat je hem vraagt |
|---|---|
| HubSpot | Private app token. Rechten: `crm.objects.contacts` en `crm.objects.deals`, lezen **en** schrijven |
| Pipedrive | Bedrijfsdomein (het stuk voor `.pipedrive.com`) + API-token uit Persoonlijke voorkeuren |
| Salesforce | My Domain + Consumer Key/Secret van een app met de client-credentials-flow **en** een uitvoerende gebruiker |
| Omnicasa | Hun API-sleutel. Vraag erbij wélke API ze gebruiken (zie §5) |
| Eigen webhook | Een https-adres. De ondertekeningssleutel maken wij |
| Whise | Nog niet mogelijk — zie §5 |

Koppelen bewijst zichzelf: de sleutel wordt eerst tegen het CRM gecontroleerd en
pas daarna opgeslagen. Eén uitzondering: Omnicasa, want daar bestaat geen
leesbaar endpoint (§5).

## 3. Wanneer wordt er iets verstuurd

Twee momenten, allebei automatisch:

1. Een gesprek dat **afgerond én gekwalificeerd** is
2. Elke **geboekte bezichtiging** — ook als de lead niet gekwalificeerd heet:
   wie een afspraak maakt is een kans, en dat oordeel komt van de agenda

Halve gesprekken en koude leads gaan er bewust niet in.

Een bestaand bestand overzetten kan met **Stuur bestaande leads na** (max 50 per
klik, en het stopt na 45 seconden). Zegt het scherm "er stonden er meer klaar",
klik dan nog eens — wat niet meeging heeft geen id gekregen en komt de volgende
keer vanzelf aan de beurt.

## 4. "Mijn leads komen niet aan"

Loop dit af, in deze volgorde:

1. **Kijk op het scherm.** Instellingen → *Je CRM*. Staat er een oranje regel
   onder de koppeling? Dan staat daar wat er misging. Dat is de laatste fout van
   de laatste bulk-synchronisatie.
2. **Zoek in de Vercel-logs op `[crm/`.** Elke mislukking logt daar met een code.
3. **Zoek in Airtable.** Open de lead, kijk in `Notities`. Staat er
   `"crm":{"hubspot":{"contactId":...}}`, dan is hij verstuurd en ligt het aan
   de andere kant.

### De codes en wat ze betekenen

| Code | Wat het is | Wat je doet |
|---|---|---|
| `geen_toegang` | Sleutel geweigerd (401/403) | Klant laten herkoppelen. Wachten helpt niet |
| `te_druk` | 429 van de leverancier | Niets. Volgende synchronisatie pakt het op |
| `storing` / `timeout` / `onbereikbaar` | Hun kant | Niets. Wordt één keer automatisch opnieuw geprobeerd |
| `geweigerd` | Zij willen onze gegevens niet (4xx) | **Dit is van ons.** Schemaverschil of een bug. Log erbij pakken |
| `veld_ontbreekt` | `CRM Koppelingen` staat niet op die base | Veld aanmaken (Long text) |
| `geen_sleutel` | Geen `CRM_TOKEN_KEY`/`SESSION_SECRET` | Zetten in Vercel |
| `verkeerde_tenant` | Lead hoort bij een ander kantoor | **Bug.** Meteen uitzoeken; dit hoort nooit voor te komen |
| `intern_adres` | Webhook-adres wijst naar een intern netwerk | Klant een publiek adres laten opgeven |
| `nog_niet_beschikbaar` | Whise | Zie §5 |

### Als een klant zegt "ik zie dubbele deals"

Dat kan één oorzaak hebben: het terugschrijven van het CRM-id naar de lead is
mislukt. Dat logt luid (`ids terugschrijven mislukt`). HubSpot, Pipedrive en
Salesforce zoeken daarna nog op telefoonnummer, dus meestal wordt het alsnog
opgevangen; Omnicasa en de webhook niet.

## 5. De twee die anders zijn

**Whise.** Niet gebouwd, expres. Hun documentatie gaat alleen naar partners met
een sleutel, en Make heeft ook geen Whise-app. Nodig om het af te maken: de
basis-URL, de velden van het token-verzoek, de velden van `contacts/upsert`, en
hoe het kantoor (ClientId) wordt meegegeven. Heb je een klant mét Whise? Vraag
hem de API-documentatie op — de rest van de koppeling staat er al. Ondertussen
is de eigen webhook de weg.

**Omnicasa.** Er bestaan twee Omnicasa-API's. Wij spreken de CRE-API
(`omnicasaapiv3.omnicasa.com/cre/`); een residentieel kantoor zit mogelijk op de
oudere `OmnicasaService`. Daarom vraagt het scherm ook het API-adres. De
veldnamen in de body zijn de enige aanname in de hele koppeling en staan in één
object bovenaan `api/_crm/adapters/omnicasa.js` — als het misgaat is dat één
regel werk. Koppelen raakt hun API niet aan (er is geen leesbaar endpoint, en
een testpersoon aanmaken in het CRM van een klant is geen optie), dus Omnicasa
bewijst zich pas bij de eerste echte lead.

## 6. Sleutels

- Ze liggen versleuteld (AES-256-GCM) in `CRM Koppelingen`. **Nooit met de hand
  bewerken en nooit kopiëren.**
- **Rotatie van `SESSION_SECRET` maakt ze allemaal onleesbaar** als
  `CRM_TOKEN_KEY` niet apart gezet is. Klanten moeten dan opnieuw koppelen. Dat
  logt als `ontsleutelen mislukt (sleutel gewijzigd?)`. Zet `CRM_TOKEN_KEY`
  apart als je ooit `SESSION_SECRET` wil roteren.
- Ontkoppelen verwijdert de sleutel echt uit de opslag; andere koppelingen van
  dezelfde klant blijven staan.

## 7. Een eigen webhook ontvangen

Wij sturen `POST` met een JSON-body en deze kop:

```
X-Helvaro-Signature: t=<unix seconden>,v1=<hex hmac-sha256>
X-Helvaro-Event: lead.nieuw | lead.bijgewerkt | ping
```

Getekend wordt `${t}.${ruwe body}` met de ondertekeningssleutel. **Dat is exact
de vorm van Stripe**, dus elke bestaande Stripe-verificatie werkt.

De ontvanger hoort twee dingen te controleren:

1. dat `v1` klopt, met een **timingveilige** vergelijking
2. dat `t` niet ouder is dan ~300 seconden — dat is de herhaalbeveiliging.
   Zonder die tweede controle kan iemand die één geldig bericht opving het
   eindeloos opnieuw aanbieden

Ontdubbelen doe je op `lead.sleutel` (`helvaro-<recordId>`): die is stabiel over
de hele levensduur van de lead.

## 8. Waar het in de code zit

```
api/_crm/index.js          de enige deur naar buiten
api/_crm/vorm.js           lead -> één neutrale vorm (adapters kennen alleen dit)
api/_crm/config.js         sleutels per klant, versleuteld
api/_crm/http.js           één time-out, één fouttype, redactie voor de logs
api/_crm/adapters/*.js     zes stuks
scripts/crm-check.js       controle tegen de echte API's, read-only
tests/crm-koppelingen.test.js
```

Regel die niet onderhandelbaar is: **een CRM-storing mag nooit een
WhatsApp-antwoord ophouden.** `duwVeilig()` gooit daarom niet, en er zit een
tijdsbudget op. Zie de kop van `api/_crm/index.js`.
