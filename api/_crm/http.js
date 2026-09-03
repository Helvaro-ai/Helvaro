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

/* ── Wat er NOOIT in een logregel mag staan ────────────────────────────────
   `detail` is het RUWE antwoord van de leverancier. Dat is precies waarom het
   nuttig is -- en precies waarom het gevaarlijk is: sommige API's echoën het
   verzoek terug, inclusief de querystring. Pipedrive zet zijn token daar
   (?api_token=...), dus een foutmelding van hen kan letterlijk de sleutel van
   een klant bevatten. Die belandt dan in de Vercel-logs, waar hij blijft staan
   en door iedereen met logtoegang te lezen is.

   Daarom gaat alles wat `detail` heet eerst hier langs. Liever een logregel
   met een sterretje erin dan een sleutel die je niet meer terug kunt halen. */
const GEHEIM_PATRONEN = [
  /* querystring: api_token=..., access_token=..., key=..., secret=... */
  /\b(api_token|access_token|refresh_token|token|api_key|apikey|key|secret|client_secret|password|pwd)=([^&\s"']{4,})/gi,
  /* JSON: "access_token":"...", 'secret': '...' */
  /(["']?(?:api_token|access_token|refresh_token|token|api_key|apikey|secret|client_secret|password)["']?\s*:\s*["'])([^"']{4,})(["'])/gi,
  /* Authorization: Bearer ... */
  /\b(Bearer|Basic)\s+([A-Za-z0-9._~+/=-]{8,})/gi,
];

function schoonDetail(tekst) {
  let t = String(tekst == null ? '' : tekst);
  t = t.replace(GEHEIM_PATRONEN[0], (_m, sleutel) => `${sleutel}=***`);
  t = t.replace(GEHEIM_PATRONEN[1], (_m, kop, _waarde, staart) => `${kop}***${staart}`);
  t = t.replace(GEHEIM_PATRONEN[2], (_m, schema) => `${schema} ***`);
  return t;
}

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
    this.detail = schoonDetail(opts.detail || '');
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
      /* ── GEEN omleidingen volgen ──────────────────────────────────────────
         Dit is de belangrijkste regel in dit bestand.

         Drie adapters roepen een adres aan dat de KLANT opgaf. Dat adres wordt
         gecontroleerd (api/_crm/adres.js): alleen https, en elk IP achter de
         hostnaam moet publiek zijn. Maar fetch() volgt standaard tot twintig
         omleidingen, en die controle geldt alleen voor de EERSTE hop. Een
         volstrekt net publiek adres dat 307 antwoordt met
         Location: http://169.254.169.254/... haalt onze server dus alsnog het
         interne netwerk in -- met de POST en de body intact.

         Dat is geen theorie: het is nagespeeld tegen een lokale omleider, en de
         "interne" server werd geraakt.

         api/_lib/fetch-website.js deed dit al goed, met exact deze reden erbij
         ("Don't follow redirects to internal IPs"). Deze module week daarvan af.
         Een 3xx is nu een fout in plaats van een sprong; loopt er ooit een
         leverancier op stuk, dan zegt scripts/crm-check.js dat meteen. */
      redirect: 'manual',
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

  /* Met redirect:'manual' komt een 3xx hier terecht in plaats van gevolgd te
     worden. Een eigen code, zodat het scherm de klant iets bruikbaars kan
     zeggen in plaats van "geweigerd". */
  if (res.status >= 300 && res.status < 400) {
    throw new CrmError(
      `${leverancier} stuurde ons door naar een ander adres. Geef het eindadres op.`,
      { code: 'omleiding', status: res.status, detail: `Location: ${res.headers.get('location') || '(geen)'}` },
    );
  }

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

module.exports = { vraag, json, CrmError, schoonDetail, STANDAARD_TIMEOUT_MS };
