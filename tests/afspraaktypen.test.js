'use strict';
/*
 * Motorsegment, stap 5: de soorten afspraak komen uit EEN bron
 * (api/_afspraaktypes.js). Auto blijft de bestaande vier; motor krijgt
 * testrit/onderhoud/waardering erbij; labels in vier talen; duur per type.
 */
const fs = require('fs');
const path = require('path');
const A = require('../api/_afspraaktypes');
const boeking = require('../api/_dealer-boeking');
const koop = require('../api/_koop');
const i18n = require('../api/_i18n');
const score = require('../api/_leadscore');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}
const lees = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

console.log('\n  een bron');
{
  ck('auto/leeg/onbekend = de bestaande vier, zelfde volgorde',
    ['auto', '', undefined, 'boot'].every((s) => A.typesVoor(s).join() === 'proefrit,bezichtiging,ophaling,gesprek'));
  ck('boeking.AFSPRAAK_TYPES is die lijst', boeking.AFSPRAAK_TYPES === A.typesVoor('auto'));
  ck('motor heeft testrit, onderhoud, waardering erbij', ['testrit', 'onderhoud', 'waardering'].every((t) => A.typesVoor('motor').indexOf(t) !== -1));
  ck('geen duplicaat van de lijst in melding/koop/leads/whatsapp',
    !/\['proefrit', 'bezichtiging', 'ophaling', 'gesprek'\]/.test(lees('api/_koop.js') + lees('api/_dealer-melding.js') + lees('api/leads.js') + lees('api/whatsapp.js')));
  ck('koop kent alle sleutels (bewaren is breder dan tonen)', A.alleSleutels().every((t) => koop.AFSPRAAK.indexOf(t) !== -1));
  ck('koop.normaliseer bewaart testrit', (koop.normaliseer({ afspraak: 'testrit' }) || {}).afspraak === 'testrit');
}

console.log('\n  normaliseren per segment');
{
  ck('auto: testrit is GEEN geldig type', A.normaliseer('testrit', 'auto') === '' && A.normaliseer('testrit') === '');
  ck('auto: proefrit blijft proefrit', A.normaliseer(' Proefrit ', 'auto') === 'proefrit');
  ck('motor: proefrit wordt testrit (nooit een autowoord)', A.normaliseer('proefrit', 'motor') === 'testrit');
  ck('motor: onderhoud/waardering geldig', A.normaliseer('onderhoud', 'motor') === 'onderhoud' && A.normaliseer('waardering', 'motor') === 'waardering');
  ck('auto: onderhoud ongeldig', A.normaliseer('onderhoud', 'auto') === '');
  ck('rommel is leeg', A.normaliseer('verhuur', 'motor') === '' && A.normaliseer(null, 'motor') === '');
  ck('kiesType: leeg -> standaard (auto proefrit, motor testrit)', A.kiesType('', 'auto') === 'proefrit' && A.kiesType('x', 'motor') === 'testrit');
  ck('boeking.standaardType: dealership auto/motor, vastgoed ongewijzigd',
    boeking.standaardType('dealership') === 'proefrit' && boeking.standaardType('dealership', 'motor') === 'testrit' && boeking.standaardType('vastgoed') === 'bezichtiging');
  ck('geldigVoor: testrit alleen voor motor', A.geldigVoor('testrit', 'motor') && !A.geldigVoor('testrit', 'auto'));
}

console.log('\n  labels, duur, rit');
{
  const talen = ['nl', 'fr', 'en', 'de'];
  ck('elk type heeft een label in vier talen', Object.keys(A.TYPES).every((t) => talen.every((l) => A.TYPES[t].label[l])));
  ck('label testrit: nl testrit, fr essai routier, en test ride', A.label('testrit', 'nl') === 'testrit' && A.label('testrit', 'fr') === 'essai routier' && A.label('testrit', 'en') === 'test ride');
  ck('i18n heeft melding.type.* voor elk type, vier talen',
    A.alleSleutels().every((t) => talen.every((l) => i18n.t(l, 'melding.type.' + t) && i18n.t(l, 'melding.type.' + t) !== 'melding.type.' + t)));
  ck('duur: testrit 60, onderhoud 30; oorspronkelijke vier houden de tenantinstelling', A.duurMin('testrit', 45) === 60 && A.duurMin('onderhoud', 45) === 30 && A.duurMin('proefrit', 45) === 45 && A.duurMin('bezichtiging', 45) === 45);
  ck('isRit: proefrit en testrit', A.isRit('proefrit') && A.isRit('testrit') && !A.isRit('onderhoud'));
  const pnt = (type) => score.bereken({ afspraak: { gevraagd: true, type } }).score;
  ck('leadscore: een testrit telt als proefrit; onderhoud als gewone afspraak',
    pnt('testrit') === pnt('proefrit') && pnt('onderhoud') === pnt('gesprek') && pnt('testrit') > pnt('onderhoud'), [pnt('testrit'), pnt('proefrit'), pnt('onderhoud'), pnt('gesprek')]);
}

console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
