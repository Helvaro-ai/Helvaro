'use strict';
/*
 * Motorsegment, stap 3: de AI praat over motoren, niet over auto's.
 *
 *  - Het motorsegment krijgt motorwoorden (motor, testrit, rijbewijs A/A2) in
 *    fiche, index en de WENS/KOOP-opdrachten, in plaats van 'auto', 'proefrit',
 *    'inruilwagen'. Een LEK-test zoekt alle autowoorden uit alle uitvoer.
 *  - De autoprompts zelf zijn onveranderd: zie motor-prompts-auto-golden.test.js.
 *  - De woordenschat voor mensen (nl/fr/en/de) heeft geen autowoord in de
 *    motorkolom.
 */
const prompts = require('../api/_ai/prompts');
const seg = require('../api/_segment');
const vert = require('../api/_vertical');
const at = require('../api/_afspraaktypes');
const P = prompts.voertuigen;

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + String(detail).slice(0, 500) : '')); }
}

/* Woorden die alleen bij auto's horen. (De JSON-sleutel 'carrosserie' in het
   WENS-voorbeeld is een veldnaam, geen woord voor de klant.) 'automatisch' en 'AutoScout' zijn geen
   treffer: er staan woordgrenzen. */
const AUTOWOORD = /\bauto(?:'s|s)?\b|\bproefrit\b|\bproefrijden\b|\binruilwagen\b|\b\w*wagens?\b|\bvoitures?\b|\bcars?\b|\bAutos?\b|\bAutohändler\b|\bberline\b|\bstationwagen\b|\bsuv\b|\bcabrio\b/i;
function lek(tekst) { const m = AUTOWOORD.exec(tekst); return m ? m[0] : null; }

const bike = { code: 'V7', merk: 'Harley-Davidson', model: 'Breakout', prijs: 19950, km: 26012, inschrijving: '2019',
  brandstof: 'benzine', carrosserie: 'Cruiser', cc: 1745, rijbewijs: 'A', kw: 66, pk: 90, status: 'beschikbaar' };
const bike2 = { code: 'V8', merk: 'Indian', model: 'Chief', prijs: 17000, km: 5000, inschrijving: '2022', status: 'beschikbaar' };

console.log('\n  fiche (bekende motor)');
{
  const f = P.fiche(bike, { maxKorting: 0, faroMag: 0 }, undefined, 'motor');
  ck('geen autowoord', lek(f) === null, lek(f));
  ck('noemt TESTRIT', /TESTRIT/.test(f));
  ck('motor klaarstaat', /de motor klaarstaat/.test(f));
  ck('cilinderinhoud en rijbewijs staan erin', /1\.745 cc|1,745 cc|1745 cc/.test(f) && /vereist is: A/.test(f), f.split('\n').filter((r) => /cc|Rijbewijs/.test(r)));
  ck('type motor i.p.v. carrosserie', /Type motor: Cruiser/.test(f) && !/Carrosserie/.test(f));
  ck('uitrusting wordt niet beloofd', /beloof je niets/.test(f));
  ck('termen in vier talen', /essai routier/.test(f) && /test ride/.test(f) && /Probefahrt/.test(f) && /Motorrad/.test(f) && /moto\b/.test(f));
  ck('BOOK mag een type krijgen: testrit, onderhoud, waardering', /"testrit", "bezichtiging", "ophaling", "gesprek", "onderhoud", "waardering"/.test(f));
  ck('het type via de context werkt ook (zoals whatsapp.js het doet)',
    P.fiche(bike, { maxKorting: 0, faroMag: 0 }, { segment: 'motor' }) === f);
  for (const st of ['verkocht', 'gereserveerd', 'onbekend']) {
    const g = P.fiche(Object.assign({}, bike, { status: st }), undefined, undefined, 'motor');
    ck('status ' + st + ' zonder autowoord', lek(g) === null, lek(g));
  }
  for (const reden of ['verkocht', 'uit_aanbod', 'gereserveerd', 'onbekend', 'afspraak_bestaat']) {
    const g = P.fiche(bike, undefined, { boekbaar: { ok: false, reden }, alternatieven: [{ voertuig: bike2 }] }, 'motor');
    ck('niet boekbaar (' + reden + ') zonder autowoord', lek(g) === null, lek(g));
  }
  const leeg = P.fiche(bike, undefined, { boekbaar: { ok: false, reden: 'verkocht' }, alternatieven: [] }, 'motor');
  ck('geen alternatieven zonder autowoord', lek(leeg) === null, lek(leeg));
}

console.log('\n  index (motor onbekend)');
{
  const i = P.index([bike, bike2], undefined, 'motor');
  ck('geen autowoord', lek(i) === null, lek(i));
  ck('welke motor je bedoelt', /welke motor je bedoelt/.test(i));
  const g = P.index([bike, bike2], { zoekt: 'cruiser', genoemd: new Set(), passend: new Set(['V7']) }, 'motor');
  ck('gerangschikt zonder autowoord', lek(g) === null, lek(g));
  const n = P.index([bike], { zoekt: 'touring', genoemd: new Set(), passend: new Set() }, 'motor');
  ck('niets past zonder autowoord', lek(n) === null, lek(n));
  const w = P.index([bike], undefined, 'motor');
  ck('WENS kent cilinderinhoud en rijbewijs', /minCc, maxCc/.test(w) && /rijbewijs \(A1, A2 of A/.test(w));
  ck('KOOP kent onderhoud en waardering', /testrit \| bezichtiging \| ophaling \| gesprek \| onderhoud \| waardering/.test(w));
  ck('KOOP-inruilvoorbeeld is een motor', /africa twin/.test(w));
  ck('inruilkop is motor', /MOTOR OM IN TE RUILEN/.test(w));
}

console.log('\n  de woordenschat voor mensen');
{
  for (const taal of ['nl', 'fr', 'en', 'de']) {
    const t = seg.termen('motor', taal);
    const alles = Object.values(t).join(' ');
    ck(taal + ': motorkolom zonder autowoord', lek(alles) === null, alles);
    ck(taal + ': alle sleutels gevuld', ['voertuig', 'voertuigen', 'dealer', 'rijbewijs', 'rit'].every((k) => t[k] && t[k].length > 2), t);
  }
  ck('nl motor/testrit', seg.termen('motor', 'nl').voertuig === 'motor' && seg.termen('motor', 'nl').rit === 'testrit');
  ck('fr moto/essai routier', seg.termen('motor', 'fr').voertuig === 'moto' && /essai/.test(seg.termen('motor', 'fr').rit));
  ck('auto blijft zoals het was', seg.termen('auto', 'nl').voertuig === 'auto' && seg.termen('auto', 'nl').rit === 'proefrit');
  ck('onbekend segment = auto', seg.termen('boot', 'nl').voertuig === 'auto');
  ck('onbekende taal = nl', seg.termen('motor', 'xx').voertuig === 'motor');
  for (const taal of ['nl', 'fr', 'en', 'de']) {
    const w = vert.afspraakWoord({ Vertical: 'dealership', 'Vehicle Segment': 'motor' }, taal);
    ck('afspraakWoord motor ' + taal + ': ' + w, lek(w) === null && w.length > 3, w);
  }
  ck('afspraakWoord auto-dealer onveranderd', vert.afspraakWoord({ Vertical: 'dealership' }, 'nl') === 'proefrit'
    && vert.afspraakWoord({ Vertical: 'dealership' }, 'fr') === 'essai' && vert.afspraakWoord({}, 'nl') === 'bezichtiging');
}

console.log('\n  de afspraaktypes in de prompt komen uit een bron');
{
  ck('auto: de bestaande vier, in volgorde', at.typesVoor('auto').join(',') === 'proefrit,bezichtiging,ophaling,gesprek');
  ck('leeg segment is auto', at.typesVoor('').join(',') === at.typesVoor('auto').join(','));
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
