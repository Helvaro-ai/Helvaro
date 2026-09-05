'use strict';
/*
 * In welke markt zit deze klant -- en wat betekent dat, en vooral: wat niet.
 *
 * ── Waarom dit een eigen bestand is ─────────────────────────────────────────
 * Helvaro krijgt er een tweede markt bij. Een makelaar verkoopt panden, een
 * dealer verkoopt auto's, en dat is zowat het enige verschil dat het PRODUCT
 * aangaat. WhatsApp, credits, facturatie, agenda, leads, gesprekken, meldingen,
 * inloggen, tenant-isolatie: allemaal hetzelfde, en dat moet zo blijven.
 *
 * Het gevaar bij zoiets is dat "welke markt" op twintig plekken los wordt
 * uitgelezen, elke keer net iets anders, met twintig verschillende antwoorden
 * op de vraag wat een lege waarde betekent. Daarom staat het hier één keer, en
 * leest niemand anders dat veld.
 *
 * ── Leeg betekent vastgoed, en dat is geen detail ───────────────────────────
 * Elke bestaande klant heeft `Vertical` leeg. Zou leeg iets anders betekenen
 * dan "vastgoed", dan zou dit bestand op de dag van uitrol elke makelaar zijn
 * pandcontext afnemen. Vandaar dat VASTGOED de terugval is op ELK pad dat
 * misgaat: onbekende waarde, ontbrekend veld, record niet gevonden, Airtable
 * plat. Alleen een record dat er letterlijk 'dealership' in heeft staan krijgt
 * de dealershipervaring.
 *
 * Dat is dezelfde redenering als bij Email Verification Status en Opted Out
 * elders in deze codebase: de vraag is nooit "wat is de mooiste standaard"
 * maar "welke standaard doet bestaande klanten geen pijn".
 *
 * ── Geen route ──────────────────────────────────────────────────────────────
 * Onderstreepje voorop. Vercel Hobby staat twaalf functies toe en die zijn op;
 * alles hangt aan bestaande routes via body.mode.
 */

/* De namen. Strings en geen Symbol of enum-object: ze gaan naar Airtable, naar
   de client en terug, en onderweg blijft er van een Symbol niets over. */
const VASTGOED   = 'vastgoed';
const DEALERSHIP = 'dealership';
/* Drie markten erbij, en ze delen een vorm die de eerste twee niet hebben:
   geen catalogus. Een makelaar heeft panden en een dealer heeft wagens -- een
   aannemer, keukenbouwer of renovatiebedrijf heeft dat niet. Die verkopen een
   project dat per opdracht wordt geoffreerd.

   Dat is geen detail maar het verschil dat het meeste code raakt. Faro hoeft
   niets te herkennen uit de voorraad, er is geen scherm met een aanbod, en de
   afspraak is geen bezichtiging of proefrit maar iemand die langskomt kijken
   of meten. Vandaar heeftAanbod() verderop: code die eigenlijk vraagt "is er
   iets om uit te kiezen" hoort dat te vragen, en niet "is dit een dealer". */
const BOUW      = 'bouw';
const KEUKEN    = 'keuken';
const RENOVATIE = 'renovatie';

const BEKEND = Object.freeze([VASTGOED, DEALERSHIP, BOUW, KEUKEN, RENOVATIE]);

/* Welke markten een eigen aanbod hebben om uit te kiezen. Expliciet als lijst
   en niet als "alles behalve X", zodat een nieuwe markt hier bewust wordt
   toegevoegd in plaats van er stilzwijgend in te vallen. */
const MET_AANBOD = Object.freeze([VASTGOED, DEALERSHIP]);

/* Het veld op Client Config. Naam én id, want de naam is leesbaar in een
   formule en het id overleeft een hernoeming in Airtable -- dat is hier al
   eens misgegaan met een veld dat stilletjes niet meer geschreven werd. */
const VELD    = 'Vertical';
const VELD_ID = 'fldJeZtaPXfHdWcdr';

