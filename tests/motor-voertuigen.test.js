'use strict';
/*
 * Motorsegment, stap 2: voertuigdata blijft compatibel.
 *  - Engine CC (nummer) en Licence Class (A1|A2|A) zijn OPTIONELE velden;
 *  - het motortype gaat in het bestaande veld Body (carrosserie);
 *  - een base waar de velden nog niet bestaan geeft 422 UNKNOWN_FIELD_NAME en
 *    save() probeert het zonder die velden opnieuw (zelfde patroon als Sold At);
 *  - een auto-save verandert niet: geen nieuwe velden in de payload.
 */
process.env.BASE_AIRTABLE = 'appZelftest';
process.env.API_AIRTABLE = 'patZelftest';
const V   = require('../api/_vehicles');
const seg = require('../api/_segment');
const I = V._intern;

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

console.log('\n  veldnamen en vertalen');
{
  ck('F.cc = Engine CC', I.F.cc === 'Engine CC');
  ck('F.rijbewijs = Licence Class', I.F.rijbewijs === 'Licence Class');
  ck('beide zijn optioneel (422-retry)',
    I.onbekendOptioneelVeld(422, 'UNKNOWN_FIELD_NAME "Engine CC"').join() === 'Engine CC'
    && I.onbekendOptioneelVeld(422, 'UNKNOWN_FIELD_NAME Licence Class').join() === 'Licence Class');
  ck('een andere 422 blijft een fout', I.onbekendOptioneelVeld(422, 'INVALID_VALUE').length === 0);

  const rec = { id: 'rec1', fields: { 'Vehicle Code': 'V1', Make: 'Harley-Davidson', Model: 'Breakout', Body: 'Cruiser', 'Engine CC': 1745, 'Licence Class': 'a', Price: 19950, Mileage: 26012 } };
  const v = I.vanRecord(rec);
  ck('cc gelezen', v.cc === 1745, v);
  ck('rijbewijs genormaliseerd', v.rijbewijs === 'A', v.rijbewijs);
  ck('motortype zit in carrosserie', v.carrosserie === 'Cruiser');
  const auto = I.vanRecord({ id: 'r', fields: { Make: 'BMW', Model: 'M4' } });
  ck('een auto heeft cc null en rijbewijs leeg', auto.cc === null && auto.rijbewijs === '', auto);
}

console.log('\n  naarVelden');
{
  const m = I.naarVelden({ merk: 'Harley-Davidson', model: 'Sportster Iron 1200', carrosserie: 'Cruiser', cc: 1200, rijbewijs: 'a', prijs: 11900 }, 'P1');
  ck('Engine CC geschreven', m['Engine CC'] === 1200, m);
  ck('Licence Class geschreven als A', m['Licence Class'] === 'A', m);
  ck('Body = motortype', m.Body === 'Cruiser');
  const auto = I.naarVelden({ merk: 'BMW', model: 'M4', prijs: 74999 }, 'P1');
  ck('auto-payload zonder motorvelden', !('Engine CC' in auto) && !('Licence Class' in auto), Object.keys(auto));
  const slecht = I.naarVelden({ cc: -5, rijbewijs: 'B' }, 'P1');
  ck('onzin cc/klasse wordt weggelaten', !('Engine CC' in slecht) && !('Licence Class' in slecht));
  ck('cc boven 10000 is een typfout', !('Engine CC' in I.naarVelden({ cc: 99999 }, 'P1')));
}

console.log('\n  rijbewijsregels');
{
  ck('norm: A2', seg.normRijbewijs('rijbewijs A2') === 'A2');
  ck('norm: B is geen motorklasse', seg.normRijbewijs('B') === '');
  ck('>35 kW vraagt A', seg.vereistRijbewijs({ kw: 70, cc: 1200 }) === 'A');
  ck('expliciet wint van afleiden', seg.vereistRijbewijs({ rijbewijs: 'A2', kw: 70 }) === 'A2');
  ck('125 cc / 11 kW is A1', seg.vereistRijbewijs({ cc: 125, kw: 11 }) === 'A1');
  ck('zonder gegevens: onbekend', seg.vereistRijbewijs({}) === 'onbekend');
  ck('A2 mag geen A-motor', seg.mogelijkMetRijbewijs({ rijbewijs: 'A' }, 'A2') === 'nee');
  ck('A mag alles', seg.mogelijkMetRijbewijs({ rijbewijs: 'A' }, 'A') === 'ja');
  ck('A2 op onbekende motor: onbekend, niet ja', seg.mogelijkMetRijbewijs({}, 'A2') === 'onbekend');
  ck('geen opgegeven rijbewijs: geen beperking', seg.mogelijkMetRijbewijs({ rijbewijs: 'A' }, '') === 'ja');
}

(async () => {
  console.log('\n  save() met een base zonder de nieuwe velden');
  const echt = global.fetch;
  const posts = [];
  global.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    const json = (b, s = 200) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
    if (method === 'GET') return json({ records: [] });
    const body = JSON.parse(opts.body);
    posts.push(body.fields);
    if ('Engine CC' in body.fields) {
      return json({ error: { type: 'UNKNOWN_FIELD_NAME', message: 'Unknown field name: "Engine CC"' } }, 422);
    }
    return json({ id: 'recNieuw', fields: Object.assign({ 'Vehicle Code': 'V1' }, body.fields) });
  };
  V._resetAvailability && V._resetAvailability();
  try {
    const r = await V.save('P1', { merk: 'Harley-Davidson', model: 'Breakout', cc: 1745, rijbewijs: 'A', prijs: 19950 });
    ck('save lukt ondanks het ontbrekende veld', r && r.id === 'recNieuw', r);
    ck('eerst met, dan zonder Engine CC', posts.length === 2 && 'Engine CC' in posts[0] && !('Engine CC' in posts[1]), posts);
    ck('Licence Class bleef (bestond wel)', 'Licence Class' in posts[1], posts[1]);
  } catch (e) {
    ck('save mocht niet werpen', false, String(e && e.message));
  }
  global.fetch = echt;

  console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
  process.exit(fail ? 1 : 0);
})();
