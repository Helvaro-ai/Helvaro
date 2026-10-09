# Verticals en segmenten

Hoe Helvaro weet in welke markt een klant zit, en hoe je een markt toevoegt
door configuratie in plaats van een nieuwe codepad. Alleen wat er is.

## Vertical of segment?

- **Vertical** (`api/_vertical.js`): de markt. `vastgoed`, `dealership`, `bouw`,
  `keuken`, `renovatie`. Leeg betekent **vastgoed**; dat verandert nooit, want
  elke klant van voor de verticals heeft het veld leeg. Een nieuwe klant krijgt
  `STANDAARD_NIEUW` (dealership).
- **Segment** (`api/_segment.js`): een variant binnen één vertical. Nu alleen
  binnen `dealership`: `auto` of `motor`, in Client Config `Vehicle Segment`.
  **Leeg, onbekend of een record zonder dealership betekent `auto`**, op elk
  pad. Een bestaande dealer verandert daardoor niet.

Kies een segment als het product hetzelfde blijft (voorraad, gesprekken, leads,
afspraken, agenda) en alleen woorden, een paar kenmerken en de soorten afspraak
verschillen. Een nieuwe vertical raakt tientallen plekken die `dealership` al
goed lezen; een segment raakt alleen wat echt anders moet.

De niche bepaalt het segment alleen als `Vehicle Segment` leeg is: een niche in
`NICHE_MOTOR` (`api/_vertical.js`, bv. `motorcycle_dealer`) leest als
dealership + motor. Een expliciet `Vehicle Segment` wint altijd.

## Een segment toevoegen: wat je raakt

1. **Lezer en woorden** — `api/_segment.js`: de naam in `BEKEND`, de woorden in
   `TERMEN` (nl/fr/en/de), en eventueel een niche-lijst in `api/_vertical.js`.
2. **Soorten afspraak** — `api/_afspraaktypes.js` is de ene bron
   (`TYPES`, `SEGMENT_TYPES`, `ALIAS`, `STANDAARD`). Niemand anders heeft een
   eigen lijst. Auto houdt de vier bestaande sleutels in dezelfde volgorde;
   motor voegt `testrit`, `onderhoud`, `waardering` toe, met label in vier
   talen en een standaardduur (`duurMin`). Een nieuw type heeft ook een
   `melding.type.<sleutel>` nodig in `api/_i18n.js`.
3. **Prompts** — `api/_ai/prompts.js` (`TERMEN` per segment). Het autopad moet
   byte-identiek blijven; `tests/motor-prompts-auto-golden.test.js` en de
   bestaande golden tests bewaken dat.
4. **Matching** — `api/_wens.js`: typegroepen (`MOTORTYPES`) en harde grenzen
   (`hardeGrenzen`: cilinderinhoud en rijbewijsklasse). Een harde grens laat een
   voertuig **weg**, ook als het veld leeg is (niet te bevestigen = niet
   aanbieden). Alles is gebonden aan het segment; zonder segment verandert er
   niets (`api/_vehicles.js` `rangschik`/`alternatieven`).
5. **Voertuigvelden** — optionele velden staan in `OPTIONELE_VELDEN`
   (`api/_vehicles.js`); ontbreekt het veld in Airtable, dan wordt zonder
   opnieuw geschreven. De velden staan ook in `api/_schema.js` (admin-actie
   `ops-schema`).
6. **Websiteassistent** — `api/_assistent.js`: `dealer.segment`, `SYSTEEM`,
   `zoekVoorraad(…, segment)`, `intentie(…, segment)`. Het model krijgt alleen
   de voorraad die het zoekresultaat teruggeeft; wat niet in het blok staat mag
   het niet noemen.
7. **Faro** — `ctx.segment` komt uit `api/_faro/handler.js`;
   `identityVoor(ctx)` in `api/_faro/prompt.js`; `add_listing` neemt de
   segmentvelden mee (`api/_faro/tools.js`).
8. **Dashboard en onboarding** — een rij in `WIZARD_MARKTEN`
   (`api/dashboard.js`) met `vertical` en `segment`; woorden in
   `HV_WOORDEN_MOTOR` + `mot.*` in `api/_i18n.js`; client-functies in
   `api/_dash/segment.js` (houd `api/dashboard.js` onder 22.000 regels);
   `public/onboard.html`; `config-save` in `api/leads.js` accepteert
   `segment` (alleen waarden uit `BEKEND`, apart best-effort geschreven).
9. **Tests** — een test per laag, naast de golden tests. Zie
   `tests/motor-*.test.js`, `tests/afspraaktypen.test.js` en
   `tests/segment.test.js`.

Na elke wijziging aan `api/dashboard.js`: `node scripts/backtick-check.js` en
`node scripts/faro-check.js`.

## Referentietenant: Capital Brussels Harley-Davidson

Alleen configuratie, geen klantspecifieke code: een Client Config-record met
`Vertical = dealership` en `Vehicle Segment = motor`, plus vier fixture-motoren
(`api/_faro/fixtures.js`, codes `DEMO-…`, omschrijving begint met `[FIXTURE]`).
`FARO_DEV_TENANT=motor node scripts/faro-dev.js` draait de lokale harnas als
deze tenant. `tests/motor-capital-brussels.test.js` loopt het hele pad met
stubs: zoeken, match, lead met motor, testritboeking, geen autowoorden, en een
verzonnen model dat niet in de context komt.
