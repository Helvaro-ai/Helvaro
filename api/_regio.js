'use strict';
/*
 * Waar staat deze klant, en wat betekent dat voor tijd, geld en telefoon.
 *
 * ── Waarom dit bestand bestaat ───────────────────────────────────────────────
 * Helvaro is gebouwd voor Vlaanderen en dat is overal te zien: `Europe/Brussels`
 * stond op zes plaatsen hardgecodeerd, `nl-BE` op tweeëndertig, en een
 * telefoonnummer dat met een 0 begon werd zonder meer een Belgisch nummer.
 *
 * Zolang elke klant in België zit is dat geen fout maar een aanname die klopt.
 * Bij de eerste klant in Londen wordt het drie echte problemen:
 *
 *   WERKUREN. "ma-vr 9-17" werd afgemeten tegen de Brusselse klok. Een Londens
 *   kantoor is dan volgens ons open van 08:00 tot 16:00 hun tijd -- de AI zegt
 *   om half vijf 's middags dat het bureau gesloten is, en 's ochtends om acht
 *   uur dat het open is. In Dubai loopt het drie uur uit de pas.
 *
 *   TELEFOON. `07700 900123` -- een doodgewoon Brits nummer -- werd
 *   `+32 7700900123`. Dat is geen Brits nummer meer en ook geen bestaand
 *   Belgisch nummer. Het WhatsApp-bericht gaat nergens heen, of erger, naar
 *   iemand anders. Dit is de stilste van de drie: er komt geen fout, er komt
 *   alleen nooit een antwoord.
 *
 *   GELD. Een prijs werd `€ 395.000` met een punt als duizendtal. In het Verenigd
 *   Koninkrijk is dat `£395,000`. Een lead die `£395.000` leest, leest een getal
 *   dat duizend keer te klein is.
 *
 * ── De standaard blijft België ───────────────────────────────────────────────
 * Elke functie hier valt terug op BE / Europe-Brussels / EUR / nl-BE. Voor een
 * bestaande klant verandert er dus letterlijk niets, ook niet als de velden in
 * Airtable nog niet bestaan. Dat is met opzet: een internationaliseringsslag die
 * de huidige klanten breekt is geen vooruitgang.
 *
 * ── Wat hier NIET in hoort ───────────────────────────────────────────────────
 * Vertalingen. Die staan in api/_lang.js en dat blijft zo. Taal en land zijn
 * niet hetzelfde: een Brusselse makelaar kan Franstalig zijn, een Zwitserse
 * klant kan Duits schrijven en in Zwitserse frank rekenen. Ze worden hier apart
 * gehouden omdat ze in het echt ook apart zijn.
 *
 * ── Geen route ───────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

/*
 * De landen waarvoor dit product vandaag zinnig is, met per land de vier dingen
 * die verschillen. Geen volledige ISO-lijst: een land toevoegen is één regel,
 * en een lijst van 249 landen waarvan we er zes ondersteunen doet alsof er meer
 * getest is dan waar is.
 *
 *   tz             IANA-zone. Landen met meerdere zones (US) krijgen de zone
 *                  die het vaakst klopt; de klant kan hem zelf overschrijven,
 *                  en dat is ook precies waarom dat veld bestaat.
 *   valuta         ISO 4217. Als code, niet als teken -- zie geld() hieronder.
 *   locale         BCP-47, bepaalt datumvolgorde en scheidingstekens.
 *   bel            landnummer zonder +.
 *   nationaal      het voorvoegsel dat een nationaal nummer krijgt en dat bij
 *                  internationaal bellen wegvalt. Bijna overal '0'; Spanje en
 *                  Italië kennen het niet, en Italië houdt de 0 juist WEL.
 */
