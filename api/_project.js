'use strict';
/*
 * Wat er moet gebeuren, waar, hoe groot, voor hoeveel en wanneer.
 *
 * ── Waarom dit bestaat ───────────────────────────────────────────────────────
 * Een makelaar heeft panden en een dealer heeft wagens: een lead wijst naar
 * iets dat al bestaat, en het gesprek gaat over DAT ding. Een aannemer,
 * keukenbouwer of renovatiebedrijf heeft dat niet. Daar bestaat het ding nog
 * niet -- het moet nog gemaakt worden, en de prijs hangt volledig af van wat
 * iemand precies wil.
 *
 * Het gevolg is een ander soort verspilling. Niet "de auto was net weg", maar:
 * de aannemer rijdt drie kwartier naar een plaatsbezoek en hoort daar pas dat
 * het om een huurwoning gaat, of dat het budget de helft is van wat dit werk
 * kost, of dat het pas volgend jaar moet. Dat is een halve dag, en die dag
 * komt niet terug.
 *
 * Alles in dit bestand dient één zin: als de aannemer in de auto stapt, weet
 * hij al of het de moeite waard is.
 *
 * ── De zes dingen, en waarom juist deze ──────────────────────────────────────
 * Niet alles wat je kunt vragen is de moeite van het vragen waard. Deze zes
 * zijn de vragen waarvan het ANTWOORD de afspraak verandert:
 *
 *   soort        wat er moet gebeuren. Zonder dit is de rest betekenisloos.
 *   plaats       waar. Bepaalt of het binnen het werkgebied ligt, en de rijtijd.
 *   omvang       hoe groot, in m2 of in aantal. De grofste prijsknop die er is.
 *   budget       wat iemand in gedachten heeft. Mag "weet ik niet" zijn --
 *                zie hieronder, dat is zelf ook een antwoord.
 *   wanneer      een termijn, geen datum. "Binnenkort" is geen planning.
 *   beslisser    eigenaar of huurder. De vraag die niemand stelt en die de
 *                meeste afspraken kost: een huurder mag meestal niet beslissen
 *                over wat er aan het gebouw verandert.
 *
 * ── Leeg is een antwoord, en dat is geen woordspel ───────────────────────────
 * Bij een budget van "geen idee" is de verleiding om door te vragen tot er een
 * getal staat. Dat is precies verkeerd: iemand die het echt niet weet, wordt
 * dan weggejaagd of verzint wat. Een leeg budget met de rest ingevuld is een
 * prima lead -- het betekent alleen dat het gesprek over de prijs bij de
 * aannemer ligt en niet bij de assistent.
 *
 * Daarom telt `budget: null` hier NIET als ontbrekend in volledigheid(). Alleen
 * een veld dat nooit ter sprake kwam telt mee.
 *
 * ── Waarom in de Notities-blob ───────────────────────────────────────────────
 * Dezelfde plek als de aanbodcode en de wens. Geen nieuw Airtable-veld, dus
 * geen migratie en geen 422 op een tabel waar dat veld nog niet bestaat. Die
 * blob wordt al door drie andere plekken gelezen en samengevoegd, dus de
 * regels eromheen staan er al.
 *
 * ── Geen route ───────────────────────────────────────────────────────────────
 * Onderstreepje voorop. Vercel Hobby staat twaalf functies toe en die zijn op.
 */

/* De termijnen. Een kleine vaste lijst en geen vrije tekst, want dit veld
   bestaat om te kunnen PLANNEN, en "binnenkort" plant niet. Wat het model
   erbuiten schrijft valt weg -- liever leeg dan een termijn die niemand kan
   lezen. */
const TERMIJNEN = Object.freeze(['zsm', 'kwartaal', 'halfjaar', 'later', 'orienterend']);

/* Eigenaar of huurder. 'onbekend' staat er met opzet in als geldige waarde en
   niet als lege string: "we hebben het gevraagd en hij wist het niet" is iets
   anders dan "we hebben het niet gevraagd". */
