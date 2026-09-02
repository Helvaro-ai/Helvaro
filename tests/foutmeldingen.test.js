/*
 * Een makelaar leest geen statuscodes.
 *
 * ── Wat hier misging ────────────────────────────────────────────────────────
 * Op negen plekken belandde de ruwe fout rechtstreeks in een toast:
 *
 *     toast(err.message)                  ->  "HTTP 500"
 *     'Kosten konden niet geladen worden: ' + e.message
 *     'Boeken mislukt. ' + err.message
 *
 * Drie dingen mis. Het zegt niet wat de gebruiker moet doen. Het klinkt alsof
 * hij zelf iets stuk maakte. En het is altijd Nederlands, ook voor de Waalse
 * en Duitstalige makelaars voor wie de rest van het scherm vertaald is.
 *
 * Nu vertaalt hvFoutZin() de status naar een van vier zinnen -- vier, omdat er
 * vier verschillende antwoorden zijn op "moet ik hier zelf iets aan doen?":
 * verbinding weg, sessie verlopen, te druk, of stuk aan onze kant.
 *
 * ── Wat NIET verdwijnt ──────────────────────────────────────────────────────
 * De ruwe fout gaat naar console.error. Een nette zin voor de klant mag geen
 * blinde vlek voor ons worden -- dan ruilen we een leesbaar scherm voor een
 * onvindbare bug.
 */
'use strict';

process.env.FARO_WORKSPACE_ENABLED = '1';

const BASE = require('path').join(__dirname, '..') + '/';
const i18n = require(BASE + 'api/_i18n.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 200)}`);
  ok ? pass++ : fail++;
};

function pagina() {
  delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
  const dash = require(BASE + 'api/dashboard.js');
  let html = '';
  dash({ method: 'GET', url: '/dashboard', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
  return html;
}
const html = pagina();

/* De echte functies uit de uitgestuurde pagina halen, met een tr() die de
   sleutel teruggeeft. Zo toetsen we WELKE zin gekozen wordt, niet de vertaling
   -- die staat een blok verderop apart. */
function helpers(online) {
  const mFout = html.match(/function hvFout\(r, body\) \{[\s\S]*?\n\}/);
  const mZin  = html.match(/function hvFoutZin\(e, valSleutel\) \{[\s\S]*?\n\}/);
  if (!mFout || !mZin) return null;
  const gelogd = [];
  // eslint-disable-next-line no-new-func
  return new Function('tr', 'console', 'navigator', 'gelogd',
    mFout[0] + '\n' + mZin[0] + '\n; return { hvFout, hvFoutZin, gelogd };'
  )((k) => k, { error: (...a) => gelogd.push(a) }, { onLine: online }, gelogd);
}

console.log('\nFoutmeldingen die een mens kan lezen');

const h = helpers(true);
ck('hvFout en hvFoutZin staan in de uitgestuurde pagina', h !== null, h);

console.log('\n  elke status krijgt het juiste antwoord');
const zin = (status) => h.hvFoutZin(h.hvFout({ status }));
ck('401 -> log opnieuw in',            zin(401) === 'err.sessie', zin(401));
ck('403 -> log opnieuw in',            zin(403) === 'err.sessie', zin(403));
ck('429 -> even te druk',              zin(429) === 'err.tedruk', zin(429));
ck('500 -> aan onze kant',             zin(500) === 'err.server', zin(500));
ck('503 -> aan onze kant',             zin(503) === 'err.server', zin(503));

console.log('\n  fetch die niet eens aankwam');
ck('offline -> controleer je verbinding',
  helpers(false).hvFoutZin(new TypeError('Failed to fetch')) === 'err.netwerk', null);
ck('online, maar fetch faalde -> ook de verbinding',
  h.hvFoutZin(new TypeError('Failed to fetch')) === 'err.netwerk',
  h.hvFoutZin(new TypeError('Failed to fetch')));

console.log('\n  de server mag zelf iets beters zeggen');
{
  const eigen = h.hvFout({ status: 400 }, { error: 'Dit e-mailadres is al in gebruik.' });
  ck('een nette zin van de server wint van onze algemene',
    h.hvFoutZin(eigen) === 'Dit e-mailadres is al in gebruik.', h.hvFoutZin(eigen));
  const rommel = h.hvFout({ status: 500 }, { error: 'HTTP 500' });
  ck('maar "HTTP 500" van de server telt niet als zin',
    h.hvFoutZin(rommel) === 'err.server', h.hvFoutZin(rommel));
}

console.log('\n  de statuscode lekt niet, en verdwijnt ook niet');
{
  const uit = h.hvFoutZin(h.hvFout({ status: 500 }));
  ck('de zin bevat geen statuscode', !/\d{3}|HTTP/.test(uit), uit);
  ck('maar de ruwe fout ging wel naar console.error', h.gelogd.length > 0, h.gelogd.length);
}

console.log('\n  geen ruwe fout meer op het scherm');
for (const patroon of [
  /toast\(\s*err\.message\s*,/,
  /toast\(\s*err\.message\s*\|\|/,
  /'HTTP ' \+ r\.status\);/,
  /Kosten konden niet geladen worden: ' \+/,
  /'Boeken mislukt\. ' \+/,
]) {
  ck(`weg uit de pagina: ${patroon}`, !patroon.test(html), null);
}

console.log('\n  en het spreekt vier talen');
for (const taal of ['nl', 'fr', 'en', 'de']) {
  const mist = ['err.netwerk', 'err.server', 'err.sessie', 'err.tedruk']
    .filter((k) => { const v = i18n.t(taal, k); return !v || v === k; });
  ck(`${taal}: alle vier de zinnen bestaan`, mist.length === 0, mist);
  /* Een vertaling die de statuscode weer binnensmokkelt is geen vertaling. */
  const metCode = ['err.netwerk', 'err.server', 'err.sessie', 'err.tedruk']
    .filter((k) => /HTTP|\b[45]\d\d\b/.test(i18n.t(taal, k)));
  ck(`${taal}: geen enkele zin noemt een statuscode`, metCode.length === 0, metCode);
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
