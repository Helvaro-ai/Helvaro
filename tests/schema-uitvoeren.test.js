'use strict';
/*
 * De schemamigratie draait betrouwbaar (2026-10-07).
 *
 * vehicle_listings werd in productie nooit aangemaakt. De lazy variant
 * (ensureLui) is fire-and-forget en wordt bevroren zodra de Vercel-functie
 * antwoordt; bovendien zei hij niets als de token geen schemarechten had.
 * De crons wachten nu af, met een tijdslimiet, en het log zegt wat er gebeurt.
 * Airtable's meta-API is hier nep; er gaat niets het net op.
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';
const schema = require(BASE + 'api/_schema.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

/* Logregels opvangen zonder de testuitvoer vol te schrijven. */
const logs = { log: [], warn: [], error: [] };
const echt = { log: console.log, warn: console.warn, error: console.error };
const vang = () => { for (const k of Object.keys(logs)) { logs[k] = []; console[k] = (...a) => logs[k].push(a.join(' ')); } };
const laat = () => { for (const k of Object.keys(logs)) console[k] = echt[k]; };

/* Nep meta-API. `toestand.tabellen` is wat er in de base staat. */
function nepMeta(opties = {}) {
  const toestand = { tabellen: opties.tabellen || [], posts: [], gets: 0, status: opties.status || 200, methoden: new Set() };
  global.fetch = async (url, o = {}) => {
    const u = String(url);
    const j = (d, status = 200) => ({ ok: status < 300, status, json: async () => d, text: async () => JSON.stringify(d) });
    if (!/\/meta\/bases\/appTEST\/tables/.test(u)) return j({}, 404);
    toestand.methoden.add(o.method || 'GET');
    if ((o.method || 'GET') === 'GET') {
      toestand.gets++;
      if (opties.hang) return new Promise(() => {});
      if (toestand.status !== 200) return j({ error: { type: 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND', message: 'nee' } }, toestand.status);
      return j({ tables: toestand.tabellen });
    }
    const body = JSON.parse(o.body);
    toestand.posts.push({ url: u, body });
    if (/\/tables$/.test(u)) {
      const t = { id: 'tblN' + toestand.tabellen.length, name: body.name, fields: body.fields.map((f) => ({ name: f.name })) };
      toestand.tabellen.push(t);
      return j(t);
    }
    const m = u.match(/\/tables\/([^/]+)\/fields$/);
    const t = toestand.tabellen.find((x) => x.id === m[1]);
    t.fields.push({ name: body.name });
    return j({ id: 'fld', name: body.name });
  };
  return toestand;
}
const bestaande = () => [
  { id: 'tblPidTrwGRzRt4LZ', name: 'Client Config', fields: [{ name: 'Client Name' }] },
  { id: 'tbliukTnDAbEDcZmt', name: 'Leads', fields: [{ name: 'Name' }] },
  { id: 'tblQAPdjEsh0l7lUe', name: 'vehicles', fields: [{ name: 'Vehicle Code' }] },
];

(async () => {
  console.log('\nensure({commit:true}) maakt vehicle_listings aan en zegt het');
  let st = nepMeta({ tabellen: bestaande() });
  vang();
  let v = await schema.ensureMetTijd({ commit: true, ms: 5000 });
  laat();
  ck('verslag ok', v.ok === true && v.reden === '', v);
  ck('tabel vehicle_listings aangemaakt, met zijn velden', st.tabellen.some((t) => t.name === 'vehicle_listings' && t.fields.some((f) => f.name === 'Listing Key')), st.tabellen.map((t) => t.name));
  ck('log: "[schema] aangemaakt: ..." noemt de tabel', logs.log.some((l) => /^\[schema\] aangemaakt:.*tabel vehicle_listings/.test(l)), logs.log);
  ck('bestaande tabellen zijn niet aangeraakt (alleen POST op nieuwe tabellen en velden)', st.posts.every((p) => !/\/tables\/tbl[A-Za-z0-9]+$/.test(p.url) || /fields$/.test(p.url)) && !st.posts.some((p) => ['Client Config', 'Leads', 'vehicles'].includes(p.body.name)));
  ck('alleen GET en POST naar de meta-API: niets hernoemd of verwijderd', Array.from(st.methoden).sort().join() === 'GET,POST', Array.from(st.methoden));

  console.log('\ntweede run = niets te doen');
  const postsVoor = st.posts.length;
  vang();
  v = await schema.ensureMetTijd({ commit: true, ms: 5000 });
  laat();
  ck('idempotent: niets nieuws geschreven', v.ok === true && st.posts.length === postsVoor && v.aangemaakt.length === 0, v);
  ck('en geen logruis als alles er is', logs.log.length === 0 && logs.error.length === 0 && logs.warn.length === 0, logs);

  console.log('\nzonder schemarechten: duidelijk in het log');
  st = nepMeta({ tabellen: bestaande(), status: 403 });
  vang();
  v = await schema.ensureMetTijd({ commit: true, ms: 5000 });
  laat();
  ck('reden geen_schemarechten', v.ok === false && v.reden === 'geen_schemarechten', v);
  ck('log noemt geen_schemarechten en wat er nodig is', logs.error.some((l) => /\[schema\] geen_schemarechten/.test(l) && /schema\.bases:write/.test(l)), logs.error);
  ck('er is niets geschreven', st.posts.length === 0);

  console.log('\nrechten ontbreken pas bij het schrijven');
  st = nepMeta({ tabellen: bestaande() });
  const oud = global.fetch;
  global.fetch = async (url, o = {}) => (o.method === 'POST'
    ? { ok: false, status: 403, json: async () => ({ error: { message: 'NOT_AUTHORIZED' } }), text: async () => '' }
    : oud(url, o));
  vang();
  v = await schema.ensureMetTijd({ commit: true, ms: 5000 });
  laat();
  ck('ook dan: geen_schemarechten gelogd', v.reden === 'geen_schemarechten' && logs.error.some((l) => /\[schema\] geen_schemarechten/.test(l)), { v, logs });

  console.log('\nmeta-API onbereikbaar');
  st = nepMeta({ tabellen: bestaande(), status: 500 });
  vang();
  v = await schema.ensureMetTijd({ commit: true, ms: 5000 });
  laat();
  ck('reden meta_onbereikbaar, gelogd als waarschuwing', v.reden === 'meta_onbereikbaar' && logs.warn.some((l) => /\[schema\] meta_onbereikbaar/.test(l)), { v, logs });

  console.log('\ntijdslimiet');
  st = nepMeta({ tabellen: bestaande(), hang: true });
  vang();
  const t0 = Date.now();
  v = await schema.ensureMetTijd({ commit: true, ms: 1000 });
  const duur = Date.now() - t0;
  laat();
  ck('een meta-API die niet antwoordt houdt de cron niet vast', v.ok === false && v.reden === 'tijd_op' && duur < 3000, { v, duur });
  ck('de tijdsoverschrijding staat in het log', logs.warn.some((l) => /\[schema\] tijd_op/.test(l)), logs.warn);

  console.log('\neén keer per instantie (uurcron)');
  schema._resetEenmaal();
  st = nepMeta({ tabellen: bestaande() });
  vang();
  v = await schema.ensureEenmaal({ ms: 5000 });
  laat();
  ck('eerste aanroep migreert', v.ok === true && st.tabellen.some((t) => t.name === 'vehicle_listings'), v);
  const getsNa1 = st.gets;
  v = await schema.ensureEenmaal({ ms: 5000 });
  ck('tweede aanroep doet geen enkele aanroep naar Airtable', v.ok === true && st.gets === getsNa1, { gets: st.gets, getsNa1 });
  schema._resetEenmaal();
  st = nepMeta({ tabellen: bestaande(), status: 403 });
  vang();
  v = await schema.ensureEenmaal({ ms: 5000 });
  const getsFout = st.gets;
  await schema.ensureEenmaal({ ms: 5000 });
  laat();
  ck('na een mislukking niet elke aanroep opnieuw hameren (10 minuten wachttijd)', v.ok === false && st.gets === getsFout, { gets: st.gets, getsFout });
  schema._resetEenmaal();

  console.log('\nbedrading in de crons');
  const cron = fs.readFileSync(BASE + 'api/cron-followup.js', 'utf8');
  const dagIdx = cron.indexOf('ensureMetTijd({ commit: true');
  ck('dagrun: afgewacht (await) en met tijdslimiet', /await require\('\.\/_schema'\)\.ensureMetTijd\(\{ commit: true, ms: \d+ \}\)/.test(cron));
  ck('dagrun: het schema komt VOOR de opvolgingsronde', dagIdx > 0 && dagIdx < cron.indexOf("// Fetch leads created 24h-7d ago that are still 'new'"), dagIdx);
  ck('dagrun: de oude, late, onbegrensde ensure() is weg', !/_schema'\)\.ensure\(\{ commit: true \}\)/.test(cron));
  ck('uurrun: runVoorraad wacht ensureEenmaal af voor de sync begint', /async function runVoorraad[\s\S]{0,1800}await require\('\.\/_schema'\)\.ensureEenmaal\(/.test(cron));
  ck('de uurrun valt niet om als het schema niet lukt', /ensureEenmaal\(\{ ms: \d+ \}\);\s*\}\s*catch/.test(cron));

  console.log(`\n  ${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { laat(); console.error(e); process.exit(1); });
