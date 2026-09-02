/*
 * Faro moet een karakter hebben, geen bandje zijn.
 *
 * ── Wat er misging ──────────────────────────────────────────────────────────
 * Er waren zes tekeningen maar één beweging: alleen 'thinking' ademde, de rest
 * stond volledig stil. En omdat meerdere toestanden dezelfde tekening delen
 * (zie TOESTANDEN in api/_faro/werk.js), was 'aan het werk' visueel niet te
 * onderscheiden van 'zit stil te wachten'. Een valk die niet beweegt is een
 * plaatje, geen collega.
 *
 * Daarnaast had elke situatie precies ÉÉN zin. Wie hem twee keer tegenkomt
 * hoort een bandje -- en dan is het een tooltip met een vogel ernaast.
 *
 * ── De twee regels achter de beweging ───────────────────────────────────────
 * 1. Wat BLIJFT DUREN beweegt zacht en traag (ademen, deinen, drijven). Iets
 *    dat de hele dag in je ooghoek staat te stuiteren zet je binnen een uur uit.
 * 2. Wat een GEBEURTENIS is, speelt eindig af (juichen, schudden). Een valk die
 *    blijft juichen viert niets meer; een die blijft trillen leest als een
 *    kapotte pagina in plaats van als een melding.
 */
'use strict';

const fs   = require('fs');
const BASE = require('path').join(__dirname, '..') + '/';
const stijl  = fs.readFileSync(BASE + 'api/_faro/ui/styles.js', 'utf8');
const client = fs.readFileSync(BASE + 'api/_faro/ui/client.js', 'utf8');
const i18n   = require(BASE + 'api/_faro/ui/i18n.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 220)}`);
  ok ? pass++ : fail++;
};

console.log('\nFaro heeft een karakter');

console.log('\n  elke toestand beweegt anders');
const DOORLOPEND = ['idle', 'thinking', 'generating', 'video'];
const EENMALIG   = ['success', 'error'];
for (const st of [...DOORLOPEND, ...EENMALIG]) {
  const re = new RegExp('\\.faro-mascot\\[data-state="' + st + '"\\][\\s\\S]{0,220}?animation:\\s*([a-z-]+)');
  const m = stijl.match(re);
  ck(`${st} heeft een eigen beweging`, !!m, m);
}
{
  /* Geen twee toestanden mogen dezelfde animatie delen -- dan zijn ze weer niet
     uit elkaar te houden, wat precies het probleem was. */
  const namen = [...DOORLOPEND, ...EENMALIG].map((st) => {
    const m = stijl.match(new RegExp('\\.faro-mascot\\[data-state="' + st + '"\\][\\s\\S]{0,220}?animation:\\s*([a-z-]+)'));
    return m && m[1];
  }).filter(Boolean);
  ck('en geen twee toestanden delen dezelfde beweging',
    new Set(namen).size === namen.length, namen);
  for (const n of namen) {
    ck(`  @keyframes ${n} bestaat echt`, new RegExp('@keyframes ' + n + '\\s*\\{').test(stijl), null);
  }
}

console.log('\n  wat duurt is zacht, wat een gebeurtenis is stopt');
for (const st of DOORLOPEND) {
  const m = stijl.match(new RegExp('\\.faro-mascot\\[data-state="' + st + '"\\][\\s\\S]{0,220}?animation:[^;]*;'));
  ck(`${st} herhaalt (het is een toestand)`, /infinite/.test(m ? m[0] : ''), m && m[0]);
}
for (const st of EENMALIG) {
  const m = stijl.match(new RegExp('\\.faro-mascot\\[data-state="' + st + '"\\][\\s\\S]{0,260}?animation:[^;]*;'));
  const s = m ? m[0] : '';
  ck(`${st} speelt eindig af (het is een gebeurtenis)`, !/infinite/.test(s) && /forwards/.test(s), s);
}

console.log('\n  wie beweging uitzet, meent dat');
{
  /* Niet met een niet-gulzige }: die stopt bij de sluitende accolade van de
     BINNENSTE regel, niet van de media-query. Dat kostte deze test eerder een
     vals alarm terwijl de CSS gewoon klopte. Neem een vast venster vanaf de
     media-query en kijk daarbinnen. */
  /* Niet met een niet-gulzige }: die stopt bij de sluitende accolade van de
     BINNENSTE regel, niet van de media-query. En niet met de EERSTE
     prefers-reduced-motion in het bestand: dat is een opmerking in een
     commentaarblok. Zoek de media-query die de mascotte noemt. */
  const alle = [...stijl.matchAll(/@media \(prefers-reduced-motion: reduce\)/g)].map((m) => m.index);
  const treffer = alle.map((i) => stijl.slice(i, i + 900))
                      .find((blok) => blok.includes('.faro-mascot'));
  const b = treffer || '';
  const mist = [...DOORLOPEND, ...EENMALIG].filter((st) => !b.includes(`data-state="${st}"`));
  ck('elke toestand staat in het reduced-motion-blok', mist.length === 0, mist);
  ck('en die zet de animatie echt uit', /animation:\s*none/.test(b), null);
}

console.log('\n  hij zegt het niet elke keer hetzelfde');
ck('er is een stemkiezer', /function faroStem\(sleutel\)/.test(client), null);
ck('en de tip gebruikt hem', /var tekst = faroStem\(sleutel\);/.test(client), null);
ck('de keuze ligt vast per sessie, niet per herteken-actie',
  /_faroStemKeuze/.test(client) && /if \(!\(sleutel in _faroStemKeuze\)\)/.test(client), null);
ck('en een ontbrekende variant valt terug op de basiszin, nooit op leeg',
  /return \(gekozen && gekozen !== _faroStemKeuze\[sleutel\]\) \? gekozen : basis;/.test(client), null);

console.log('\n  in alle vier de talen');
const SLEUTELS = ['tip.onboarding', 'tip.leeg', 'tip.persona', 'tip.formulier', 'tip.facturatie', 'tip.agenda'];
for (const taal of ['nl', 'fr', 'en', 'de']) {
  const T = i18n.translator(taal);
  const mist = [];
  const zelfde = [];
  for (const k of SLEUTELS) {
    for (const v of ['.v2', '.v3']) {
      const t = T(k + v);
      if (!t || t === k + v) mist.push(k + v);
      /* Een "variant" die letterlijk de basiszin herhaalt is geen variant. */
      else if (t === T(k)) zelfde.push(k + v);
    }
  }
  ck(`${taal}: elke situatie heeft drie varianten`, mist.length === 0, mist);
  ck(`${taal}: en die verschillen echt van de basiszin`, zelfde.length === 0, zelfde);
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
