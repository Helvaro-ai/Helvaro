/*
 * Eén bedrag, drie parsers, één antwoord.
 *
 * ── Wat hier misging ────────────────────────────────────────────────────────
 * "Verwachte Waarde" is vrije tekst die een makelaar zelf intikt. Er waren
 * DRIE parsers voor dat ene veld, en twee ervan gaven een ander antwoord dan de
 * derde:
 *
 *     "3 slaapkamers, 450.000"   parseBudget -> 450000
 *                                 de andere twee -> 3
 *
 * Die 3 stond daarna als EUR 3 in het pipelinetotaal, in het omzetdoel en in de
 * gemiddelde dealwaarde. "Budget 350.000 euro" en "ongeveer 400k" leverden zelfs
 * 0 op. Op hetzelfde scherm kon dezelfde lead dus 450.000 waard zijn in de ene
 * tegel en 3 in de andere.
 *
 * Bij het repareren bleek de "goede" parser ook stuk: hij poetste ALLE
 * scheidingstekens weg, inclusief de decimale komma, en maakte van "2.750,00"
 * 275000 -- honderd keer te veel op elk bedrag met centen. Dat viel nooit op
 * omdat budgetten meestal rond zijn.
 *
 * ── Waarom er nog steeds drie zijn ──────────────────────────────────────────
 * De client-kopie in api/dashboard.js kan niets require()n: die code staat
 * binnen een HTML-template. Twee kunnen er samen (leads.js roept nu
 * _faro/data.js aan), de derde niet. Daarom deze test: hij legt alle drie op
 * DEZELFDE tabel en eist hetzelfde antwoord. Zo mag de kopie bestaan, maar niet
 * afwijken.
 */
'use strict';

process.env.FARO_WORKSPACE_ENABLED = '1';

const fs = require('fs');
const BASE = require('path').join(__dirname, '..') + '/';
const data = require(BASE + 'api/_faro/data.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 160)}`);
  ok ? pass++ : fail++;
};

/* De client-parser uit de daadwerkelijk uitgestuurde pagina halen. Niet uit de
   bron: het gaat om wat de browser krijgt. */
function clientParser() {
  delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
  const dash = require(BASE + 'api/dashboard.js');
  let html = '';
  dash({ method: 'GET', url: '/dashboard', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
  const m = html.match(/function parseDealValue\(v\) \{[\s\S]*?\n\}/);
  if (!m) return null;
  // eslint-disable-next-line no-new-func
  return new Function(m[0] + '; return parseDealValue;')();
}

/* En de server-kopie uit api/leads.js. Die delegeert nu, maar de test moet dat
   controleren en niet aannemen. */
function serverParser() {
  const src = fs.readFileSync(BASE + 'api/leads.js', 'utf8');
  const m = src.match(/function parseDealValueServer\(v\) \{[\s\S]*?\n\}/);
  if (!m) return null;
  // eslint-disable-next-line no-new-func
  return new Function('_faroData', m[0] + '; return parseDealValueServer;')(data);
}

const client = clientParser();
const server = serverParser();

console.log('\nBedragen uit vrije tekst');
ck('de client-parser staat in de uitgestuurde pagina', typeof client === 'function', typeof client);
ck('de server-parser staat in leads.js', typeof server === 'function', typeof server);
ck('en leads.js roept de gedeelde parser aan in plaats van een eigen kopie',
  /_faroData\.parseBudget\(/.test(fs.readFileSync(BASE + 'api/leads.js', 'utf8')), null);

/* De tabel. Elk geval is iets dat een makelaar echt intikt. */
const GEVALLEN = [
  ['450.000', 450000],                     // gewoon budget, Vlaamse punt
  ['€ 450.000', 450000],
  ['1.500', 1500],                         // NOOIT 1,5
  ['1500', 1500],
  ['350 000', 350000],                     // spatie als duizendtal
  ['2.750,00', 2750],                      // centen -- werd 275000
  ['€1.234.567,89', 1234567.89],
  ['450.000,50', 450000.5],
  ['3 slaapkamers, 450.000', 450000],      // DE bug: werd 3
  ['Budget 350.000 euro', 350000],         // werd 0
  ['ongeveer 400k', 400000],               // werd 0
  ['1.2M', 1200000],
  ['4 kamers', 0],                         // geen bedrag: mag geen 4 worden
  ['abc', 0],
  ['', 0],
];

console.log('\n  alle drie geven hetzelfde antwoord');
for (const [invoer, verwacht] of GEVALLEN) {
  const c = client ? client(invoer) : NaN;
  const s = server ? server(invoer) : NaN;
  const b = data.parseBudget(invoer);
  const bNorm = (b === null || !Number.isFinite(b)) ? 0 : b;

  const bijna = (x, y) => Math.abs(x - y) < 0.001;
  ck(`${JSON.stringify(invoer)} -> ${verwacht}`,
    bijna(c, verwacht) && bijna(s, verwacht) && bijna(bNorm, verwacht),
    { client: c, server: s, budget: b });
}

/* Het gevaarlijkste geval apart benoemd: een getal dat GEEN bedrag is mag nooit
   als bedrag meetellen. Een lead met "4 kamers" die als EUR 4 in de pipeline
   staat, verdwijnt bovendien onder elke minimumbudget-filter. */
console.log('\n  een kamertelling is geen bedrag');
for (const rommel of ['4 kamers', '3 slaapkamers', '2 gevels', 'huisnummer 12']) {
  ck(`${JSON.stringify(rommel)} levert 0 op`,
    client(rommel) === 0 && server(rommel) === 0, { c: client(rommel), s: server(rommel) });
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
