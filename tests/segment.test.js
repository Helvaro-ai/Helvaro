'use strict';
/*
 * Segment binnen dealership: auto | motor.
 *
 * Wat hier bewaakt wordt:
 *  1. Leeg/onbekend/null = auto, op elk pad. Elke bestaande dealer blijft
 *     daardoor byte voor byte hetzelfde.
 *  2. Motor-niches (motor, moto, motorcycle, harley-davidson ...) lezen als
 *     dealership + motor. Tot nu toe vielen ze stil terug op vastgoed.
 *  3. De vertical-regels veranderen niet: leeg = vastgoed, STANDAARD_NIEUW =
 *     dealership.
 *  4. Een segment bestaat alleen binnen dealership.
 */
const v   = require('../api/_vertical');
const seg = require('../api/_segment');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

console.log('\n  leeg, onbekend en null lezen als auto');
{
  ck('null',            seg.van(null) === 'auto');
  ck('leeg record',     seg.van({}) === 'auto');
  ck('dealer zonder segment', seg.van({ Vertical: 'dealership' }) === 'auto');
  ck('onbekende waarde', seg.van({ Vertical: 'dealership', 'Vehicle Segment': 'boot' }) === 'auto');
  ck('lege string',     seg.van({ Vertical: 'dealership', 'Vehicle Segment': '  ' }) === 'auto');
  ck('expliciet auto',  seg.van({ Vertical: 'dealership', 'Vehicle Segment': 'auto' }) === 'auto');
  ck('hoofdletters en spaties', seg.van({ Vertical: 'dealership', 'Vehicle Segment': ' Motor ' }) === 'motor');
  ck('norm() van rommel is auto', seg.norm('xx') === 'auto' && seg.norm(null) === 'auto' && seg.norm('motor') === 'motor');
}

console.log('\n  een segment bestaat alleen binnen dealership');
{
  ck('makelaar met motor blijft auto-segment', seg.van({ 'Vehicle Segment': 'motor' }) === 'auto');
  ck('bouw met motor idem', seg.van({ Vertical: 'bouw', 'Vehicle Segment': 'motor' }) === 'auto');
  ck('dealership + motor', seg.van({ Vertical: 'dealership', 'Vehicle Segment': 'motor' }) === 'motor');
  ck('isMotor helper', seg.isMotor({ Vertical: 'dealership', 'Vehicle Segment': 'motor' }) && !seg.isMotor({}));
}

console.log('\n  motor-niches -> dealership + motor');
{
  const aliassen = ['motor', 'motorfiets', 'moto', 'motorcycle', 'motorbike', 'harley', 'harley-davidson', 'Harley Davidson', 'MOTORCYCLES'];
  for (const a of aliassen) {
    const r = { Niche: a };
    ck("'" + a + "' -> dealership", v.van(r) === 'dealership', v.van(r));
    ck("'" + a + "' -> motor", seg.van(r) === 'motor', seg.van(r));
  }
  ck('expliciet auto-segment wint van motor-niche',
    seg.van({ Niche: 'motor', 'Vehicle Segment': 'auto' }) === 'auto');
  ck('auto-niches blijven auto', seg.van({ Niche: 'autodealer' }) === 'auto' && seg.van({ Niche: 'garage' }) === 'auto');
  ck('Vertical vastgoed wint van motor-niche', v.van({ Vertical: 'vastgoed', Niche: 'motor' }) === 'vastgoed');
  ck('motor-niche zonder Vertical is niet langer vastgoed', v.van({ Niche: 'motorfiets' }) !== 'vastgoed');
}

console.log('\n  de vertical-regels zijn niet verschoven');
{
  ck('leeg = vastgoed', v.van({}) === 'vastgoed' && v.van(null) === 'vastgoed');
  ck('onbekende niche = vastgoed', v.van({ Niche: 'bloemenwinkel' }) === 'vastgoed');
  ck('STANDAARD_NIEUW = dealership', v.STANDAARD_NIEUW === 'dealership');
  ck('BEKEND ongewijzigd', v.BEKEND.join(',') === 'vastgoed,dealership,bouw,keuken,renovatie', v.BEKEND);
  ck('geen nieuwe vertical motor', v.BEKEND.indexOf('motor') === -1);
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
