'use strict';
/*
 * Het register van voorraadproviders.
 *
 * Een provider is een bron waar de voorraad van een dealer vandaan komt (of,
 * later, naartoe gaat). api/_inventaris.js kent GEEN enkel platform: het vraagt
 * dit register om de provider bij een bron en praat verder alleen tegen het
 * gemeenschappelijke contract hieronder. Een platform erbij is een bestand in
 * deze map plus een regel in PROVIDERS -- verder verandert er niets.
 *
 * ── Het contract ────────────────────────────────────────────────────────────
 *   id                 korte sleutel, ook de provider-naam in vehicle_listings
 *   label              naam voor de dealer
 *   status             ACTIVE | BETA | COMING_SOON | FEED_REQUIRED | MANUAL | DISABLED
 *   auth               none | feed_url | api_key | basic | partner | csv
 *   kentReservering    weet het platform van "gereserveerd"? (zo niet, dan
 *                      draait de sync een reservering van de dealer niet terug)
 *   capabilities       { lezen, publiceren, leads } -- wat Helvaro NU kan, niet
 *                      wat het platform in theorie aanbiedt
 *   saneer(ruw)        de providerspecifieke velden van een bron, gesaneerd
 *   haal(bron, opties) -> { formaat, voertuigen, ongeldig, hash }; gooit bij fouten
 *   health(bron)       zonder netwerk: { ok, toestand }
 *   normaliseerFout(e) -> { code, sleutel, legacy }  (zie ./fouten.js)
 *
 * Statussen en wat de sync ermee doet:
 *   ACTIVE, BETA, MANUAL    synchroniseren
 *   FEED_REQUIRED           inloggegevens bewaren, NIET synchroniseren (wacht op activatie)
 *   COMING_SOON, DISABLED   niets: geen bewaren, geen synchroniseren
 *
 * Geen route: onderstreepje voorop.
 */

const feed = require('./feed').provider;
const autoscout24 = require('./autoscout24').provider;
const { maakAanvraag, maakNietBeschikbaar, maakHandmatig } = require('./aanvragen');

const STATUSSEN = Object.freeze(['ACTIVE', 'BETA', 'COMING_SOON', 'FEED_REQUIRED', 'MANUAL', 'DISABLED']);
const AUTHTYPES = Object.freeze(['none', 'feed_url', 'api_key', 'basic', 'partner', 'csv']);
const SYNCBAAR = Object.freeze(['ACTIVE', 'BETA', 'MANUAL']);
const BEWAARBAAR = Object.freeze(['ACTIVE', 'BETA', 'MANUAL', 'FEED_REQUIRED']);

const LIJST = [
  feed,
  autoscout24,
  /* AutoScout24 Listing Creation API: Basic Auth per dealeraccount. Of die API
     de EIGEN advertenties ook kan LEZEN is niet geverifieerd; zie
     docs/integrations/autoscout24_api. Tot dan: bewaren, niet lezen. */
  maakAanvraag({ id: 'autoscout24_api', label: 'AutoScout24 (API)', auth: 'basic' }),
  /* mobile.de Seller API: de dealer haalt zijn inloggegevens uit zijn
     Dealer Area. Nog niet geactiveerd voor Helvaro. */
  maakAanvraag({ id: 'mobile_de', label: 'mobile.de', auth: 'basic' }),
  /* 2dehands en Marktplaats hebben geen eigen API; alleen gecertificeerde
     partners (Hexon, IZI Motive) leveren de voorraad aan. */
  maakNietBeschikbaar({ id: 'tweedehands', label: '2dehands', status: 'COMING_SOON', auth: 'partner' }),
  maakNietBeschikbaar({ id: 'marktplaats', label: 'Marktplaats', status: 'COMING_SOON', auth: 'partner' }),
  maakNietBeschikbaar({ id: 'vroom', label: 'Vroom.be', status: 'COMING_SOON', auth: 'partner' }),
  /* Gocar.be: geen publieke dealerkoppeling gevonden. Heeft de dealer een
     export, dan loopt die via het gewone feedpad. */
  maakHandmatig({ id: 'gocar', label: 'Gocar.be', auth: 'csv' }),
  /* Meta: de automotive-catalogusfeed is een PUBLICEERkanaal (voorraad naar
     Meta), geen bron. */
  maakNietBeschikbaar({ id: 'meta', label: 'Meta (Facebook/Instagram)', status: 'COMING_SOON', auth: 'partner' }),
  /* Heycar is niet actief in Belgie. */
  maakNietBeschikbaar({ id: 'heycar', label: 'heycar', status: 'DISABLED', auth: 'none' }),
];

const PROVIDERS = Object.freeze(LIJST.reduce((o, p) => { o[p.id] = Object.freeze(p); return o; }, {}));

/** De provider bij een id, of null. */
function get(id) { return Object.prototype.hasOwnProperty.call(PROVIDERS, id) ? PROVIDERS[id] : null; }
function lijst() { return LIJST.slice(); }
function kanSyncen(p) { return Boolean(p) && SYNCBAAR.indexOf(p.status) !== -1; }
function kanBewaren(p) { return Boolean(p) && BEWAARBAAR.indexOf(p.status) !== -1; }
/** Heeft deze provider inloggegevens (en dus versleutelde opslag) nodig? */
function vraagtCredentials(p) { return Boolean(p) && (p.auth === 'basic' || p.auth === 'api_key'); }

/** Het contract nagaan; geeft een lijst problemen (leeg = in orde). */
function controleerContract(p) {
  const fouten = [];
  if (!p || typeof p !== 'object') return ['geen object'];
  if (!/^[a-z0-9_]{2,30}$/.test(String(p.id))) fouten.push('id');
  if (!p.label) fouten.push('label');
  if (STATUSSEN.indexOf(p.status) === -1) fouten.push('status');
  if (AUTHTYPES.indexOf(p.auth) === -1) fouten.push('auth');
  if (typeof p.kentReservering !== 'boolean') fouten.push('kentReservering');
  const c = p.capabilities;
  if (!c || ['lezen', 'publiceren', 'leads'].some((k) => typeof c[k] !== 'boolean')) fouten.push('capabilities');
  for (const fn of ['haal', 'health', 'normaliseerFout', 'saneer']) if (typeof p[fn] !== 'function') fouten.push(fn);
  return fouten;
}

module.exports = { PROVIDERS, STATUSSEN, AUTHTYPES, get, lijst, kanSyncen, kanBewaren, vraagtCredentials, controleerContract };