/* Het niche-veld dat er al was, en waarom het hier ook meetelt.
   Niche is wat er bij aanmelding wordt ingevuld en wat Sindi in Airtable ziet
   staan. Vertical is er later bij gekomen. Twee velden voor bijna dezelfde
   vraag is precies hoe er ooit eentje vergeten wordt: iemand zet Niche op
   dealership en het dashboard blijft over panden praten.

   Daarom leest deze functie ze allebei. Vertical WINT als hij expliciet gezet
   is -- dat is de fijnregeling, voor het geval een niche niet dekt wat iemand
   echt doet. Staat Vertical leeg, dan beslist Niche.

   De lijst is ruim opgezet omdat een niche met de hand ingetypt kan worden:
   'dealership', 'car_dealer', 'autodealer', 'garage' en 'automotive' komen
   allemaal op hetzelfde neer. Wat er niet in staat, is vastgoed -- de veilige
   standaard. */
const NICHE_VELD    = 'Niche';
const NICHE_VELD_ID = 'fld0BsPnDbBOkTHzr';

const NICHE_DEALERSHIP = Object.freeze([
  'dealership', 'car_dealer', 'cardealer', 'autodealer', 'auto_dealer',
  'garage', 'automotive', 'autohandel', 'concessionnaire', 'autohaus',
]);

/* Dezelfde ruime opzet voor de drie nieuwe. Ook hier geldt: een niche wordt
   met de hand ingetypt, in vier talen, door iemand die haast heeft. Wat er
   niet in staat valt terug op vastgoed, en dat is de veilige kant. */
const NICHE_BOUW = Object.freeze([
  'bouw', 'bouwbedrijf', 'bouwbedrijven', 'aannemer', 'aannemerij',
  'construction', 'constructie', 'contractor', 'entrepreneur',
  'entreprise_de_construction', 'bau', 'bauunternehmen', 'bauunternehmer',
]);

const NICHE_KEUKEN = Object.freeze([
  'keuken', 'keukens', 'keukenbouwer', 'keukenzaak', 'keukenspecialist',
  'kitchen', 'kitchens', 'kitchen_studio', 'cuisine', 'cuisines',
  'cuisiniste', 'kueche', 'kuechen', 'kuechenstudio',
]);

const NICHE_RENOVATIE = Object.freeze([
  'renovatie', 'renovaties', 'renovatiebedrijf', 'verbouwing', 'verbouwingen',
  'renovation', 'renovations', 'remodeling', 'renovering',
  'renovation_entreprise', 'sanierung', 'renovierung', 'umbau',
]);

/* Volgorde is hier gedrag, geen opmaak: de eerste die matcht wint. Dealership
   staat vooraan omdat die lijst er het langst is en het meest specifiek. */
const NICHE_TABEL = Object.freeze([
  [DEALERSHIP, NICHE_DEALERSHIP],
  [BOUW,       NICHE_BOUW],
  [KEUKEN,     NICHE_KEUKEN],
  [RENOVATIE,  NICHE_RENOVATIE],
]);

/* Onderhandelingsgrenzen, ook per tenant. Ze horen bij de vertical omdat ze
   alleen in dealership bestaan; ze staan hier zodat er één plek is die weet
   hoe een leeg veld gelezen moet worden. */
const VELD_MAX_KORTING  = 'Max Discount EUR';
const VELD_FARO_KORTING = 'Faro Discount Limit EUR';

/**
 * Welke vertical hoort bij dit klantrecord.
 *
 * @param {object} velden  de `fields` van een Client Config-record, of null
 * @returns {'vastgoed'|'dealership'}
 */
