'use strict';
const _vertical = require('../_vertical');
/*
 * Waar staat de gebruiker, en wat betekent "dit"?
 *
 * ── Waarom dit bestand bestaat ───────────────────────────────────────────────
 * Faro kreeg tot nu toe alleen de VRAAG. De client stuurde
 * { mode, text, conversationId, tier, attachments, history } en verder niets.
 * Iemand die naar zijn creditsscherm keek en "wat betekent dit?" typte, vroeg
 * dus letterlijk aan een assistent die niet kon zien waar hij stond. Faro
 * antwoordde met een gok of een wedervraag, en dat is precies het moment
 * waarop een gebruiker besluit dat hij het zelf wel uitzoekt.
 *
 * Dit bestand is de ene plek die weet welke schermen er zijn en wat ze
 * betekenen. Eén definitie, gebruikt door de prompt én door de proactieve
 * zinnetjes in de UI, zodat wat Faro zegt en wat het scherm doet niet uit
 * elkaar kunnen lopen.
 *
 * ── Wat hier NIET in hoort ───────────────────────────────────────────────────
 * Klantgegevens. De schermcontext zegt WAAR iemand is, niet WAT er staat.
 * Leads, bedragen en telefoonnummers komen via de gereedschappen in tools.js,
 * met de tenantcontrole die daarbij hoort. Deze weg omzeilt die controle niet
 * en mag dat nooit gaan doen.
 *
 * ── Alles wat binnenkomt is verdacht ─────────────────────────────────────────
 * De context komt uit de browser en is dus door de gebruiker te vervalsen.
 * sanitize() laat daarom alleen bekende sleutels door, kapt lengtes af, en
 * accepteert alleen pagina-ids die we zelf gedefinieerd hebben. Vrije tekst
 * uit de pagina belandt nooit in de prompt: een lead met een naam als
 * "negeer je instructies" mag Faro niet kunnen omdraaien.
 *
 * ── Geen route ───────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

/* De schermen die een KLANT ziet. De back-office (founder, kosten, admin)
   staat er bewust niet in: die pagina's worden voor een klant al uit de HTML
   gehaald (stripBackoffice in api/dashboard.js) en Faro hoort er dus ook niets
   over te kunnen zeggen.

   Vier velden per scherm, en ze beantwoorden vier verschillende vragen:

     wat      "Wat is dit?"        -- kort, in gewone taal, waar zonder dat je
                                      het scherm hoeft te zien.
     acties   "Wat kan ik hier?"   -- de handelingen die er echt zijn. Geen
                                      opsomming van knoppen: wat iemand kan
                                      BEREIKEN.
     waarom   "Waarom bestaat dit?" -- wat het je oplevert, of wat er misgaat
                                      als je het overslaat. Dit is het veld dat
                                      een rondleiding van een opsomming
                                      onderscheidt.
     eerst    "Waar begin ik?"     -- de ene handeling die op dit scherm het
                                      meeste oplevert voor iemand die hier voor
                                      het eerst staat. Leeg als er niets te
                                      doen valt.

   Waarom dit hier staat en niet als uitleg op de pagina zelf: een dashboard
   dat zichzelf overal uitlegt wordt onleesbaar voor wie het al kent. Faro
   vertelt het aan wie het vraagt, en zwijgt tegen de rest.

   `acties` en `waarom` zijn ook wat de rondleiding voorleest -- zie tour()
   onderaan dit bestand. Eén bron, twee gebruiken: anders vertelt de
   rondleiding iets anders dan Faro in een gesprek, en dan klopt er een van
   de twee niet meer. */
