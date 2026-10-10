'use strict';
/* Importeren uit een advertentielink voor een motordealer (review 2, 2026-10-10):
 * 'semi-automaat' werd door het schema geweigerd, en cc/rijbewijsklasse werden
 * niet uitgelezen. Nu: het schema laat ze toe en ze komen in het concept. */
const assert = require('assert');
const path = require('path');
process.env.BASE_AIRTABLE = 'appTest'; process.env.API_AIRTABLE = 'patTest';
const prompts = require(path.join(__dirname, '..', 'api', '_ai', 'prompts.js'));
const { valideer } = require(path.join(__dirname, '..', 'api', '_ai', 'validate.js'));
const motor = { merk: 'Harley-Davidson', model: 'Pan America', transmissie: 'semi-automaat', cc: 1250, rijbewijs: 'A', confidence: 0.9 };
const r = valideer(motor, prompts.VOERTUIG_IMPORT_SCHEMA);
assert.ok(r.ok !== false && !(r.problemen && r.problemen.length), 'motor-import is geldig: ' + JSON.stringify(r.problemen || r));
const fout = valideer(Object.assign({}, motor, { rijbewijs: 'B' }), prompts.VOERTUIG_IMPORT_SCHEMA);
assert.ok(fout.problemen && fout.problemen.length, 'rijbewijs B (auto) wordt geweigerd');
assert.ok(/"semi-automaat"/.test(prompts.voertuigImport.system()), 'de prompt noemt semi-automaat');
assert.ok(/"cc": number of null/.test(prompts.voertuigImport.system()), 'de prompt vraagt cc');

// Het concept neemt cc en rijbewijs over (stub DNS, de pagina en de AI).
require('dns').promises.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
global.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => '<html><head><title>Pan America 1250</title></head><body>Pan America 1250 S, 1250 cc, rijbewijs A. ' + 'Adventure touring motor in nieuwstaat, onderhouden bij de dealer, met koffers en verwarmde handvatten. '.repeat(3) + '</body></html>' });
const ai = require(path.join(__dirname, '..', 'api', '_ai'));
ai.generateText = async () => ({ data: motor, text: JSON.stringify(motor) });
const vehicles = require(path.join(__dirname, '..', 'api', '_vehicles.js'));
(async () => {
  const uit = await vehicles.importeerUitLink('TEST01', 'https://voorbeeld.test/motor');
  const c = uit && uit.concept;
  assert.ok(c, 'concept: ' + JSON.stringify(uit));
  assert.strictEqual(c.transmissie, 'semi-automaat');
  assert.strictEqual(c.cc, 1250);
  assert.strictEqual(c.rijbewijs, 'A');
  console.log('voertuig-import-motor: ok');
})().catch((e) => { console.error(e); process.exit(1); });
