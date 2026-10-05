/*
 * Grote voorraden (audit M-9).
 *
 * De voertuigenlijst stopte stil bij 1000. Voor het scherm is dat onvolledig;
 * voor de voorraadsync is het gevaarlijk: wat voorbij 1000 staat, ziet
 * verzoen() als nieuw en maakt het een tweede keer aan. Nu leest de sync tot
 * 3000, en past het daar niet in, dan stopt hij zonder iets te schrijven.
 */
'use strict';

process.env.API_AIRTABLE = 'patTest';
process.env.BASE_AIRTABLE = 'appTest';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

let paginasGevraagd = 0;
let totaalPaginas = 1000;
global.fetch = async (url) => {
  const u = String(url);
  if (/\/meta\/|tables/.test(u) && !/filterByFormula/.test(u)) return { ok: true, status: 200, json: async () => ({ tables: [] }), text: async () => '' };
  /* Alleen echte paginaverzoeken tellen; de eerste aanroep is de controle
     of de tabel bestaat. */
  const m = /offset=p(\d+)/.exec(decodeURIComponent(u));
  const n = m ? Number(m[1]) + 1 : 1;
  if (/filterByFormula/.test(u)) paginasGevraagd++;
  const records = Array.from({ length: 100 }, (_, i) => ({ id: 'rec' + n + '_' + i, fields: { 'Project Code': 'GROOT', Code: 'V' + (n * 100 + i), Merk: 'BMW' } }));
  return { ok: true, status: 200, json: async () => ({ records, offset: n < totaalPaginas ? 'p' + n : undefined }), text: async () => '' };
};

const vehicles = require('../api/_vehicles.js');

(async () => {
  console.log('\nGrote voorraden');

  paginasGevraagd = 0; totaalPaginas = 12;
  let r = await vehicles.listMetStatus('GROOT', { inclusiefGearchiveerd: true });
  ck('scherm: standaard nog 10 pagina\'s, en zegt dat het afgekapt is', paginasGevraagd === 10 && r.afgekapt === true, { paginasGevraagd, afgekapt: r.afgekapt });

  paginasGevraagd = 0;
  r = await vehicles.listMetStatus('GROOT', { inclusiefGearchiveerd: true, maxPaginas: 30 });
  ck('sync: 1200 wagens passen in 30 pagina\'s, volledig gelezen', paginasGevraagd === 12 && r.afgekapt === false && r.vehicles.length === 1200, { paginasGevraagd, afgekapt: r.afgekapt, n: r.vehicles.length });

  paginasGevraagd = 0; totaalPaginas = 40;
  r = await vehicles.listMetStatus('GROOT', { inclusiefGearchiveerd: true, maxPaginas: 30 });
  ck('sync: 4000 wagens -> afgekapt op 30 pagina\'s', paginasGevraagd === 30 && r.afgekapt === true, { paginasGevraagd, afgekapt: r.afgekapt });

  const inv = fs.readFileSync(path.join(__dirname, '..', 'api', '_inventaris.js'), 'utf8');
  ck('de sync leest met maxPaginas 30', /listMetStatus\(projectCode, \{ inclusiefGearchiveerd: true, maxPaginas: 30 \}\)/.test(inv));
  const i = inv.indexOf('voorraad_te_groot');
  const j = inv.indexOf('_sync.verzoenAlles(');
  ck('en stopt met voorraad_te_groot VOOR er een plan gemaakt of geschreven wordt', i > 0 && j > i, { i, j });

  const i18n = require('../api/_i18n.js');
  const d = (i18n.woordenboek && i18n.woordenboek('en')) || {};
  ck('de melding staat in de dashboardvertaling', typeof d['inv.code.voorraad_te_groot'] === 'string' || /inv\.code\.voorraad_te_groot/.test(fs.readFileSync(path.join(__dirname, '..', 'api', '_i18n.js'), 'utf8')));

  console.log(`\n  ${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
