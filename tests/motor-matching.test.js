'use strict';
/*
 * Motorsegment, stap 4: matching.
 *  - motortypes (cruiser, touring, adventure, ...) vervangen de autogroepen,
 *    zodat 'touring' niet bij de stationwagen belandt;
 *  - cilinderinhoud (min/max) en rijbewijsklasse zijn HARDE grenzen: een motor
 *    die niet voldoet, of waarvan het niet te bevestigen is, valt eruit;
 *  - alles gaat op het segment: auto blijft wat het was.
 */
const W = require('../api/_wens');
const V = require('../api/_vehicles');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

const bike = (code, model, o) => Object.assign({ code, merk: 'Harley-Davidson', model, prijs: 15000, km: 10000, status: 'beschikbaar', publiek: true }, o);
const VOORRAAD = [
  bike('M1', 'Breakout', { carrosserie: 'Cruiser', cc: 1745, prijs: 19950 }),
  bike('M2', 'Sportster Iron 1200', { carrosserie: '', cc: 1200, prijs: 11900 }),
  bike('M3', 'Pan America 1250 S', { carrosserie: 'Adventure Touring', cc: 1250, prijs: 17900 }),
  bike('M4', 'Heritage 114', { carrosserie: 'Touring', cc: 1868, prijs: 22900 }),
  bike('M5', 'Street 750', { carrosserie: 'Naked', cc: 750, kw: 35, prijs: 6000 }),
  bike('M6', 'Onbekend blok', { carrosserie: 'Cruiser', cc: null, prijs: 8000 }),
];

console.log('\n  motortypes');
{
  const t = (x) => W.motortypesVan(x);
  ck('touring is touring, niet de stationwagen', t('touring').join() === 'touring' && W.soortVan('carrosserie', 'touring', true) === 'break');
  ck('adventure touring is adventure, niet touring', t('adventure touring').join() === 'adventure', t('adventure touring'));
  ck('sport touring is touring, niet sport', t('sport touring').join() === 'touring', t('sport touring'));
  ck('softail en sportster zijn ook cruiser', t('Softail Standard').join() === 'softail,cruiser' && t('Sportster Iron').indexOf('cruiser') !== -1);
  ck('trike en naked herkend', t('trike').join() === 'trike' && t('naked bike').join() === 'naked');
  ck('roadster is hier geen cabrio', W.soortVan('carrosserie', 'roadster', true, 'motor') === '');
  ck('uitTekst motor: "een touring motor" -> touring', W.uitTekst(['ik zoek een touring motor'], { segment: 'motor' }).carrosserie === 'touring');
  ck('uitTekst auto: "touring" blijft stationwagen (ongewijzigd)', W.uitTekst(['ik zoek een touring'], {}).carrosserie === 'break');
  ck('uitTekst motor: cruiser', W.uitTekst(['ik zoek een cruiser'], { segment: 'motor' }).carrosserie === 'cruiser');
}

console.log('\n  cc en rijbewijs uit tekst');
{
  const u = (t) => W.uitTekst([t], { segment: 'motor' }) || {};
  ck('max 1300 cc', u('max 1300 cc').maxCc === 1300 && u('max 1300 cc').maxPrijs === undefined, u('max 1300 cc'));
  ck('vanaf 1.200 cc', u('vanaf 1.200 cc').minCc === 1200, u('vanaf 1.200 cc'));
  ck('cc telt niet als budget', u('tot 1200 cc en tot 15000 euro').maxPrijs === 15000, u('tot 1200 cc en tot 15000 euro'));
  ck('een kaal 1200cc is geen eis', !u('ik heb een 1200cc gereden').minCc && !u('ik heb een 1200cc gereden').maxCc);
  ck('rijbewijs A2', u('ik heb rijbewijs A2').rijbewijs === 'A2', u('ik heb rijbewijs A2'));
  ck('permis A2 (fr)', u("j'ai le permis A2").rijbewijs === 'A2');
  ck('A2 rijbewijs (nl, omgekeerd)', u('met mijn A2 rijbewijs').rijbewijs === 'A2');
  ck('"a licence" is geen klasse A', !u('give me a licence overview').rijbewijs);
  ck('auto-segment negeert cc en rijbewijs', (W.uitTekst(['max 1300 cc rijbewijs A2'], {}) || {}).maxCc === undefined);
}