const BESLISSERS = Object.freeze(['eigenaar', 'huurder', 'onbekend']);

const MAX_TEKST = 160;

function tekst(v, max) {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.slice(0, max || MAX_TEKST);
}

/* Een bedrag in euro, uit wat een model of een mens erin typt.
 *
 * Dit ging bijna mis op de meest Belgische manier die er is. De eerste versie
 * deed replace(',', '.') en liet de punt staan, en las "15.000" dus als
 * vijftien. Hier is de punt de DUIZENDTALSCHEIDER: 15.000 is vijftienduizend.
 * Een budget dat duizend keer te laag binnenkomt is erger dan geen budget --
 * de aannemer schrijft de lead af zonder te weten waarom.
 *
 * De regel die overblijft is simpel omdat het domein simpel is: een budget
 * voor een keuken of een verbouwing is een rond bedrag in hele euro's. Centen
 * bestaan hier niet. Dus alles wat geen cijfer is gaat eruit, en een
 * decimaalstaart van hoogstens twee cijfers achter een komma gaat er eerst af
 * zodat "15.000,50" niet als 1500050 eindigt.
 */
function getal(v) {
  if (v === null || v === undefined || v === '') return null;
  let s = String(v).trim();

  /* Een 'k' of 'K' achter het getal: 15k, 15 k, 15K euro. Komt vaak genoeg
     voor om het niet stil te laten mislukken. */
  const kort = /^[^\d]*(\d+(?:[.,]\d+)?)\s*k\b/i.exec(s);
  if (kort) {
    const n = Number(kort[1].replace(',', '.')) * 1000;
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  /* De decimaalstaart eraf: komma of punt gevolgd door precies één of twee
     cijfers aan het EIND. Drie cijfers is een duizendtalgroep, geen centen. */
  s = s.replace(/[.,]\d{1,2}\s*$/, '');

  /* Een minteken ervoor betekent onzin, geen positief bedrag. Zonder deze
     regel maakt het strippen van niet-cijfers er stilletjes 5 van, en dat ziet
     er in het dashboard uit als een echt (belachelijk laag) budget. */
  if (/^\s*-/.test(s)) return null;

  const cijfers = s.replace(/[^\d]/g, '');
  if (!cijfers) return null;
  const n = Number(cijfers);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Maakt van wat het model schreef iets waar de rest van de code op kan
 * rekenen. Alles wat niet klopt valt weg in plaats van de hele fiche te laten
 * mislukken -- een half ingevulde fiche is bruikbaar, een geweigerde niet.
 *
 * Geeft null terug als er werkelijk niets bruikbaars in zat. Dat onderscheid
 * telt: de aanroeper mag een lege fiche niet opslaan, want dan overschrijft
 * hij wat er in een eerder bericht al wel stond.
 */
function normaliseer(ruw) {
  if (!ruw || typeof ruw !== 'object') return null;

  const p = {
    soort:     tekst(ruw.soort),
    plaats:    tekst(ruw.plaats, 80),
    omvang:    tekst(ruw.omvang, 60),
    budget:    getal(ruw.budget),
    wanneer:   TERMIJNEN.indexOf(String(ruw.wanneer || '').trim().toLowerCase()) !== -1
                 ? String(ruw.wanneer).trim().toLowerCase() : '',
    beslisser: BESLISSERS.indexOf(String(ruw.beslisser || '').trim().toLowerCase()) !== -1
                 ? String(ruw.beslisser).trim().toLowerCase() : '',
    notitie:   tekst(ruw.notitie, 400),
  };

  const ietsIngevuld = p.soort || p.plaats || p.omvang || p.budget !== null
                    || p.wanneer || p.beslisser || p.notitie;
  return ietsIngevuld ? p : null;
}

/* De zes die meetellen. `notitie` staat er niet bij: dat is kleur, geen
   kwalificatie, en een fiche compleet noemen omdat er een zin bij staat zou de
   score waardeloos maken. */
const KERN = Object.freeze(['soort', 'plaats', 'omvang', 'budget', 'wanneer', 'beslisser']);

/**
 * Hoe compleet is deze fiche, en wat mist er nog.
 *
 * Dit is wat Faro gebruikt om te weten wat hij nog moet vragen, en wat het
 * dashboard toont zodat iemand in één blik ziet of een lead klaar is voor een
 * afspraak. Vandaar dat het de ontbrekende VELDEN teruggeeft en niet alleen
 * een getal: "4 van 6" zegt niets over wat je nog moet doen.
 */
function volledigheid(p) {
  if (!p) return { ingevuld: 0, totaal: KERN.length, mist: KERN.slice(), klaar: false };
  const mist = KERN.filter((k) => {
    const v = p[k];
    /* budget mag expliciet 0 of null zijn zodra er ooit naar gevraagd is; dat
       onderscheid kunnen we hier niet zien, dus null telt als ontbrekend en
       een 0 als "gevraagd, geen bedrag". Zie de kop van dit bestand. */
    if (k === 'budget') return v === null || v === undefined;
    return !v;
  });
  const ingevuld = KERN.length - mist.length;
  /* "Klaar" is niet "alles ingevuld". Soort, plaats en beslisser zijn de drie
     waar een aannemer zijn dag op inricht; omvang en budget scherpen de
     offerte aan maar houden een plaatsbezoek niet tegen. */
  const klaar = !!(p.soort && p.plaats && p.beslisser);
  return { ingevuld, totaal: KERN.length, mist, klaar };
}

function uitNotities(raw) {
  try {
    const blob = JSON.parse(raw || '{}');
    return blob && blob.project ? normaliseer(blob.project) : null;
  } catch (_) { return null; }
}

/**
 * Voegt de fiche samen met wat er al stond, en schrijft de blob terug.
 *
 * SAMENVOEGEN en niet vervangen: een gesprek loopt over meerdere berichten, en
 * een tweede fiche waarin alleen het budget staat mag niet wissen wat er in de
 * eerste al aan plaats en omvang stond. Alleen wat werkelijk gevuld is
 * overschrijft.
 */
function naarNotities(raw, project) {
  let blob = {};
  try { blob = JSON.parse(raw || '{}') || {}; } catch (_) { blob = {}; }
  if (!project) return JSON.stringify(blob);

  const oud = (blob.project && typeof blob.project === 'object') ? blob.project : {};
  const nieuw = Object.assign({}, oud);
  for (const k of Object.keys(project)) {
    const v = project[k];
    if (v === null || v === undefined || v === '') continue;
    nieuw[k] = v;
  }
  blob.project = nieuw;
  return JSON.stringify(blob);
}

const TERMIJN_TEKST = Object.freeze({
  zsm:         'zo snel mogelijk',
  kwartaal:    'binnen drie maanden',
  halfjaar:    'binnen zes maanden',
  later:       'later dit jaar of daarna',
  orienterend: 'aan het orienteren',
});

/** Eén regel die een mens leest voor hij in de auto stapt. */
function omschrijf(p) {
  if (!p) return '';
  const d = [];
  if (p.soort)  d.push(p.soort);
  if (p.omvang) d.push(p.omvang);
  if (p.plaats) d.push('in ' + p.plaats);
  if (p.budget !== null && p.budget !== undefined && p.budget > 0) {
    d.push('budget rond ' + new Intl.NumberFormat('nl-BE').format(p.budget) + ' euro');
  }
  if (p.wanneer)   d.push(TERMIJN_TEKST[p.wanneer] || p.wanneer);
  if (p.beslisser === 'huurder')  d.push('LET OP: huurder, beslist mogelijk niet zelf');
  if (p.beslisser === 'eigenaar') d.push('eigenaar');
  return d.join(' - ');
}

module.exports = {
  TERMIJNEN,
  BESLISSERS,
  KERN,
  normaliseer,
  volledigheid,
  uitNotities,
  naarNotities,
  omschrijf,
};
