# Changelog

Wat er in Helvaro verandert, en wat het voor jou betekent. Nieuwste bovenaan.

Dit is geen lijst van commits — die staan in git. Hier staat wat er anders is
aan het product, waarom, en of jij er iets voor moet doen. Elke regel die met
**Actie:** begint vraagt iets van jou; de rest is puur ter kennisgeving.

Conventies staan in `CLAUDE.md` en `scripts/changelog.js` maakt een nieuw
kopje aan. Ongereleasede wijzigingen staan onder *Nog niet uitgerold*, want de
enige eerlijke datum voor "uitgerold" is de dag dat `main` deployt.

---

## Nog niet uitgerold

> **Actie voor jou — twee dingen, allebei één keer.**
>
> 1. Zet in Vercel de variabele **`STRIPE_WEBHOOK_SECRET`** (Production) en
>    deploy opnieuw. De waarde staat in Stripe bij de webhook naar
>    `app.helvaro.pro/api/stripe` ("Signing secret", begint met `whsec_`) — die
>    hoort niet in dit bestand, want dit bestand staat in git. Zolang de
>    variabele ontbreekt weigert de webhook elke melding van Stripe: de klant
>    betaalt en krijgt geen credits.
> 2. Zet in Stripe het **klantportaal** aan: Instellingen > Facturatie >
>    Klantportaal, instellingen bewaren. Dat maakt de standaardconfiguratie aan.
>    Zonder die ene handeling weigert Stripe élke portaalsessie, dus "Beheer
>    abonnement" werkt voor niemand.

**Nieuwe pagina: Kosten (alleen voor jou)**

- **Wat Helvaro zelf betaalt, per dienst.** Tot nu stond dat als één getal op de
  Founder-pagina — `-€58` — ingetypt in een prompt en bewaard in je browser. Dus
  onzichtbaar op je telefoon, weg zodra je je browser leegde, en door niemand na
  te rekenen. De nieuwe pagina leest het uit de echte instellingen: welke
  diensten draaien, wat ze kosten, en waar dat bedrag vandaan komt.
- **Vercel Pro en Airtable Team staan erin** met hun gepubliceerde tarief
  ($20 per teamlid en $24 per plek per maand). Betaal je Airtable per jaar, dan
  is het $20 — zie hieronder hoe je je eigen bedrag invult.
- **Bij elk bedrag staat de herkomst.** *Lijstprijs* (wat de leverancier
  publiceert), *ingevuld* (jouw eigen bedrag, dat wint altijd) of *nog invullen*.
  Een dienst waarvan we de prijs niet kennen krijgt géén nul: hij telt niet mee
  in het totaal en staat apart vermeld. Een kostenoverzicht dat onbekende posten
  stilletjes op nul zet, is precies het overzicht dat je te rooskleurig
  voorspiegelt.
- **Er staat geen nettowinst zolang een bedrag ontbreekt.** Liever geen cijfer
  dan een winstcijfer dat een deel van je kosten niet kent.
- **Dollars en euro's worden niet zomaar opgeteld.** Er wordt geen koers
  verzonnen: de totalen staan per munt. Wil je één eurobedrag, zet dan
  `KOSTEN_USD_EUR` in Vercel op de koers die je zelf hanteert.
- **Je sleutels in één oogopslag.** Twintig omgevingsvariabelen met een groen of
  grijs bolletje: gezet of niet. De wáárden staan er bewust nooit bij, ook niet
  afgekort — dit scherm gaat over het netwerk en een sleutel hoort daar niet in.
  Zo zie je in één blik dat bijvoorbeeld `STRIPE_WEBHOOK_SECRET` nog ontbreekt.
- **Alleen jij ziet dit.** De pagina wordt uit de HTML van een klant geknipt,
  net als Klanten en Founder. Bij die twee stonden de paginatitels nog wél in de
  broncode van iedereen ("Founder — jouw startup"); die zijn nu ook weg.

**Smartlead erbij, en "hoeveel hebben we hier al aan uitgegeven"**

- **Smartlead staat nu in het overzicht.** Hij hangt aan geen enkele sleutel —
  Helvaro praat niet met Smartlead — en telt daarom altijd mee in plaats van als
  "staat uit" te verschijnen tussen de diensten die wél een sleutel missen.
- **Nieuw veld `Started On` in de tabel `costs`.** Vul daar in wanneer je een
  abonnement gestart bent, en de pagina rekent uit hoeveel keer er sindsdien
  betaald is en wat je er in totaal aan kwijt bent geweest. Bovenaan staat een
  vierde kaart met het totaal over alles.
- **Het telt BETALINGEN, geen maanden.** Een abonnement dat op 15 maart begon is
  die dag voor het eerst afgeschreven; op 20 maart heb je dus één keer betaald
  en niet nul keer. En op 14 april nog steeds één keer, want de tweede
  afschrijving is er dan nog niet geweest.