console.log('\n  harde grenzen');
{
  const h = (w, v) => W.hardeGrenzen(w, v);
  ck('onder minCc valt eruit', h({ minCc: 1500 }, VOORRAAD[1]).reden === 'cc_te_laag');
  ck('boven maxCc valt eruit', h({ maxCc: 1300 }, VOORRAAD[0]).reden === 'cc_te_hoog');
  ck('onbekende cc bij een cc-eis valt eruit (niet stil genegeerd)', h({ maxCc: 1300 }, VOORRAAD[5]).reden === 'cc_onbekend');
  ck('zonder cc-eis is onbekende cc geen probleem', h({}, VOORRAAD[5]).ok);
  ck('A2 + 35kW-bike mag', h({ rijbewijs: 'A2' }, VOORRAAD[4]).ok);
  ck('A2 + 1745cc zonder klasse mag NIET', h({ rijbewijs: 'A2' }, VOORRAAD[0]).reden === 'rijbewijs_nee' || h({ rijbewijs: 'A2' }, VOORRAAD[0]).reden === 'rijbewijs_onbekend');
  ck('A mag alles', h({ rijbewijs: 'A' }, VOORRAAD[0]).ok);
  ck('expliciete klasse op de motor wint', h({ rijbewijs: 'A2' }, bike('X', 'Beperkt', { cc: 1250, rijbewijs: 'A2' })).ok);
  ck('A1 koper, A2-motor -> nee', h({ rijbewijs: 'A1' }, bike('X', 'Y', { rijbewijs: 'A2', cc: 400 })).reden === 'rijbewijs_nee');
}

console.log('\n  rangschikken: motor');
{
  const lijst = (w, extra) => V.rangschik(VOORRAAD, Object.assign({ wens: w, segment: 'motor' }, extra));
  const r1 = lijst({ carrosserie: 'cruiser', maxPrijs: 20000, maxCc: 1800 });
  ck('cruiser <= 1800 cc: Breakout en Iron vooraan, Heritage (1868) en de onbekende eruit',
    r1.lijst.slice(0, 2).map((v) => v.code).sort().join() === 'M1,M2' && !r1.lijst.some((v) => v.code === 'M4' || v.code === 'M6'), r1.lijst.map((v) => v.code));
  ck('uitgesloten bevat Heritage met reden en de onbekende-cc', r1.uitgesloten.some((u) => u.voertuig.code === 'M4' && u.reden === 'cc_te_hoog')
    && r1.uitgesloten.some((u) => u.voertuig.code === 'M6' && u.reden === 'cc_onbekend'), r1.uitgesloten.map((u) => u.voertuig.code + ':' + u.reden));
  const r2 = lijst({ carrosserie: 'touring' });
  ck('touring: Heritage en Pan America passen, Breakout niet als passend', r2.passend.has('M4') && !r2.passend.has('M1'), [...r2.passend]);
  ck('adventure: alleen Pan America passend', (() => { const r = lijst({ carrosserie: 'adventure' }); return r.passend.has('M3') && r.passend.size === 1; })());
  ck('cruiser: de Sportster telt via zijn modelnaam als cruiser', lijst({ carrosserie: 'cruiser' }).passend.has('M2'));
  ck('cruiser vindt Sportster Iron zonder Body-veld', lijst({ carrosserie: 'cruiser' }).passend.has('M2') && !lijst({ carrosserie: 'cruiser' }).passend.has('M3'));
  const r3 = lijst({ rijbewijs: 'A2' });
  ck('A2: alleen wat zeker kan (de 35 kW-bike)', r3.lijst.map((v) => v.code).join() === 'M5', r3.lijst.map((v) => v.code));
  ck('geen uitgesloten bij een wens zonder harde grens', lijst({ carrosserie: 'cruiser' }).uitgesloten.length === 0);
}

console.log('\n  auto blijft ongewijzigd');
{
  const auto = [
    { code: 'A1', merk: 'VW', model: 'Golf', carrosserie: 'Hatchback', prijs: 15000, km: 1, status: 'beschikbaar', cc: 1200 },
    { code: 'A2', merk: 'Audi', model: 'A4', carrosserie: 'Station', prijs: 18000, km: 1, status: 'beschikbaar' },
  ];
  const wens = { maxCc: 100, rijbewijs: 'A2', carrosserie: 'touring' };
  const r = V.rangschik(auto, { wens });
  ck('geen uitsluiting, geen uitgesloten-sleutel', r.lijst.length === 2 && r.uitgesloten === undefined, Object.keys(r));
  ck('touring blijft break: A4 passend', r.passend.has('A2'), [...r.passend]);
}

console.log('\n  alternatieven: harde grens geldt ook daar');
{
  const alt = V.alternatieven(VOORRAAD, { voertuig: VOORRAAD[0], wens: { maxCc: 1300 }, segment: 'motor' }, 3);
  ck('geen alternatief boven 1300 cc of met onbekende cc', alt.every((a) => (a.voertuig || a).cc && (a.voertuig || a).cc <= 1300), alt.map((a) => (a.voertuig || a).code));
}

console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
