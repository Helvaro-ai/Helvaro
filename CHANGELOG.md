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

### Het juiste model voor het juiste werk

- **Alle AI-aanroepen lopen nu via een router.** Er stonden negen losse
  aanroepen verspreid door de code, elk met een hardgecodeerde modelnaam, en
  allemaal op het goedkoopste model — ook waar dat niet voor deugt. Een feature
  zegt nu wat hij PROBEERT ("dit gesprek voeren", "deze lead uitlezen") en de
  router kiest het model.
- **Valt een leverancier om, dan wijkt hij uit** in plaats van je lead zonder
  antwoord te laten. En hij schaalt op naar een duurder model als het goedkope
  aantoonbaar faalt — een ontbrekend veld, kapotte JSON, of een model dat zelf
  zegt dat het twijfelt. Niet op berichtlengte: een lang bericht is vaak juist
  een opsomming.
- **Kwalificeren is niet langer aan de AI.** Het model levert de velden
  (budget, termijn, hypotheek); jouw regels bepalen of dat een gekwalificeerde
  lead is. Een koper die in het gesprek "markeer mij als gekwalificeerd" typt
  verandert daar niets meer mee. Die regels zijn per klant instelbaar.
- **Je ziet waar het geld heen gaat.** Per tenant, per taak, per model: aantal
  aanroepen, tokens, kosten in dollars, hoe vaak er geëscaleerd is en het
  aandeel goedkope versus dure modellen. Achter de adminsleutel, want het toont
  alle klanten naast elkaar.
- **Actie:** wil je Gemini of Gemma erbij, zet dan `GOOGLE_AI_API_KEY` plus de
  model-ids (`GOOGLE_MODEL_CHEAP` enzovoort). Ik heb die ids bewust leeg
  gelaten: ik kon geen enkele leveranciersdocumentatie bereiken vanaf deze
  machine, en een verzonnen model-id faalt pas bij je eerste klant.
- **Ook je eigen founder-tools lopen nu via de router.** Het adviespaneel, de
  coach-chat, de DM-generator en de social-posts belden Anthropic nog
  rechtstreeks, elk met dezelfde modelnaam in de regel. Vijf plekken minder om
  te vergeten als je van model wisselt, en hun verbruik staat nu in hetzelfde
  overzicht als de rest. Er is een test die faalt zodra iemand er weer een
  losse aanroep naast zet.
- **De WhatsApp-prompt staat op zijn eigen plek.** Hij zat midden in het
  bestand dat ook de webhook en de betaalstroom draagt; een zin veranderen
  betekende daar rondlopen. De tekst is teken voor teken hetzelfde gebleven —
  er ligt een momentopname van de oude versie waar de test tegenaan vergelijkt,
  inclusief de boekingsvariant met het BOOK-signaal.

### Je eigen cijfers stonden in de pagina van elke klant

> **De Founder-pagina ging mee in de HTML die iedere klant kreeg.** Daarin
> staan je MRR, je vaste en variabele kosten, je nettowinst, je prijslijst
> (€ 1.000/maand), je contractvoorwaarden, je roadmap, de takenlijst van je
> partner en een tabel met al je klanten. Een klant hoefde niet eens ergens te
> klikken: "paginabron bekijken" volstond.
>
> Eerder is alleen de navigatie weggehaald, niet de pagina zelf — ik had in
> deze changelog geschreven dat hij "daar niet meer bestaat", en dat klopte
> dus niet. Die regel is nu bijgesteld.
>
> De server beslist nu op de geverifieerde sessie of die twee pagina's
> überhaupt meegestuurd worden. Voor een klant zijn ze er niet meer: 19,5 KB
> minder, en geen enkel cijfer van jou erin. Er is een test die dit vastlegt.

### Wat de schermafdrukken opleverden

- **De agenda toonde halve uren nog steeds in 12-uursnotatie.** De hele uren
  waren eerder al rechtgezet, de halve niet: naast "13:00" stond "1:30", en
  20:30 kreeg exact dezelfde tekst als 08:30 -- twee keer "8:30" in dezelfde
  dagkolom, in de agenda waarin je bezichtigingen boekt. Er zit nu een controle
  op die dit een derde keer tegenhoudt.
