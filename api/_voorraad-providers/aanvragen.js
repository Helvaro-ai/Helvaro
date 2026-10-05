'use strict';
/*
 * Providers die (nog) niet kunnen synchroniseren: de officiele API-koppelingen
 * die op activatie wachten, en de platformen waar Helvaro nog geen toegang toe
 * heeft. Eerlijk uitgedrukt in code:
 *
 *   FEED_REQUIRED  de dealer kan inloggegevens bewaren, maar haal() gooit
 *                  'activatie_vereist' -- er is voor Helvaro nog geen
 *                  geactiveerde API-toegang. Geen verzonnen eindpunten.
 *   COMING_SOON    er bestaat (nog) geen koppeling. Niets te bewaren.
 *   DISABLED       bestaat niet voor deze markt. Niets te bewaren.
 *   MANUAL         geen API, wel een export die de dealer zelf kan aanleveren;
 *                  loopt via het gewone feedpad (zie maakHandmatig).
 *
 * De sync slaat alles wat niet kan synchroniseren over (zie kanSyncen in
 * ./index.js) -- zo veroorzaakt een in afwachting staande koppeling geen
 * foutmelding elk uur. Wie haal() toch rechtstreeks aanroept, krijgt een
 * duidelijke fout.
 *
 * Geen route: onderstreepje voorop.
 */

const { normaliseer, maakFout } = require('./fouten');
const credentials = require('./credentials');
const feed = require('./feed').provider;

function basis(o) {
  return Object.assign({
    kentReservering: false,
    capabilities: { lezen: false, publiceren: false, leads: false },
    normaliseerFout: normaliseer,
  }, o);
}

/** FEED_REQUIRED: bewaart inloggegevens, kan nog niet lezen. */
function maakAanvraag(o) {
  return basis(Object.assign({
    status: 'FEED_REQUIRED',
    saneer: () => ({}),
    async haal(bron) {
      if (!bron || !bron.credentials || !credentials.ontsleutel(bron.credentials)) {
        throw maakFout(o.label + ': geen inloggegevens ingesteld', 'geen_credentials');
      }
      throw maakFout(o.label + ': de API-toegang is voor Helvaro nog niet geactiveerd', 'activatie_vereist');
    },
    async health(bron) {
      if (!bron || !bron.credentials) return { ok: false, toestand: 'niet_geconfigureerd' };
      return { ok: false, toestand: 'wacht_op_activatie' };
    },
  }, o));
}

/** COMING_SOON / DISABLED: niets te doen en niets te bewaren. */
function maakNietBeschikbaar(o) {
  return basis(Object.assign({
    saneer: () => ({}),
    async haal() { throw maakFout(o.label + ': deze koppeling is niet beschikbaar', 'provider_niet_beschikbaar'); },
    async health() { return { ok: false, toestand: 'niet_beschikbaar' }; },
  }, o));
}

/** MANUAL: dezelfde weg als een feed, voor wie een export heeft. */
function maakHandmatig(o) {
  return basis(Object.assign({
    status: 'MANUAL',
    capabilities: { lezen: true, publiceren: false, leads: false },
    saneer: feed.saneer,
    haal: (bron, opties) => feed.haal(bron, opties),
    health: (bron) => feed.health(bron),
  }, o));
}

module.exports = { maakAanvraag, maakNietBeschikbaar, maakHandmatig };
