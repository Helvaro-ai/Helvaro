'use strict';
/*
 * BTW-nummers: normaliseren, controleren, en één per bedrijf.
 * (Module met underscore = geen route, zelfde afspraak als api/_abonnement.js,
 * api/_credits.js en de rest — zie CLAUDE.md.)
 *
 * ── Wanneer wordt hiernaar gevraagd ─────────────────────────────────────────
 * Bij het afsluiten van een abonnement, NIET bij het aanmaken van een account.
 * Dat is een bewuste keuze van de eigenaar en hij is ook de juiste:
 *
 *   • Een proefaccount hoeft geen btw-nummer. Wie eerst wil kijken, moet
 *     kunnen kijken; een formulierveld erbij kost hier meer klanten dan het
 *     aan misbruik tegenhoudt.
 *   • Bots tegenhouden is een andere taak, en die staat al ergens anders:
 *     Clerk (met Cloudflare-uitdaging) plus api/_signup-guard.js met
 *     wegwerpdomeinen, IP-begrenzing en hergebruik van vingerafdrukken. Een
 *     btw-nummer is geen botfilter — ze zijn openbaar op te zoeken.
 *   • Op het moment dat er geld betaald wordt, is een btw-nummer wél logisch:
 *     het hoort op de factuur, en het is precies daar dat "één bedrijf, één
 *     account" ertoe doet.
 *
 * ── Waarom fail-open bij een storing bij VIES ───────────────────────────────
 * VIES is de officiële EU-dienst en ligt er met enige regelmaat uit, soms per
 * lidstaat. Twee soorten antwoord, twee soorten gevolg:
 *
 *   • VIES zegt "bestaat niet"     -> weigeren. Een duidelijk antwoord.
 *   • VIES antwoordt niet (of traag) -> doorlaten, en markeren als ongecontroleerd.
 *
 * Dezelfde asymmetrie als in api/_credits.js: een storing bij een derde partij
 * mag geen betalende klant tegenhouden. Het formaat is dan al wél gecontroleerd
 * (dat is lokaal en zegt genoeg tegen typefouten), en `gecontroleerd:false`
 * blijft staan zodat het later na te lopen is.
 *
 * ── Waarom claim-then-verify voor de uniciteit ──────────────────────────────
 * De opdracht vraagt om afdwingen "op databaseniveau". Dat kan hier niet:
 * de klantgegevens staan in Airtable en Airtable kent geen unieke index. Een
 * kale "kijk of hij bestaat, schrijf hem dan weg" is fout — twee gelijktijdige
 * aanvragen zien allebei niets en schrijven allebei.
 *
 * Dus: eerst schrijven, dan terugkijken wie de oudste claim heeft. Airtable
 * geeft createdTime per record, en dat is een serverwaarde die wij niet kunnen
 * beïnvloeden. Wie niet de oudste is, maakt zijn eigen claim ongedaan en krijgt
 * een nette melding. Dat is bestand tegen gelijktijdigheid zonder unieke index,
 * en het is de reden dat dit een aparte functie is en geen twee losse regels op
 * de aanroepplek.
 */

const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';

/* Veldnaam, geen veld-id: het veld bestaat nog niet en heeft dus nog geen id.
   Airtable accepteert de naam net zo goed. Bestaat het veld niet, dan faalt de
   PATCH met 422 en zegt claimVat() dat eerlijk — zie de actie in CHANGELOG.md. */
const VELD_VAT = 'VAT';

/* Lengte van het cijfergedeelte per lidstaat, plus de paar landen met letters
   erin. Dit vangt typefouten af zonder VIES nodig te hebben; of het nummer
   ECHT bestaat is een aparte vraag die alleen VIES kan beantwoorden.

   BE staat op precies tien cijfers met een leidende nul, niet op "negen of
   tien". Normaliseer() zet die nul er al voor, dus alles wat hier binnenkomt
   hoort tien lang te zijn -- en met /^0?\d{9}$/ glipte een nummer met één
   cijfer te weinig er alsnog doorheen als "negen cijfers". */
const EU_PATRONEN = Object.freeze({
  AT: /^U\d{8}$/,            BE: /^0\d{9}$/,            BG: /^\d{9,10}$/,
  CY: /^\d{8}[A-Z]$/,        CZ: /^\d{8,10}$/,          DE: /^\d{9}$/,
  DK: /^\d{8}$/,             EE: /^\d{9}$/,             EL: /^\d{9}$/,
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/, FI: /^\d{8}$/,         FR: /^[A-Z0-9]{2}\d{9}$/,
  HR: /^\d{11}$/,            HU: /^\d{8}$/,             IE: /^(\d{7}[A-Z]{1,2}|\d[A-Z]\d{5}[A-Z])$/,
  IT: /^\d{11}$/,            LT: /^(\d{9}|\d{12})$/,    LU: /^\d{8}$/,
  LV: /^\d{11}$/,            MT: /^\d{8}$/,             NL: /^\d{9}B\d{2}$/,
  PL: /^\d{10}$/,            PT: /^\d{9}$/,             RO: /^\d{2,10}$/,
  SE: /^\d{12}$/,            SI: /^\d{8}$/,             SK: /^\d{10}$/,
});