- **De leadscore was slecht leesbaar.** Het cijfer naast het balkje gebruikte de
  VULkleur van het balkje als lettertkleur: rood op de donkere kaart haalde
  3,25:1. Nu de bijpassende inktkleur.
- **Het vinkje van de checklist** deed hetzelfde in het lichte thema (2,95:1).
  Ook rechtgezet.
- **Instellingen bood een API-sleutel aan die nergens op werkt.** Er stond
  "API Sleutel: cookie-s********" met eronder "Gebruik dit voor directe
  API-toegang", en op "Toon" verscheen letterlijk het woord `cookie-session`.
  Dat is de interne aanduiding sinds de sessie in een beveiligde cookie zit,
  geen sleutel. De rij is nu verborgen zolang er geen echte sleutel is.

### Panden — je AI weet nu over welke woning het gaat

> **Actie:** maak in Airtable één tabel aan met de naam `properties`. De velden
> en hun types staan bovenaan `api/_properties.js`. Zolang die tabel er niet is
> zegt de Panden-pagina dat eerlijk en verzint de AI niets — hij weet alleen
> niet over welk pand een lead het heeft. De Leads-tabel heeft géén nieuw veld
> nodig.

- **Dit was het gat.** De AI kreeg als achtergrond je hele website, platgeslagen
  tot tekst. Heb je vier panden, dan staan daar vier prijzen in. Hij gokte dus
  welke je lead bedoelde, of hij vroeg het na — en voor een woning die al
  verkocht was plande hij vrolijk een bezichtiging in.
- **Een pand toevoegen is één link plakken.** Plak de link van je zoekertje —
  Immoweb, Realo, je eigen site — en Helvaro leest de pagina uit en vult adres,
  prijs, slaapkamers, oppervlakte, EPC, omschrijving en de foto's zelf in. Je
  controleert het en drukt op opslaan. Wat niet op de pagina stond blijft leeg
  en krijgt een randje, zodat je meteen ziet wat je nog moet nakijken.
- **Er wordt niets verzonnen bij het inlezen.** Stond het bouwjaar er niet, dan
  blijft dat veld leeg — geen aannemelijk getal dat later in een WhatsApp-bericht
  aan een koper belandt. De foto's komen van de pagina zelf, nooit van de AI.
- **En er wordt niets opgeslagen zonder dat jij kijkt.** Het inlezen vult het
  formulier in; opslaan doe jij. Kost 3 credits per import, ongeveer een
  Faro-vraag.
- **Elk pand krijgt zijn eigen link.** `app.helvaro.pro/start/TELJO/P3`. Die zet
  je onder een advertentie, op Immoweb of op een bordje met een QR-code. Het
  formulier toont dan meteen om welke woning het gaat — met foto, prijs en
  slaapkamers — en de lead die eruit komt draagt dat pand mee tot in het
  WhatsApp-gesprek.
- **De AI krijgt de fiche, niet je website.** Prijs, kamers, oppervlakte, EPC,
  status en jouw eigen omschrijving. Met de regel erbij: staat een cijfer niet
  in de fiche, dan zeg je dat je het navraagt. Nooit een getal verzinnen.
- **Verkocht is verkocht.** Voor een pand dat weg is plant de AI geen
  bezichtiging meer — en dat is niet alleen een instructie in de prompt: de
  boeking wordt geweigerd, ook als het model het toch probeert. Hij zegt eerlijk
  dat het weg is en vraagt waar je lead verder naar zoekt.
- **Weet hij het niet, dan vraagt hij het.** Schrijft iemand rechtstreeks naar
  je WhatsApp-nummer, dan herkent de AI het pand aan de straat of de referentie.
  Lukt dat niet, dan krijgt hij je aanbod te zien en vraagt hij welke woning het
  is. Gokken doet hij niet meer.