- **Een jaarbedrag wordt niet twaalf keer geteld.** Drie jaarbetalingen van €120
  is €360, niet 36 × €10. Per maand blijft het gewoon €10 — dat is een ander
  getal en het blijft een ander getal.
- **Geen startdatum, geen totaal.** Diensten zonder datum verdwijnen niet
  stilzwijgend als nul in de som: ze worden bij naam genoemd onder de kaart.

> **Actie voor jou:** vul in `costs` bij elke dienst **Started On** in (de datum
> van je eerste afschrijving) en het bedrag. Vanaf dat moment klopt het totaal.

**Alle elf diensten staan nu in `costs`, allemaal per maand**

- **Elke dienst heeft nu een regel**: Vercel, Airtable, Clerk, Upstash, Meta,
  Anthropic, OpenAI, Kling, Stripe, e-mail en het domein. Allemaal op
  **maand** — zoals je zei dat je betaalt — met de munt ingevuld en een
  notitie die zegt wat er in Amount hoort. Alleen het bedrag is nog leeg.
- **Kling stond er nog niet bij** en is toegevoegd.
- **Het domein stond op jaar** en staat nu ook op maand. Betaal je je domein
  toch per jaar, zet Interval dan terug op `jaar`; dan wordt het bedrag door
  twaalf gedeeld.
- **Meta staat op maand** (je maandfactuur). Wil je het per bericht laten
  uitrekenen, zet Interval dan op `bericht` en Amount op je tarief per
  sjabloonbericht — dat blijft gewoon werken.
- **Zit je bij Clerk of Upstash nog in de gratis laag? Zet daar `0`.** Dan telt
  de dienst als bekend in plaats van als "nog invullen" — en zolang er nog iets
  op "nog invullen" staat, toont de pagina bewust geen nettowinst.

**Meta erbij, en die rekent anders**

- **Meta factureert per verstuurd sjabloonbericht**, niet per maand — een
  gesprek dat de lead zélf begint is gratis. De Kosten-pagina kan daar nu mee
  rekenen: zet je tarief per bericht in de tabel `costs` (Service `whatsapp`,
  Interval `bericht`) en het maandbedrag volgt uit het aantal dat de pagina
  telt.
- **Geteld wordt alleen wat écht in je records staat:** afspraakherinneringen
  laten `Reminder Sent` achter op de afspraak, dus die zijn te tellen. Opvolg-
  en introberichten laten geen eigen markering achter — die staan er dus níét
  bij, en dat zegt de pagina er ook bij in plaats van het verschil weg te
  rekenen.
- **Kennen we het aantal niet, dan komt er geen bedrag.** Een tarief per bericht
  maal een onbekend aantal gaf eerst netjes "€ 0,00 per maand" — een dienst
  waarvan je het volume niet kent die eruitziet alsof hij gratis is. Nu blijft
  het leeg.
- **Verbruik telt nu ook echt ergens op.** Vulde je een Meta-factuur in, dan
  stond die wel op het scherm maar in geen enkel totaal. Er staat nu een regel
  "bekend verbruik samen", en dat bedrag gaat mee in de nettowinst.
- **Een ingevuld bedrag telt altijd mee**, ook als de bijbehorende sleutel hier
  niet gelezen kan worden. Jij hebt de factuur; die weegt zwaarder dan een
  omgevingsvariabele.

> **Actie voor jou, optioneel:** in Airtable staat een nieuwe tabel **`costs`**.
> Vul daar een regel per dienst in met je échte factuurbedrag (`Service` moet
> `vercel`, `airtable`, `domein`, … zijn) en de pagina rekent daarmee in plaats
> van met de lijstprijs. Laat je hem leeg, dan blijven de lijstprijzen staan.
>
> **Dat is nu al voor je klaargezet.** In `costs` staat voor Vercel, Airtable,
> Meta, Anthropic, OpenAI en het domein al een regel met de juiste munt, het
> juiste interval en een notitie erbij — alleen **Amount** is leeg. Je hoeft er
> dus enkel een getal in te typen. Zolang dat leeg blijft verandert er niets:
> de lijstprijzen blijven gelden. De keuze `bericht` bij Interval staat er ook
> in, dus Meta kan meteen op een tarief per sjabloonbericht.

**Het inlogscherm liet eerst het verkeerde formulier zien**

- **Twee inlogschermen na elkaar, op dezelfde plek.** De pagina opende met ons
  eigen e-mail-en-wachtwoordformulier, en een seconde later kwam dat van Clerk
  eroverheen. Wie meteen begon te typen was zijn invoer kwijt. De server weet al
  of Clerk aanstaat, dus staat er nu meteen een plaatshouder in de vorm van het
  formulier dat komt - en het eigen formulier blijft weg zolang Clerk verwacht
  wordt. Gemeten in Chromium: 200 ms na het openen staat er geen eigen formulier
  meer, alleen de plaatshouder.