/**
 * Naar één schrijfwijze. "BE 0123.456.749", "be0123456749" en "0123 456 749"
 * moeten hetzelfde nummer zijn, anders is uniciteit een wassen neus.
 * Zonder landcode wordt BE aangenomen — dit product verkoopt aan Vlaamse
 * makelaars, en een Belg die zijn nummer intikt laat "BE" vrijwel altijd weg.
 */
function normaliseer(ruw, standaardLand = 'BE') {
  let s = String(ruw == null ? '' : ruw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s) return '';
  if (!/^[A-Z]{2}/.test(s)) s = String(standaardLand).toUpperCase() + s;
  // Griekenland dient zich soms aan als GR, maar heet bij VIES EL.
  if (s.startsWith('GR')) s = 'EL' + s.slice(2);
  /* Belgische nummers zijn tien cijfers en beginnen met een nul. Wie de nul
     weglaat ("BE123456749") heeft hetzelfde nummer bedoeld, en zonder deze
     regel telt dat als een tweede bedrijf. */
  if (s.startsWith('BE') && /^\d{9}$/.test(s.slice(2))) s = 'BE0' + s.slice(2);
  return s;
}

/** Klopt de vorm? Lokaal, geen netwerk. */
function vormOk(genormaliseerd) {
  const s = String(genormaliseerd || '');
  const land = s.slice(0, 2);
  const rest = s.slice(2);
  const patroon = EU_PATRONEN[land];
  if (!patroon) return { ok: false, reden: 'onbekend_land' };
  if (!patroon.test(rest)) return { ok: false, reden: 'vorm' };
  return { ok: true, land };
}

/**
 * Bestaat het nummer echt? Vraagt het aan VIES.
 * Geeft { bestaat:true|false|null, naam }. null = geen antwoord gekregen; dat
 * is uitdrukkelijk iets anders dan false en wordt hierboven anders behandeld.
 */
async function viesControle(genormaliseerd, timeoutMs = 6000) {
  const land = genormaliseerd.slice(0, 2);
  const nummer = genormaliseerd.slice(2);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(
      `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${land}/vat/${nummer}`,
      { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) return { bestaat: null, naam: '' };
    const d = await r.json();
    if (typeof d.isValid !== 'boolean') return { bestaat: null, naam: '' };
    return { bestaat: d.isValid, naam: String(d.name || '').trim() };
  } catch (e) {
    // Time-out of netwerkfout: geen oordeel, geen blokkade.
    return { bestaat: null, naam: '' };
  } finally {
    clearTimeout(t);
  }
}

function airtableKlaar() {
  return !!(process.env.API_AIRTABLE && process.env.BASE_AIRTABLE);
}
function esc(v) { return String(v).replace(/["\\]/g, '\\$&'); }

async function rijenMetVat(genormaliseerd) {
  const formule = encodeURIComponent(`{${VELD_VAT}}="${esc(genormaliseerd)}"`);
  const url = `https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/${CLIENTS_TABLE}`
            + `?filterByFormula=${formule}&pageSize=100`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.API_AIRTABLE}` } });
  if (!r.ok) throw new Error(`Airtable GET ${r.status}`);
  const d = await r.json();
  return d.records || [];
}

async function rijVoorProject(projectCode) {
  const formule = encodeURIComponent(`{Project Code}="${esc(projectCode)}"`);
  const url = `https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/${CLIENTS_TABLE}`
            + `?filterByFormula=${formule}&maxRecords=1`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.API_AIRTABLE}` } });
  if (!r.ok) throw new Error(`Airtable GET ${r.status}`);
  const d = await r.json();
  return (d.records || [])[0] || null;
}