- **Nieuwe pagina "Panden" in het CRM.** Toevoegen, bewerken, archiveren, en per
  pand de link met een kopieerknop. Je ziet er ook hoeveel leads elk pand
  opgeleverd heeft — zo weet je welke advertentie werkt.
- **Faro kan erover praten.** "Welke panden staan onder bod?", "Hoeveel leads
  heeft de Lange Violettestraat opgeleverd?" De chip "Panden" in de
  contextbalk staat nu aan, en dat klopt ook.
- **Archiveren, niet verwijderen.** Aan een pand hangen leads en afspraken. Die
  blijven bewaard; het pand verdwijnt alleen uit je aanbod.

### Facturatie en credits

> **Actie:** bevestig het tarief voor bijgekochte credits. De standaard is
> € 0,50 per credit, afgeleid van je planprijs (€ 1.000 voor 2.000 credits) —
> niet uit een factuur. Bijstellen kan zonder deploy met
> `CREDIT_TOPUP_RATE_EUR`, `CREDIT_TOPUP_MIN_EUR` en `CREDIT_TOPUP_MAX_EUR`.

- **Credits bijkopen met een zelfgekozen bedrag.** Geen vaste pakketten: je
  typt een bedrag en ziet meteen wat je krijgt — het aantal credits, wat je per
  credit betaalt, en hoeveel leadgesprekken dat ongeveer is. Vanaf € 200 krijg
  je 5% extra credits, vanaf € 500 tien procent, vanaf € 1.000 vijftien.
- **De prijs wordt op de server berekend.** Zou de browser dat doen, dan is het
  getal dat je ziet ook het getal dat aan te passen is.
- **Er komen geen credits bij vóór de betaling.** De aanvraag gaat naar
  Helvaro, je krijgt een factuur, en pas als die betaald is staan de credits op
  je account — met een regel in het grootboek. Een saldo dat omhoog gaat voordat
  er betaald is, is een verzonnen saldo.


> **Actie:** maak in Airtable de tabel `credit_transactions` aan. De velden
> staan bovenaan `api/_ledger.js`. Zonder die tabel werkt alles gewoon door —
> credits worden geteld zoals altijd — maar dan blijft de geschiedenis leeg en
> zegt de pagina dat eerlijk.

- **Nieuwe pagina: Facturatie.** Je plan, hoeveel credits je nog hebt, waar ze
  heen gingen en elke boeking op een rij. Alles uit je eigen gegevens; er staat
  geen enkel geschat getal op.
- **Credits zijn een grootboek geworden.** Het was een teller: "1240
  verbruikt", zonder dat ergens stond waaraan. Nu is elke beweging een regel
  met datum, reden en bedrag — toewijzing, verbruik, aankoop, terugbetaling of
  correctie.
- **Een mislukte actie kan terugbetaald worden.** Dat kon niet: je kon een
  getal verlagen, maar niet uitleggen waarom. Een terugbetaling zonder reden
  wordt geweigerd, want juist als een klant ernaar vraagt moet je hem kunnen
  navertellen.
- **Twee keer betalen voor één actie kan niet meer.** Een boeking kan een
  referentie meekrijgen; dezelfde referentie tweemaal is één boeking. Dat is
  wat een herhaalde aanroep na een time-out onschadelijk maakt.
- **Credits bijkopen en van plan wisselen** openen een mail aan Helvaro. Er
  hangt nog geen betaalprovider aan, en een betaalknop die niet werkt is erger
  dan een mailtje dat aankomt.

### Cijfers die eerlijk moeten zijn

- **"Omzet Doel" op het dashboard telde je pipeline op, geen omzet.** Bij elf
  leads stond er "€ 4.570.000 — 76% van doel bereikt", en dat las als "Helvaro
  heeft vier en een half miljoen voor je verdiend". Het is de verwachte waarde
  van je gekwalificeerde leads. De kaart heet nu **Pipeline Doel** en zegt
  eronder wat het getal is.

### Inloggen

