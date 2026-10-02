/*
 * Dynamische sleutels ('stage.' + fase, 'mail.status.' + status ...) worden niet door
 * vertaalsleutels-bestaan.test.js gezien. Hier staat per familie de echte waardenreeks, en
 * elke waarde moet in alle vier de talen een niet-lege vertaling hebben die niet de kale sleutel is.
 */
'use strict';
const i18n = require('../api/_i18n.js');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`); ok ? pass++ : fail++; };
const FAMILIES = {
  'stage.': ['new', 'qualified', 'afspraak', 'won', 'lost'],
  'score.temp.': ['hot', 'warm', 'cold'],
  'mail.status.': ['verzenden', 'mislukt', 'concept', 'dubbel'],
  'mail.klasse.': ['lead', 'klant', 'overig', 'nieuwsbrief', 'factuur', 'automatisch', 'eigen'],
  'pd.opstatus.': ['beschikbaar', 'interesse', 'afspraak', 'gereserveerd', 'verkocht', 'onbekend', 'uit_aanbod'],
};
for (const id of ['dealership', 'real_estate', 'construction', 'kitchen', 'renovation', 'other']) FAMILIES['markt.' + id + '.'] = ['t', 's'];
console.log('\nDynamische vertaalsleutelfamilies');
for (const taal of ['nl', 'fr', 'en', 'de']) {
  const w = i18n.woordenboek(taal);
  const mist = [];
  for (const [voorvoegsel, waarden] of Object.entries(FAMILIES)) {
    for (const v of waarden) { const k = voorvoegsel + v; if (!w[k] || w[k] === k) mist.push(k); }
  }
  ck(taal + ': alle familiesleutels bestaan', mist.length === 0, mist);
}
console.log(`\n  ${pass} ok, ${fail} fout\n`); process.exit(fail ? 1 : 0);