async function schrijfVat(recordId, waarde) {
  const r = await fetch(
    `https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/${CLIENTS_TABLE}/${recordId}`,
    { method: 'PATCH',
      headers: { Authorization: `Bearer ${process.env.API_AIRTABLE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { [VELD_VAT]: waarde } }) });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    const err = new Error(`Airtable PATCH ${r.status}: ${t.slice(0, 200)}`);
    err.status = r.status;
    throw err;
  }
  return true;
}

/**
 * Controleer en claim een btw-nummer voor één klant.
 *
 * Geeft { ok, code, vat, land, naam, gecontroleerd } terug. Gooit niet: elke
 * afloop is een antwoord, want dit zit midden in een betaalpad.
 *
 * code is een van:
 *   ontbreekt | vorm | onbekend_land | bestaat_niet | in_gebruik |
 *   veld_ontbreekt | opslag_storing | ok
 */
async function controleerEnClaim({ projectCode, vat, viesTimeoutMs } = {}) {
  const genormaliseerd = normaliseer(vat);
  if (!genormaliseerd) {
    return { ok: false, code: 'ontbreekt', melding: 'Vul je btw-nummer in.' };
  }
  const vorm = vormOk(genormaliseerd);
  if (!vorm.ok) {
    return {
      ok: false,
      code: vorm.reden,
      vat: genormaliseerd,
      melding: vorm.reden === 'onbekend_land'
        ? 'Dit lijkt geen Europees btw-nummer. Controleer de landcode.'
        : 'Dit btw-nummer klopt niet. Controleer of je een cijfer mist.',
    };
  }

  const vies = await viesControle(genormaliseerd, viesTimeoutMs);
  if (vies.bestaat === false) {
    return {
      ok: false, code: 'bestaat_niet', vat: genormaliseerd, land: vorm.land,
      melding: 'Dit btw-nummer is niet bekend bij de Europese btw-databank.',
    };
  }
  // vies.bestaat === null -> geen oordeel. Doorlaten, maar wel als zodanig merken.
  const gecontroleerd = vies.bestaat === true;

  if (!airtableKlaar()) {
    return { ok: false, code: 'opslag_storing', vat: genormaliseerd,
             melding: 'We konden je btw-nummer nu niet opslaan. Probeer het zo meteen opnieuw.' };
  }

  let eigenRij;
  try { eigenRij = await rijVoorProject(projectCode); }
  catch (e) {
    console.warn('[vat] klantrij lezen mislukt:', e && e.message);
    return { ok: false, code: 'opslag_storing', vat: genormaliseerd,
             melding: 'We konden je btw-nummer nu niet opslaan. Probeer het zo meteen opnieuw.' };
  }
  if (!eigenRij) {
    return { ok: false, code: 'opslag_storing', vat: genormaliseerd,
             melding: 'We konden je account niet terugvinden. Neem contact op.' };
  }

  /* ── Claim, dan terugkijken ──────────────────────────────────────────────
     Eerst schrijven, dan pas kijken wie hem heeft. Andersom (kijken, dan
     schrijven) laat twee gelijktijdige aanvragen allebei door: ze zien allebei
     niets. Nu schrijven ze allebei, en beslist de createdTime van Airtable —
     een serverwaarde die geen van beide kan sturen — wie hem houdt. */
  try {
    await schrijfVat(eigenRij.id, genormaliseerd);
  } catch (e) {
    if (e.status === 422) {
      console.error(`[vat] het veld "${VELD_VAT}" bestaat niet in de Clients-tabel — btw kan niet vastgelegd worden`);
      return { ok: false, code: 'veld_ontbreekt', vat: genormaliseerd,
               melding: 'Btw-registratie staat nog niet aan. Neem heel even contact op.' };
    }
    console.warn('[vat] claim schrijven mislukt:', e && e.message);
    return { ok: false, code: 'opslag_storing', vat: genormaliseerd,
             melding: 'We konden je btw-nummer nu niet opslaan. Probeer het zo meteen opnieuw.' };
  }

  let claims;
  try { claims = await rijenMetVat(genormaliseerd); }
  catch (e) {
    console.warn('[vat] terugkijken mislukt:', e && e.message);
    /* Wel geschreven, niet kunnen controleren. De claim laten staan is hier het
       minste kwaad: hem weghalen zou een klant die er als enige recht op heeft
       zijn nummer afpakken, en een dubbele claim is met de hand te zien. */
    return { ok: true, code: 'ok', vat: genormaliseerd, land: vorm.land,
             naam: vies.naam, gecontroleerd, uniekBevestigd: false };
  }

  const anderen = claims.filter((c) => c.id !== eigenRij.id);
  if (anderen.length) {
    const oudste = claims
      .slice()
      .sort((a, b) => String(a.createdTime || '').localeCompare(String(b.createdTime || '')))[0];
    if (oudste && oudste.id !== eigenRij.id) {
      // Wij zijn niet de eerste: eigen claim terugdraaien.
      try { await schrijfVat(eigenRij.id, ''); }
      catch (e) { console.warn('[vat] eigen claim terugdraaien mislukt:', e && e.message); }
      return {
        ok: false, code: 'in_gebruik', vat: genormaliseerd, land: vorm.land,
        melding: 'Dit btw-nummer hoort al bij een ander Helvaro-account. '
               + 'Eén bedrijf, één account — log in op het bestaande account of neem contact op.',
      };
    }
  }

  return { ok: true, code: 'ok', vat: genormaliseerd, land: vorm.land,
           naam: vies.naam, gecontroleerd, uniekBevestigd: true };
}

module.exports = {
  normaliseer, vormOk, viesControle, controleerEnClaim,
  VELD_VAT, CLIENTS_TABLE, EU_PATRONEN,
};
