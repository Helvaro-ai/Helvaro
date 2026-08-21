# Werken aan Helvaro

Helvaro kwalificeert vastgoedleads via WhatsApp voor Vlaamse makelaars: de AI
voert het gesprek, vraagt budget en timing uit, en boekt de bezichtiging zelf in
de agenda. `app.helvaro.pro` draait op Vercel.

## De changelog bijhouden — bij elke wijziging

`CHANGELOG.md` is verplicht onderhoud, geen extraatje. Wie hier iets verandert,
beschrijft het daar. De reden is simpel: de eigenaar leest geen git log, en een
wijziging die hij niet kan zien bestaat voor hem niet.

```
node scripts/changelog.js      # toont wat er nog niet beschreven is
```

Regels die het verschil maken tussen een bruikbare changelog en ruis:

- **Schrijf het GEVOLG, niet de commit.** Een commit legt uit waarom de code
  veranderde; een changelog-regel zegt wat de gebruiker merkt. "Fix suffix in
  stat card" is een commit. "GEM. REACTIE toonde 55 uur voor iets van 55
  seconden" is een changelog-regel.
- **Eén regel mag drie commits dekken.** Groepeer op gevolg, niet op diff.
- **Begin met `**Actie:**` als de eigenaar iets moet doen** — een variabele
  zetten, een script draaien, een tabel aanmaken. Die regels worden gelezen; de
  rest is ter kennisgeving.
- **Nederlands**, want de eigenaar en de app zijn Nederlandstalig.
- **Alles wat nog niet op `main` staat gaat onder `## Nog niet uitgerold`.** De
  enige eerlijke datum voor "uitgerold" is de dag dat het deployt.
- **Werk het merkteken onderaan bij** (`<!-- changelog-tot: <sha> -->`) zodat het
  script weet waar het moet beginnen.
- **Verzin geen resultaat.** Staat er een getal in — contrastverhouding, aantal
  fouten, aantal commits — dan moet dat gemeten zijn.

## Vier dingen die deze codebase eigen zijn

**`api/dashboard.js` is één sjabloonliteral van ~20.000 regels.** Alles wat je
daarin schrijft wordt pas JavaScript nadat de template is uitgerold. Een
`\s` in een regex wordt een kale `s`; een `\'` in een string sluit die string.
Beide zijn hier al eens gebeurd zonder dat de module weigerde te laden — de fout
zit in de UITVOER, niet in de bron. `scripts/faro-check.js` parseert daarom de
uitgestuurde JavaScript; draai hem na elke wijziging aan dit bestand.

**Routes zijn duur; hang gedrag aan `body.mode`.** Er staan er nu 13 in `api/`.
Modules met een underscore ervoor (`api/_faro/`, `api/_credits.js`, …) zijn géén
routes en tellen niet mee.

Het plafond van twaalf was dat van Vercel Hobby; het project staat inmiddels op
Pro, dus een route erbij breekt de deploy niet meer. Dat maakt de gewoonte niet
minder waar: elke route is een koude start en een tweede plek waar de
sessiecontrole moet kloppen. `api/leads.js` draagt daarom panden, facturatie,
plannen en het bijkopen van credits als modes.

Eén route is er bewust wél bij gekomen: `api/stripe.js`. Die kan niet aan
`leads.js` hangen, omdat Stripe de RUWE bytes van de body ondertekent en Vercel
een JSON-body automatisch wegparst — de handtekening zou dan bij elke betaling
falen. Vandaar `bodyParser: false` op die ene route. Dat is de lat: een eigen
route is te rechtvaardigen als het technisch niet anders kan, niet omdat het
netter oogt.

**Kleuren komen uit tokens, en tekst gebruikt een ándere token dan een vlak.**
`--accent-c` is de vulling, `--accent-ink` is diezelfde kleur als tekst — met per
thema een andere waarde. Hetzelfde geldt voor `--success-ink`, `--warning-ink`,
`--error-ink` en `--neutral-ink`. Zand op wit haalt 1,29:1; het is geen
smaakkwestie. Meet tegen het oppervlak waar de tekst ECHT op staat: een groene
score staat op een groene chip, niet op de kaart eronder.

**Maten staan op een schaal.** `scripts/faro-check.js` weigert ruwe pixelwaarden
in de Faro-bestanden. Gebruik `--sp-*` en `--r-*`.

## Voor je klaar bent

```
node scripts/faro-check.js     # ontwerpschaal, i18n, en de uitgestuurde JS
for t in tests/*.test.js; do node "$t"; done
```

`tests/faro-store-live.test.js` praat met de echte Airtable-base en slaat zichzelf
over zonder credentials. Hij is de enige test die tenant-isolatie tegen een echte
database controleert; draai hem met `vercel env pull .env.local` als je aan
`api/_faro/store.js` komt.

Een browser is hier vaak sneller dan lezen. `node scripts/faro-dev.js` start de
app lokaal met een fixture-tenant, en Chromium staat klaar op
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Meerdere rapporten in deze
codebase bleken bij natrekken niet te kloppen; meten scheelt werk aan dingen die
niet stuk zijn.

## Wat níét zomaar mag

- **Geen tenant-identiteit uit een request body.** De projectcode komt uit de
  geverifieerde sessie. Leeg leest verderop als "admin, toon alles".
- **De AI krijgt geen directe uitvoerweg.** Alles wat naar buiten gaat — een
  bericht, een afspraak, een campagne — loopt via de HMAC-poort in
  `api/_faro/actions.js`.
- **Geen verzonnen cijfers in het echte dashboard.** Elk getal komt uit
  tenant-eigen records. Pipeline is geen omzet.
- **Prijzen staan in `api/_plans.js` en nergens anders.** Ze hebben hier al twee
  keer los in de code gestaan en klopten allebei de keren niet met de
  prijspagina — één keer zes keer te duur, één keer drie keer te goedkoop. Wat
  daaruit volgt (het tarief voor bijkopen, de creditlimiet bij onboarding, wat
  het scherm toont) wordt afgeleid, nooit overgetypt. De browser rekent geen
  prijs uit: dat is het getal dat een klant kan aanpassen.
- **Geen mailto op een moment dat iemand wil betalen.** Er stonden er vier
  ("Upgrade nu", "Heractiveer account", "Limiet bereikt", "mail ons voor een
  account"). Elke daarvan is een klant die moet wachten tot er iemand wakker is.
  `tests/zelfbediening.test.js` bewaakt dat ze niet terugkomen.
- **Nooit een slot tonen als vrij** zonder dat de agenda dat bevestigt.