const LANDEN = Object.freeze({
  BE: { naam: 'België',           tz: 'Europe/Brussels',    valuta: 'EUR', locale: 'nl-BE', bel: '32',  nationaal: '0' },
  NL: { naam: 'Nederland',        tz: 'Europe/Amsterdam',   valuta: 'EUR', locale: 'nl-NL', bel: '31',  nationaal: '0' },
  FR: { naam: 'Frankrijk',        tz: 'Europe/Paris',       valuta: 'EUR', locale: 'fr-FR', bel: '33',  nationaal: '0' },
  DE: { naam: 'Duitsland',        tz: 'Europe/Berlin',      valuta: 'EUR', locale: 'de-DE', bel: '49',  nationaal: '0' },
  ES: { naam: 'Spanje',           tz: 'Europe/Madrid',      valuta: 'EUR', locale: 'es-ES', bel: '34',  nationaal: ''  },
  IT: { naam: 'Italië',           tz: 'Europe/Rome',        valuta: 'EUR', locale: 'it-IT', bel: '39',  nationaal: ''  },
  PT: { naam: 'Portugal',         tz: 'Europe/Lisbon',      valuta: 'EUR', locale: 'pt-PT', bel: '351', nationaal: ''  },
  LU: { naam: 'Luxemburg',        tz: 'Europe/Luxembourg',  valuta: 'EUR', locale: 'fr-LU', bel: '352', nationaal: ''  },
  AT: { naam: 'Oostenrijk',       tz: 'Europe/Vienna',      valuta: 'EUR', locale: 'de-AT', bel: '43',  nationaal: '0' },
  IE: { naam: 'Ierland',          tz: 'Europe/Dublin',      valuta: 'EUR', locale: 'en-IE', bel: '353', nationaal: '0' },
  GB: { naam: 'Verenigd Koninkrijk', tz: 'Europe/London',   valuta: 'GBP', locale: 'en-GB', bel: '44',  nationaal: '0' },
  CH: { naam: 'Zwitserland',      tz: 'Europe/Zurich',      valuta: 'CHF', locale: 'de-CH', bel: '41',  nationaal: '0' },
  AE: { naam: 'VAE',              tz: 'Asia/Dubai',         valuta: 'AED', locale: 'en-AE', bel: '971', nationaal: '0' },
  US: { naam: 'Verenigde Staten', tz: 'America/New_York',   valuta: 'USD', locale: 'en-US', bel: '1',   nationaal: ''  },
  CA: { naam: 'Canada',           tz: 'America/Toronto',    valuta: 'CAD', locale: 'en-CA', bel: '1',   nationaal: ''  },
  MA: { naam: 'Marokko',          tz: 'Africa/Casablanca',  valuta: 'MAD', locale: 'fr-MA', bel: '212', nationaal: '0' },
  TR: { naam: 'Turkije',          tz: 'Europe/Istanbul',    valuta: 'TRY', locale: 'tr-TR', bel: '90',  nationaal: '0' },
});

const STANDAARD_LAND = 'BE';

/* De velden op Client Config. Ze mogen ONTBREKEN -- dan geldt de standaard.
   Zo werkt dit ook op een base waar ze nog niet aangemaakt zijn, en dat is de
   toestand waarin deze code voor het eerst draait. */
const VELD = Object.freeze({
  LAND:   'Country',
  TZ:     'Timezone',
  VALUTA: 'Currency',
  LOCALE: 'Locale',
});

/** Kennen we dit land? */
function land(code) {
  return LANDEN[String(code || '').trim().toUpperCase()] || null;
}

/** Alle landen, voor een keuzelijst. */
function landen() {
  return Object.keys(LANDEN).map((code) => ({ code, ...LANDEN[code] }));
}

/* Een IANA-zone die Node echt kent. Een typefout in dit veld ("Europe/Brussel")
   laat Intl.DateTimeFormat gooien, en dat zou hier een hele WhatsApp-beurt
   omvergooien voor iets cosmetisch. Dus: controleren en anders terugvallen. */
function geldigeZone(tz) {
  const s = String(tz || '').trim();
  if (!s) return '';
  try {
    new Intl.DateTimeFormat('en', { timeZone: s }).format(new Date());
    return s;
  } catch (_) {
    console.warn(`[regio] onbekende tijdzone "${s}" — val terug op het land`);
    return '';
  }
}

/**
 * De regio-instellingen van één klant.
 *
 * @param {object} clientFields  het `fields`-object van de Client Config-rij
 * @returns {{land:string, naam:string, tz:string, valuta:string, locale:string, bel:string, nationaal:string}}
 */
function lees(clientFields) {
  const f = clientFields || {};
  const code = String(f[VELD.LAND] || '').trim().toUpperCase();
  const basis = LANDEN[code] || LANDEN[STANDAARD_LAND];
  const gekozenLand = LANDEN[code] ? code : STANDAARD_LAND;

  /* Elk veld apart overschrijfbaar. Een makelaar in Genève die in euro factureert
     bestaat echt, en een Belgisch kantoor dat zijn agenda in UTC houdt ook. */
  return Object.freeze({
    land:      gekozenLand,
    naam:      basis.naam,
    tz:        geldigeZone(f[VELD.TZ]) || basis.tz,
    valuta:    String(f[VELD.VALUTA] || '').trim().toUpperCase() || basis.valuta,
    locale:    String(f[VELD.LOCALE] || '').trim() || basis.locale,
    bel:       basis.bel,
    nationaal: basis.nationaal,
  });
}

