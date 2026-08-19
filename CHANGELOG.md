# Changelog

Wat er in Helvaro verandert, en wat het voor jou betekent. Nieuwste bovenaan.

Dit is geen lijst van commits — die staan in git. Hier staat wat er anders is
aan het product, waarom, en of jij er iets voor moet doen. Elke regel die met
**Actie:** begint vraagt iets van jou; de rest is puur ter kennisgeving.

Conventies staan in `CLAUDE.md` en `scripts/changelog.js` maakt een nieuw
kopje aan. Ongereleasede wijzigingen staan onder *Nog niet uitgerold*, want de
enige eerlijke datum voor "uitgerold" is de dag dat `main` deployt.

---

## Nog niet uitgerold — tak `claude/helvaro-ai-workspace-ol7lbr`

47 commits die nog niet op `main` staan. Productie draait dus nog niets
hieronder.

> **Actie:** haal `PG_API_URL`, `PG_API_TOKEN` en `PG_API_INSECURE` uit Vercel.
> Ze wijzen naar de opgeheven VPS. Dat was een kaal IP-adres, en die worden door
> de provider opnieuw uitgedeeld — zolang de variabelen er staan stuurt Helvaro
> een bearer-token naar wie dat adres nu ook heeft, met certificaatcontrole uit.

> **Actie:** draai `node scripts/preflight.js` vóór je uitrolt. Eén commando
> zegt of Clerk én Faro aan kunnen. Clerk staat
> AL aan in productie, en een bestaande klant zonder Clerk-account krijgt bij
> "Account aanmaken" een gloednieuwe lege tenant — hij logt succesvol in en ziet
> nul leads, terwijl zijn echte data gewoon in Airtable staat.

### Inloggen en accounts

- **Een bestaande klant houdt zijn eigen tenant.** Dit was de duurste fout in de
  hele migratie. Logde een klant die al in Airtable stond voor het eerst via
  Clerk in, dan kreeg hij een gloednieuwe lege tenant: succesvol ingelogd, nul
  leads, proefperiode van veertien dagen — terwijl al zijn echte records
  gewoon in Airtable bleven staan, alleen niet meer bereikbaar vanaf zijn
  account. Van zijn kant niet te onderscheiden van "Helvaro heeft mijn klanten
  gewist". De rij werd wél opgezocht, maar alleen om te kijken óf hij bestond;
  zijn projectcode werd weggegooid. Die wordt nu overgenomen. Er is een test
  bijgekomen die precies dit geval afdekt, plus het spiegelgeval dat een écht
  nieuwe klant nog steeds gewoon een tenant krijgt.
- **Google Agenda werkte voor geen enkele Clerk-gebruiker.** Status, koppelen en
  ontkoppelen gaven alle drie een 401: de agendaroute werd afgehandeld vóórdat
  de Clerk-controle draaide, en keek alleen naar het oude sessietoken. Het
  paneel bleef daardoor eeuwig op "nog niet gekoppeld" staan en er was geen
  enkele manier om een agenda te koppelen. Zonder agenda kan de boekingsstroom
  nooit bevestigen dat een slot vrij is — precies het ding waar hij niet naar
  mag gokken.
- **`preflight.js` telde maar tot 100.** Airtable geeft honderd rijen per pagina
  en de rest achter een `offset`, die niet werd gelezen. Bij meer dan honderd
  klanten meldde hij "alle 100 actieve klanten bestaan in Clerk" — groen licht
  — terwijl klant 101 en verder ongecontroleerd bleven en bij het inloggen
  precies in de lege tenant hierboven terechtkwamen. De controle die dat moest
  voorkomen, bevestigde dus het tegendeel. Hij paginaeert nu.
- **Clerk werkt nu op een geverifieerd eigen domein.** Faro had helemaal geen
  Clerk-pad en gaf iedereen een 401 op de pagina waar je na het inloggen landt.
- **Uitloggen logt echt uit.** De Clerk-sessie bleef leven: één keer verversen en
  je stond weer binnen.
- **De leadcache verlaat de computer bij uitloggen.** Namen, telefoonnummers en
  samenvattingen bleven 24 uur in de browser staan en verschenen bij de volgende
  klant zodra Airtable even druk was.
- **`scripts/preflight.js`** zegt vooraf of Clerk én Faro aan kunnen, met een
  reden per probleem in plaats van een stil inlogscherm. Controleert ook de
  gevallen die geld kosten of op een bug lijken: een OpenAI-sleutel zonder
  opslag, een ontbrekende `SESSION_SECRET` (dan weigert élke bevestigde actie),
  en `FARO_DEMO_MODE` dat per ongeluk aan staat.

### Faro

- **De videolengtes die Faro kon kiezen bestonden geen van alle.** Het schema
  bood 10, 15 of 30 seconden aan; het model achter de knop accepteert alleen 4,
  8 of 12. Elke keuze die de AI kon maken was er dus één die de provider zou
  weigeren — een functie die werkend oogt tot aan de foutmelding. Lengtes komen
  nu uit dezelfde registry als de prijs.
