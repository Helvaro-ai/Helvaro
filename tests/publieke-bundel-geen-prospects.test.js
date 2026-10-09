'use strict';
/*
 * De dashboardbundel /dashboard.js wordt aan iedereen geserveerd, zonder login,
 * en een jaar publiek gecachet. Op 2026-10-09 stonden daarin de dagtaken van het
 * founder-dashboard: namen, e-mailadressen en een telefoonnummer van prospects.
 * Die lijst komt nu van api/admin.js, achter de admin-controle.
 *
 * Bewaakt:
 *   1. de bundel bevat geen dagtakeninhoud en geen onverwachte e-mailadressen;
 *   2. de dagtaken zijn er nog, maar alleen via de admin-route (401 zonder sleutel).
 */
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

function render(pad) {
  delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
  const dash = require(BASE + 'api/dashboard.js');
  let uit = '';
  const q = pad.indexOf('?') > -1 ? Object.fromEntries(new URLSearchParams(pad.split('?')[1])) : {};
  dash({ method: 'GET', url: pad, query: q, headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { uit = String(b); }, end(b) { if (b) uit = String(b); }, json() {} });
  return uit;
}

(async () => {
  const js = render('/dashboard.js?asset=js');
  ck('bundel gerenderd', js.length > 100000, js.length);
  const { DAILY_TASKS } = require(BASE + 'api/_founder-dagtaken.js');
  const voorbeelden = Object.values(DAILY_TASKS).flat().map(t => t.detail).filter(d => d && d.length > 25);
  ck('dagtaken hebben inhoud (bron bestaat nog)', voorbeelden.length > 5, voorbeelden.length);
  const gelekt = voorbeelden.filter(d => js.includes(d));
  ck('geen enkele dagtaak-tekst staat in de publieke bundel', gelekt.length === 0, gelekt.slice(0, 2));
  // Voorbeeldadressen (plaatshouders) en publieke supportadressen mogen.
  const toegestaneDomeinen = ['helvaro.pro', 'acme.be', 'bedrijf.be', 'example.com', 'team.mobile.de'];
  const mails = (js.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g) || [])
    .filter(m => !toegestaneDomeinen.includes(m.split('@')[1].toLowerCase()));
  ck('geen onverwachte e-mailadressen in de publieke bundel', mails.length === 0, mails.slice(0, 5));

  // admin-route: zonder sleutel 401, met geldige afgeleide sleutel de dagtaken
  process.env.ADMIN_KEY = 'test-admin-sleutel'; process.env.BASE_AIRTABLE = 'appTest'; process.env.API_AIRTABLE = 'patTest';
  const admin = require(BASE + 'api/admin.js');
  const crypto = require('crypto');
  const tok = crypto.createHmac('sha256', process.env.ADMIN_KEY).update('helvaro-admin-v1').digest('hex');
  const roep = async (key) => {
    const res = { _c: 200, _j: null, setHeader() {}, getHeader() {}, status(c) { this._c = c; return this; }, json(o) { this._j = o; return this; }, send(b) { this._j = b; return this; }, end() { return this; } };
    await admin({ method: 'GET', url: '/api/admin?section=founder&type=dagtaken', query: { section: 'founder', type: 'dagtaken' }, headers: key ? { 'x-api-key': key } : {} }, res);
    return res;
  };
  const zonder = await roep('');
  ck('zonder admin-sleutel: 401', zonder._c === 401, zonder._c);
  const met = await roep(tok);
  ck('met admin-sleutel: de dagtaken', met._c === 200 && met._j && met._j.dagtaken && Object.keys(met._j.dagtaken).length === 5, [met._c, met._j && Object.keys(met._j.dagtaken || {})]);

  console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
