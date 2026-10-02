/*
 * Elke tr('sleutel') / T('sleutel') in het dashboard verwijst naar een sleutel die bestaat. Een sleutel
 * die ontbreekt staat kaal op het scherm ("act.inventory_synced"). Dynamische sleutels (die op een
 * punt eindigen, zoals 'act.' + soort) worden hier niet gecontroleerd; die hebben hun eigen test.
 */
'use strict';
const fs = require('fs'); const path = require('path');
const i18n = require('../api/_i18n.js');
const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'dashboard.js'), 'utf8');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`); ok ? pass++ : fail++; };
console.log('\nVertaalsleutels in het dashboard');
for (const taal of ['nl', 'fr', 'en', 'de']) {
  const heeft = new Set(Object.keys(i18n.woordenboek(taal)));
  const re = /\b(?:tr|T|T_JS)\(\s*'([a-zA-Z0-9_.\-]+)'/g;
  const mist = new Set(); let m;
  while ((m = re.exec(src))) { if (m[1].slice(-1) !== '.' && !heeft.has(m[1])) mist.add(m[1]); }
  ck(taal + ': geen enkele letterlijke sleutel ontbreekt (' + heeft.size + ' sleutels)', mist.size === 0, [...mist]);
}
console.log(`\n  ${pass} ok, ${fail} fout\n`); process.exit(fail ? 1 : 0);
