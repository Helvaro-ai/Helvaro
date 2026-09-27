'use strict';
/*
 * Eén open lead per persoon (audit M-6, 2026-09-27).
 *
 * Wie het formulier twee keer invult, stond twee keer in de pipeline. Nu:
 *   - bestaat er al een OPEN lead (nieuw / in behandeling) voor hetzelfde
 *     nummer of e-mailadres bij deze dealer, dan wordt die bijgewerkt:
 *     notitie met de nieuwe aanvraag, wagen/e-mail aangevuld als ze ontbraken,
 *     bestaande Notities-inhoud (aiPaused, taken, notities) blijft staan;
 *   - geen tweede WhatsApp-begroeting;
 *   - een GESLOTEN lead (gewonnen/verloren) telt niet: dan een nieuwe lead;
 *   - faalt de opzoeking, of is Notities geen JSON: gewoon een nieuwe lead.
 */
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';
process.env.INTRO_VERTRAGING_MS = '1';
process.env.INTRO_TEMPLATE_NAME = 'intro_test';
process.env.WHATSAPP_TOKEN = 'wa-test';
process.env.PHONE_NUMBER_ID = '100000000000000';
process.env.NOTIFY_EMAIL = 'eigenaar@voorbeeld.be';
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`);
  ok ? pass++ : fail++;
};

const LEADS = 'tbliukTnDAbEDcZmt';
let bestaande = [];        // wat de opzoeking teruggeeft
let opzoekingFaalt = false;
let oproepen = [];
global.fetch = async (url, opts) => {
  const u = String(url);
  const method = (opts && opts.method) || 'GET';
  const body = opts && opts.body ? String(opts.body) : '';
  oproepen.push({ url: u, method, body });
  const json = (d, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => d, text: async () => JSON.stringify(d) });
  if (u.includes('tblPidTrwGRzRt4LZ')) return json({ records: [{ id: 'recC', fields: { 'Client Name': 'Garage Test', 'Plan Status': 'active' } }] });
  if (u.includes(LEADS) && method === 'GET' && u.includes('filterByFormula')) {
    if (opzoekingFaalt) return json({ error: 'kapot' }, 500);
    return json({ records: bestaande });
  }
  if (u.includes(LEADS) && method === 'POST') return json({ id: 'recNIEUW000000000', fields: {} });
  if (u.includes(LEADS + '/') && method === 'PATCH') return json({ id: 'x', fields: {} });
  if (u.includes('graph.facebook.com')) return json({ messages: [{ id: 'wamid.X' }] });
  return json({ records: [], id: 'x' });
};

const form = require(BASE + 'api/form.js');
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let ip = 0;

async function stuur(body) {
  oproepen = [];
  let status = 200, uit = null;
  const res = { setHeader() {}, status(c) { status = c; return this; }, json(d) { uit = d; return this; }, end() { return this; }, send(d) { uit = d; return this; } };
  await form({ method: 'POST', url: '/api/form/GARAGE', query: {}, headers: { 'x-forwarded-for': '10.8.0.' + (++ip) }, body }, res);
  await wacht(250);
  return {
    status, uit,
    zoek: oproepen.find((o) => o.url.includes(LEADS) && o.method === 'GET' && o.url.includes('filterByFormula')),
    create: oproepen.find((o) => o.url.includes(LEADS) && o.method === 'POST'),
    patch: oproepen.find((o) => o.url.includes(LEADS + '/recOPEN') && o.method === 'PATCH'),
    whatsapp: oproepen.filter((o) => o.url.includes('graph.facebook.com')),
  };
}

const open = (status, notities) => ({ id: 'recOPEN0000000000', fields: {
  fldSmczuyUJd26HLe: 'GARAGE', fld8mkrEWcyq7mUip: status, fld6YaitW0lMqHUrd: '32478123456',
  fldoLRI5W12ThTls7: notities === undefined ? JSON.stringify({ _v: 1, notes: [{ id: 'n_1', text: 'oud', ts: 'x' }], tasks: [{ t: 1 }], calls: [], aiPaused: true }) : notities,
} });

(async () => {
  console.log('\nzelfde nummer, open lead');
  {
    bestaande = [open('in_progress')];
    const r = await stuur({ name: 'Bart', phone: '0478 12 34 56', consent: true, property: 'V7' });
    ck('antwoordt gewoon succes, met de bestaande id', r.status === 200 && r.uit.success && r.uit.id === 'recOPEN0000000000' && r.uit.bestaand === true, r.uit);
    ck('maakt GEEN tweede lead aan', !r.create, r.create && r.create.body);
    ck('zoekt op tenant, nummer en open status', r.zoek && /GARAGE/.test(decodeURIComponent(r.zoek.url)) && /32478123456/.test(decodeURIComponent(r.zoek.url)) && /NOT\(OR\(/.test(decodeURIComponent(r.zoek.url)), r.zoek && decodeURIComponent(r.zoek.url));
    const blob = r.patch ? JSON.parse(JSON.parse(r.patch.body).fields.fldoLRI5W12ThTls7) : {};
    ck('zet een notitie met de nieuwe aanvraag bovenaan', blob.notes && /opnieuw in voor V7/.test(blob.notes[0].text) && blob.notes.length === 2, blob.notes);
    ck('vult de wagen aan', blob.property === 'V7', blob);
    ck('laat aiPaused en de taken staan', blob.aiPaused === true && blob.tasks.length === 1, blob);
    ck('stuurt geen tweede WhatsApp-begroeting', r.whatsapp.length === 0, r.whatsapp.length);
  }

  console.log('\nzelfde e-mail, open lead');
  {
    bestaande = [open('new', JSON.stringify({ _v: 1, notes: [], email: 'an@voorbeeld.be', property: 'V1' }))];
    const r = await stuur({ name: 'An', email: 'AN@voorbeeld.be', consent: true, property: 'V9' });
    ck('hergebruikt de lead', r.uit && r.uit.bestaand === true && !r.create, r.uit);
    ck('zoekt het adres in kleine letters in de Notities', r.zoek && /"email":"an@voorbeeld\.be"/.test(decodeURIComponent(r.zoek.url).replace(/\\"/g, '"')), r.zoek && decodeURIComponent(r.zoek.url));
    const blob = JSON.parse(JSON.parse(r.patch.body).fields.fldoLRI5W12ThTls7);
    ck('overschrijft de eerste wagen niet', blob.property === 'V1', blob);
    ck('maar noemt de nieuwe in de notitie', /V9/.test(blob.notes[0].text), blob.notes);
  }

  console.log('\nwanneer het WEL een nieuwe lead is');
  {
    bestaande = [open('completed')];
    let r = await stuur({ name: 'Bart', phone: '0478 12 34 56', consent: true });
    ck('gesloten lead (ook als Airtable hem toch teruggeeft): nieuwe lead', !!r.create && !r.patch, r.uit);
    ck('en die krijgt wel een begroeting', r.whatsapp.length === 1, r.whatsapp.length);

    bestaande = [];
    r = await stuur({ name: 'Nieuw', phone: '0478 99 88 77', consent: true });
    ck('niemand gevonden: nieuwe lead', !!r.create && r.uit.id === 'recNIEUW000000000', r.uit);

    opzoekingFaalt = true;
    r = await stuur({ name: 'Bart', phone: '0478 12 34 56', consent: true });
    ck('opzoeking faalt: toch een nieuwe lead, niets verloren', !!r.create && r.status === 200, r.uit);
    opzoekingFaalt = false;

    bestaande = [open('new', 'gewone tekst, geen JSON')];
    r = await stuur({ name: 'Bart', phone: '0478 12 34 56', consent: true });
    ck('Notities is vrije tekst: niet overschrijven, nieuwe lead', !!r.create && !r.patch, { create: !!r.create, patch: !!r.patch });

    bestaande = [Object.assign(open('new'), { fields: Object.assign(open('new').fields, { fldSmczuyUJd26HLe: 'ANDERE' }) })];
    r = await stuur({ name: 'Bart', phone: '0478 12 34 56', consent: true });
    ck('lead van een andere dealer (formule faalt): nooit hergebruiken', !!r.create && !r.patch, { create: !!r.create, patch: !!r.patch });
  }

  console.log(`\n  ${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
