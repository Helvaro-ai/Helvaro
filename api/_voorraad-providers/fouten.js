'use strict';
/*
 * Genormaliseerde bronfouten.
 *
 * Elke provider gooit zijn eigen fouten (een HTTP-status, een Nederlandse
 * technische melding, een code als 'feed_leeg'). Het dashboard en de alarmen
 * willen daar niets van weten: ze willen een van negen woorden, en een zin in
 * de taal van de dealer. Dit bestand is de enige plek die de vertaalslag
 * maakt; elke provider krijgt hem gratis via normaliseerFout().
 *
 * De technische tekst (e.message) gaat NOOIT naar de dealer. Die staat in de
 * serverlog en in de run-geschiedenis; de dealer krijgt de sleutel hieronder.
 *
 * Geen route: onderstreepje voorop.
 */

const CODES = Object.freeze([
  'AUTH_ERROR', 'RATE_LIMIT', 'PROVIDER_DOWN', 'INVALID_DATA', 'MISSING_FIELD',
  'DUPLICATE_VEHICLE', 'PERMISSION_DENIED', 'SYNC_TIMEOUT', 'UNKNOWN_ERROR',
]);

/* Bestaande codes uit api/_inventaris.js en de providers -> genormaliseerd.
   Een tweede element overschrijft de zinssleutel: voor twee gevallen is de
   standaardzin van de code te algemeen. */
const LEGACY = Object.freeze({
  geen_url:                   ['MISSING_FIELD'],
  geen_credentials:           ['MISSING_FIELD'],
  url_geweigerd:              ['INVALID_DATA'],
  ongeldig_adres:             ['INVALID_DATA'],
  feed_leeg:                  ['INVALID_DATA'],
  bron_onleesbaar:            ['INVALID_DATA'],
  feed_te_groot:              ['INVALID_DATA'],
  feed_omleiding:             ['INVALID_DATA'],
  bron_omleiding:             ['INVALID_DATA'],
  feed_http:                  ['PROVIDER_DOWN'],
  bron_onvolledig:            ['SYNC_TIMEOUT'],
  bron_geweigerd:             ['PERMISSION_DENIED'],
  bron_geblokkeerd:           ['PERMISSION_DENIED'],
  voorraad_te_groot:          ['UNKNOWN_ERROR'],
  dubbel_voertuig:            ['DUPLICATE_VEHICLE'],
  activatie_vereist:          ['PERMISSION_DENIED', 'ig.fout.ACTIVATIE'],
  provider_niet_beschikbaar:  ['PERMISSION_DENIED', 'ig.fout.NIET_BESCHIKBAAR'],
});

const NETWERKCODES = /^(ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EHOSTUNREACH|UND_ERR_CONNECT_TIMEOUT)$/;

function vanHttp(status) {
  if (status === 401) return 'AUTH_ERROR';
  if (status === 403) return 'PERMISSION_DENIED';
  if (status === 429) return 'RATE_LIMIT';
  if (status === 408 || status === 504) return 'SYNC_TIMEOUT';
  if (status >= 500 && status < 600) return 'PROVIDER_DOWN';
  return '';
}

/**
 * @param {Error & {code?:string, http?:number, status?:number}} e
 * @returns {{code:string, sleutel:string, legacy:string}}
 *   code     een van CODES
 *   sleutel  i18n-sleutel van de zin voor de dealer
 *   legacy   de oorspronkelijke code, voor logs en tests
 */
function normaliseer(e) {
  const fout = e || {};
  if (CODES.indexOf(fout.genormaliseerd) !== -1) {
    return { code: fout.genormaliseerd, sleutel: 'ig.fout.' + fout.genormaliseerd, legacy: String(fout.code || '') };
  }
  const legacy = String(fout.code || '');
  const http = Number(fout.http || fout.status) || 0;
  const rij = LEGACY[legacy];
  let code = rij ? rij[0] : '';
  let sleutel = rij && rij[1] ? rij[1] : '';

  /* Een HTTP-status zegt meer dan de algemene code: feed_http is bij een 401
     een inlogprobleem, geen "bron is stuk"; een blokkade met 429 is een
     tempo-probleem, geen weigering. */
  if (legacy === 'bron_geblokkeerd') {
    /* Een 429 of 503 van een publieke pagina is "te snel, wacht"; al het andere
       (403, een captcha, een pagina zonder gegevens) is "hier mag je niet in". */
    code = (http === 429 || http === 503) ? 'RATE_LIMIT' : 'PERMISSION_DENIED';
  } else if (http && (legacy === 'feed_http' || !rij)) {
    const h = vanHttp(http);
    if (h) { code = h; sleutel = ''; }
  }
  if (!code) {
    if (fout.name === 'TimeoutError' || fout.name === 'AbortError' || /timed? ?out|aborted/i.test(String(fout.message || ''))) code = 'SYNC_TIMEOUT';
    else if (NETWERKCODES.test(String(fout.code || (fout.cause && fout.cause.code) || '')) || /fetch failed/i.test(String(fout.message || ''))) code = 'PROVIDER_DOWN';
    else code = 'UNKNOWN_ERROR';
  }
  return { code, sleutel: sleutel || 'ig.fout.' + code, legacy };
}

/** Een fout met een vaste code, zoals de providers hem gooien. */
function maakFout(bericht, legacyCode, extra) {
  const e = new Error(bericht);
  e.code = legacyCode;
  if (extra) Object.assign(e, extra);
  return e;
}

module.exports = { CODES, LEGACY, normaliseer, maakFout, vanHttp };