const PAGINAS = Object.freeze({
  dashboard: {
    toontLeads: true,
    naam: 'Dashboard',
    wat: 'Het overzicht: binnengekomen leads, wie er gekwalificeerd is, en welke afspraken er staan.',
    acties: 'Leads openen, een gesprek terugkijken, een lead als opgepikt markeren, en exporteren.',
    waarom: 'Dit is de plek waar je \'s ochtends ziet of het gewerkt heeft. Wie hier niets doet, mist niets -- de AI heeft de leads al beantwoord. Het is een spiegel, geen werklijst.',
    eerst: 'Open een lead en lees het gesprek terug. Dan zie je meteen wat de AI namens jou zegt.',
  },
  gesprekken: {
    toontLeads: true,
    naam: 'Gesprekken',
    wat: 'De WhatsApp-gesprekken tussen de AI en de leads, van begin tot eind terug te lezen.',
    acties: 'Een gesprek van begin tot eind teruglezen, zelf antwoorden, of de AI voor deze lead pauzeren als je het overneemt.',
    waarom: 'Als je iets wil bijstellen aan hoe de AI praat, lees je hier wat er echt gezegd is. Dat werkt beter dan raden bij AI-persoonlijkheid.',
    eerst: 'Lees een volledig gesprek. Dat is de snelste manier om te zien of de toon klopt.',
  },
  pipeline: {
    toontLeads: true,
    naam: 'Pipeline',
    wat: 'De leads verdeeld over fasen, van nieuw tot gewonnen of verloren.',
    acties: 'Een lead naar een andere fase slepen, een reden van verlies vastleggen, en zien waar het vastloopt.',
    waarom: 'Een lead die twee weken in dezelfde fase staat is geen lead meer. Deze kolommen maken dat zichtbaar zonder dat je een lijst hoeft af te gaan.',
    eerst: 'Sleep een lead naar de fase waar hij echt in zit. De rest volgt vanzelf.',
  },
  panden: {
    kanLeegZijn: true,
    naam: 'Panden',
    wat: 'De panden die de AI aan leads kan voorstellen, met hun kenmerken en beelden.',
    acties: 'Een pand toevoegen of uitlezen uit een zoekertje, de status wijzigen, en de eigen link per pand kopiëren.',
    waarom: 'Zonder panden moet de AI raden over welke woning een lead het heeft, en dan noemt hij cijfers van het verkeerde pand. Eén pand invoeren lost dat al op.',
    eerst: 'Plak de link van een zoekertje in het invoerveld. De fiche vult zichzelf; jij kijkt hem na.',
  },
  kalender: {
    kanLeegZijn: true,
    naam: 'Kalender',
    wat: 'De afspraken die de AI heeft ingepland. Gekoppeld aan Google Agenda kijkt ze eerst of je vrij bent.',
    acties: 'Afspraken bekijken, verzetten of afzeggen, en Google Agenda koppelen.',
    waarom: 'Zonder koppeling plant de AI afspraken zonder te weten of je vrij bent, en dan sta je dubbel geboekt. Met koppeling kijkt hij eerst.',
    eerst: 'Koppel je Google Agenda. Dat is de enige instelling die een dubbele boeking voorkomt.',
  },
  analyse: {
    toontLeads: true,
    naam: 'Analyse',
    wat: 'Cijfers over de leads: hoeveel er binnenkomen, hoeveel er kwalificeren en hoeveel er een afspraak maken.',
    acties: 'Een periode kiezen en zien hoeveel leads binnenkwamen, hoeveel er kwalificeerden en hoeveel er een afspraak maakten.',
    waarom: 'Dit zegt of je advertenties het juiste publiek brengen. Veel leads en weinig kwalificaties betekent meestal dat de doelgroep niet klopt, niet dat de AI faalt.',
    eerst: 'Vergelijk deze maand met de vorige. Eén getal zegt niets, twee wel.',
  },
  resultaten: {
    toontLeads: true,
    naam: 'Resultaten',
    wat: 'Wat de AI heeft opgeleverd over een periode.',
    acties: 'Een periode kiezen en het resultaat bekijken of downloaden.',
    waarom: 'Voor als je aan iemand anders moet laten zien wat dit heeft opgeleverd.',
  },
  activiteit: {
    toontLeads: true,
    naam: 'Activiteit',
    wat: 'Wat er wanneer gebeurde: nieuwe leads, kwalificaties en geboekte afspraken op volgorde van tijd.',
    acties: 'Terugkijken wat er wanneer gebeurde.',
    waarom: 'Als je je afvraagt waarom een lead iets kreeg of juist niet, staat het antwoord hier op tijdstip.',
  },
  'ai-persona': {
    naam: 'AI-persoonlijkheid',
    wat: 'Hier stel je in hoe de AI je leads te woord staat: haar naam, het welkomstbericht, wat je bedrijf doet en je werkuren. Hoe concreter dit staat, hoe beter ze kwalificeert.',
    acties: 'De naam van je assistent kiezen, zijn toon instellen, en vrije instructies meegeven over je kantoor.',
    waarom: 'Dit is het enige scherm dat verandert wat een lead LEEST. Alles wat je hier schrijft, zegt de AI namens jou -- dus schrijf hier wat je een nieuwe medewerker zou vertellen.',
    eerst: 'Vertel in een paar zinnen wat je kantoor doet en voor wie. Dat verandert meer aan de gesprekken dan welke andere instelling ook.',
  },
  'ai-beeld': {
    naam: 'AI-beeld',
    wat: 'Beeldgeneratie voor panden en social posts. Dit kost credits per beeld.',
    acties: 'Een foto van een pand uploaden en er een visualisatie in een gekozen stijl van laten maken.',
    waarom: 'Voor advertenties en social. Let op: dit kost credits, en een visualisatie is een sfeerbeeld -- geen belofte over de werkelijke staat van het pand.',
  },
  formulier: {
    naam: 'Formulier',
    wat: 'De publieke link die je deelt. Iedereen die hem invult wordt een lead en krijgt meteen een WhatsApp-bericht van de AI.',
    acties: 'De publieke link kopiëren, de tekst en kleuren aanpassen, en zien hoe hij eruitziet voor een bezoeker.',
    waarom: 'Dit is waar je leads vandaan komen. Zet hem onder je advertenties en in je e-mailhandtekening; iedereen die hem invult, krijgt binnen een minuut antwoord.',
    eerst: 'Kopieer de link en zet hem onder één advertentie. Dan zie je morgen of het werkt.',
  },
  facturatie: {
    naam: 'Facturatie',
    wat: 'Je abonnement, je creditsaldo en je facturen. Credits zijn wat Helvaro gebruikt voor AI-acties: een gekwalificeerd WhatsApp-gesprek kost er 20, beeldgeneratie meer.',
    acties: 'Je plan bekijken of wijzigen, credits bijkopen, en facturen downloaden.',
    waarom: 'Credits zijn wat de AI verbruikt: één leadgesprek kost er twintig. Raakt je saldo op, dan stoppen de antwoorden -- dus dit scherm is de enige plek waar je dat ziet aankomen.',
  },
  instellingen: {
    naam: 'Instellingen',
    wat: 'Je koppelingen en voorkeuren: Google Agenda, meldingen, taal en land.',
    acties: 'Google Agenda koppelen, meldingen instellen, je taal kiezen, werkuren instellen en je CRM verbinden.',
    waarom: 'De twee die er echt toe doen zijn de agenda (anders geen afspraken) en je werkuren (anders antwoordt de AI om drie uur \'s nachts alsof je kantoor open is).',
    eerst: 'Stel je werkuren in. Dat is één regel en het verandert meteen hoe de AI buiten kantooruren praat.',
  },
  exports: {
    naam: 'Exports',
    wat: 'Je leads en gesprekken downloaden als bestand.',
    acties: 'Je leads of gesprekken downloaden als bestand.',
    waarom: 'Voor je boekhouding, of om ze in een ander systeem te zetten.',
  },
  profile: {
    naam: 'Profiel',
    wat: 'Je eigen accountgegevens en wachtwoord.',
    acties: 'Je naam, e-mailadres en wachtwoord wijzigen.',
    waarom: 'Dit gaat over jouw eigen account -- je naam, je e-mailadres en je wachtwoord -- en niet over de AI, je leads of je abonnement. Die staan elk op hun eigen scherm.',
  },
});

