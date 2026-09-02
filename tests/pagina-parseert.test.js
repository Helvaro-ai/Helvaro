/*
 * De uitgestuurde pagina moet parsen.
 *
 * ── Waarom dit bestand bestaat ──────────────────────────────────────────────
 * Op 2 september 2026 stond het dashboard een paar minuten stuk in productie.
 * Iedereen die inlogde kreeg het inlogscherm terug, want het hele inline script
 * gooide bij het parsen:
 *
 *     SyntaxError: await is only valid in async functions
 *
 * De oorzaak was een tekstvervanging die ankerde op "function loadResultaten()"
 * terwijl de echte declaratie "async function loadResultaten()" was. Het nieuwe
 * blok belandde daardoor TUSSEN 'async' en 'function' -- en één kapotte regel
 * in dat script neemt de hele applicatie mee.
 *
 * ── Waarom node --check dit niet zag ────────────────────────────────────────
 * api/dashboard.js is één groot template literal. `node --check api/dashboard.js`
 * controleert de BUITENKANT: is dat bestand geldige JavaScript. Dat was het.
 * De JavaScript die erin ZIT is voor Node gewoon een string, en die werd nooit
 * geparseerd. Precies daar zat de fout.
 *
 * scripts/faro-check.js deed dit wel al, maar ik las zijn uitvoer verkeerd (op
 * de laatste regel in plaats van op de exitcode) en duwde toch. Een controle die
 * je makkelijk verkeerd leest, is een controle die je een keer overslaat --
 * daarom staat hij nu ook hier, in de suite die per bestand rood of groen is.
 *
 * ── Wat dit precies doet ───────────────────────────────────────────────────
 * De pagina renderen, elk <script>-blok eruit halen, en het door de echte
 * JS-parser van Node halen. Geen regex die "ziet er goed uit" zegt: parsen of
 * niet parsen.
 */
'use strict';

process.env.FARO_WORKSPACE_ENABLED = '1';

const vm = require('vm');
const BASE = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 300)}`);
  ok ? pass++ : fail++;
};

function render(url) {
  delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
  const dash = require(BASE + 'api/dashboard.js');
  let html = '';
  dash({ method: 'GET', url, headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
  return html;
}

/* Alleen scripts die ECHT JavaScript zijn. Een <script type="application/json">
   of een importmap is geen JS en hoort niet door de JS-parser. */
function jsBlokken(html) {
  const uit = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    if (/\btype\s*=/.test(attrs) && !/type\s*=\s*["']?(text\/javascript|module)["']?/i.test(attrs)) continue;
    if (/\bsrc\s*=/.test(attrs)) continue;          // extern, niets inline te parsen
    const code = m[2];
    if (code.trim()) uit.push({ module: /type\s*=\s*["']?module/i.test(attrs), code });
  }
  return uit;
}

console.log('\nDe uitgestuurde pagina parseert');

for (const taal of ['nl', 'en']) {
  const html = render('/dashboard?lang=' + taal);
  const blokken = jsBlokken(html);

  ck(`${taal}: er zijn inline scripts om te controleren`, blokken.length > 0, blokken.length);

  let stuk = null;
  for (const b of blokken) {
    try {
      /* new vm.Script parseert zonder uit te voeren. Dat is precies wat we
         willen: de code mag naar document en window verwijzen, die bestaan hier
         niet, maar dat is een RUNTIME-zorg. Wij toetsen alleen de syntaxis. */
      new vm.Script(b.code, { filename: 'dashboard-inline.js' });
    } catch (err) {
      stuk = err.message;
      break;
    }
  }
  ck(`${taal}: elk inline script parseert`, stuk === null, stuk);
}

/* Er stond hier ook een regex die naar een "losgeraakte async" zocht. Die sloeg
   aan op doodgewone code als `xhr.async = false` -- async is ook gewoon een
   geldige naam. Een controle die op correcte code afgaat, wordt uitgezet, en dan
   bewaakt hij niets meer. De parser hierboven vangt dezelfde fout exact en
   zonder vals alarm, dus de heuristiek is eruit. */

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