/** De standaard, voor code die (nog) geen klantrij bij de hand heeft. */
function standaard() { return lees(null); }

/**
 * Datum en tijd, in de zone van de KLANT en de taal van de lezer.
 *
 * Die twee zijn los van elkaar, en dat is het hele punt: een Franstalige lead
 * van een Antwerps kantoor hoort "jeudi 12 juin 14:00" te lezen -- Franse
 * woorden, Belgische klok. Draai je dat om, dan staat er een uur dat niet klopt.
 *
 * calendar:'gregory' staat er expliciet en is niet overbodig: sommige locales
 * kiezen vanzelf een andere kalender (fa-IR gebruikt de Perzische), en dan toont
 * dezelfde afspraak een andere dag dan Google Agenda.
 */
function datumTijd(iso, { tz, locale } = {}) {
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return String(iso || '');
  const opts = {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
    timeZone: geldigeZone(tz) || LANDEN[STANDAARD_LAND].tz,
    calendar: 'gregory',
  };
  try {
    return dt.toLocaleString(locale || LANDEN[STANDAARD_LAND].locale, opts);
  } catch (_) {
    return dt.toLocaleString('en-GB', opts);
  }
}

/** Kort, voor lijstjes: "do 12 jun 14:00". */
function datumKort(iso, { tz, locale } = {}) {
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return String(iso || '');
  const opts = {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
    timeZone: geldigeZone(tz) || LANDEN[STANDAARD_LAND].tz,
    calendar: 'gregory',
  };
  try { return dt.toLocaleString(locale || LANDEN[STANDAARD_LAND].locale, opts); }
  catch (_) { return dt.toLocaleString('en-GB', opts); }
}

/**
 * Een bedrag, met het juiste teken op de juiste plek en de juiste scheidingstekens.
 *
 * Intl doet dit werk; het punt is dat de VALUTA meegaat als code en niet als
 * teken. Alleen het teken vervangen levert `£395.000` op -- Britse munt, Belgische
 * puntnotatie -- en dat leest als driehonderdvijfennegentig pond.
 */
function geld(bedrag, { valuta, locale, decimalen } = {}) {
  /* Number(null) is 0 en Number('') ook. Zonder deze regel wordt "prijs
     onbekend" op het scherm "€ 0" -- een pand dat gratis lijkt. Een ontbrekend
     bedrag hoort niets te tonen, niet nul. */
  if (bedrag === null || bedrag === undefined || bedrag === '') return '';
  const n = Number(bedrag);
  if (!Number.isFinite(n)) return '';
  const munt = String(valuta || LANDEN[STANDAARD_LAND].valuta).toUpperCase();
  const taal = locale || LANDEN[STANDAARD_LAND].locale;
  /* Standaard zonder centen: vastgoedprijzen zijn ronde bedragen en "€ 395.000,00"
     leest als een factuur. Facturatie geeft decimalen:2 mee. */
  const cijfers = decimalen === undefined ? 0 : decimalen;
  try {
    return new Intl.NumberFormat(taal, {
      style: 'currency', currency: munt,
      minimumFractionDigits: cijfers, maximumFractionDigits: cijfers,
    }).format(n);
  } catch (_) {
    return `${munt} ${Math.round(n)}`;
  }
}

/**
 * Een telefoonnummer naar E.164 zonder plusteken (wat WhatsApp wil).
 *
 * De hele reden dat hier een LAND bij moet: een nummer dat met een nul begint is
 * een nationaal nummer, en welk land dat is kun je er niet aan zien. Drie
 * plaatsen in deze codebase plakten er ongevraagd 32 voor. Voor een Belgische
 * klant klopt dat; voor elke andere maakt het een nummer dat niet bestaat.
 *
 * Volgorde van herkennen:
 *   +32...  / 0032...   al internationaal, laat staan
 *   0470... nationaal   nationale nul eraf, landnummer ervoor
 *   32470...            begint al met het landnummer van deze klant
 *   470...              kaal nationaal nummer, landnummer ervoor
 *
 * Geeft '' terug bij iets dat geen telefoonnummer kan zijn. Leeg is hier de
 * juiste uitkomst: liever niets versturen dan naar een verkeerd nummer.
 */