- **Om Faro aan te zetten heb je één nieuwe sleutel nodig:** `ANTHROPIC_API_KEY`.
  De rest (Airtable, WhatsApp, `SESSION_SECRET`) heeft Helvaro al. Beeld en video
  vragen daarnaast `OPENAI_API_KEY` én `BLOB_READ_WRITE_TOKEN` — allebei of geen
  van beide.
- **Je kunt meer dan één vraag stellen.** Elk tweede bericht gaf 404 en elk
  "recent gesprek" was dood bij aanklikken.
- **Gesprekken worden bewaard** in twee nieuwe Airtable-tabellen
  (`ai_conversations`, `ai_messages`). Zonder tabel valt hij terug op de browser.
- **Een lopend antwoord kun je stoppen.** De verstuurknop wordt een stopknop.
- **Faro praat Nederlands.** De snelkoppelingen stuurden Engelse zinnen die als
  jouw eigen bericht in de draad kwamen en de gesprekstitel werden.
- **De bevestigingskaart zegt wat hij gaat doen** — pand, kanalen, invalshoek,
  doelgroep — in plaats van "Helvaro maakt de campagne aan".
- **Bijlagen tonen een miniatuur en kunnen weer weg.**
- **De limiet op AI-verzoeken werkt.** Hij kon door drie fouten nooit afgaan.
- **De agenda-actie kan slagen.** Bevestigen gaf altijd "kon niet aangemaakt
  worden": de aanroep en de functie spraken een andere vorm af.

### Cijfers die fout waren

- **"GEM. REACTIE 55u"** was 55 secónden. Het veld heet `Response Time (sec)`.
- **"WIN RATE 100%"** naast "Gewonnen 0" — de formule was "nog niet verloren".
- **Het omzetdoel** stond standaard op € 5.000, dus de kaart meldde vanaf dag één
  "100% van doel bereikt".
- **Een budget van "3 slaapkamers, 450.000"** werd gelezen als € 3.
- **De kalender toonde 12-uursnotatie** zonder am/pm: 13:00 las als 1:00.

### Credits

- **Video heeft nu een prijs.** Het was het enige dat Faro kan doen zonder enige
  afschrijving, en het is verreweg het duurste: één filmpje van acht seconden
  kost twaalf leadgesprekken. Het staat op 30 credits per seconde (50 op de
  bredere formaten), ongeveer 1,6x kostprijs. De poort staat al in de code
  hoewel videogeneratie zelf nog niet is aangesloten — een rem die je pas ná het
  openzetten bedenkt, bedenk je te laat.
- **Actie:** beslis wat een proefklant met video mag. Bij dit tarief kost één
  standaardvideo 240 van de 250 proefcredits: hij kan er precies één maken en
  heeft daarna niets meer voor leads. Zie `CREDIT-SYSTEM-DESIGN.md` §7 voor de
  drie opties.
- **Faro rekent nu af op wat hij echt verbruikt.** Het was 3 credits per beurt,
  plat — of die beurt nu één regel was of acht gereedschapsrondes op een duurder
  model. De tokens werden al geteld en alleen als notitie bewaard; ze bepalen nu
  de afschrijving. Gemeten op het goedkoopste model kost een zware beurt 15
  credits waar er 3 werd gerekend.
- **Sonnet en Opus hebben nu een prijs.** Dit hoefde niet meer op jou te
  wachten: het zijn de lijstprijzen van Anthropic. Dezelfde beurt (10.000 in,
  700 uit) kost nu 3 credits op Haiku, 8 op Sonnet en 13 op Opus — waar er
  overal 3 werd gerekend, en Sonnet is het standaardmodel. Sonnet staat er op
  het NORMALE tarief, niet op de introprijs die tot en met 31 augustus 2026
  geldt: met de introprijs erin zou de afschrijving op 1 september in één nacht
  50% te laag worden, precies wanneer niemand eraan denkt.
- **Gelijktijdige afschrijvingen gaan niet meer verloren.** Gemeten: vijf
  tegelijk van 3 credits werden geboekt als 3 in plaats van 15 — vier van de
  vijf verdampten. Faro maakte dit erger dan het was, want één vraag kan
  meerdere gereedschappen draaien. Afschrijvingen voor dezelfde klant staan nu
  achter elkaar in plaats van door elkaar.

### Beveiliging

- **Uitloggen beëindigt de sessie nu ook op de server.** Het was volledig
  client-side: localStorage leegmaken en het inlogscherm tonen. Maar de
  sessiecookie is httpOnly, dus JavaScript kón hem niet wissen en deed dat ook
  niet — hij bleef zeven dagen geldig. Op een gedeelde computer is dat precies
  waar uitloggen voor bedoeld is: twee markers met de hand terugzetten en je
  stond weer binnen, met een geldige cookie en zonder dat er iets gestolen
  hoefde te worden.
