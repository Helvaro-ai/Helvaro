/*
 * De pauze vóór het AI-antwoord (api/whatsapp.js stap 9).
 *
 * Stond op 25-55 s, en omdat de geschiedenis pas na verzending geschreven
 * wordt, zag de lead én het dashboard tot een minuut niets -- elke opname
 * van 2026-09-20 liet dat zien, terwijl het antwoord zelf 1,5 s kost.
 * Nu 2-5 s, vast in te stellen met ANTWOORD_PAUZE_MS (0..55000).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`);
  ok ? pass++ : fail++;
};

const src = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');
console.log('\nPauze vóór het antwoord');
ck('geen vaste 25-55 s meer', !/25_000 \+ Math\.floor\(Math\.random\(\) \* 30_000\)/.test(src));
ck('stap 9 wacht op antwoordPauzeMs()', src.includes('await new Promise(resolve => setTimeout(resolve, antwoordPauzeMs()));'));

/* De functie los uitvoeren, zonder de hele webhook te laden. */
const m = src.match(/function antwoordPauzeMs\(\) \{[\s\S]*?\n\}/);
ck('antwoordPauzeMs bestaat', !!m);
const fn = new Function('process', m[0] + '; return antwoordPauzeMs;');
const met = (v) => fn({ env: v === undefined ? {} : { ANTWOORD_PAUZE_MS: v } })();
const stand = Array.from({ length: 50 }, () => met());
ck('standaard 2-5 s', stand.every((x) => x >= 2000 && x < 5000), stand.slice(0, 5));
ck('vast: "0" → 0', met('0') === 0);
ck('vast: "10000" → 10000', met('10000') === 10000);
ck('geklemd op 55 s', met('999999') === 55000);
ck('onzin → standaard', met('abc') >= 2000 && met('abc') < 5000);
ck('lege string → standaard', met('') >= 2000 && met('') < 5000);

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