- **Het vangnet is er nog, en op meer paden dan eerst.** Laadt Clerk niet - een
  geblokkeerd script, een storing, of een verbinding die blijft hangen zonder
  ooit te antwoorden - dan komt het eigen inlogformulier gewoon terug. Dat
  laatste geval was nieuw: er zat geen tijdslimiet op, dus een hangend script
  liet je eeuwig naar een ladend scherm kijken. Nu tien seconden, en daarna het
  eigen formulier.
- **De diavoorstelling rechts stond stil.** Op precies het scherm dat iedereen
  ziet: met Clerk aan werd hij nooit gestart, dus bleef de merkkant op dia 1
  hangen mét bolletjes die suggereren dat er meer komt.
- **Een verlopen sessie gaf een scherm zonder inlogveld.** Bij een 401 werd het
  loginscherm getoond en de cursor in het e-mailveld gezet - een veld dat er met
  Clerk niet is. Nu wordt Clerks inlogkaart opnieuw getoond.
- Alle dertien pagina's van de app zijn erna in Chromium nagelopen: geen enkele
  JavaScript-fout, elke pagina rendert.

**Stripe staat nu echt aangesloten**

- **De webhook bestond nog helemaal niet.** Er stond nul webhooks op de
  Stripe-account. Betalen werkte dus wél, maar er kwam daarna niets terug: geen
  credits, geen plan, geen opzegging die aankomt. Er staat er nu één naar
  `https://app.helvaro.pro/api/stripe`, ingeschakeld, voor
  `checkout.session.completed`, `invoice.paid` en
  `customer.subscription.deleted`.
- **"Beheer abonnement" gaf een foutmelding die nergens over ging.** Het
  klantportaal van Stripe was nooit geactiveerd. De klant las "probeer het zo
  meteen opnieuw" bij iets dat zo meteen precies even goed werkt als nu. Hij
  leest nu dat het portaal nog niet aanstaat en dat zijn abonnement gewoon
  doorloopt — en in het log staat exact welke Stripe-instelling ontbreekt.
- **`node scripts/preflight.js` kijkt dit voortaan bij Stripe zelf na.** Niet of
  de sleutel de juiste vorm heeft — dat bewees niets — maar of er echt een
  ingeschakelde webhook naar ons wijst, of hij naar de juiste gebeurtenissen
  luistert, en of het klantportaal bestaat. Ontbreekt er iets, dan faalt hij
  hard, mét de handeling die het oplost.

> **Actie voor jou: geen meer.** De drie Airtable-dingen die hier stonden zijn
> aangemaakt — `Credit Purchased` (Client Config), `Opted Out` (Leads) en de
> tabel `campaigns`. Je hoeft in Airtable niets meer te doen.

**Gevonden in de echte productiebase**

- **"Verloren" markeren mislukte, en sleurde je notities mee.** De statuslijst in
  Airtable kende alleen Nieuw, In behandeling en Gewonnen — de status *Verloren*
  bestond daar niet. Airtable weigert bij een onbekende keuze de **hele**
  opslagactie, dus als je in hetzelfde scherm ook een notitie of dealwaarde had
  ingevuld, was die óók weg. Je zag alleen "Opslaan mislukt". Dit werkt nu, en
  de fout in het log zegt voortaan wélk veld weigerde.
- **De omschrijving van het creditveld klopte niet meer.** Er stond nog
  Starter=2000 en Growth=5000, terwijl de prijspagina en de code 3.000 en 10.000
  zeggen. Rechtgezet in Airtable zelf.


> **Actie voor jou, en dit is er nu twee.** Maak op de **Leads**-tabel een veld
> **`Opted Out`** aan, type **Checkbox**. En op **Client Config** het veld
> **`Credit Purchased`**, type **Number** (dat stond er al). `node
> scripts/preflight.js` faalt hard op allebei.

**Spraakberichten kunnen nu echt gelezen worden**

- **Optioneel, en standaard uit.** Zet `WHATSAPP_TRANSCRIBE=1` in Vercel en de
  AI schrijft ingesproken berichten automatisch uit, in plaats van te vragen of
  de lead het wil typen. Het kost ongeveer een halve cent per spraakbericht en
  dat zit niet in de creditprijs — vandaar dat jij het aanzet en niet ik.
- **Waarom het de moeite waard is:** iemand die net zijn hele situatie heeft
  ingesproken en dan te horen krijgt "kan je dat typen", is precies het moment
  waarop een lead afhaakt. Zeker bij oudere kopers, die vaker inspreken dan
  typen.
- Lukt het uitschrijven niet, dan gebeurt er precies wat er nu gebeurt: de AI
  zegt vriendelijk dat hij het niet kan beluisteren. Er is geen situatie waarin
  dit iets stukmaakt.

**Campagnes**

- **Campagnes zeiden "nog niet aangesloten" en doen nu het werk dat kan.** Je
  vraagt de AI een campagne rond een pand, hij maakt hem aan met de leads die
  je koos, en hij vertelt je hoeveel er afvielen en waarom. Afgemelde leads
  gaan er automatisch uit, en leads van een ander kantoor komen er niet in.