- **Zelfaanmelden staat nu ook via Clerk dicht.** `PUBLIC_SIGNUP_ENABLED` staat
  standaard uit en `api/admin.js` weigerde daarom elke aanmelding zonder
  uitnodigingscode. Het Clerk-pad liep daar volledig omheen: met Clerk aan en
  die vlag uit — wat jij als gesloten beschouwt — kon een willekeurige
  bezoeker een e-mailadres bevestigen en met een werkende tenant, een live
  leadformulier en 250 credits naar buiten lopen. Een bestaande klant die voor
  het eerst inlogt wordt níét geblokkeerd: dat is koppelen, geen aanmelden.
  **Actie:** wil je zelfaanmelden wél openzetten, zet dan
  `PUBLIC_SIGNUP_ENABLED=true` in Vercel.

### Als er iets misgaat

- **Een storing ziet er niet meer uit als een leeg account.** Een mislukte
  Airtable-lezing gaf een keurige 200 met nul leads — niet te onderscheiden van
  een nieuw account, inclusief onboarding-checklist.
- **Fouten zijn zichtbaar.** Een 500 of kapotte JSON liet alle tegels eeuwig op
  "LADEN..." staan, zonder melding.
- **AI-verbruik is begrensd en herstelbaar.** Tijdens een storing was het
  tegelijk ongelimiteerd én ongemeten; nu een dak en een
  `[Credits][RECONCILE]`-regel per verloren boeking.

### Hoe het eruitziet en aanvoelt

- **Licht thema:** 150 leesbaarheidsfouten naar 0, donker 7 naar 0. Zand op wit
  haalde 1,29:1.
- **Twee plekken in plaats van één hoop: CRM en AI.** Bovenaan de zijbalk staat
  nu een schakelaar. CRM toont je gewone navigatie, AI toont Faro met zijn eigen
  lijst gesprekken, beelden en projecten. Daarvoor stonden die twee kolommen
  naast elkaar op élk scherm — 428 pixels aan menu voordat er werk in beeld
  kwam, en geen manier om te zien welke van de twee je moest lezen. Faro blijft
  de startpagina; kies je CRM, dan onthoudt hij dat, ook na herladen. Schakelen
  brengt je terug op de CRM-pagina waar je gebleven was, niet naar het
  dashboard.
- **Je eigen naam stond onzichtbaar in de zijbalk (donker thema).** De
  profielknop kreeg nooit een achtergrond, dus Chrome gebruikte zijn eigen
  knopkleur: een lichtgrijze pil met bijna-witte tekst erop. Nu 12,2:1.
- **De voet van de zijbalk was onleesbaar in het lichte thema.** De zijbalk
  blijft daar bewust donker, maar je profielnaam en de Uitloggen-knop pakten de
  paginakleuren: bijna-zwart op donkergrijs (1,86:1) en een rood dat voor een
  wit vlak bedoeld is (1,88:1). Nu 5,68:1 en hoger, gemeten op de echte pixels
  van het vlak waar de tekst op staat.
- **Niets wordt meer afgesneden** op smalle schermen: 13 gevallen naar 1 van 6px.
- **De zijbalk** kreeg groepen, een inklapstand die 152px teruggeeft, en een
  duidelijke actieve pagina.
- **Het inlogscherm vertelt wat Helvaro doet** in plaats van "Naadloze
  werkomgeving".
- **Toetsenbord:** elk klikbaar element is bereikbaar, elke bediening heeft een
  naam, elke pagina één `h1`, en er is een overslaan-link.
- **De back-office van Helvaro** (`Klanten`, `Founder`) zat verborgen in de HTML
  van élke klant. Nu bestaat hij daar niet meer.

### Onder de motorkap

- **Dit changelogbestand.** Vanaf nu wordt elke wijziging hier beschreven, in
  gevolgen in plaats van commits. `node scripts/changelog.js` zegt wat er nog
  ontbreekt — en negeert daarbij commits die alleen dit bestand aanraken, anders
  jaagt het merkteken zijn eigen staart na. `CLAUDE.md` legt de afspraak vast
  voor iedereen die hier verder werkt.

- **De VPS is opgeheven** en de code deed alsof hij er nog was. Wat eraan hing —
  marketingposts, outreach, social posting via "Herald" — is stil, en dat staat
  nu eerlijk in `api/_pgapi.js`. Afspraken stonden in Airtable en zijn veilig.
- **`scripts/faro-check.js`** parseert nu de JavaScript die de browser echt
  krijgt. `api/dashboard.js` is één groot sjabloon waarin een geldig ogende regel
  iets anders kan opleveren; dat is hier drie keer gebeurd.

---

<!-- Nieuwe kopjes hierboven. Zie CLAUDE.md. -->
<!-- Het merkteken hieronder zegt tot welke commit dit bestand bijgewerkt is.
     scripts/changelog.js leest het en toont alleen wat erna kwam. Bijwerken bij
     elke changelog-aanvulling. -->
<!-- changelog-tot: 3031080 -->
