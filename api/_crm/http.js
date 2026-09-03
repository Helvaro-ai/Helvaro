'use strict';
/*
 * CRM -- één manier om met een vreemde server te praten.
 *
 * -- Waarom dit niet per adapter --------------------------------------------
 * Vijf adapters is vijf keer dezelfde drie vergissingen: geen time-out (een
 * hangende CRM-server houdt dan een WhatsApp-antwoord tegen), de rauwe
 * foutmelding van de leverancier doorgeven aan de makelaar (die bevat soms de
 * verstuurde inhoud, en altijd een naam die de klant niets zegt), en een 429
 * behandelen alsof het een 500 is.
 *
 * -- Wat de klant te zien krijgt ---------------------------------------------
 * Nooit de tekst van de leverancier. `CrmError.message` is Nederlands en
 * geschreven voor een makelaar; `CrmError.detail` is voor de logs. Dat is
 * dezelfde scheiding als ProviderError in api/_faro/providers/index.js.
 */

const STANDAARD_TIMEOUT_MS = 12_000;

class CrmError extends Error {
  /**
   * @param {string} message  Nederlands, voor de klant. Geen leveranciersnaam
   *                          in de zin die op een fout duidt -- wél als het
   *                          over de KOPPELING gaat ("HubSpot weigerde de
   *                          sleutel") want dan is de naam juist de informatie.
   * @param {object} [opts]
   * @param {string}  [opts.code]       stabiele code voor de client
   * @param {boolean} [opts.opnieuw]    mag de aanroeper het later nog eens proberen
   * @param {string}  [opts.detail]     alleen voor console.error
   * @param {number}  [opts.status]     HTTP-status, als die er was
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = 'CrmError';
    this.code = opts.code || 'crm_fout';
    this.opnieuw = Boolean(opts.opnieuw);
    this.detail = opts.detail || '';
    this.status = opts.status || 0;
  }
}

/**
 * Eén HTTP-aanroep naar een CRM.
 *
 * Geeft de geparste JSON terug, of gooit een CrmError. Een lege body (204, of
 * een leverancier die niets teruggeeft bij een PATCH) is `{}` en geen fout.
 *
 * @param {string} url
 * @param {object} opties  { method, headers, body, timeoutMs, leverancier }
 */
async function vraag(url, opties = {}) {
  const leverancier = opties.leverancier || 'het CRM';
  const timeoutMs = opties.timeoutMs || STANDAARD_TIMEOUT_MS;

  let res;
  try {
    res = await fetch(url, {
      method:  opties.method || 'GET',
      headers: opties.headers || {},
      body:    opties.body,
      signal:  AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    /* Een time-out en een DNS-fout zijn voor de makelaar hetzelfde: het lukte
       niet, en het ligt niet aan hem. Allebei mag opnieuw geprobeerd worden. */
    const traag = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new CrmError(
      traag ? `${leverancier} reageerde niet op tijd.` : `${leverancier} was niet bereikbaar.`,
      { code: traag ? 'timeout' : 'onbereikbaar', opnieuw: true, detail: String(err && err.message) },
    );
  }

  const tekst = await res.text().catch(() => '');
  let json = {};
  if (tekst) { try { json = JSON.parse(tekst); } catch (_) { json = { _rauw: tekst.slice(0, 500) }; } }

  if (res.ok) return json;

  /* De statuscode bepaalt wat de aanroeper hierna kan. Dat onderscheid is het
     halve punt van deze functie: een 401 moet de koppeling als kapot markeren
     zodat de klant hem opnieuw legt, terwijl een 429 alleen betekent "straks". */
  if (res.status === 401 || res.status === 403) {
    throw new CrmError(
      `${leverancier} accepteerde de sleutels niet. Leg de koppeling opnieuw.`,
      { code: 'geen_toegang', status: res.status, detail: tekst.slice(0, 500) },
    );
  }
  if (res.status === 429) {
    throw new CrmError(
      `${leverancier} laat even geen verzoeken meer toe. We proberen het later opnieuw.`,
      { code: 'te_druk', opnieuw: true, status: 429, detail: tekst.slice(0, 300) },
    );
  }
  if (res.status >= 500) {
    throw new CrmError(
      `${leverancier} had een storing.`,
      { code: 'storing', opnieuw: true, status: res.status, detail: tekst.slice(0, 500) },
    );
  }
  /* 4xx die geen van de bovenstaande is: wij sturen iets wat zij niet willen.
     Dat is een bug of een schemaverschil, en opnieuw proberen lost het niet op. */
  throw new CrmError(
    `${leverancier} weigerde de gegevens.`,
    { code: 'geweigerd', status: res.status, detail: tekst.slice(0, 500) },
  );
}

/** JSON-verzoek: de headers en de body in één keer goed. */
function json(url, method, body, headers, opties = {}) {
  return vraag(url, {
    ...opties,
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

module.exports = { vraag, json, CrmError, STANDAARD_TIMEOUT_MS };
