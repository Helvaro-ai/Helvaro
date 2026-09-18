/*
 * api/leads.js, api/whatsapp.js, api/admin.js -- de buitenste vangnet-laag
 * (api/_errors.js's vangAf()) om de top-level handler.
 *
 * errors-taxonomie.test.js bewijst al dat vangAf() zelf correct werkt met een
 * synthetische functie. Deze test bewijst dat de VIER routegrenzen uit fase 3
 * pass 2 'm ook daadwerkelijk gebruiken: een rauwe, onverwachte throw vroeg in
 * de handler (voor elk inner try/catch) moet een veilige JSON-body + status
 * teruggeven in plaats van een onafgehandelde exception of hangend verzoek.
 *
 * Elke sectie forceert de throw via een Proxy op een property die de handler
 * gegarandeerd als EERSTE aanraakt, buiten elk bestaand try/catch-blok --
 * geen enkele bestaande innerlijke catch wordt hier getest of aangeraakt.
 */
'use strict';

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

function nepRes() {
  const uit = { code: 0, body: null, headersSent: false, ended: false, headers: {} };
  uit.setHeader = (k, v) => { uit.headers[k] = v; };
  uit.status = (c) => { uit.code = c; return uit; };
  uit.json = (b) => { uit.body = b; return uit; };
  uit.send = (b) => { uit.body = b; return uit; };
  uit.end = () => { uit.ended = true; return uit; };
  return uit;
}

function throwingProxy(propNaam, boodschap) {
  return new Proxy({}, {
    get(_t, prop) {
      if (prop === propNaam) throw new Error(boodschap);
      // Andere properties (bv. Symbol.toPrimitive, then) blijven onschadelijk.
      return undefined;
    },
  });
}

(async () => {
  const origConsoleError = console.error;
  let gelogd = '';
  console.error = (...args) => { gelogd += args.map(String).join(' ') + '\n'; };

  console.log('\n— api/leads.js: rauwe throw op req.method bereikt vangAf() —');
  {
    const leads = require('../api/leads.js');
    const req = { get method() { throw new Error('kapotte req.method lezer -- leads'); }, headers: {}, query: {} };
    const res = nepRes();
    gelogd = '';
    await leads(req, res);
    ck('status is 500 (INTERNAL, geen crash)', res.code === 500, res.code);
    ck('body lekt de onderliggende fout niet', !JSON.stringify(res.body || '').includes('kapotte req.method'), res.body);
    ck('body heeft het veilige .error-veld', res.body && typeof res.body.error === 'string', res.body);
    ck('de server-log bevat de echte oorzaak (voorLog())', gelogd.includes('kapotte req.method lezer -- leads'), gelogd);
  }

  console.log('\n— api/whatsapp.js: rauwe throw op req.query bereikt vangAf() —');
  {
    const whatsapp = require('../api/whatsapp.js');
    const req = { method: 'POST', headers: {}, get query() { throw new Error('kapotte req.query lezer -- whatsapp'); } };
    const res = nepRes();
    gelogd = '';
    await whatsapp(req, res);
    // req.query wordt gelezen VOOR whatsapp.js's eigen try (die begint pas bij
    // de handtekeningcontrole verderop) -- deze throw ontsnapt dus aan de
    // innerlijke catch en moet door vangAf() zelf worden opgevangen.
    ck('status is 500 (INTERNAL, geen crash)', res.code === 500, res.code);
    ck('body lekt de onderliggende fout niet', !JSON.stringify(res.body || '').includes('kapotte req.query'), res.body);
    ck('body heeft het veilige .error-veld', res.body && typeof res.body.error === 'string', res.body);
    ck('de server-log bevat de echte oorzaak (voorLog())', gelogd.includes('kapotte req.query lezer -- whatsapp'), gelogd);
  }

  console.log('\n— api/admin.js: rauwe throw op req.headers bereikt vangAf() —');
  {
    const admin = require('../api/admin.js');
    const req = { method: 'GET', get headers() { throw new Error('kapotte req.headers lezer -- admin'); } };
    const res = nepRes();
    gelogd = '';
    await admin(req, res);
    ck('status is 500 (INTERNAL, geen crash)', res.code === 500, res.code);
    ck('body lekt de onderliggende fout niet', !JSON.stringify(res.body || '').includes('kapotte req.headers'), res.body);
    ck('body heeft het veilige .error-veld', res.body && typeof res.body.error === 'string', res.body);
    ck('de server-log bevat de echte oorzaak (voorLog())', gelogd.includes('kapotte req.headers lezer -- admin'), gelogd);
  }

  console.log('\n— api/cron-followup.js: rauwe throw op req.method bereikt vangAf() —');
  {
    const cron = require('../api/cron-followup.js');
    const req = { get method() { throw new Error('kapotte req.method lezer -- cron'); }, headers: {} };
    const res = nepRes();
    gelogd = '';
    await cron(req, res);
    ck('status is 500 (INTERNAL, geen crash)', res.code === 500, res.code);
    ck('body lekt de onderliggende fout niet', !JSON.stringify(res.body || '').includes('kapotte req.method'), res.body);
  }

  console.log('\n— api/privacy.js en api/demo.js: sync handlers, vangAf() slaagt ook zonder await —');
  {
    const privacy = require('../api/privacy.js');
    const req = { get url() { throw new Error('kapotte req.url lezer -- privacy'); } };
    const res = nepRes();
    gelogd = '';
    await privacy(req, res);
    ck('privacy.js: status is 500, geen crash', res.code === 500, res.code);

    const demo = require('../api/demo.js');
    const req2 = {};
    const res2 = nepRes();
    // demo.js heeft geen enkele req-property-lezing die kan falen; dit
    // bewijst enkel dat de normale weg nog steeds werkt na het inpakken.
    await demo(req2, res2);
    ck('demo.js: normale respons blijft 200 (geen regressie)', res2.code === 200, res2.code);
  }

  console.error = origConsoleError;

  console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