- **Wat nog NIET kan: versturen.** Een campagnebericht valt vrijwel altijd
  buiten het 24-uursvenster van WhatsApp — dat is nu juist waarom je een
  campagne doet — en dan staat Meta alleen een goedgekeurde template toe. Die
  goedkeuring moet er eerst komen. De campagne staat tot dan op *klaar voor
  verzending* en de AI zegt er met zoveel woorden bij dat er niets verstuurd is.
- **Optioneel:** wil je dit gebruiken, maak dan een tabel **`campaigns`** aan in
  Airtable. Zolang die er niet is, zegt de AI eerlijk dat campagnes uitstaan in
  plaats van een fout te geven.

**Afmelden — dit bestond helemaal niet**

- **Een lead die "STOP" stuurde kreeg gewoon antwoord, en de dag erna weer een
  opvolging.** Er was geen enkele afmeldweg. Dat is niet alleen vervelend: het
  is tegen het beleid van WhatsApp (en het nummer is voorlopig gedeeld, dus één
  klant die dit fout doet raakt alle klanten), en "STOP" is in AVG-termen
  gewoon bezwaar — dan hoort het te stoppen.
- **Nu:** de AI herkent een afmelding in het Nederlands, Frans, Engels, Duits,
  Spaans en Italiaans, stuurt één korte bevestiging, en daarna gaat er niets
  meer naartoe — geen opvolging, geen herinnering, geen campagne. Jij krijgt
  bericht met het nummer, zodat je hem desnoods nog kunt bellen.
- **Wat bewust NIET als afmelding telt:** "stop me maar een berichtje als er
  iets nieuws is" of "ik wil geen reclame maar wel info over dit pand". Een te
  gretige afmelding kost je een lead die juist interesse had, en die krijg je
  niet terug — een gemiste afmelding typt iemand nog wel een tweede keer.


**Het scherm zei dingen die niet waar waren**

- **De filters op de exportpagina deden niets.** Je koos "laatste 7 dagen,
  alleen gekwalificeerd", het scherm zei "4 leads geselecteerd", je klikte
  downloaden — en kreeg alle 380. De filters pasten alleen de voorbeeldweergave
  aan en gingen nooit mee naar de server. Nu bevat het bestand precies wat je
  aanvinkte.
- **"Afspraak resultaat" kon mislukken zonder dat je het zag.** De knop meldde
  succes en het scherm was al bijgewerkt, ook als het opslaan stukliep. Dat is
  het veld waar je omzet- en opkomstcijfers op Analyse uit gerekend worden. Nu
  krijg je een echte foutmelding en springt de knop terug.
- **"Google Agenda ontkoppelen" meldde altijd dat het gelukt was**, ook als het
  mislukte. Je koppeling was dan nog gewoon actief.
- **De Kalender feliciteerde een nieuwe klant** met "Alle gekwalificeerde leads
  hebben een afspraak!" terwijl hij er nul had.
- **De pagina Gesprekken was een dubbele doodlopende weg** voor een nieuwe
  klant: links "Geen gesprekken gevonden", rechts "Selecteer een gesprek", en
  nergens een aanwijzing. Nu staat er wat er moet gebeuren, met de knop om je
  formulierlink te kopiëren.

**De AI en de agenda**

- **Twee snel achter elkaar getypte berichten raakten er één kwijt.** Zo typen
  mensen op WhatsApp: "hey", en vijf tellen later de echte vraag. Beide beurten
  lazen dezelfde gespreksgeschiedenis, antwoordden apart, en de laatste schreef
  over de andere heen. De lead kreeg twee antwoorden op een gesprek dat geen van
  beide heel gezien had, en één beurt was voorgoed weg. Dezelfde fout kon twee
  afspraken voor één lead maken. Berichten van hetzelfde gesprek gaan nu netjes
  achter elkaar; verschillende leads houden elkaar niet op.
- **Een verzonnen tijdstip kon een afspraak maken die nergens op sloeg.** Gaf het
  AI-model "morgen om 14u" terug in plaats van een echte datum, dan glipte dat
  langs de dubbelboekingscontrole heen (die rekent dan met een onleesbare datum
  en vergelijkt dus nooit iets), kwam er een afspraak met een kapot nummer in de
  agenda, en las de lead een keurige bevestiging voor "morgen om 14u". Nu wordt
  zo'n tijdstip geweigerd, krijg jij bericht, en wordt de lead om een echt
  moment gevraagd. Een duur van meer dan vier uur of minder dan vijf minuten kan
  ook niet meer.
- **Het storingsbericht was altijd Nederlands.** Precies het ene bericht dat
  gegarandeerd aankomt als er iets stuk is, ging in het Nederlands naar een
  Franse of Duitse lead. Nu in hun eigen taal, of anders in het Engels.
- **Een spraakbericht of foto kreeg totale stilte.** Geen antwoord, geen regel in
  het gesprek, geen spoor op je dashboard — voor de lead leek het alsof je
  gestopt was met antwoorden. De AI zegt nu vriendelijk dat hij het niet kan
  beluisteren en vraagt of de lead het wil typen, in diens eigen taal, en jij
  ziet het bericht gewoon staan.

