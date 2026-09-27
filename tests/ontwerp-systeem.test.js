/*
 * Ontwerpsysteem: wat de audit van 26/09 rechtzette, mag niet terugsluipen.
 *
 * - Hoeken komen uit de tokenschaal (--r-xs/sm/md/lg/full). Een losse
 *   "border-radius: 10px" is hoe de elf verschillende hoeken er kwamen.
 * - Temperatuur is een gekleurde stip, geen emoji.
 * - Klikbare divs zijn met het toetsenbord bereikbaar.
 * - Resultaten zegt "niets in deze periode" als alleen de periode leeg is.
 */
'use strict';

const vm = require('vm');
const css = require('../api/_dash/styles.js');
const dash = require('../api/dashboard.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

function cssTekst() {
  if (typeof css === 'function') return css();
  for (const k of Object.keys(css)) if (typeof css[k] === 'function') { const t = css[k](); if (typeof t === 'string' && t.length > 10000) return t; }
  for (const k of Object.keys(css)) if (typeof css[k] === 'string' && css[k].length > 10000) return css[k];
  return '';
}

function clientJs(lang) {
  return new Promise((klaar) => {
    const res = { setHeader() {}, getHeader() {}, status() { return this; }, send(b) { klaar(String(b)); }, end(b) { klaar(String(b || '')); }, json() {} };
    dash({ method: 'GET', url: '/dashboard.js?asset=js&lang=' + lang, headers: { host: 't' }, query: { asset: 'js', lang } }, res);
  });
}

(async () => {
  console.log('\nOntwerpsysteem');
  const s = cssTekst();
  ck('stylesheet gevonden', s.length > 100000, s.length);

  const los = (s.match(/border-radius:\s*\d+px\s*[;}!]/g) || []).filter((r) => !/:\s*2px/.test(r));
  ck('geen losse enkelvoudige hoeken buiten de 2px-haarlijn', los.length === 0, los.slice(0, 5));

  const js = await clientJs('en');
  ck('client-JS geladen', js.length > 100000, js.length);
  let parseert = true;
  try { new vm.Script(js); } catch (e) { parseert = e.message; }
  ck('client-JS parseert', parseert === true, parseert);

  ck('geen temperatuur-emoji meer in de interface', !/'(🔥|🟡|⚪)/.test(js), (js.match(/.{30}(🔥|🟡|⚪).{10}/) || [])[0]);
  ck('tempStip bestaat en geeft een label mee', /function tempStip/.test(js) && /aria-label/.test(js));
  ck('stipkleuren staan op palettokens', /\.temp-stip--hot\s*\{[^}]*var\(--error-ink\)/.test(s));

  ck('klikbare elementen krijgen role en tabindex', /function maakToetsbaar/.test(js) && /setAttribute\('tabindex', '0'\)/.test(js));
  ck('Enter en Spatie klikken ze', /e\.key !== 'Enter' && e\.key !== ' '/.test(js));
  ck('overlays worden geen tabstop', /function isAchtergrondKlik/.test(js));

  ck('Resultaten kent een lege-periode-staat', /res\.leegPeriode/.test(js) && /function resultatenAlleTijd/.test(js));
  ck('en die knop staat niet in het Nederlands in de Engelse versie', !/Toon alle tijd/.test(js) || /Show all time/.test(js));

  ck('meldingen op de telefoon staan bovenaan', /max-width:\s*520px\)\s*\{[^}]*\.toast-container\s*\{[^}]*top:/.test(s));

  console.log(`\n  ${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