- **Een nieuwe klant kon zich niet aanmelden als Clerk niet laadde.** Registreren
  liep volledig via Clerk, en de knop ernaartoe werd pas gemaakt nádat Clerk
  geladen was. Laadde die niet — geblokkeerd script, storing, DNS — dan zag een
  bezoeker alleen een inlogformulier en geen enkele aanwijzing waar hij heen
  moest. Er staat nu altijd "Account aanmaken" onder het formulier, met drie
  eerlijke antwoorden: het registratiescherm als Clerk er is, een melding als
  hij hoort te werken maar niet laadt, en anders een e-mailadres.
- **De thema-knop was onleesbaar op een telefoon.** Onder 900px vallen de
  panelen onder elkaar en landt die knop op het witte formulierpaneel, terwijl
  zijn kleuren uit het donkere thema kwamen: 2,05:1, oftewel lichtgrijs op wit.
  Nu 16,32:1.

- **Wisselen van "Inloggen" naar "Account aanmaken" gaf een leeg vak.** Het
  formulier verdween en er kwam niets voor in de plaats — je kon je alleen nog
  registreren door de pagina te verversen. Oorzaak: het inlogvak werd
  leeggemaakt en opnieuw aan Clerk gegeven, en die weigert dan stilzwijgend een
  tweede keer te tekenen. Nu krijgt hij elke keer een vers vak. En blijft het
  onverhoopt tóch leeg, dan staat er voortaan een zin die zegt wat je kunt doen
  in plaats van een wit vlak.

### Afspraken

- **Klikken op een dag in de kalender boekte de dag ervóór.** Klikte je op
  vrijdag, dan opende het boekvenster op donderdag. De datum werd naar UTC
  omgerekend, en middernacht in België is in UTC de vorige dag. Bij "vandaag"
  viel het niet op omdat die datum verderop toch naar vandaag werd
  teruggezet — wat het juist gevaarlijker maakte: de fout dook alleen op bij
  de andere zes dagen van de week.

- **Het boekingsvenster bood tijden aan waar je al een afspraak had.** De
  kalender toonde de vergaderingen uit je eigen Google-agenda wél, maar het
  venster "Afspraak inplannen" rekende alleen met wat Helvaro zelf geboekt
  had. Op hetzelfde scherm stond dus een bezet halfuur in het raster én
  hetzelfde halfuur als vrij in de lijst — en boekte je eroverheen. Nu telt je
  echte agenda mee. Een dagvullend item (verlof, een verjaardag) zet de dag
  niet dicht, want dat is geen bezet halfuur.

### Kleine dingen die iedereen raakten

- **Het inlogscherm heeft een thema-knop.** Wie in de app naar licht was
  geswitcht kreeg die keuze wel terug op het inlogscherm, maar kon er niets aan
  veranderen tot na het inloggen. De knop staat nu rechtsboven.
- **De demo-chat op het inlogscherm was in het lichte thema onleesbaar.** De
  ballonnen hadden een vaste bijna-witte tekstkleur op een wit paneel. Dat viel
  nooit op omdat je daar geen thema kon wisselen; nu dat wel kan, is het
  gemeten en rechtgezet — 16:1 in plaats van onzichtbaar.
- **De paginatitels waren niet consistent.** Een punt op de ene pagina, een
  puntje op de andere, en het contactformulier heette letterlijk "Mathis van
  Helvaro. neem contact op". Overal nu hetzelfde scheidingsteken, en het
  formulier heet "<naam> van <kantoor> · Contact".
- **Het publieke contactformulier had geen kop.** Voor een zoekmachine en voor
  een schermlezer begon die pagina met niets. De naam van je assistent is nu de
  kop; er verandert visueel niets aan.

- **Elke sessie haalde een 404 op.** De mascotte-afbeelding staat in de HTML,
  maar `public/faro/` bestaat niet in deze repo. De code ving dat netjes af en
  viel terug op de CSS-bol -- alleen pas NA de mislukte request, dus iedere
  klant deed bij elk bezoek een verzoek dat nooit iets kon opleveren. De bol is
  nu meteen de mascotte; zet `FARO_MASCOT_ASSETS` op true zodra de bestanden er
  wel zijn.

### Video

