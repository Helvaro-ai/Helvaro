/*
 * Een voorraadcontrole zonder veranderingen is geen gebeurtenis (live gevonden
 * 2026-10-04: "Inventory checked x13" op de activiteitenpagina, een per
 * paginalading). Wel loggen bij verandering, fout of een handmatige sync.
 */
'use strict';
const fs = require('fs'); const path = require('path');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`); ok ? pass++ : fail++; };
const src = fs.readFileSync(path.join(__dirname, '..', 'api', '_inventaris.js'), 'utf8');
console.log('\nActiviteit: stille voorraadcontrole');
const i = src.indexOf('const stilleControle');
const blok = src.slice(i, i + 700);
ck('een geslaagde, niet-handmatige controle zonder wijzigingen wordt niet gelogd', /!fout && trigger !== 'handmatig'/.test(blok) && /if \(stilleControle\) throw/.test(blok), blok);
for (const v of ['run.changed', 'run.removed', 'run.failed', 'run.aangemaakt', 'run.verkocht', 'run.daling']) ck('een wijziging telt mee: ' + v, blok.includes(v));
ck('een fout wordt altijd gelogd', /!fout &&/.test(blok));
console.log(`\n  ${pass} ok, ${fail} fout\n`); process.exit(fail ? 1 : 0);