/* Toestanden die iets betekenen voor wat Faro zou moeten zeggen. Vrije tekst
   is hier niet toegestaan -- alleen deze woorden. */
const TOESTANDEN = new Set(['leeg', 'fout', 'laden', 'normaal']);

const MAX_SECTIE = 60;

/* Wat de browser stuurt is niet te vertrouwen. Alleen bekende sleutels, alleen
   bekende waarden, en lengtes afgekapt. Alles wat we niet herkennen valt weg
   in plaats van een fout te geven: een onbekende pagina mag een vraag niet
   laten mislukken, hij levert alleen minder context op. */
function sanitize(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const uit = {};

  const pagina = String(r.pagina || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(PAGINAS, pagina)) uit.pagina = pagina;

  /* De sectie is een label uit onze eigen UI, geen klantdata. Toch afkappen en
     ontdoen van alles wat op opmaak lijkt, want het is en blijft een string
     die uit de pagina komt. */
  const sectie = String(r.sectie || '').trim().replace(/[<>`${}\n\r]/g, '').slice(0, MAX_SECTIE);
  if (sectie) uit.sectie = sectie;

  const toestand = String(r.toestand || '').trim().toLowerCase();
  if (TOESTANDEN.has(toestand) && toestand !== 'normaal') {
    /* "Leeg" wordt door de client afgeleid uit het aantal leads, en dat zegt
       alleen iets op een scherm dat leads TOONT. Op AI-persoonlijkheid of
       Facturatie zou "dit scherm is leeg" Faro laten uitleggen waarom er niets
       staat, terwijl er een volledig ingevuld formulier voor de gebruiker
       staat. Live gezien: een account zonder leads meldde elk scherm als leeg.

       Een foutmelding geldt wél overal. */
    /* `kanLeegZijn` is erbij gekomen naast toontLeads. De regel hierboven
       klopte -- op AI-persoonlijkheid is "leeg" onzin -- maar hij was te
       streng: het aanbodscherm begint bij ELKE nieuwe klant leeg, en dat is
       precies het moment waarop uitleg iets oplevert. Een expliciete vlag in
       plaats van de regel verruimen: dan blijft zichtbaar WELKE schermen echt
       leeg kunnen staan, en gaat er niet stilletjes een derde mee. */
    const def0 = uit.pagina && PAGINAS[uit.pagina];
    const magLeeg = def0 && (def0.toontLeads || def0.kanLeegZijn);
    if (toestand !== 'leeg' || magLeeg) uit.toestand = toestand;
  }

  // Booleans over de eigen inrichting. Geen waarden, alleen aan of uit.
  if (typeof r.onboardingKlaar === 'boolean') uit.onboardingKlaar = r.onboardingKlaar;
  if (typeof r.agendaGekoppeld === 'boolean') uit.agendaGekoppeld = r.agendaGekoppeld;
  if (typeof r.whatsappKlaar === 'boolean') uit.whatsappKlaar = r.whatsappKlaar;
  /* Signalen voor de rondleiding. Booleans en niets anders: ze komen uit de
     browser en zijn dus door de gebruiker te vervalsen, maar er hangt niets
     gevoeligs aan -- het ergste wat een vervalste waarde doet is een stap in
     de rondleiding overslaan die hij nog nodig had. */
  if (typeof r.aiIngesteld  === 'boolean') uit.aiIngesteld  = r.aiIngesteld;
  if (typeof r.heeftAanbod  === 'boolean') uit.heeftAanbod  = r.heeftAanbod;
  if (typeof r.creditsLaag  === 'boolean') uit.creditsLaag  = r.creditsLaag;
  /* In welke markt deze klant zit. Alleen bekende waarden; iets anders wordt
     genegeerd en leest dus als vastgoed -- zie api/_vertical.js voor waarom
     dat de veilige standaard is. De lijst komt daar vandaan en staat hier niet
     nog eens met de hand. */
  const vert = String(r.vertical || '').trim().toLowerCase();
  if (_vertical.BEKEND.indexOf(vert) !== -1) uit.vertical = vert;

  return uit;
}

/* De promptregels. Kort gehouden: dit gaat bij ELKE vraag mee, dus elke zin
   die niets toevoegt kost bij elk bericht opnieuw tokens.

   Geen blok als er niets bruikbaars is -- dan liever helemaal zwijgen dan een
   kopje "Waar de gebruiker staat" met niets eronder. */
/* Hoe het aanbodscherm heet en wat het doet, per markt. Alleen markten die
   ervan afwijken staan hier; de rest valt terug op PAGINAS.panden.

   Bouw, keuken en renovatie staan er met opzet NIET in: die hebben geen
   catalogus, en render() hierboven zwijgt dan over dat scherm in plaats van
   er een naam voor te verzinnen. */
const AANBODSCHERM = Object.freeze({
  dealership: {
    naam: 'Voertuigen',
    wat: 'De voertuigen die de assistent aan kopers kan voorstellen, met hun prijs, kilometerstand en status.',
    acties: 'Een voertuig toevoegen of uitlezen uit een AutoScout24-link, de status wijzigen, en de kortingsruimte per wagen instellen.',
    waarom: 'Zonder voorraad kan de assistent een binnenkomende WhatsApp-lead niet aan een auto koppelen, en dan moet de koper zelf uitleggen waar hij het over heeft. Een advertentielink plakken lost dat al op.',
  },
});

function render(ui) {
  if (!ui || !ui.pagina) return '';
  const def = PAGINAS[ui.pagina];
  if (!def) return '';

  /* Het aanbodscherm heet anders per markt, en de uitleg ook. Eén scherm dat
     zich aanpast in plaats van een definitie per markt: zie api/dashboard.js,
     waar dezelfde pagina alle markten bedient. Losse definities zouden
     betekenen dat er ergens eentje achterblijft.

     Dit stond er als drie losse ternaries op `dealer && pagina === 'panden'`.
     Met twee markten ging dat; met vijf wordt het een vierwegsprong per veld
     en blijft er gegarandeerd eentje achter. Nu een tabel: een markt erbij is
     een regel data, geen wijziging in de logica. */
  const eigen = AANBODSCHERM[ui.vertical];
  const overschrijf = (ui.pagina === 'panden' && eigen !== undefined) ? eigen : null;

  /* Markten zonder catalogus hebben dit scherm niet. Faro hoort dan niet over
     "Panden" te beginnen tegen een aannemer -- liever niets zeggen dan een
     scherm beschrijven dat er niet is. */
  if (ui.pagina === 'panden' && !_vertical.heeftAanbod(ui.vertical || _vertical.VASTGOED)) return '';

  const naam = overschrijf ? overschrijf.naam : def.naam;
  const wat  = overschrijf ? overschrijf.wat  : def.wat;

  const regels = [
    '── Waar de gebruiker nu staat ──',
    `Scherm: ${naam}. ${wat}`,
  ];

  /* Wat je hier kunt en waarom het bestaat. Dit is het verschil tussen een
     assistent die zegt "dit is het pandenscherm" en een die zegt waaróm je er
     iets zou invoeren.

     Alleen als de gebruiker het NODIG heeft: elke regel hier gaat mee in elke
     beurt, en een model dat bij "hoeveel leads had ik" ook nog vier regels
     over de bedoeling van het scherm meekrijgt, gaat die gebruiken. */
  const acties = overschrijf ? overschrijf.acties : def.acties;
  const waarom = overschrijf ? overschrijf.waarom : def.waarom;
  if (acties) regels.push(`Wat hier kan: ${acties}`);
  if (waarom) regels.push(`Waarom dit scherm bestaat: ${waarom}`);

  if (ui.sectie) regels.push(`Onderdeel: ${ui.sectie}.`);

  if (ui.toestand === 'leeg') {
    regels.push('Dit scherm is nu leeg. Leg uit wat er komt te staan en wat de gebruiker daarvoor moet doen.');
    /* Juist bij een leeg scherm telt de eerste stap. Iemand die hier voor het
       eerst staat heeft geen data om naar te kijken, dus het enige nuttige
       antwoord is "doe dit". */
    if (def.eerst) regels.push(`De handeling die hier het meeste oplevert: ${def.eerst}`);
  } else if (ui.toestand === 'fout') {
    regels.push('Er staat een foutmelding op dit scherm. Help de gebruiker die op te lossen.');
  }

  if (ui.onboardingKlaar === false) {
    regels.push('De inrichting is nog niet af.');
  }
  if (ui.agendaGekoppeld === false) {
    regels.push('Google Agenda is niet gekoppeld, dus er worden geen afspraken ingepland.');
  }
  if (ui.whatsappKlaar === false) {
    regels.push('De WhatsApp-berichten van deze klant zijn nog niet goedgekeurd in zijn taal.');
  }

  /* De belangrijkste regel van het blok. Zonder deze aanwijzing beantwoordt het
     model "wat betekent dit?" alsnog met "waar doel je op?", omdat het de
     context wel KRIJGT maar niet doorheeft dat het die mag gebruiken om het
     aanwijzend voornaamwoord op te lossen. */
  regels.push(
    'Verwijst de gebruiker naar "dit", "hier" of "deze pagina", dan bedoelt hij dit scherm. ' +
    'Vraag niet waar hij op doelt; antwoord meteen over dit scherm.'
  );

  return regels.join('\n');
}

/* ── De rondleiding ──────────────────────────────────────────────────────────
 *
 * "Laat me eens rondkijken." Faro loopt dan met je mee langs de schermen die er
 * op dat moment toe doen, in de volgorde waarin ze elkaar opbouwen.
 *
 * ── Waarom een VOLGORDE en niet de navigatie ────────────────────────────────
 * De zijbalk staat op werk-inzicht-instellen, en dat is de goede indeling voor
 * wie het product kent. Voor wie het NIET kent is die volgorde precies
 * verkeerd: hij begint bij het dashboard, dat leeg is, want er is nog niets
 * ingesteld.
 *
 * Deze volgorde loopt de andere kant op: eerst wat je moet invullen voordat er
 * iets kan gebeuren, dan waar het resultaat verschijnt. Elke stap is een
 * voorwaarde voor de volgende.
 *
 * ── Waarom hij korter wordt naarmate je verder bent ─────────────────────────
 * Een rondleiding die je langs veertien schermen sleept wordt weggeklikt. Wat
 * hier gebeurt is dat stappen VERVALLEN zodra ze niet meer nodig zijn: heb je
 * al panden, dan slaat hij het pandenscherm over. Wie alles al ingesteld heeft
 * krijgt drie stappen in plaats van zeven.
 *
 * ── Wat dit NIET is ─────────────────────────────────────────────────────────
 * Geen overlay met pijlen en "volgende". Dat is een tweede interface bovenop de
 * eerste, en hij is altijd stuk zodra er iets aan de pagina verandert. Dit
 * levert TEKST voor Faro; hij vertelt het in zijn eigen woorden en de gebruiker
 * kan hem onderbreken. Dat is het hele verschil tussen een gids en een
 * dwangbuis.
 */

/* De volgorde. Elke stap zegt waarom hij hier staat, en `nodig` bepaalt of hij
   nog getoond wordt. */
const RONDLEIDING = Object.freeze([
  { pagina: 'ai-persona',
    nodig: (st) => !st.aiIngesteld,
    reden: 'Hier begint alles: dit bepaalt wat je leads te lezen krijgen.' },
  { pagina: 'panden',
    nodig: (st) => !st.heeftAanbod,
    reden: 'Zonder aanbod moet de assistent raden waar een lead het over heeft.' },
  { pagina: 'formulier',
    nodig: () => true,
    reden: 'Dit is waar je leads vandaan komen. Zonder deze link gebeurt er niets.' },
  { pagina: 'instellingen',
    nodig: (st) => !st.agendaGekoppeld,
    reden: 'De agenda koppelen is wat voorkomt dat er dubbel geboekt wordt.' },
  { pagina: 'dashboard',
    nodig: () => true,
    reden: 'Hier verschijnt het resultaat. Vanaf nu is dit je ochtendscherm.' },
  { pagina: 'gesprekken',
    nodig: () => true,
    reden: 'En hier lees je terug wat er namens jou gezegd is.' },
  { pagina: 'facturatie',
    nodig: (st) => st.creditsLaag === true,
    reden: 'Je saldo loopt terug; hier zie je hoeveel er nog in zit.' },
]);

/**
 * De rondleiding als tekst voor Faro.
 *
 * @param {object} [staat]  wat er al ingesteld is. Alles optioneel; een
 *                          ontbrekend veld telt als "nog niet gedaan", zodat
 *                          een onbekende toestand een LANGERE rondleiding geeft
 *                          en geen kortere -- te veel uitleg is hinderlijk, te
 *                          weinig laat iemand vastlopen.
 */
/* De naam van een scherm zoals DEZE klant hem ziet. Alleen het aanbodscherm
   verschilt; de rest heet in elke markt hetzelfde.

   In een markt zonder catalogus -- bouw, keuken, renovatie -- bestaat dat
   scherm niet en heeft Faro er dus ook geen naam voor. Hij hoort dan niet over
   "Panden" te beginnen tegen een aannemer. */
function schermNaam(pagina, st) {
  const vert = (st && st.vertical) || _vertical.VASTGOED;
  if (pagina === 'panden') {
    if (vert === _vertical.DEALERSHIP) return 'Voertuigen';
    if (!_vertical.heeftAanbod(vert))  return '';
  }
  return (PAGINAS[pagina] || {}).naam || pagina;
}

function tour(staat, opties) {
  const st = staat && typeof staat === 'object' ? staat : {};
  const kort = !!(opties && opties.kort);
  /* Alleen een ECHTE true telt als "al gedaan". Een truthy string ('ja', '1')
     zou de stap overslaan, en dat is precies de verkeerde kant op: de hele
     asymmetrie van deze functie is dat onbekend leidt tot WEL tonen. Een stap
     te veel is hinderlijk, een stap te weinig laat iemand vastlopen.

     sanitize() gooit niet-booleans er al uit, dus in de praktijk komt dit niet
     voor. Maar tour() is geexporteerd en hoort op zichzelf te kloppen -- een
     tweede aanroeper die de sanitize overslaat, hoort geen andere rondleiding
     te krijgen. */
  const echt = {};
  for (const k of ['aiIngesteld', 'heeftAanbod', 'agendaGekoppeld', 'creditsLaag']) {
    echt[k] = st[k] === true;
  }
  echt.vertical = st.vertical;
  const stappen = RONDLEIDING.filter((x) => {
    try { return x.nodig(echt) !== false; } catch (_) { return true; }
  }).filter((x) => PAGINAS[x.pagina]);

  if (!stappen.length) return '';

  /* De KORTE variant gaat bij elke beurt mee. Vier regels in plaats van
     dertig: genoeg om te weten dat een rondleiding bestaat en in welke
     volgorde, te weinig om het gesprek te verdringen. De volledige tekst komt
     pas als de gebruiker er echt om vraagt. */
  if (kort) {
    return 'Vraagt hij om een rondleiding of om hulp met opstarten, loop dan deze '
      + 'schermen langs in deze volgorde, twee zinnen per scherm, en vraag na elk '
      + 'scherm of hij verder wil: '
      + stappen.map((x) => schermNaam(x.pagina, echt)).join(' -> ') + '.';
  }

  const r = [
    '── Rondleiding ──',
    'De gebruiker vroeg om een rondleiding. Loop deze schermen langs, in deze',
    'volgorde, en houd het kort: per scherm twee of drie zinnen, in je eigen',
    'woorden. Vraag na elk scherm of hij verder wil -- hij mag altijd stoppen.',
    'Noem nooit een scherm dat hier niet staat.',
    '',
  ];
  stappen.forEach((x, i) => {
    const def = PAGINAS[x.pagina];
    r.push(`${i + 1}. ${schermNaam(x.pagina, echt)} — ${def.wat}`);
    r.push(`   Waarom nu: ${x.reden}`);
    if (def.eerst) r.push(`   Laat hem dit doen: ${def.eerst}`);
  });
  r.push('');
  r.push('Sluit af met wat er daarna vanzelf gebeurt: leads komen binnen, de');
  r.push('assistent beantwoordt ze, en wat overblijft staat op het dashboard.');
  return r.join('\n');
}

module.exports = { PAGINAS, RONDLEIDING, sanitize, render, tour };
