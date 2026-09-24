/*
 * Eigen WhatsApp-nummer: de status las velden op ID zonder
 * returnFieldsByFieldId, dus 'gekoppeld' was altijd false en Instellingen
 * toonde na een geslaagde koppeling nog "Nummer koppelen" (2026-09-24).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const bron = fs.readFileSync(path.join(__dirname, '..', 'api', 'leads.js'), 'utf8');
let pass = 0, fail = 0;
const ck = (n, ok) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`); ok ? pass++ : fail++; };
for (const mode of ['wa-es-status', 'wa-es-disconnect', 'wa-es-complete']) {
  const i = bron.indexOf(`body.mode === '${mode}'`);
  const blok = bron.slice(i, i + 3500);
  const lezing = blok.match(/filterByFormula=\$\{formula\}&maxRecords=1[^`]*`/);
  ck(`${mode}: leest Client Config met returnFieldsByFieldId=true`, Boolean(lezing && /returnFieldsByFieldId=true/.test(lezing[0])));
}
console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
