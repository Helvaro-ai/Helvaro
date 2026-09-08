/*
 * Het woord voor het aanbod moet OVERAL met de markt meegaan.
 *
 * Gevonden op de live app, ingelogd als autohandel (vertical 'dealership'):
 * de zijbalk zei "Vehicles", de kop op het scherm zelf zei "Your stock", de
 * lege staat zei "No vehicles yet" -- en de kop in de TOPBALK zei "Properties".
 * Klik op Voertuigen, en er staat Panden boven.
 *
 * Twee plekken bleven achter, allebei omdat ze het woord één keer vastpakken
 * en daarna nooit meer kijken:
 *
 *   1. de titelstabel voor de topbalk had 'panden' hard op tr('nav.properties')
 *   2. data-label (de tooltip van de INGEKLAPTE zijbalk) wordt door
 *      initSidebar() één keer bij het opstarten gevuld, met een expliciete
 *      `if (el.dataset.label) return;` erin -- dus die werd daarna nooit meer
 *      bijgewerkt. In alle zes de markten stond er "Properties".
 *
 * Beide lezen nu vw('Meer'), dezelfde sleutel die het navigatie-item zelf al
 * gebruikte. Eén bron, dus ze kunnen niet meer uit elkaar lopen.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const i18n = require('../api/_i18n.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

const bron  = fs.readFileSync(path.join(__dirname, '..', 'api', 'dashboard.js'), 'utf8');
/* De opmaak staat in een eigen bestand; de tooltip-regel hoort daar en niet
   in dashboard.js. Die twee apart lezen, zodat een verhuizing opvalt. */
const stijl = fs.readFileSync(path.join(__dirname, '..', 'api', '_dash', 'styles.js'), 'utf8');

/* ── De sleutels zelf ──────────────────────────────────────────────────────
   Zonder deze twee is de rest zinloos: als 'veh.nav' en 'nav.properties'
   hetzelfde woord opleveren, bewijst een test op vw('Meer') niets. */
console.log('\n— de twee woorden verschillen echt, in elke taal —');
{
  for (const taal of ['nl', 'en', 'fr', 'de']) {
    const pand = i18n.t(taal, 'nav.properties');
    const wagen = i18n.t(taal, 'veh.nav');
    ck(`${taal}: "${pand}" en "${wagen}" zijn niet hetzelfde woord`,
       pand && wagen && pand !== wagen, `${pand} / ${wagen}`);
  }
}

/* ── 1. De kop in de topbalk ─────────────────────────────────────────────── */
console.log('\n— de kop in de topbalk volgt de markt —');
{
  const regel = (bron.match(/'panden':\s*\{[^}]*\}/) || [''])[0];
  ck('de titelregel voor panden bestaat nog', regel.length > 0, regel);
  ck('hij leest het marktwoord (vw) en niet de vaste pandsleutel',
     /title:\s*vw\('Meer'\)/.test(regel), regel);
  ck('tr(\'nav.properties\') staat niet meer als titel in die regel',
     !/title:\s*tr\('nav\.properties'\)/.test(regel), regel);
}

/* ── 2. De tooltip van de ingeklapte zijbalk ─────────────────────────────── */
console.log('\n— de tooltip van de ingeklapte zijbalk volgt de markt —');
{
  ck('zetVertical schrijft data-label bij',
     /nav\.dataset\.label\s*=\s*vw\('Meer'\)/.test(bron),
     'zonder deze regel blijft de tooltip op de markt van het opstarten staan');

  /* Het anker onder deze test: die eenmalige vulling in initSidebar is de
     REDEN dat bijwerken nodig is. Verdwijnt die early return ooit, dan mag
     iemand deze test opnieuw wegen -- maar niet stilzwijgend. */
  ck('initSidebar vult data-label nog steeds maar één keer',
     /if \(el\.dataset\.label\) return;/.test(bron),
     'de early return is weg; heroverweeg of het bijwerken nog nodig is');

  /* En de CSS die hem toont, zodat dit geen test op dode code wordt. */
  ck('de CSS toont data-label als tooltip bij een ingeklapte zijbalk',
     /sidebar-collapsed[^{]*\[data-label\][^{]*::after/.test(stijl)
       && /content:\s*attr\(data-label\)/.test(stijl),
     'zonder deze regel is data-label dode opmaak en zegt de test hierboven niets');
}

/* ── 3. De vier plekken lezen dezelfde bron ──────────────────────────────── */
console.log('\n— navigatie, topbalk en tooltip lezen dezelfde sleutel —');
{
  const woorden = (bron.match(/var HV_WOORDEN = \{[\s\S]*?\n\};/) || [''])[0];
  ck('HV_WOORDEN bestaat', woorden.length > 0, null);
  ck('vastgoed wijst Meer naar de pandsleutel',
     /vastgoed:\s*\{[\s\S]*?Meer:\s*'nav\.properties'/.test(woorden), null);
  ck('dealership wijst Meer naar de voertuigsleutel',
     /dealership:\s*\{[\s\S]*?Meer:\s*'veh\.nav'/.test(woorden), null);

  /* Drie plekken die alle drie vw('Meer') moeten gebruiken: het label van het
     navigatie-item, de tooltip, en de kop in de topbalk. */
  const aantal = (bron.match(/vw\('Meer'\)/g) || []).length;
  ck('vw(\'Meer\') wordt op minstens drie plekken gebruikt', aantal >= 3, 'gevonden: ' + aantal);
}

console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
process.exit(fail === 0 ? 0 : 1);