function naarE164(ruw, regio) {
  const r = regio || standaard();
  let s = String(ruw || '').replace(/[\s\-(). ]/g, '');
  if (!s) return '';

  if (s.startsWith('00')) s = s.slice(2);
  else if (s.startsWith('+')) s = s.slice(1);
  else if (r.nationaal && s.startsWith(r.nationaal)) {
    s = r.bel + s.slice(r.nationaal.length);
  } else if (!s.startsWith(r.bel)) {
    /* Geen nationale nul en niet het eigen landnummer. Dat kan een kaal
       nationaal nummer zijn (470123456) of een ander land (49301234567). Het
       verschil is niet te zien, dus: alleen het eigen landnummer ervoor als het
       resultaat een plausibele lengte houdt. Anders laten staan -- een nummer
       dat al internationaal was mag niet dubbel voorzien worden. */
    const met = r.bel + s;
    if (met.length >= 10 && met.length <= 15) s = met;
  }

  return /^\d{8,15}$/.test(s) ? s : '';
}

/**
 * Zit het NU binnen de werkuren van deze klant?
 *
 * `spec` is wat de klant zelf typte, bijvoorbeeld "ma-vr 9-17" of "mon-fri 9:30-18".
 * Alles wat niet te lezen is geeft `true`: onbekend hoort "gewoon open" te
 * betekenen, niet "gesloten". Een kantoor per ongeluk dicht zetten is duurder
 * dan er een keer ten onrechte open uitzien.
 *
 * De klok is die van de KLANT. Dat was de bug: hij was altijd Brussels.
 */
const DAGEN = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAG_ALIAS = {
  ma: 'mon', di: 'tue', wo: 'wed', do: 'thu', vr: 'fri', za: 'sat', zo: 'sun',      // nl
  lun: 'mon', mar: 'tue', mer: 'wed', jeu: 'thu', ven: 'fri', sam: 'sat', dim: 'sun', // fr
  mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat', sun: 'sun', // en
  mo: 'mon', tu: 'tue', we: 'wed', th: 'thu', fr: 'fri', sa: 'sat', so: 'sun',        // de
};

function normaliseerDag(d) {
  const l = String(d || '').toLowerCase();
  return DAG_ALIAS[l] || DAG_ALIAS[l.slice(0, 3)] || DAG_ALIAS[l.slice(0, 2)] || l.slice(0, 3);
}

function binnenWerkuren(spec, regio, nu = new Date()) {
  const tekst = String(spec || '').trim();
  if (!tekst) return true;

  const m = tekst.match(/([a-zA-Zà-ü]+)\s*[-–—]\s*([a-zA-Zà-ü]+)\s+(\d{1,2})(?::(\d{2}))?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?/);
  if (!m) return true;

  const vanDag = DAGEN.indexOf(normaliseerDag(m[1]));
  const totDag = DAGEN.indexOf(normaliseerDag(m[2]));
  if (vanDag < 0 || totDag < 0) return true;

  const vanUur = parseInt(m[3], 10) + (m[4] ? parseInt(m[4], 10) / 60 : 0);
  const totUur = parseInt(m[5], 10) + (m[6] ? parseInt(m[6], 10) / 60 : 0);

  const tz = (regio && geldigeZone(regio.tz)) || LANDEN[STANDAARD_LAND].tz;
  /* 'en-GB' en niet de taal van de klant: we lezen hier een weekdag TERUG uit de
     opmaak, en dan wil je een taal waarvan je de afkortingen kent. De vorige
     versie las 'nl-BE' en moest de Nederlandse afkortingen weer terugvertalen --
     een omweg die alleen werkt zolang de opmaaktaal Nederlands blijft. */
  const delen = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(nu);

  const wdRuw = (delen.find((p) => p.type === 'weekday') || {}).value || '';
  const wd = DAGEN.indexOf(wdRuw.toLowerCase().slice(0, 3));
  if (wd < 0) return true;

  const inDagbereik = (vanDag <= totDag)
    ? (wd >= vanDag && wd <= totDag)
    : (wd >= vanDag || wd <= totDag);
  if (!inDagbereik) return false;

  const uur = parseInt((delen.find((p) => p.type === 'hour') || {}).value || '0', 10);
  const min = parseInt((delen.find((p) => p.type === 'minute') || {}).value || '0', 10);
  const nuUur = uur + min / 60;

  /* Een bereik dat over middernacht heen loopt (22-2) bestaat voor een
     makelaarskantoor niet, maar het kost één regel om het niet fout te doen. */
  return (vanUur <= totUur)
    ? (nuUur >= vanUur && nuUur < totUur)
    : (nuUur >= vanUur || nuUur < totUur);
}

module.exports = {
  LANDEN, STANDAARD_LAND, VELD,
  land, landen, lees, standaard, geldigeZone,
  datumTijd, datumKort, geld, naarE164, binnenWerkuren,
};
