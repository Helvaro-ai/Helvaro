'use strict';
/* Het uurritje: (1) elk uur een andere startdealer, zodat een krap budget niet
 * altijd dezelfde staart van de lijst overslaat; (2) een mislukte pagina van de
 * klantenlijst wordt gemeld in plaats van stil afgebroken (review 2026-10-09). */
const assert = require('assert');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
process.env.API_AIRTABLE = 'test-token'; process.env.BASE_AIRTABLE = 'appTEST';
const _vertical = require(BASE + 'api/_vertical.js');
const inv = require(BASE + 'api/_inventaris.js');
const schema = require(BASE + 'api/_schema.js');
schema.ensureEenmaal = async () => {};
const volgorde = [];
inv.sync = async (code) => { volgorde.push(code); return { ok: true }; };
let lijstKapot = false;
global.fetch = async (url) => {
  const u = String(url);
  if (u.includes('tblPidTrwGRzRt4LZ')) {
    if (lijstKapot) return { ok: false, status: 429, json: async () => ({}), text: async () => '' };
    const feed = JSON.stringify({ type: 'feed', url: 'https://dms.voorbeeld/feed.csv' });
    return { ok: true, status: 200, json: async () => ({ records: ['A', 'B', 'C'].map((c) => ({ id: 'r' + c, fields: { 'Project Code': c, [_vertical.VELD_ID]: _vertical.DEALERSHIP, 'Inventory Source': feed } })) }), text: async () => '' };
  }
  return { ok: true, status: 200, json: async () => ({ records: [] }), text: async () => '' };
};
const cron = require(BASE + 'api/cron-followup.js');
(async () => {
  const uur = Math.floor(Date.now() / 3600000) * 3600000;
  const eersten = [];
  for (let i = 0; i < 3; i++) {
    volgorde.length = 0;
    await cron.runVoorraad(new Date(uur + i * 3600000 + 1000), { budgetS: 1e9, trigger: 'uurlijks', archiveren: false });
    assert.strictEqual(volgorde.length, 3, 'alle drie gesynct');
    eersten.push(volgorde[0]);
  }
  assert.strictEqual(new Set(eersten).size, 3, 'elk uur een andere eerste dealer: ' + eersten.join(','));
  lijstKapot = true;
  const v = await cron.runVoorraad(new Date(), { budgetS: 240, trigger: 'uurlijks', archiveren: false });
  assert.strictEqual(v.lijstOnvolledig, true, 'mislukte klantenlijst wordt gemeld');
  console.log('voorraad-cron-rotatie: ok');
})().catch((e) => { console.error(e); process.exit(1); });
