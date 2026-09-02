/*
 * Elk veld heeft een naam die een schermlezer kan uitspreken.
 *
 * ── Wat hier misging ────────────────────────────────────────────────────────
 * 39 invoervelden hadden geen enkele toegankelijke naam: geen <label for>, geen
 * aria-label, en niet in een <label> gewikkeld. Een schermlezer kondigt zo'n
 * veld aan als "invoerveld, tekst" -- zonder te zeggen WAT je moet invullen.
 *
 * Er stonden wel 45 labels, alleen wezen ze nergens naar. Visueel klopte het
 * dus; het viel alleen op als je niet kon zien.
 *
 * Een placeholder is geen naam: die verdwijnt zodra je begint te typen, en
 * niet elke schermlezer leest hem voor.
 *
 * ── Twee soorten, twee oplossingen ──────────────────────────────────────────
 * De meeste labels stonden direct voor een <input>: die zijn gekoppeld met
 * for=. Elf andere labelden een <div> vol keuzeblokjes (stijl, kamertype,
 * vloer). Een for= naar een div doet niets -- die groepen zijn nu een echte
 * groep met een naam: role="group" + aria-labelledby.
 *
 * ── Wat expres NIET gekoppeld is ────────────────────────────────────────────
 * Alleen labels die DIRECT voor hun veld staan. Een label aan het verkeerde
 * veld hangen is erger dan geen label: dan spreekt de schermlezer met
 * vertrouwen de verkeerde naam uit.
 */
'use strict';

process.env.FARO_WORKSPACE_ENABLED = '1';

const BASE = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 260)}`);
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

console.log('\nElk veld heeft een uitspreekbare naam');

console.log('\n  labels wijzen naar hun veld');
{
  const alle    = (html.match(/<label\b/g) || []).length;
  const metFor  = (html.match(/<label\b[^>]*\bfor="/g) || []).length;
  const metId   = (html.match(/<label\b[^>]*\bid="/g) || []).length;
  ck(`er zijn ${alle} labels`, alle > 40, alle);
  ck(`${metFor} daarvan wijzen naar een veld`, metFor >= 28, metFor);
  ck(`${metId} benoemen een keuzegroep`, metId >= 10, metId);
  ck('samen dekken ze bijna alles', (metFor + metId) / alle >= 0.85,
    { metFor, metId, alle, dekking: ((metFor + metId) / alle).toFixed(2) });
}

console.log('\n  elke for= wijst naar een veld dat bestaat');
{
  const ids = new Set([...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]));
  const doelen = [...html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]);
  const kapot = doelen.filter((d) => !ids.has(d));
  /* Dit is het gevaar van deze wijziging: een for= naar een niet-bestaand id
     is stiller dan geen label, want het ziet er in de code juist uit. */
  ck('geen enkele for= wijst naar niets', kapot.length === 0, kapot);
  ck('en geen twee labels claimen hetzelfde veld',
    new Set(doelen).size === doelen.length,
    doelen.filter((d, i) => doelen.indexOf(d) !== i));
}

console.log('\n  de keuzegroepen zijn een echte groep');
{
  const groepen = [...html.matchAll(/<div\b[^>]*\brole="group"[^>]*\baria-labelledby="([^"]+)"/g)].map((m) => m[1]);
  ck(`${groepen.length} groepen aangekondigd`, groepen.length >= 10, groepen.length);
  const labelIds = new Set([...html.matchAll(/<label\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]));
  const zwevend = groepen.filter((g) => !labelIds.has(g));
  ck('elke aria-labelledby wijst naar een bestaand label', zwevend.length === 0, zwevend);
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
