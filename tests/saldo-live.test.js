/*
 * Het creditsaldo stond stil tot je ververste.
 *
 * ── Wat de eigenaar zag ─────────────────────────────────────────────────────
 * Je stelt Faro een vraag, of laat een pandbeeld maken. Dat kost credits — de
 * server boekt ze ook echt af. Maar de teller in het CRM bleef staan. Pas als
 * je toevallig naar een andere pagina klikte of de boel ververste, sprong hij
 * ineens een stuk omlaag.
 *
 * Het scherm loog dus stelselmatig te laag over je verbruik, en op het moment
 * dat het ertoe doet (vlak voor je limiet) was het het minst betrouwbaar.
 *
 * ── Waarom ──────────────────────────────────────────────────────────────────
 * loadCreditUsage() zit op een rem van vier minuten en werd alleen aangeroepen
 * vanuit refreshData(), dat elke tien minuten draait. Er was geen enkel pad van
 * "actie klaar" naar "teller bijwerken".
 *
 * ── De oplossing ────────────────────────────────────────────────────────────
 * Elke schrijfactie die credits kan kosten loopt langs dezelfde fetch-wrapper
 * (die daar al CSRF- en Clerk-tokens aanhangt). Eén plek is betrouwbaarder dan
 * het per knop onthouden. Samengevoegd over 1,2 s, en credit-usage zelf
 * uitgesloten omdat die zichzelf anders blijft aanroepen.
 */
'use strict';

/* Zonder deze vlag laat api/dashboard.js de hele Faro-UI weg, en dan staat het
   'done'-blok waar het saldo bijgewerkt wordt niet in de uitvoer. */
process.env.FARO_WORKSPACE_ENABLED = '1';

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

delete require.cache[require.resolve('../api/dashboard.js')];
const dash = require('../api/dashboard.js');
let html = '';
dash({ method: 'GET', url: '/dashboard', headers: {} },
     { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });

console.log('\n— de wrapper werkt het saldo bij —');
ck('er is een samenvoegende bijwerker',
   /function saldoStraksBijwerken\(\)/.test(html), null);
ck('die loadCreditUsage FORCEERT (anders houdt de rem van 4 min hem tegen)',
   /loadCreditUsage\(true\)/.test(html), null);
ck('alleen na een POST naar /api/leads of /api/faro',
   /kanCreditsKosten = sameOrigin && method === 'POST'/.test(html)
   && /api\/leads.*> -1 \|\| url\.indexOf\('\/api\/faro'\)/.test(html), null);
ck('en alleen als het verzoek slaagde',
   /if \(kanCreditsKosten && r && r\.ok\) saldoStraksBijwerken\(\);/.test(html), null);
ck('credit-usage zelf is uitgesloten, anders roept hij zichzelf aan',
   /indexOf\('credit-usage'\) === -1/.test(html), null);
ck('beide doorgeefpaden (met en zonder Clerk) werken bij',
   (html.match(/if \(kanCreditsKosten && r && r\.ok\) saldoStraksBijwerken\(\);/g) || []).length === 2,
   (html.match(/if \(kanCreditsKosten && r && r\.ok\) saldoStraksBijwerken\(\);/g) || []).length);

console.log('\n— en Faro werkt hem ook zelf bij na een beurt —');
ck('bij done wordt het saldo geforceerd opgehaald',
   /case 'done':[\s\S]{0,700}loadCreditUsage\(true\)/.test(html), null);

console.log('\n— de rem bestaat nog wel voor de poll —');
ck('loadCreditUsage kent nog steeds een interval',
   /CREDIT_USAGE_MIN_INTERVAL/.test(html), null);
ck('en refreshData roept hem nog ongeforceerd aan',
   /loadCreditUsage\(\); \/\/ internally throttled/.test(html), null);

// ── Gedrag: de samenvoeging moet echt samenvoegen ──────────────────────────
console.log('\n— de samenvoeging in bedrijf —');
{
  /* De wrapper uit de uitgestuurde pagina lichten en draaien met een nagemaakte
     fetch, zodat gemeten wordt wat er gebeurt in plaats van hoe het er staat. */
  const vm = require('vm');
  const start = html.indexOf('var _fetch = window.fetch.bind(window);');
  const eind  = html.indexOf('})();', start);
  const brok  = html.slice(start, eind);

  let opgehaald = 0;
  const sandbox = {
    window: {}, document: { cookie: '' }, location: { origin: 'https://app.helvaro.pro' },
    Headers: class { constructor(o) { this._ = Object.assign({}, o); }
                     has(k) { return k.toLowerCase() in this._; }
                     set(k, v) { this._[k.toLowerCase()] = v; } },
    CLERK_READY: false,
    // Staat vlak boven de uitgelichte brok en hoort dus niet in de knip.
    csrfToken: () => 'test-csrf',
    loadCreditUsage: (force) => { if (force) opgehaald++; },
    setTimeout, clearTimeout, console,
  };
  sandbox.window.fetch = async () => ({ ok: true });
  vm.createContext(sandbox);
  vm.runInContext(brok, sandbox);

  const post = (body) => sandbox.window.fetch('/api/leads', { method: 'POST', body });

  (async () => {
    await Promise.all([post('{"mode":"test-message"}'), post('{"mode":"x"}'), post('{"mode":"y"}')]);
    await new Promise(r => setTimeout(r, 1600));
    ck('drie acties achter elkaar geven één bijwerking, geen drie',
       opgehaald === 1, opgehaald);

    opgehaald = 0;
    await post('{"mode":"credit-usage"}');
    await new Promise(r => setTimeout(r, 1600));
    ck('een credit-usage-verzoek werkt zichzelf niet bij', opgehaald === 0, opgehaald);

    opgehaald = 0;
    await sandbox.window.fetch('/api/leads', { method: 'GET' });
    await new Promise(r => setTimeout(r, 1600));
    ck('een GET werkt niets bij', opgehaald === 0, opgehaald);

    opgehaald = 0;
    sandbox.window.fetch = async () => ({ ok: false, status: 500 });
    vm.runInContext(brok, sandbox);
    await sandbox.window.fetch('/api/leads', { method: 'POST', body: '{"mode":"test-message"}' });
    await new Promise(r => setTimeout(r, 1600));
    ck('een mislukte actie werkt niets bij', opgehaald === 0, opgehaald);

    console.log(`\n${pass} ok, ${fail} fout`);
    process.exit(fail ? 1 : 0);
  })();
}
