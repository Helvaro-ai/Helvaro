'use strict';
/*
 * De marktkeuze in Instellingen moet tonen in welke markt je ZIT.
 *
 * ── Wat er mis was ─────────────────────────────────────────────────────────
 * loadOnboardingChecklist() zette de keuzelijst zo:
 *
 *     var huidig = (d.sector === 'dealership' || d.vertical === 'dealership')
 *                ? 'dealership' : (d.sector === 'other' ? 'other' : 'real_estate');
 *
 * Drie markten. Geschreven toen dat er drie waren, en nooit uitgebreid toen
 * bouw, keuken en renovatie erbij kwamen. Gevolg: een aannemer opende
 * Instellingen en las "Vastgoed".
 *
 * Zijn keuze WAS bewaard -- de server wist het, de zijbalk wist het, het
 * aanbodscherm was terecht verdwenen -- maar het scherm waarop hij die keuze
 * gemaakt had, zei iets anders. Dat is de klacht "ik wissel van niche en hij
 * laadt niet goed": het lijkt niet opgeslagen, dus je kiest het nog eens.
 *
 * Het venijn zit in het commentaar dat er al stond: "zonder dit staat er altijd
 * Vastgoed, ook bij een dealer -- en dan lijkt het alsof zijn keuze niet
 * bewaard is". Het probleem was dus gezien en beschreven; de oplossing werd
 * alleen voor dealers doorgetrokken.
 *
 * ── Wat hier bewaakt wordt ─────────────────────────────────────────────────
 * Dat de vertaling van markt naar keuzewaarde via hvSectorBijVertical() loopt,
 * en die leest WIZARD_MARKTEN -- dezelfde lijst als de keuzelijst en de wizard.
 * Eén lijst betekent dat dit niet opnieuw kan achterlopen als er een zesde
 * markt bij komt. Precies de reden die HELVARO-ARCHITECTUUR §4.5 geeft voor
 * "vier lijsten moeten gelijk blijven".
 */
const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

const bron = fs.readFileSync(path.join(BASE, 'api/dashboard.js'), 'utf8');

console.log('\n  de keuzelijst leest dezelfde lijst als de rest');
{
  /* DIT is de regressie. De oude regel noemde alleen dealership en other. */
  ck('de markt komt uit hvSectorBijVertical(), niet uit een eigen lijstje',
    /var huidig = d\.sector === 'other' \? 'other' : hvSectorBijVertical\(hvVertical\)/.test(bron), null);
  ck('en het oude drie-markten-lijstje is weg',
    !/d\.vertical === 'dealership'\) \? 'dealership'/.test(bron), null);
}

console.log('\n  alle zes de keuzes bestaan aan beide kanten');
{
  /* De keuzelijst in Instellingen en WIZARD_MARKTEN moeten dezelfde id's
     kennen -- anders kan iemand een markt kiezen die de rest niet herkent, en
     dan valt hij stil terug op vastgoed zonder dat er iets misgaat wat je
     kunt zien. */
  const opties = [...bron.matchAll(/<option value="([a-z_]+)">\$\{T\('set\.markt\./g)].map((m) => m[1]);
  ck('de keuzelijst heeft zes opties', opties.length === 6, opties);
  const iM = bron.indexOf('var WIZARD_MARKTEN = [');
  const markten = bron.slice(iM, iM + 4000);
  for (const id of opties) {
    if (id === 'other') continue;   // 'other' heeft bewust geen eigen vertical
    ck("WIZARD_MARKTEN kent '" + id + "'", markten.indexOf("id: '" + id + "'") !== -1, id);
  }
}

console.log('\n  en een wissel is meteen te zien');
{
  /* Zonder dit klopt de keuzelijst pas na de volgende opstart, en tot dan
     staat de vorige markt er -- dezelfde indruk als de fout hierboven. */
  ck('marktWisselen zet de keuzelijst zelf ook bij',
    /zetVertical\(nieuweVertical[\s\S]{0,400}kiezer\.value = gekozen/.test(bron), null);
}

console.log('\n  de vier lijsten uit HELVARO-ARCHITECTUUR §4.5');
{
  /* Server, client, wizard en instellingen moeten dezelfde markten kennen.
     tests/niches.test.js bewaakt de eerste drie; deze regel hangt de vierde
     eraan vast, want die was het die achterliep. */
  const vert = require(path.join(BASE, 'api/_vertical.js'));
  const iW = bron.indexOf('var WIZARD_MARKTEN = [');
  const wiz = bron.slice(iW, iW + 4000);
  for (const v of vert.BEKEND) {
    ck("de wizard kent de markt '" + v + "'", wiz.indexOf("vertical: '" + v + "'") !== -1, v);
  }
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
