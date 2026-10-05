'use strict';
/*
 * Gedeelde HTTP-hulp voor de API-providers (AutoScout24 API, mobile.de).
 *
 * Wat hier staat is wat beide officiele API's van een client vragen:
 *   - Basic Auth (de Authorization-header wordt hier gebouwd en nergens gelogd)
 *   - een time-out op elk verzoek
 *   - bij 429 en 5xx (behalve 503, onderhoud) een paar keer opnieuw met
 *     exponentieel uitstel en jitter: 100, 200, 400 ms. AutoScout24 vraagt dit
 *     letterlijk in zijn foutafhandeling; mobile.de zegt niets over tempo, dus
 *     daar geldt hetzelfde voorzichtige beleid.
 *   - een fout die de status meedraagt, zodat ./fouten.js hem kan vertalen.
 *
 * Elke aanroep loopt via een inspuitbare fetch (opties.fetch) en wacht (opties.wacht),
 * zodat tests nooit het net op gaan en nooit echt wachten. De tekst van een
 * fout bevat NOOIT de header of het adres met geheimen; alleen de status.
 *
 * Geen route: onderstreepje voorop.
 */

const { maakFout, vanHttp } = require('./fouten');

const MAX_ANTWOORD_BYTES = 20 * 1024 * 1024;
const UITSTEL_MS = Object.freeze([100, 200, 400]);

function basicHeader(gebruiker, wachtwoord) {
  return 'Basic ' + Buffer.from(String(gebruiker) + ':' + String(wachtwoord), 'utf8').toString('base64');
}

const slaap = (ms) => new Promise((klaar) => setTimeout(klaar, ms));

/** Een fout voor een niet-geslaagde HTTP-status. `verfijn(status)` mag code en zin bepalen. */
function statusFout(status, label, verfijn) {
  const extra = { http: status };
  const v = verfijn ? verfijn(status) : null;
  if (v) Object.assign(extra, { genormaliseerd: v.genormaliseerd, sleutel: v.sleutel });
  /* Een andere 4xx (400, 404, 405, 422): het platform begreep ons verzoek niet. */
  else if (!vanHttp(status)) extra.genormaliseerd = 'INVALID_DATA';
  return maakFout(label + ' antwoordde HTTP ' + status, 'provider_http', extra);
}

/**
 * Een JSON-antwoord ophalen.
 * @param {string} url
 * @param {{fetch?:Function, wacht?:Function, headers?:object, timeoutMs?:number,
 *          label?:string, verfijn?:Function, eindtijd?:number, geenRetry?:number[]}} o
 * @returns {Promise<any>} het geparseerde JSON-lichaam
 */
async function haalJson(url, o = {}) {
  const haal = o.fetch || fetch;
  const wacht = o.wacht || slaap;
  const label = o.label || 'platform';
  let laatste;
  for (let poging = 0; poging <= UITSTEL_MS.length; poging++) {
    if (o.eindtijd && Date.now() > o.eindtijd) throw maakFout(label + ': tijd op', 'bron_onvolledig');
    const r = await haal(url, { method: 'GET', redirect: 'manual', headers: o.headers || {}, signal: AbortSignal.timeout(o.timeoutMs || 10000) });
    if (r.status >= 300 && r.status < 400) throw maakFout(label + ' stuurde door', 'bron_omleiding', { http: r.status });
    if (r.ok) {
      const tekst = await r.text();
      if (tekst.length > MAX_ANTWOORD_BYTES) throw maakFout(label + ': antwoord te groot', 'feed_te_groot');
      try { return JSON.parse(tekst); } catch (_) { throw maakFout(label + ': antwoord onleesbaar', 'bron_onleesbaar'); }
    }
    laatste = statusFout(r.status, label, o.verfijn);
    const opnieuw = r.status === 429 || (r.status >= 500 && r.status !== 503);
    if (!opnieuw || poging === UITSTEL_MS.length) break;
    /* Jitter: tot 25% erbij, zodat parallelle verzoeken niet tegelijk terugkomen. */
    await wacht(UITSTEL_MS[poging] + Math.floor(Math.random() * UITSTEL_MS[poging] * 0.25));
  }
  throw laatste;
}

module.exports = { basicHeader, haalJson, statusFout, MAX_ANTWOORD_BYTES, UITSTEL_MS };
