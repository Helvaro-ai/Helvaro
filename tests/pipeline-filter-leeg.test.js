/*
 * Een filter zonder treffers is geen lege pipeline (Sindi, 2026-10-03: met
 * "Financing ready" aan stond er "Je pipeline is nog leeg" in de linkerhoek).
 */
'use strict';
const fs = require('fs'); const path = require('path');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`); ok ? pass++ : fail++; };
const dash = fs.readFileSync(path.join(__dirname, '..', 'api', 'dashboard.js'), 'utf8');
const css = require('../api/_dash/styles.js').css();
const i18n = require('../api/_i18n.js');
console.log('\nPipeline: leeg door een filter');
ck('een filter zonder treffers heeft een eigen melding', /gefilterdLeeg = !leads\.length && state\.leads\.length > 0 && pipeFilters\.size > 0/.test(dash));
ck('en die komt vóór de "pipeline is nog leeg"-melding', dash.indexOf('if (gefilterdLeeg)') < dash.indexOf("tr('pipe.leeg.titel')"));
ck('met een knop die de filters wist', /onclick="wisPipeFilters\(\)"/.test(dash) && /function wisPipeFilters\(\) \{\s*pipeFilters\.clear\(\);\s*renderPipeline\(\);/.test(dash));
ck('de lege melding krijgt de hele bordbreedte', /\.pipeline-board > \.empty-state \{ flex: 1 1 100%/.test(css));
for (const taal of ['nl', 'fr', 'en', 'de']) {
  const w = i18n.woordenboek(taal);
  ck(taal + ': titel, tekst met {n} en knop', !!w['pipe.fgeen.titel'] && /\{n\}/.test(w['pipe.fgeen.tekst'] || '') && !!w['pipe.fgeen.wis']);
}
console.log(`\n  ${pass} ok, ${fail} fout\n`); process.exit(fail ? 1 : 0);