## 23 augustus 2026 — geld, agenda en internationaal (uitgerold)

> **Actie voor jou, en dit kost anders geld.** Maak op **Client Config** een veld
> **`Credit Purchased`** aan, type **Number**. Zonder dat veld verdwijnt het deel
> van een bijkoop dat groter is dan wat de klant al verbruikt had — hij betaalt
> en krijgt het niet. `node scripts/preflight.js` faalt hier nu hard op.
>
> Optioneel, voor klanten buiten België: de velden **`Country`** (bv. `GB`),
> **`Timezone`**, **`Currency`** en **`Locale`**. Laat je ze leeg, dan blijft
> alles precies zoals het nu is.

**Geld**

- **Bijgekochte credits verdwenen gedeeltelijk, en soms helemaal.** Bijkopen
  verlaagde de verbruiksteller in plaats van een saldo op te bouwen. Wie 400
  credits verbruikt had en er 6.000 bijkocht, kreeg er 400. Wie net een nieuwe
  periode in was en 6.000 kocht, kreeg er **nul**. En wat er wél bij kwam
  verdween bij de maandelijkse reset. Nu is bijgekocht een eigen saldo dat
  optelt bij je maandlimiet en de reset overleeft.
- **Een opgezegde klant kon eindeloos blijven verbruiken.** Bij opzeggen ging
  alleen de status om; de creditlimiet bleef staan en reset zichzelf elke dertig
  dagen. Een opgezegd account hield dus maandelijks zijn volle limiet aan
  beeldgeneratie, video en AI-chat — bij nul omzet. Nu gaat dat dicht.
  Leadgesprekken blijven wél doorlopen: dat is de lead zijn schuld niet.
- **Een gesprek werd meermaals afgeschreven tijdens een storing.** De twintig
  credits van een leadgesprek werden geboekt vóór het bericht verstuurd was, en
  de gespreksgeschiedenis wordt alleen bewaard als het antwoord aankwam. Tijdens
  een WhatsApp-storing werd hetzelfde gesprek daardoor bij elk bericht opnieuw
  geboekt. Nu telt één gesprek één keer, wat er ook misgaat.
- **"Limiet bereikt" stuurde je niet meer naar Helvaro toe.** Die melding zei
  "neem contact op om je limiet te verhogen". Nu wijst hij naar de knop waarmee
  je zelf bijkoopt.

**Internationaal**

- **Werkuren stonden op de Brusselse klok, voor iedereen.** Een kantoor in
  Londen was volgens ons open van 08:00 tot 16:00 hun tijd; in Dubai liep het
  drie uur uit de pas. De AI zei dan "we zijn gesloten" midden op de werkdag.
  Nu telt de klok van de klant zelf.
- **Een buitenlands telefoonnummer werd een Belgisch nummer dat niet bestaat.**
  `07700 900123` (Brits) werd `+32 7700900123`. Het bericht ging nergens heen,
  zonder foutmelding. Nu wordt de landcode van de klant gebruikt.
- **Prijzen, datums en tijden volgen nu land en munt van de klant** in plaats van
  altijd euro met Belgische opmaak.
- **Openingsuren worden nu ook in het Frans en het Duits gelezen** (`lun-ven`,
  `mo-fr`). Die vielen eerder terug op "altijd open".

**De lead**

- **Een afspraak die niet opgeslagen kon worden, ging stil verloren.** De AI had
  de lead al "ingepland, tot dan" geschreven; mislukte het wegschrijven daarna,
  dan stond er niets in de agenda en wist niemand het. Nu wordt de lead
  rechtgezet en krijg jij meteen bericht.
- **Een stukgelopen stuurblok kon in het bericht van de lead belanden.** Schreef
  het AI-model onbedoeld ongeldige JSON, dan las de lead letterlijk
  `DECISION:{"qualified":true...}` in zijn WhatsApp. Dat kan nu niet meer,
  ongeacht wat er misgaat.
- **Een lead kan nu zelf afzeggen via WhatsApp.** Zegt hij "ik kan niet komen",
  "ik ben ziek" of "kan het een andere keer", dan haalt de AI de afspraak uit je
  agenda, zet hem op geannuleerd, en vraagt meteen wanneer het wel past. Jij
  krijgt op hetzelfde moment een bericht met wie het is, wanneer het stond en wat
  hij als reden gaf. Daarvoor bleef zo'n afspraak gewoon staan tot je hem zelf
  opmerkte — en hield je een uur vrij voor iemand die niet kwam.
- **Afzeggen deed maar de helft.** Vroeg je Faro om een afspraak af te zeggen,
  dan verdween het item uit Google maar bleef de afspraak in Helvaro op
  "geboekt" staan. Gevolg: de lead kreeg 24 uur van tevoren nog netjes een
  herinnering voor een afspraak die niet meer bestond. Nu gaan de agenda, de
  afspraak, en de lead zelf in één keer mee. Dat geldt ook voor afzeggen vanaf de
  Kalender-pagina.
