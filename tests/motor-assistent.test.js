'use strict';
/*
 * Motorsegment, stap 6: de websiteassistent.
 *  - SYSTEEM wordt uit de segmentwoorden gebouwd; auto is byte-identiek;
 *  - motorwoordenschat in zoeken (cruiser, touring, cc, rijbewijs) en intentie
 *    (testrit, onderhoud, waardering, verkopen);
 *  - cc en rijbewijs zijn harde grenzen; "tot 1200 cc" is geen budget;
 *  - onderhoud/waardering: geen verzonnen gegevens, het team bevestigt.
 */
process.env.BASE_AIRTABLE = 'appZelftest';
process.env.API_AIRTABLE = 'patZelftest';
const A = require('../api/_assistent');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

const fx = (code, model, o) => Object.assign({ code, merk: 'Harley-Davidson', model, prijs: 15000, km: 1000, status: 'beschikbaar', publiek: true, gearchiveerd: false }, o);
const VOORRAAD = [
  fx('M1', 'Breakout', { carrosserie: 'Cruiser', cc: 1745, prijs: 19950 }),
  fx('M2', 'Sportster Iron 1200', { carrosserie: '', cc: 1200, prijs: 11900 }),
  fx('M3', 'Pan America 1250 S', { carrosserie: 'Adventure Touring', cc: 1250, prijs: 17900 }),
  fx('M4', 'Heritage 114', { carrosserie: 'Touring', cc: 1868, prijs: 22900 }),
  fx('M5', 'Street 750', { carrosserie: 'Naked', cc: 750, kw: 35, prijs: 6000 }),
];
const eerste = (t, seg) => (A._test.zoekVoorraad(VOORRAAD, t, 5, seg)[0] || {}).code;
const codes = (t, seg) => A._test.zoekVoorraad(VOORRAAD, t, 5, seg).map((v) => v.code).sort().join();

console.log('\n  systeemprompt');
{
  const auto = A._test.SYSTEEM({ naam: '' }, undefined);
  ck('auto: "deze autodealer" en "proefrit" zoals altijd', /deze autodealer/.test(auto) && /afspraak of proefrit/.test(auto));
  ck('auto: segment auto of leeg geeft dezelfde tekst', A._test.SYSTEEM({ naam: '', segment: 'auto' }, undefined) === auto);
  const motor = A._test.SYSTEEM({ naam: '', segment: 'motor' }, undefined);
  ck('motor: "deze motordealer" en "testrit"', /deze motordealer/.test(motor) && /afspraak of testrit/.test(motor));
  ck('motor: geen autowoorden (auto, autodealer, proefrit, wagen)', !/\bauto(s|dealer)?\b|proefrit|wagen/i.test(motor), motor.match(/.*(\bauto\b|proefrit|wagen).*/i));
  ck('motor: cc/rijbewijs niet raden', /rijbewijsklasse/.test(motor) && /Raad nooit welk rijbewijs/.test(motor));
  ck('motor: onderhoud/waardering zonder verzonnen gegevens', /Verzin geen prijzen of termijnen/.test(motor) && /onderhoud/.test(motor));
  ck('naam van de dealer wint', /Capital Brussels Harley-Davidson, op hun/.test(A._test.SYSTEEM({ naam: 'Capital Brussels Harley-Davidson', segment: 'motor' })));
}

console.log('\n  voorraadblok');
{
  const b = A._test.voorraadBlok(VOORRAAD.slice(0, 1), 'motor');
  ck('motor toont cc en rijbewijsklasse, onbekend als leeg', /cilinderinhoud 1745 cc/.test(b) && /rijbewijsklasse onbekend/.test(b), b);
  ck('auto: geen cc-kolommen', !/cilinderinhoud/.test(A._test.voorraadBlok(VOORRAAD.slice(0, 1))));
}

console.log('\n  zoeken');
{
  ck('cruiser vindt de Breakout en de Sportster (model), niet de touring', codes('Hebben jullie een cruiser?', 'motor') === 'M1,M2', codes('Hebben jullie een cruiser?', 'motor'));
  ck('touring vindt de Heritage, niet de adventure touring', codes('ik zoek een touring motor', 'motor') === 'M4', codes('ik zoek een touring motor', 'motor'));
  ck('adventure vindt de Pan America', codes('adventure motor graag', 'motor') === 'M3');
  ck('cruiser tot 15.000: de Sportster eerst, de Breakout (19.950) niet', eerste('cruiser tot 15.000 euro', 'motor') === 'M2' && codes('cruiser tot 15.000 euro', 'motor').indexOf('M1') === -1);
  ck('tot 1300 cc: Iron, Pan America en Street (geen Breakout, geen Heritage)', codes('motor tot 1300 cc', 'motor') === 'M2,M3,M5', codes('motor tot 1300 cc', 'motor'));
  ck('"tot 1200 cc" is geen budget van 1200 euro (naked eerst, niets boven 1200 cc)', eerste('naked tot 1200 cc', 'motor') === 'M5' && codes('naked tot 1200 cc', 'motor').split(',').every((c) => ['M2', 'M3', 'M5'].indexOf(c) !== -1 && c !== 'M3'), codes('naked tot 1200 cc', 'motor'));
  ck('rijbewijs A2: alleen wat zeker kan', codes('ik heb rijbewijs A2, wat kan ik rijden', 'motor') === 'M5', codes('ik heb rijbewijs A2, wat kan ik rijden', 'motor'));
  ck('een motor zonder bevestigde cc valt af bij een cc-eis', A._test.zoekVoorraad([fx('X', 'Onbekend blok', { carrosserie: 'Cruiser', cc: null })], 'cruiser max 1300 cc', 5, 'motor').length === 0);
  ck('Road Glide niet in voorraad: niets gevonden (geen verzinsel)', codes('Road Glide', 'motor') === '');
  ck('auto-zoeken: "touring" zonder segment ongewijzigd (geen motortypes)', codes('cruiser', undefined) === 'M1', codes('cruiser', undefined));
}

console.log('\n  intentie');
{
  const i = A._test.intentie;
  ck('motor: test ride, onderhoud, waardering, mijn motor verkopen = hoog',
    ['Can I book a test ride?', 'Ik wil mijn motor laten onderhouden', 'wat is mijn motor waard? waardering', 'Ik wil mijn motor verkopen', "j'aimerais un essai routier", "entretien de ma moto"].every((z) => i(z, 'motor') === 'hoog'));
  ck('auto: onderhoud/service blijft laag (ongewijzigd)', i('Doen jullie onderhoud en service?') === 'laag' && i('Doen jullie onderhoud en service?', 'auto') === 'laag');
  ck('motor: een gewone vraag blijft laag', i('Welke kleur heeft hij?', 'motor') === 'laag');
  ck('testrit blijft hoog voor allebei', i('Kan ik een testrit doen?') === 'hoog' && i('Kan ik een testrit doen?', 'motor') === 'hoog');
}

console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