function van(velden) {
  if (!velden || typeof velden !== 'object') return VASTGOED;

  /* 1. Vertical, als hij expliciet gezet is. Die wint altijd: het is de
        fijnregeling voor het geval de niche niet dekt wat iemand echt doet. */
  const ruw = velden[VELD_ID] !== undefined ? velden[VELD_ID] : velden[VELD];
  const v = String(ruw == null ? '' : ruw).trim().toLowerCase();
  if (BEKEND.indexOf(v) !== -1) return v;

  /* 2. Anders beslist de niche. Zo hoeft er maar EEN veld gewijzigd te worden
        om het hele dashboard om te zetten, en maakt het niet uit welk van de
        twee iemand pakt. */
  const nRuw = velden[NICHE_VELD_ID] !== undefined ? velden[NICHE_VELD_ID] : velden[NICHE_VELD];
  const n = String(nRuw == null ? '' : nRuw).trim().toLowerCase().replace(/[\s-]+/g, '_');
  for (const [markt, lijst] of NICHE_TABEL) {
    if (lijst.indexOf(n) !== -1) return markt;
  }

  /* 3. Onbekend telt als vastgoed. Niet als fout: er kan een keuze bijkomen
        voordat de code hem kent, en dan is stilletjes terugvallen op het
        bestaande gedrag beter dan omvallen. */
  return VASTGOED;
}

function isDealership(velden) { return van(velden) === DEALERSHIP; }
function isVastgoed(velden)   { return van(velden) === VASTGOED; }

/**
 * Heeft deze markt een eigen aanbod om uit te kiezen?
 *
 * Dit is de vraag die de meeste code eigenlijk stelt als hij `=== dealership`
 * schrijft. Een makelaar heeft panden, een dealer heeft wagens; een aannemer,
 * keukenbouwer of renovatiebedrijf heeft geen voorraad maar een offerte per
 * opdracht. Voor die drie is er dus geen aanbodscherm, valt er niets te
 * herkennen uit een lijst, en gaat het gesprek over wat iemand wil laten doen
 * in plaats van welk stuk uit de etalage hij bedoelt.
 *
 * Neemt een vertical-string OF een klantrecord aan, want beide vormen komen
 * in deze codebase voor en het alternatief is dat elke aanroeper zelf gaat
 * raden welke van de twee hij moet meegeven.
 *
 * @param {string|object} wat  vertical-naam of de `fields` van Client Config
 */
function heeftAanbod(wat) {
  let v;
  if (typeof wat === 'string') {
    /* Een onbekende string leest als vastgoed, net als overal elders. Zonder
       deze regel betekende een vertical die onderweg gehavend raakte stilletjes
       "geen catalogus", en dan verdwijnt het pandenscherm bij een makelaar --
       precies de verkeerde kant om te falen. De veilige kant is dat een
       onbekende waarde de STANDAARDmarkt is, en die heeft wel een aanbod. */
    const g = wat.trim().toLowerCase();
    v = BEKEND.indexOf(g) !== -1 ? g : VASTGOED;
  } else {
    v = van(wat);
  }
  return MET_AANBOD.indexOf(v) !== -1;
}

/**
 * Hoe heet een afspraak in deze markt? Alleen het WOORD verschilt -- de
 * afspraken zelf lopen door dezelfde tabel, dezelfde agenda-synchronisatie en
 * dezelfde herinneringscron. Er komt geen tweede agendasysteem.
 *
 * @param {object} velden
 * @param {'nl'|'fr'|'en'|'de'} [taal]
 */
const AFSPRAAKWOORD = Object.freeze({
  vastgoed:   { nl: 'bezichtiging',  fr: 'visite',            en: 'viewing',              de: 'Besichtigung' },
  dealership: { nl: 'proefrit',      fr: 'essai',             en: 'test drive',           de: 'Probefahrt'   },
  /* Bij de drie zonder catalogus is de afspraak niet "kom kijken naar dit
     ding" maar "kom kijken bij mij". Een keukenbouwer meet op, een aannemer
     en een renovatiebedrijf komen ter plaatse -- en dat verschil hoort de
     lead te horen, want het bepaalt of hij thuis moet zijn. */
  bouw:       { nl: 'plaatsbezoek',  fr: 'visite de chantier', en: 'site visit',          de: 'Ortstermin'   },
  keuken:     { nl: 'opmeting',      fr: 'prise de mesures',   en: 'measuring appointment', de: 'Aufma\u00df' },
  renovatie:  { nl: 'plaatsbezoek',  fr: 'visite sur place',   en: 'site visit',          de: 'Ortstermin'   },
});