- **Een afgezegde lead kan weer een nieuwe afspraak maken.** Er stond een rem op
  die voorkomt dat er twee keer geboekt wordt, en die bleef na een afzegging
  staan — waardoor de AI voor die lead nooit meer iets kon inplannen. De stilste
  van de vier fouten hierboven, en de duurste.
- **Verzetten waarschuwt de lead over de nieuwe tijd.** De herinnering ging
  eerder uit van de oude afspraak en werd daarna nooit meer verstuurd.


- **Twee snel achter elkaar getypte berichten raakten er één kwijt.** Zo typen
  mensen op WhatsApp: "hey", en vijf tellen later de echte vraag. Beide beurten
  lazen dezelfde gespreksgeschiedenis, antwoordden apart, en de laatste schreef
  over de andere heen. De lead kreeg twee antwoorden op een gesprek dat geen van
  beide heel gezien had, en één beurt was voorgoed weg. Dezelfde fout kon twee
  afspraken voor één lead maken. Berichten van hetzelfde gesprek gaan nu netjes
  achter elkaar; verschillende leads houden elkaar niet op.
- **Een verzonnen tijdstip kon een afspraak maken die nergens op sloeg.** Gaf het
  AI-model "morgen om 14u" terug in plaats van een echte datum, dan glipte dat
  langs de dubbelboekingscontrole heen (die rekent dan met een onleesbare datum
  en vergelijkt dus nooit iets), kwam er een afspraak met een kapot nummer in de
  agenda, en las de lead een keurige bevestiging voor "morgen om 14u". Nu wordt
  zo'n tijdstip geweigerd, krijg jij bericht, en wordt de lead om een echt
  moment gevraagd. Een duur van meer dan vier uur of minder dan vijf minuten kan
  ook niet meer.
- **Het storingsbericht was altijd Nederlands.** Precies het ene bericht dat
  gegarandeerd aankomt als er iets stuk is, ging in het Nederlands naar een
  Franse of Duitse lead. Nu in hun eigen taal, of anders in het Engels.
- **Een spraakbericht of foto kreeg totale stilte.** Geen antwoord, geen regel in
  het gesprek, geen spoor op je dashboard — voor de lead leek het alsof je
  gestopt was met antwoorden. De AI zegt nu vriendelijk dat hij het niet kan
  beluisteren en vraagt of de lead het wil typen, in diens eigen taal, en jij
  ziet het bericht gewoon staan.

## 22 augustus 2026 — video (uitgerold)

> **Actie voor jou, vóór je video aanzet.** Zet `KLING_ACCESS_KEY` en
> `KLING_SECRET_KEY` in Vercel en draai daarna één keer
> `node scripts/kling-check.js`. Dat stuurt één echte opdracht in (kost ongeveer
> een halve euro) en zegt per aanname of onze code klopt met Kling. Zolang je dat
> niet gedaan hebt, biedt de AI geen video aan en wordt er niets afgeschreven —
> dat is met opzet zo.

- **De AI kan nu een video van een pand maken.** Je vraagt het in de chat, je
  krijgt een kaartje met wat het kost, en pas als je op *Maken* klikt wordt de
  opdracht ingestuurd. Daarvoor zei hij "nog niet aangesloten".
- **Een mislukte video kost je niets.** Credits gaan er pas af op het moment dat
  de video echt klaar is — niet bij het insturen. Blijft hij hangen of faalt hij
  bij de leverancier, dan is er niets afgeschreven. Ook doorpollen (de app kijkt
  elke paar seconden of hij klaar is) boekt nooit een tweede keer.
- **Een video die niet meer past wordt geweigerd voordat hij besteld is.** Er
  werd eerder alleen gekeken óf je nog credits had, niet of je er genoeg had:
  met 40 credits over kon je een video van 300 starten. Nu zegt hij hoeveel je
  er nog hebt en hoeveel het kost.
- **`node scripts/preflight.js` vertelt in welke van de drie video-toestanden je
  staat**: uit (geen sleutels), aan maar nooit tegen de echte API gedraaid, of
  per ongeluk op het demo-model.

## 22 augustus 2026 — uitgerold

Alles onder dit kopje draait sinds vandaag in productie.

> **Actie voor jou, vóór je klanten binnenlaat.** In Vercel: `STRIPE_SECRET_KEY`,
> `STRIPE_WEBHOOK_SECRET` en `PUBLIC_SIGNUP_ENABLED=true`. In Stripe: één webhook
> naar `https://app.helvaro.pro/api/stripe` met `checkout.session.completed`,
> `invoice.paid` en `customer.subscription.deleted`. Producten of prijzen hoef je
> daar níét aan te maken — die komen uit de plantabel.
>
> Draai daarna `node scripts/preflight.js`. Er staat een nieuwe sectie *betalen*
> in die precies dit controleert.
>
> Doe eerst een testbetaling met kaart `4242 4242 4242 4242` voordat je op live
> sleutels overgaat: Stripe heeft nog nooit een echt verzoek van ons gezien.