- **De standaard hangt niet meer aan Sora.** OpenAI haalt die API op 24
  september weg en heeft geen opvolger aangekondigd. De standaard staat nu op
  Kling, met Runway als goedkope laag; allebei kunnen ze een FOTO van het pand
  animeren, wat hier zwaarder weegt dan de prijs -- tekst-naar-video verzint een
  huis, en een huis dat niet bestaat verkoopt niemand.
- **Alles rond de leverancier is nu wel gebouwd en getest.** De job, de
  duur- en formaatgrenzen, het pollen, en de controle dat een job van jou is.
  Dat laatste is geen formaliteit: een job-id staat in een poll-URL in de
  browser, dus het is geen bewijs van eigendom. Een job van een andere klant
  geeft nu hetzelfde antwoord als een job die niet bestaat.
- **Actie:** de koppeling met Kling of Runway zelf is NIET geschreven, en dat
  weigert met een duidelijke melding in plaats van te gokken. Ik kon hun
  documentatie niet lezen vanaf deze machine, en een adapter die eruitziet als
  de echte maar net andere veldnamen gebruikt faalt pas bij je eerste klant.
  Nodig: `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` (of `RUNWAY_API_KEY`), plus
  hun API-documentatie.

### Alles vragen in plaats van klikken

- **Faro kan nu ook dingen VERANDEREN in je CRM.** Hij kon lezen, berichten
  sturen en beeld maken, maar een lead verplaatsen of een instelling aanpassen
  moest je zelf gaan aanklikken. Nu kan het gevraagd worden: een lead op
  gewonnen of verloren zetten (met reden), er een notitie bij schrijven, hem
  verwijderen, en de stem van de WhatsApp-AI bijstellen -- naam,
  welkomstbericht, instructies, werkuren, formuliertekst.
- **Alles gaat door dezelfde bevestigingskaart als altijd.** De AI stelt voor,
  jij klikt, pas dan gebeurt er iets. De kaart toont ook de nieuwe waarde en
  niet alleen de veldnaam: "AI-naam wordt aangepast" laat je klikken zonder te
  weten waarin.
- **Notities worden toegevoegd, nooit overschreven.** In dat veld zit ook de
  vlag die zegt dat de AI voor deze lead gepauzeerd is; overschrijven zou de AI
  ongemerkt weer laten antwoorden op een lead die een mens had overgenomen.
- **Faro mag de stem aanpassen, niet de rekening.** Plan, creditlimiet en
  projectcode staan niet in de lijst velden die hij kan raken.
- **Een afspraak verzetten of afzeggen kan ook via de chat.** Bij afzeggen zegt
  hij er expliciet bij dat de lead GEEN bericht krijgt, en biedt hij aan er een
  te sturen. Wie denkt dat afzeggen ook afmeldt, laat iemand voor een dichte
  deur staan.

### Prijsadvies

- **Faro kan nu een vraagprijs adviseren.** Vraag "wat kan ik vragen voor een
  woning in Gent met 3 slaapkamers" en hij rekent het uit over de budgetten die
  je eigen leads noemden: mediaan, spreiding, en een advies op het 75e
  percentiel. Niet de mediaan, want op de mediaan prijzen betekent dat de helft
  van je geinteresseerden je pand per definitie te duur vindt.
- **Hij zegt er altijd bij wat het NIET is.** Helvaro heeft geen
  verkoopcijfers; het heeft wat kopers in gesprekken zeggen te willen betalen.
  Dat is bruikbaar en zeldzaam, maar het is geen marktwaarde, en elk antwoord
  noemt die grens. Onder acht budgetten geeft hij bewust geen prijs: "te weinig
  om op te sturen" is dan het eerlijke antwoord.
- **Een uitschieter kantelt het advies niet.** Een lead die 3 miljoen noemt
  tilt een gemiddelde over de kop; de mediaan niet. Ligt het gemiddelde ver
  boven de mediaan, dan zegt hij dat er los bij.

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
  van élke klant. De navigatieknoppen zijn eruit.

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
<!-- changelog-tot: b1204b9 -->
