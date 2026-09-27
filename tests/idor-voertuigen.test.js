'use strict';
/*
 * Dealer B kan niet aan de wagens van dealer A (audit 26/09).
 *
 * tests/idor-matrix.test.js voert de aanval uit op afspraken, leads en
 * gesprekken. De voertuigmodes (vehicle-save, vehicle-archive, vehicle-list)
 * waren alleen door codelezing gedekt. Hier de echte route, met de sessie van
 * B tegen de code van een wagen van A, via een nagemaakte Airtable die de
 * filterformule echt toepast.
 */
const crypto = require('crypto');
process.env.SESSION_SECRET = 'idor-voertuigen-secret';
process.env.BASE_AIRTABLE = 'appZelftest';
process.env.API_AIRTABLE = 'patZelftest';
delete process.env.CLERK_ENABLED;
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got).slice(0, 300)}`); ok ? pass++ : fail++; };

const A = 'DEALERAAA1', B = 'DEALERBBB2';
function sessie(projectCode) {
  const secret = crypto.createHmac('sha256', process.env.SESSION_SECRET).update('helvaro-session-v1').digest('hex');
  const p = Buffer.from(JSON.stringify({ projectCode, clientName: 'T ' + projectCode, calendlyLink: '', exp: Date.now() + 3600000 })).toString('base64url');
  return `hvs1.${p}.${crypto.createHmac('sha256', secret).update(p).digest('base64url')}`;
}

/* De wagen van A. De nep-Airtable past {Project Code} en {Vehicle Code} uit de
   formule echt toe; een formule zonder tenantfilter zou hem teruggeven. */
const WAGEN_A = { id: 'recWAGENAAAAAAAAA', createdTime: '2026-09-01T00:00:00.000Z',
  fields: { 'Vehicle Code': 'V1', 'Project Code': A, Make: 'BMW', Model: 'M4', Price: 74999, Status: 'beschikbaar' } };
const schrijf = [];
global.fetch = async (url, opts) => {
  const u = decodeURIComponent(String(url));
  const method = (opts && opts.method) || 'GET';
  if (method !== 'GET') schrijf.push({ u, method, body: opts && opts.body });
  if (u.includes('/vehicles')) {
    if (method === 'GET') {
      const f = (u.match(/filterByFormula=([^&]*)/) || [])[1] || '';
      const pc = (f.match(/\{Project Code\}="([^"]*)"/) || [])[1];
      const code = (f.match(/UPPER\(\{Vehicle Code\}\)="([^"]*)"/) || [])[1];
      let rows = [WAGEN_A];
      if (f && !pc) rows = [];                      // zonder tenantfilter niets teruggeven: dat zou de bug zijn
      if (pc) rows = rows.filter((r) => r.fields['Project Code'] === pc);
      if (code) rows = rows.filter((r) => r.fields['Vehicle Code'] === code);
      return { ok: true, status: 200, json: async () => ({ records: rows }), text: async () => '' };
    }
    return { ok: true, status: 200, json: async () => ({ records: [WAGEN_A], id: WAGEN_A.id, fields: WAGEN_A.fields }), text: async () => '' };
  }
  return { ok: true, status: 200, json: async () => ({ records: [] }), text: async () => '' };
};

function maakRes() {
  return { _code: 200, _json: null, _h: {}, setHeader(k, v) { this._h[k] = v; return this; }, getHeader(k) { return this._h[k]; },
    status(c) { this._code = c; return this; }, json(o) { this._json = o; return this; }, send(b) { this._json = b; return this; }, end() { return this; } };
}
async function roep(body, token) {
  delete require.cache[require.resolve('../api/leads.js')];
  const leads = require('../api/leads.js');
  const res = maakRes();
  await leads({ method: 'POST', url: '/api/leads', headers: { 'content-type': 'application/json', 'x-api-key': token }, query: {}, body, socket: { remoteAddress: '10.8.8.8' } }, res);
  return res;
}

(async () => {
  console.log('\n— dealer B tegen de wagen van dealer A —');
  schrijf.length = 0;
  let r = await roep({ mode: 'vehicle-archive', code: 'V1' }, sessie(B));
  ck('vehicle-archive: 404', r._code === 404, { code: r._code, json: r._json });
  ck('en er is niets geschreven', !schrijf.some((s) => s.method === 'PATCH' || s.method === 'DELETE'), schrijf);

  schrijf.length = 0;
  r = await roep({ mode: 'vehicle-save', vehicle: { code: 'V1', merk: 'Gestolen', model: 'X', prijs: 1 } }, sessie(B));
  const raakteA = schrijf.some((s) => /recWAGENAAAAAAAAA/.test(s.u) || /recWAGENAAAAAAAAA/.test(String(s.body || '')));
  ck('vehicle-save met de code van A: het record van A wordt NIET overschreven', !raakteA, { code: r._code, schrijf });

  schrijf.length = 0;
  r = await roep({ mode: 'vehicle-list' }, sessie(B));
  const lijst = (r._json && (r._json.vehicles || r._json.voertuigen)) || [];
  ck('vehicle-list van B bevat de wagen van A niet', !lijst.some((v) => v.code === 'V1' && v.merk === 'BMW'), r._json);

  console.log('\n— dezelfde modes werken wel voor dealer A zelf —');
  schrijf.length = 0;
  r = await roep({ mode: 'vehicle-archive', code: 'V1' }, sessie(A));
  ck('A kan zijn eigen wagen archiveren', r._code === 200 && schrijf.some((s) => s.method === 'PATCH'), { code: r._code, json: r._json, schrijf });

  console.log('\n— zonder sessie nergens —');
  r = await roep({ mode: 'vehicle-list' }, 'geen-geldige-sessie');
  ck('vehicle-list zonder sessie: 401/403', r._code === 401 || r._code === 403, r._code);

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