> **Losse aandacht:** je eigen klantrij (HELVARO) staat nog op 2.000 credits,
> terwijl Starter er 3.000 zegt. Dat is data, geen code — ik heb hem niet
> aangepast.


### Wat er uit een klikronde over alle pagina's kwam

- **De omzetkaarten op Analyse waren 76px breed op een telefoon.** De tekst erin
  werd afgekapt. De regel die dat had moeten voorkomen stond er wél, maar op de
  verkeerde plek in het stijlblad en verloor daardoor.
- **Te snel klikken in Faro gaf "Er ging iets mis".** Dezelfde melding als bij
  een storing, met een knop "opnieuw proberen" die meteen weer faalde. Nu staat
  er dat je te snel gaat, en is die knop weg — even wachten is het enige dat
  helpt.

### "Verloren" en "gewonnen" betekenden allebei twee dingen

- **Zette je een lead op "Verloren", dan bleef zijn kaartje in Nieuw staan.** Het
  pipelinebord en de cijfers op Analyse gebruikten elk hun eigen definitie. Dat
  is nu één definitie, dus het bord en de cijfers kunnen niet meer verschillen.
- **De win rate telde leads als gewonnen die op het bord nog in "Afspraak"
  stonden.** Ook rechtgezet.
- Slepen werkt beide kanten op: een lead die je op verloren zette kun je gewoon
  terugslepen.


> **Actie:** zet vier variabelen in Vercel voordat je klanten binnenlaat.
> `STRIPE_SECRET_KEY` en `STRIPE_WEBHOOK_SECRET` (anders is er geen betaalweg),
> `PUBLIC_SIGNUP_ENABLED=true` (anders kan niemand zich zelf aanmelden), en
> controleer dat `CLERK_ENABLED` op `1` of `true` staat.
> Zet in Stripe één webhook naar `https://app.helvaro.pro/api/stripe` met de
> gebeurtenissen `checkout.session.completed`, `invoice.paid` en
> `customer.subscription.deleted`.

### Clerk was uitgeschakeld zonder dat iets dat zei

`CLERK_ENABLED` moest exact `1` zijn. Stond er `true` — de spelling die iedereen
intikt en die elke andere schakelaar hier ook accepteert — dan sliep Clerk, viel
het scherm terug op het oude wachtwoordformulier, en was er geen foutmelding,
geen waarschuwing en geen aanwijzing. De vlag leest nu ook `true`, `yes`, `on`
en `ja`, en `preflight.js` zegt voortaan welke waarde hij las.

### Wisselen naar "Account aanmaken" liet een leeg scherm achter

Klikte je op Account aanmaken, dan verdween het formulier en stond er "Het scherm
om te registreren kon niet geladen worden". Twee oorzaken:

Het knopje keek of Clerk er *al* was, maar Clerk laadt op de achtergrond terwijl
de knop er meteen staat. Wie binnen de eerste seconde klikte — het normale geval
— kreeg dus een fout voor iets dat een seconde later gewoon werkte. En het eigen
formulier werd verborgen vóórdat Clerk iets had getekend, dus lukte het niet,
dan was er niets om naar terug te vallen.

Nu wordt er gewacht tot Clerk klaar is, verdwijnt het formulier pas als er echt
iets staat, en komt het terug zodra dat niet zo is. Inloggen kan dus altijd, wat
Clerk ook doet.

### Het inlogscherm opnieuw ingedeeld

- Een schakelaar bovenaan met **Inloggen** en **Account aanmaken** naast elkaar.
  De weg naar binnen voor een nieuwe klant was het kleinste element op het
  scherm: een tekstlinkje onderaan, achter een middenpunt.
- Titel en ondertitel volgen de stand: "Welkom terug!" of "Begin vandaag".
- Een regel met wat je krijgt: 14 dagen gratis, geen kaart nodig, maandelijks
  opzegbaar.
- De rechterhelft blijft in beide thema's donker. Zette je het lichte thema aan,
  dan werd die helft wit en verdween de merkkant volledig.

### Zelf een abonnement afsluiten, zonder dat wij eraan te pas komen

Dit is het gat dat overbleef: een klant kon zich aanmelden en veertien dagen
proberen, en daarna hield het op. Betalend worden ging alleen doordat iemand met
de hand een plan en een creditlimiet invulde.

Op **Facturatie** staan nu de drie plannen. Kiezen, afrekenen bij Stripe, en het
plan én de creditlimiet staan goed voordat de klant terug is op het scherm.
Facturen, kaart wijzigen en opzeggen lopen via Stripe's eigen portaal — een
opzegknop die alleen bij ons werkt en niet bij Stripe laat iemand doorbetalen
terwijl hij denkt dat hij weg is.

**Actie:** "mail ons en wij zetten je account klaar" is weg van het inlogscherm.
Dat was handwerk per klant; wie zich 's avonds aanmeldde was de volgende ochtend
weg. Zet daarom `PUBLIC_SIGNUP_ENABLED=true`, anders is er geen weg naar binnen.

