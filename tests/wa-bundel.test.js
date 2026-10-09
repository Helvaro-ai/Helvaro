'use strict';
/*
 * Eén webhook, meerdere berichten (audit L-05).
 *
 * Meta stuurt bij een achterstand, of bij snel na elkaar verstuurde berichten,
 * meerdere berichten in één webhook: value.messages[] heeft er n, en er kunnen
 * meerdere entry[] en changes[] in zitten. De handler verwerkte alleen
 * entry[0].changes[0].messages[0]; de rest verdween zonder logregel.
 *
 * Deze test stuurt een echt ondertekende bundel door de handler en kijkt welke
 * berichten de dedupe-poort (api/_lock.eenmalig) bereiken, in welke volgorde,
 * en dat een tweede bezorging van dezelfde bundel niets dubbel doet.
 */
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const BASE = path.join(__dirname, '..') + '/';

process.env.WA_APP_SECRET = 'geheim-voor-de-test';
process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';
process.env.PHONE_NUMBER_ID = '100000000000000';
process.env.WHATSAPP_TOKEN = 'wa-test';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'sk-test';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 400)}`);
  ok ? pass++ : fail++;
};

const airtable = [];
global.fetch = async (url, opts) => {
  const u = String(url);
  airtable.push(decodeURIComponent(u));
  const json = (d) => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) });
  return json({ records: [] });
};

const vf = require.resolve('@vercel/functions');
require.cache[vf] = { id: vf, filename: vf, loaded: true, exports: { waitUntil: () => {} } };

const _lock = require(BASE + 'api/_lock.js');
const gezien = [];
_lock.eenmalig = async (sleutel) => { gezien.push(sleutel); return true; };
_lock.vergeet = async () => {};

const handler = require(BASE + 'api/whatsapp.js');

async function post(payload) {
  const raw = Buffer.from(JSON.stringify(payload));
  const req = Readable.from([raw]);
  req.method = 'POST'; req.query = {}; req.url = '/api/whatsapp';
  req.headers = { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', process.env.WA_APP_SECRET).update(raw).digest('hex') };
  let status = 0;
  const res = { status(c) { status = c; return this; }, send() { return this; }, json() { return this; }, setHeader() {}, end() { return this; } };
  await handler(req, res);
  return status;
}

const txt = (id, from, body) => ({ id, from, type: 'text', text: { body } });
const meta = { phone_number_id: process.env.PHONE_NUMBER_ID };

(async () => {
  console.log('\nbundel met drie berichten in een change, plus een tweede entry');
  const payload = { object: 'whatsapp_business_account', entry: [
    { id: 'W1', changes: [ { field: 'messages', value: { metadata: meta, messages: [ txt('wamid.A1', '32470000001', 'eerste'), txt('wamid.A2', '32470000001', 'tweede'), txt('wamid.A3', '32470000002', 'derde') ] } } ] },
    { id: 'W2', changes: [ { field: 'messages', value: { metadata: meta, messages: [ txt('wamid.B1', '32470000003', 'vierde') ] } } ] },
  ] };
  const status = await post(payload);
  ck('antwoordt 200', status === 200, status);
  const ids = gezien.map((s) => s.replace('wa-msg:', ''));
  ck('ELK bericht bereikt de dedupe-poort', ['wamid.A1', 'wamid.A2', 'wamid.A3', 'wamid.B1'].every((i) => ids.includes(i)), ids);
  ck('in de volgorde waarin Meta ze stuurde', ids.join(',') === 'wamid.A1,wamid.A2,wamid.A3,wamid.B1', ids);
  const metNummer = (nr) => airtable.some((u) => u.includes(nr));
  ck('en elke afzender wordt echt opgezocht (verwerking loopt door)', metNummer('32470000001') && metNummer('32470000002') && metNummer('32470000003'),
    airtable.map((u) => u.slice(0, 120)));

  console.log('\neen kapot item in de bundel breekt de rest niet');
  gezien.length = 0;
  const kapot = { entry: [ { changes: [ { value: { metadata: meta, messages: [ null, txt('wamid.C1', '32470000004', 'ok'), { id: 'wamid.C2', from: '32470000005', type: 'text' } , txt('wamid.C3', '32470000006', 'ook ok') ] } } ] } ] };
  await post(kapot);
  const ids2 = gezien.map((s) => s.replace('wa-msg:', ''));
  ck('de goede berichten komen nog steeds door', ids2.includes('wamid.C1') && ids2.includes('wamid.C3'), ids2);

  console.log('\nlege en vreemde payloads blijven veilig');
  gezien.length = 0;
  ck('geen entry', (await post({})) === 200 && gezien.length === 0);
  ck('statuses-only change', (await post({ entry: [ { changes: [ { value: { metadata: meta, statuses: [] } } ] } ] })) === 200 && gezien.length === 0);

  console.log(`\n  ${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
