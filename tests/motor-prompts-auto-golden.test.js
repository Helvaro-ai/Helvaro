'use strict';
/*
 * De auto-prompts zijn BYTE VOOR BYTE wat ze voor het motorsegment waren.
 *
 * tests/fixtures/auto-voertuigprompts.golden.json is gemaakt met de code van
 * VOOR de terminologie-parameter (WRITE_GOLDEN=1 op die code). Elke bestaande
 * dealer heeft Vehicle Segment leeg = auto en mag geen letter anders te lezen
 * krijgen. Deze test dekt fiche (alle statussen, korting, alternatieven),
 * index (kaal en gerangschikt) en profiel -- zonder segment-argument EN met
 * het expliciete segment 'auto'.
 */
const fs = require('fs');
const path = require('path');
const prompts = require('../api/_ai/prompts');
const P = prompts.voertuigen;

const GOLDEN = path.join(__dirname, 'fixtures', 'auto-voertuigprompts.golden.json');

const v1 = { code: 'V1', merk: 'BMW', model: 'M4', uitvoering: 'Competition', prijs: 74999, km: 12000,
  inschrijving: '03/2022', brandstof: 'benzine', transmissie: 'automaat', kw: 375, pk: 510, carrosserie: 'coupe',
  kleur: 'zwart', omschrijving: 'Mooie wagen.', troeven: ['Head-up', 'Carbon'], status: 'beschikbaar' };
const v2 = { code: 'V2', merk: 'Audi', model: 'A4', prijs: 28500, km: 90000, inschrijving: '2018', status: 'beschikbaar' };
const v3 = { code: 'V3', merk: 'Mercedes', model: 'C200', prijs: 31000, km: 40000, inschrijving: '2020', status: 'gereserveerd' };

function uitvoer(extra) {
  const o = {};
  const s = extra === undefined ? [] : [extra];
  o.ficheKaal = P.fiche(v1, undefined, undefined, ...s);
  o.ficheKorting = P.fiche(v1, { maxKorting: 2000, faroMag: 500 }, undefined, ...s);
  o.ficheKortingMax = P.fiche(v1, { maxKorting: 2000, faroMag: 0 }, undefined, ...s);
  for (const st of ['verkocht', 'uit aanbod', 'gereserveerd', 'onbekend']) {
    o['fiche_' + st] = P.fiche(Object.assign({}, v1, { status: st }), { maxKorting: 0, faroMag: 0 }, undefined, ...s);
  }
  for (const reden of ['verkocht', 'uit_aanbod', 'gereserveerd', 'onbekend', 'afspraak_bestaat']) {
    o['context_' + reden] = P.fiche(v1, undefined, { boekbaar: { ok: false, reden }, alternatieven: [{ voertuig: v2 }, { voertuig: v3 }] }, ...s);
  }
  o.contextLeeg = P.fiche(v1, undefined, { boekbaar: { ok: false, reden: 'verkocht' }, alternatieven: [] }, ...s);
  o.indexKaal = P.index([v1, v2, v3], undefined, ...s);
  o.indexLeeg = P.index([], undefined, ...s);
  o.indexGerangschikt = P.index([v1, v2, v3], { zoekt: 'BMW, automaat', genoemd: new Set(['V2']), passend: new Set(['V1']) }, ...s);
  o.indexNietsPast = P.index([v1, v2], { zoekt: 'Tesla', genoemd: new Set(), passend: new Set() }, ...s);
  o.profielBeide = P.profiel({ zoekt: 'BMW tot 30.000', aankoop: 'cash, binnen een maand' }, ...s);
  o.profielLeeg = P.profiel({}, ...s);
  return o;
}

if (process.env.WRITE_GOLDEN === '1') {
  fs.writeFileSync(GOLDEN, JSON.stringify(uitvoer(), null, 2) + '\n');
  console.log('golden geschreven');
  process.exit(0);
}

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + String(detail).slice(0, 400) : '')); }
}
const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
const nu = uitvoer();
const metAuto = uitvoer('auto');
const metRommel = uitvoer('onzin');
console.log('\n  auto-prompts zijn onveranderd (zonder, met auto, met onbekend segment)');
for (const k of Object.keys(golden)) {
  ck(k + ': zonder segment', nu[k] === golden[k], nu[k]);
  ck(k + ': segment auto',   metAuto[k] === golden[k]);
  ck(k + ': onbekend segment valt terug op auto', metRommel[k] === golden[k]);
}
ck('de golden dekt alle vormen', Object.keys(golden).length >= 19);
console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