### De prijzen klopten niet met je eigen prijspagina

Alles stond verspreid: onboarding gaf **2.000** credits waar Starter **3.000**
zegt, dus elke nieuwe klant kreeg een derde te weinig. Er is nu één plantabel:
Starter € 249,99 / 3.000, Growth € 499 / 10.000, Scale € 799 / 20.000.

Het tarief voor bijgekochte credits volgt daaruit: **€ 0,0833 per credit**,
gelijk aan Starter. Het stond eerder op € 0,50 (zes keer te duur) en daarna op
€ 0,025 (drie keer te goedkoop) — allebei omdat het een los getal was dat
nergens uit volgde.

De volumebonus is eruit. Doorgerekend gaf die voor € 249,99 aan bijgekochte
credits er 3.151, terwijl Starter voor hetzelfde bedrag 3.000 geeft: bijkopen
was voordeliger dan een abonnement. Het scherm zegt nu juist dat een groter plan
meer geeft zodra dat zo is.

Ook: het Starter-plan stond op het scherm als "€ 250" in plaats van € 249,99.

### Betalen kan niet twee keer aankomen

Stripe stuurt een gebeurtenis opnieuw zodra hij geen bevestiging krijgt. Het
bijschrijven van credits werkte de teller bij vóórdat gecontroleerd werd of die
betaling al geboekt was — twee webhooks betekende dus twee keer credits voor één
betaling. De controle staat nu vooraan.

### Leesbaarheid: de vorige meting deugde niet

Eerlijk hierover, want alle eerdere uitspraken hierover hingen eraan. De vorige
controle mat veertien keer het **inlogscherm** in plaats van de pagina erachter,
en de meetmethode las de zijbalk als lichtblauw terwijl die donker is — goed
voor 23 tot 49 valse meldingen per pagina.

Opnieuw gemeten, met een methode die de hele achtergrondstapel doorrekent: over
alle veertien pagina's in beide thema's **twee echte fouten**, allebei hersteld.
Het rondje van een nog niet afgevinkte onboardingstap (2,95:1) en "Mijn profiel"
in de zijbalk in het lichte thema (3,99:1). Nu 6,40 en 5,15.

---

## 21 augustus 2026 — uitgerold

### Drie back-officeknoppen gaven een kale 500 na het weghalen van de VPS-variabelen

`PG_API_URL` en `PG_API_TOKEN` horen weg te zijn — dat token ging naar een
vrijgegeven IP-adres. Maar drie standen in de back-office (de contentlijst, een
post bijwerken, een beeld genereren) riepen de opgeheven VPS aan **zonder
foutafhandeling**. Zonder die variabelen gooide de aanroep, en Vercel gaf een
kale 500 zonder te zeggen waarom.

Ze antwoorden nu met "Deze functie hing aan de opgeheven VPS en is buiten
dienst." Dat is geen fout van jou en gaat ook niet over door het opnieuw te
proberen — dus een 503 met een reden in plaats van een crash. Alleen jouw eigen
back-office raakte dit; klanten hebben er nooit bij gekund.


### Bijgekochte credits kostten twintig keer te veel

Het tarief voor bijkopen stond op € 0,50 per credit. Een bijgekocht
leadgesprek (20 credits) kostte daarmee **€ 10**, terwijl datzelfde gesprek op
Starter € 1,49 kost. Dat getal was afgeleid uit een losse opmerking over
€ 1.000 per maand voor 2.000 credits; de prijspagina zegt € 149 voor 2.000.

Staat nu op **€ 0,025 per credit** — precies het overage-tarief dat al in
`CREDIT-SYSTEM-DESIGN.md` §4 stond: € 25 per 1.000 extra credits. Bijkopen en
je limiet overschrijden kosten nu hetzelfde, wat ook de bedoeling was: anders
is slordig zijn goedkoper dan netjes bijkopen.

Wat een klant nu ziet: € 25 → 1.000 credits → 50 gesprekken. € 500 → 22.000
credits (20.000 + 10% bonus) → 1.100 gesprekken. Je marge per bijgekocht
gesprek loopt van 40% (geen bonus) tot 31% (15% bonus); dunner dan een
abonnement, en dat staat nu uitgerekend bij de code.

> **Actie:** wil je een ander tarief of geen volumebonus, zet
> `CREDIT_TOPUP_RATE_EUR` in Vercel of zet de bonuspercentages in
> `api/_credits.js` op 0.

*Naschrift:* dit tarief is dezelfde dag nog aangepast. € 0,025 lag namelijk
onder je eigen planprijs, dus bijkopen werd goedkoper dan een abonnement — de
fout in de andere richting. Het staat nu op € 0,0833, gelijk aan Starter. Zie
"De prijzen klopten niet met je eigen prijspagina" hierboven.

Alles onder dit kopje staat sinds vandaag op `main` en draait in productie.

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
<!-- changelog-tot: b815cc7 -->
