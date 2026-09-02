/*
 * Het heet geen "AI", het heet je assistent.
 *
 * ── Waarom ──────────────────────────────────────────────────────────────────
 * "AI" is wat de technologie is, niet wat het product doet. Een makelaar heeft
 * geen AI in dienst, hij heeft iemand die zijn WhatsApp beantwoordt. Het scherm
 * noemt het dus bij wat het is: je assistent, of gewoon bij de naam die de
 * makelaar hem gaf.
 *
 * ── De uitzondering, en waarom die hier apart staat ─────────────────────────
 * Op drie plekken MOET het woord AI blijven staan:
 *
 *   1. bij AI-gegenereerde vastgoedbeelden ("AI-visualisatie — werkelijke
 *      staat van de woning kan afwijken"),
 *   2. bij de beeldgenerator zelf, die echt een beeldmodel is en niet Faro,
 *   3. in de zin waarin de assistent tegen een lead toegeeft dat hij een AI is.
 *
 * Die derde is verplicht. En die eerste beschermt een koper tegen een keuken
 * die niet bestaat.
 *
 * Een eerdere versie van de hernoeming liep hier overheen en maakte van de
 * Duitse "KI-Kennzeichnung" het onzinnige "Ihr Assistent-Kennzeichnung" -- de
 * hernoeming brak precies de uitzondering die hem moest tegenhouden. Daarom
 * toetst dit bestand POSITIEF: de disclosures moeten het woord bevatten. Een
 * lijst van toegestane uitzonderingen zou zijn eigen schade hebben verborgen.
 */
'use strict';

process.env.FARO_WORKSPACE_ENABLED = '1';

const fs   = require('fs');
const BASE = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 220)}`);
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

const html    = pagina();
const onboard = fs.readFileSync(BASE + 'public/onboard.html', 'utf8');
const promo   = fs.readFileSync(BASE + 'public/promo.html', 'utf8');

console.log('\nDe assistent heet geen AI');

/* ── 1. De uitzonderingen, eerst. Als deze wegvallen is de rest schade. ──── */
console.log('\n  wat het woord AI MOET blijven zeggen');
ck('het vastgoedbeeld is gemarkeerd als AI-visualisatie',
  /AI-visualisatie/.test(html), null);
ck('met de waarschuwing dat de echte woning kan afwijken',
  /AI-visualisatie — werkelijke staat van de woning kan afwijken/.test(html), null);
ck('de assistent geeft tegenover een lead toe dat hij een AI is',
  /hij een AI is als een lead daarnaar vraagt/.test(html), null);
ck('de beeldgenerator heet nog steeds een AI-beeld',
  /AI-beeld/.test(html), null);

/* ── 2. En wat het NIET meer mag zeggen ──────────────────────────────────── */
console.log('\n  wat weg is uit de klantentaal');
const WEG = [
  "'AI actief'",
  'Geef AI terug',
  'AI denkt na...',
  "'AI geboekt'",
  'Je AI staat klaar.',
  'Geef je AI een naam.',
  "ai:      'Je AI',",
  "'AI naam'",
  'Je AI-credits voor deze periode zijn op',
];
for (const t of WEG) ck(`weg: ${t}`, html.indexOf(t) === -1, null);

console.log('\n  en waar het naartoe ging');
for (const t of ['Je assistent staat klaar.', 'Geef je assistent een naam.', 'Assistent actief',
                 'Je assistent denkt na...', 'Gesprekstegoed']) {
  ck(`aanwezig: ${t}`, html.indexOf(t) !== -1, null);
}

/* ── 3. De spreker in een gesprek ────────────────────────────────────────── */
console.log('\n  in een transcript is "AI" geen spreker');
ck('het sprekerlabel komt uit hvAssistentNaam()',
  /function hvAssistentNaam/.test(html) && !/const label = isUser \? 'Lead' : 'AI';/.test(html), null);
{
  const m = html.match(/function hvAssistentNaam\(\) \{[\s\S]*?\n\}/);
  ck('die functie staat in de pagina', !!m, null);
  if (m) {
    // eslint-disable-next-line no-new-func
    const f = new Function('document', 'window', m[0] + '; return hvAssistentNaam;');
    ck('zonder ingestelde naam valt hij terug op "Assistent"',
      f({ getElementById: () => null }, {})() === 'Assistent', f({ getElementById: () => null }, {})());
    ck('met een ingestelde naam gebruikt hij die',
      f({ getElementById: () => ({ value: '  Mathis  ' }) }, {})() === 'Mathis', null);
    ck('en een kapotte DOM levert een label op in plaats van een crash',
      f({ getElementById() { throw new Error('stuk'); } }, {})() === 'Assistent', null);
  }
}

/* ── 4. De publieke pagina's, die de hernoeming eerst helemaal misliep ───── */
console.log('\n  ook de pagina\'s buiten het dashboard');
const kaal = (s) => s.replace(/<!--[\s\S]*?-->/g, '');
for (const [naam, bron] of [['onboard.html', onboard], ['promo.html', promo]]) {
  const hits = kaal(bron).match(/\bAI\b/g) || [];
  ck(`${naam}: geen losse "AI" meer`, hits.length === 0, hits.slice(0, 6));
}
ck('onboard.html noemt het je assistent', /Je assistent|je assistent/.test(onboard), null);

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
