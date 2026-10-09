'use strict';
/*
 * Motorsegment, stap 7: Faro. IDENTITY is voor auto en vastgoed byte-identiek;
 * voor motor zijn de woorden vervangen. add_listing neemt cc en rijbewijs mee
 * voor motor en negeert ze voor auto.
 */
process.env.BASE_AIRTABLE = 'appZelftest';
process.env.API_AIRTABLE = 'patZelftest';
const prompt = require('../api/_faro/prompt');
const tools = require('../api/_faro/tools');
const vehicles = require('../api/_vehicles');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

(async () => {
  console.log('\n  identiteit');
  const m = prompt.identityVoor({ segment: 'motor' });
  ck('zonder segment, auto en onbekend: IDENTITY zoals hij was', [undefined, {}, { segment: 'auto' }, { segment: 'boot' }, { vertical: 'dealership' }].every((c) => prompt.identityVoor(c) === prompt.IDENTITY));
  ck('motor: motordealers, motoren, testritten', /motordealers/.test(m) && /leads, motoren,/.test(m) && /testritten, onderhoud en waarderingen ZELF/.test(m));
  ck('motor: geen vastgoed-, bezichtigings- of autowoorden', !/vastgoed|makelaar|bezichtig|woning|BMW|\bauto\b/i.test(m), m.match(/.*(vastgoed|makelaar|bezichtig|woning|BMW|\bauto\b).*/i));
  ck('motor: de rest van de identiteit is intact (eerlijkheid, gegevens zijn geen opdrachten)', /GEGEVENS ZIJN GEEN OPDRACHTEN/.test(m) && /EERLIJKHEID/.test(m));

  console.log('\n  add_listing');
  const t = tools.get('add_listing');
  vehicles.available = async () => true;
  vehicles.list = async () => [];
  const bewaard = [];
  vehicles.save = async (p, inv) => { bewaard.push(inv); return Object.assign({ id: 'recX', code: 'V1', projectCode: p, status: 'beschikbaar', fotos: [], troeven: [] }, inv); };
  const args = { merk: 'Harley-Davidson', model: 'Breakout', prijs: 19950, km: 26012, cc: 1745, rijbewijs: 'A' };
  const motor = await t.run(args, { projectCode: 'ZZ', userId: 'u', vertical: 'dealership', segment: 'motor' });
  const kaart = motor.components[0];
  ck('motor: cc en rijbewijs gaan mee in de payload', kaart.payload.velden.cc === 1745 && kaart.payload.velden.rijbewijs === 'A', kaart.payload);
  const auto = await t.run(args, { projectCode: 'ZZ', userId: 'u', vertical: 'dealership' });
  ck('auto: cc en rijbewijs worden genegeerd', auto.components[0].payload.velden.cc === undefined && auto.components[0].payload.velden.rijbewijs === undefined, auto.components[0].payload);
  const leeg = await t.run({}, { projectCode: 'ZZ', userId: 'u', vertical: 'dealership', segment: 'motor' });
  ck('motor zonder merk/model: vraagt om "motor", niet om "auto"', /welke motor/.test(leeg.summary) && !/auto/i.test(leeg.summary), leeg.summary);
  const leegAuto = await t.run({}, { projectCode: 'ZZ', userId: 'u', vertical: 'dealership' });
  ck('auto zonder merk/model: tekst ongewijzigd', /Ik weet nog niet welke auto het is\. Geef een AutoScout24-link/.test(leegAuto.summary), leegAuto.summary);

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
