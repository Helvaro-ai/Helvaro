/* De zwevende formulierknop (public/form-widget.js) sprak alleen Nederlands op de site van elke dealer. */
'use strict';
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'form-widget.js'), 'utf8');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`); ok ? pass++ : fail++; };
console.log('\nFormulierwidget in vier talen');
let parseert = true; try { new vm.Script(src); } catch (e) { parseert = e.message; }
ck('het script parseert', parseert === true, parseert);
for (const t of ['nl', 'fr', 'en', 'de']) ck('woordenboek ' + t, new RegExp('\\n    ' + t + ': \\{ aria:').test(src));
const sleutels = ['aria', 'sluit', 'sub', 'naam', 'naamPh', 'tel', 'akkoord1', 'akkoord2', 'privacy', 'stuur', 'stuurt', 'bedankt', 'bedanktTxt', 'eNaam', 'ePriv', 'eMis'];
const blok = src.slice(src.indexOf('var D = {'), src.indexOf('var L = D['));
for (const t of ['nl', 'fr', 'en', 'de']) {
  const deel = blok.slice(blok.indexOf('    ' + t + ': {'));
  const dit = deel.slice(0, deel.indexOf('}') + 1);
  ck(t + ' heeft alle ' + sleutels.length + ' teksten', sleutels.every((k) => new RegExp('\\b' + k + ':').test(dit)), sleutels.filter((k) => !new RegExp('\\b' + k + ':').test(dit)));
}
ck('geen hardgecodeerde Nederlandse zin meer buiten het woordenboek', !/errEl\.textContent\s+= '/.test(src) && !/>Naam<|>Telefoonnummer<|VERSTUUR<|Bedankt!</.test(src.slice(src.indexOf('var L = D[') + 20)));
ck('de taal komt uit data-lang, de pagina of de browser', /getAttribute\('data-lang'\)/.test(src) && /documentElement\.lang/.test(src));
console.log(`\n  ${pass} ok, ${fail} fout\n`); process.exit(fail ? 1 : 0);
