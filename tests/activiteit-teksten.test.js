/* Elke soort op de Activiteit-pagina heeft een tekst in vier talen (live gevonden: "act.inventory_synced" stond kaal op het scherm). */
'use strict';
const fs = require('fs'); const path = require('path');
const act = require('../api/_activiteit.js');
const i18n = fs.readFileSync(path.join(__dirname, '..', 'api', '_i18n.js'), 'utf8');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 220)}`); ok ? pass++ : fail++; };
console.log('\nActiviteit: teksten');
const soorten = [...act.SOORTEN];
ck('er zijn soorten om te controleren (' + soorten.length + ')', soorten.length > 30);
const zonder = []; const onvolledig = [];
for (const k of soorten) {
  const m = i18n.match(new RegExp("'act\\." + k + "':\\s*\\{([^}]*)\\}"));
  if (!m) { zonder.push(k); continue; }
  if (!['nl:', 'fr:', 'en:', 'de:'].every((t) => m[1].indexOf(t) !== -1)) onvolledig.push(k);
}
ck('elke soort heeft een tekst', zonder.length === 0, zonder);
ck('in alle vier de talen', onvolledig.length === 0, onvolledig);
const dash = fs.readFileSync(path.join(__dirname, '..', 'api', 'dashboard.js'), 'utf8');
ck('een toekomstige soort zonder tekst toont leesbaar Engels, geen kale sleutel', /T_DICT\['act\.' \+ soort\] !== undefined/.test(dash));
console.log(`\n  ${pass} ok, ${fail} fout\n`); process.exit(fail ? 1 : 0);
