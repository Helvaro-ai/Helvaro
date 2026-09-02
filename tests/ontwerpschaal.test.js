/*
 * Een schaal, geen verzameling losse getallen.
 *
 * ── Wat hier misging ────────────────────────────────────────────────────────
 * De CSS was over maanden gegroeid en telde 28 verschillende lettergroottes en
 * 16 verschillende hoekafrondingen. Niet als ontwerpkeuze -- gewoon omdat er
 * telkens een getal bij kwam dat leek op wat ernaast stond:
 *
 *     border-radius: 3px, 4px, 5px, 6px, 7px, 8px, 9px, 10px, 12px, 14px...
 *     font-size: 10.5px, 11.5px, 12.5px, 13.5px
 *
 * Die halve pixels zijn nooit bedoeld. Een browser rondt ze zelf af, en niet
 * overal hetzelfde: bij 110% zoom of op een scherm met een andere pixelratio
 * springt de ene 12.5px naar 12 en de andere naar 13. Tekst die op één regel
 * hoort te staan, staat dat dan niet meer.
 *
 * ── Waarom een test en niet alleen een opruimactie ──────────────────────────
 * Opruimen zonder grens is een middag werk die binnen twee maanden weg is. De
 * grens is het punt: nieuwe CSS moet uit de schaal kiezen, en een nieuwe 7px
 * hoort op te vallen voordat hij erin staat.
 */
'use strict';

process.env.FARO_WORKSPACE_ENABLED = '1';

const BASE = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

function css() {
  delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
  const dash = require(BASE + 'api/dashboard.js');
  let html = '';
  dash({ method: 'GET', url: '/dashboard', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
  return (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
}
const sheet = css();

console.log('\nDe ontwerpschaal');

console.log('\n  lettergroottes');
{
  const half = sheet.match(/font-size:\s*[0-9]+\.5px/g) || [];
  ck('geen halve pixels meer', half.length === 0, half.slice(0, 8));

  const maten = [...new Set((sheet.match(/font-size:\s*([0-9.]+)px/g) || [])
    .map((m) => Number(m.replace(/[^0-9.]/g, ''))))].sort((a, b) => a - b);
  ck(`het aantal maten blijft beheersbaar (${maten.length})`, maten.length <= 24, maten);
  ck('en het zijn allemaal hele pixels', maten.every((m) => Number.isInteger(m)), maten.filter((m) => !Number.isInteger(m)));
}

console.log('\n  hoekafrondingen');
{
  /* De toegestane schaal. 999px is "helemaal rond" -- die hoort erbij, want
     een pil-vorm is geen maat maar een vorm. */
  const TOEGESTAAN = new Set([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 999]);
  const gebruikt = [...new Set((sheet.match(/border-radius:\s*([0-9]+)px/g) || [])
    .map((m) => Number(m.replace(/[^0-9]/g, ''))))].sort((a, b) => a - b);
  const buiten = gebruikt.filter((w) => !TOEGESTAAN.has(w));
  ck('elke afronding komt uit de schaal', buiten.length === 0, { buiten, gebruikt });
  ck('en de oude bijna-duplicaten zijn weg (3/5/7/9/99)',
    ![3, 5, 7, 9, 99].some((w) => gebruikt.includes(w)), gebruikt);
}

console.log('\n  kleuren volgen het thema');
{
  /* Een hardgecodeerde kleur die exact een bestaand token is, breekt het thema:
     hij verandert niet mee als het licht/donker omslaat. Merkkleuren
     (LinkedIn, WhatsApp, Instagram) blijven bewust hardgecodeerd -- die horen
     bij dat merk en niet bij ons thema. */
  const HERKEND = ['#ffffff', '#E9EEF6', '#e9eef6', '#6B7280', '#6b7280', '#4B5563', '#4b5563', '#8D99AC', '#8d99ac'];
  const lek = [];
  for (const kleur of HERKEND) {
    const re = new RegExp('(?:^|[;{]\\s*)(?:color|background|background-color|border-color|fill|stroke)\\s*:\\s*' + kleur + '(?=[;\\s}])', 'g');
    const n = (sheet.match(re) || []).length;
    if (n) lek.push(`${kleur} (${n}x)`);
  }
  ck('geen kleur die letterlijk een token herhaalt', lek.length === 0, lek);

  /* Positief: de merkkleuren MOETEN blijven staan. Ze naar een token trekken
     zou van de WhatsApp-knop een willekeurig groen maken. */
  for (const [merk, kleur] of [['WhatsApp', '#25D366'], ['LinkedIn', '#0A66C2']]) {
    ck(`de ${merk}-kleur blijft letterlijk`, sheet.toLowerCase().includes(kleur.toLowerCase()), null);
  }
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