function afspraakWoord(velden, taal) {
  const v = van(velden);
  const t = String(taal || 'nl').slice(0, 2).toLowerCase();
  /* Terugval op vastgoed als een markt hier ooit ontbreekt: liever het woord
     van de standaardmarkt dan een lege string midden in een zin. */
  const rij = AFSPRAAKWOORD[v] || AFSPRAAKWOORD[VASTGOED];
  return rij[t] || rij.nl;
}

/**
 * De onderhandelingsgrenzen van deze dealer, met het voertuig als
 * overschrijving.
 *
 * Twee getallen, en de volgorde ertussen is de hele regel:
 *
 *   faroMag   wat Faro ZELF mag weggeven, zonder tussenkomst
 *   maxKorting het absolute plafond; daarboven is het antwoord nee
 *
 * Leeg betekent NUL, niet onbeperkt. Dat is de enige veilige lezing: een dealer
 * die dit veld nooit invult heeft niet stilzwijgend ingestemd met korting, en
 * een AI die uit een leeg veld "onbeperkt" leest geeft de zaak weg.
 *
 * En faroMag wordt geklemd op maxKorting. Staat er per ongeluk een hogere
 * waarde in dan het plafond, dan wint het plafond -- de code kiest altijd de
 * striktste grens in plaats van te vertrouwen wat er is ingetypt.
 *
 * @param {object} klantVelden    Client Config
 * @param {object} [voertuig]     zoals api/_vehicles.js het teruggeeft
 */
function kortingsgrenzen(klantVelden, voertuig) {
  const getal = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };

  const klantMax  = getal(klantVelden && klantVelden[VELD_MAX_KORTING]);
  const klantFaro = getal(klantVelden && klantVelden[VELD_FARO_KORTING]);

  /* Het voertuig mag overschrijven, maar alleen als er echt iets staat.
     `undefined` en 0 zijn hier hetzelfde: geen eigen regel, dus de
     dealerinstelling geldt. */
  const vMax  = getal(voertuig && voertuig.maxKorting);
  const vFaro = getal(voertuig && voertuig.faroKorting);

  const maxKorting = vMax  > 0 ? vMax  : klantMax;
  let   faroMag    = vFaro > 0 ? vFaro : klantFaro;

  if (faroMag > maxKorting) faroMag = maxKorting;

  return { maxKorting, faroMag, bron: (vMax > 0 || vFaro > 0) ? 'voertuig' : 'dealer' };
}

/**
 * Mag Faro dit kortingsbedrag zelf geven?
 *
 * Drie uitkomsten, en ze zijn met opzet drie en niet twee:
 *
 *   'ja'        binnen zijn eigen ruimte; hij mag het aanbieden
 *   'navragen'  boven zijn ruimte maar onder het plafond; hij escaleert
 *   'nee'       boven het plafond; het antwoord is nee
 *
 * 'navragen' is het hele punt van deze functie. Zonder die middelste stand
 * wordt elke vraag om meer korting ofwel stilletjes toegestaan ofwel botweg
 * geweigerd, en allebei kost dat de dealer de deal.
 *
 * @param {number} bedrag  gevraagde korting in euro
 */
function mag(bedrag, grenzen) {
  const b = Number(bedrag);
  if (!Number.isFinite(b) || b <= 0) return 'ja';   // geen korting gevraagd
  if (b <= grenzen.faroMag)    return 'ja';
  if (b <= grenzen.maxKorting) return 'navragen';
  return 'nee';
}

module.exports = {
  VASTGOED,
  DEALERSHIP,
  BOUW,
  KEUKEN,
  RENOVATIE,
  BEKEND,
  MET_AANBOD,
  VELD,
  VELD_ID,
  NICHE_VELD,
  NICHE_VELD_ID,
  NICHE_DEALERSHIP,
  NICHE_BOUW,
  NICHE_KEUKEN,
  NICHE_RENOVATIE,
  NICHE_TABEL,
  van,
  isDealership,
  isVastgoed,
  heeftAanbod,
  afspraakWoord,
  kortingsgrenzen,
  mag,
};
