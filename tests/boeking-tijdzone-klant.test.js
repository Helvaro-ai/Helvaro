/*
 * L-12: openingsuren en boekingstijden volgen de tijdzone van de klant
 * (api/_regio.js), met Europe/Brussels als standaard -- voor bestaande klanten
 * is de uitkomst byte-identiek.
 */
'use strict';
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';
const { maakNepAirtable } = require('./fixtures/nep-airtable');
const WB = require(BASE + 'api/_webboeking.js');
const _afspraken = require(BASE + 'api/_afspraken.js');
const P = WB._test;
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`); ok ? pass++ : fail++; };

(async () => {
  const nu = Date.parse('2026-01-12T05:00:00Z'); // maandag
  const standaard = P.kandidaten('ma-vr 9-17', { nu, dagen: 0 });
  const expliciet = P.kandidaten('ma-vr 9-17', { nu, dagen: 0, tz: 'Europe/Brussels' });
  ck('zonder tz: eerste moment 09:00 Brussel = 08:00Z', standaard[0] === '2026-01-12T08:00:00.000Z', standaard[0]);
  ck('standaard is byte-identiek aan expliciet Brussel', JSON.stringify(standaard) === JSON.stringify(expliciet));
  const londen = P.kandidaten('ma-vr 9-17', { nu, dagen: 0, tz: 'Europe/London' });
  ck('Londen: 09:00 lokaal = 09:00Z', londen[0] === '2026-01-12T09:00:00.000Z', londen[0]);
  ck('modeltijd wordt in de zone van de klant gecorrigeerd', _afspraken.corrigeerNaarBrusselseTijd('2026-01-12T10:00:00', 'Europe/London') === '2026-01-12T10:00:00.000Z');

  const { db } = maakNepAirtable(['tblPidTrwGRzRt4LZ', 'tbliukTnDAbEDcZmt', 'tblD058vEITs1xYFc', 'customers', 'conversations', 'messages', 'activity']);
  db.tblPidTrwGRzRt4LZ.push({ id: 'recL', fields: { fldN4dL0bGgfBOXwM: 'LON', Timezone: 'Europe/London', 'Working Hours': 'ma-vr 9-17' } });
  db.tblPidTrwGRzRt4LZ.push({ id: 'recB', fields: { fldN4dL0bGgfBOXwM: 'BRU', 'Working Hours': 'ma-vr 9-17' } });
  const l = await WB.vrijeMomenten('LON', { nu, alle: true });
  const b = await WB.vrijeMomenten('BRU', { nu, alle: true });
  ck('klant met Timezone Europe/London krijgt Londense uren', l.momenten[0] === '2026-01-12T09:00:00.000Z', l.momenten[0]);
  ck('klant zonder Timezone blijft Brussel', b.momenten[0] === '2026-01-12T08:00:00.000Z', b.momenten[0]);
  // De bezette Google-momenten die de AI te zien krijgt, staan ook in de tijdzone van de klant.
  const wa = require('fs').readFileSync(require('path').join(__dirname, '..', 'api', 'whatsapp.js'), 'utf8');
  ck('bezet-lijst voor de AI in de tijdzone van de klant', /const tzKlant = \(regio && regio\.tz\) \|\| 'Europe\/Brussels';/.test(wa) && /const tOpt = \{ hour: '2-digit', minute: '2-digit', timeZone: tzKlant \};/.test(wa));
  console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
