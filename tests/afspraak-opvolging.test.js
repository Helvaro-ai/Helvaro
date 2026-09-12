/*
 * api/cron-followup.js runAfspraakOpvolging() -- de no-show/geannuleerd-
 * opvolging voor dealership-afspraken (Fase 4).
 *
 * Mocked fetch, net als tests/wa-send-deur.test.js en tests/voertuigslot.
 * test.js: geen echte Airtable- of Meta-aanroep, maar wel de echte functie,
 * zodat de VOLGORDE van de aanroepen (vlag voor verzending) en de echte
 * beslissingen (wie krijgt wat, wie wordt overgeslagen) bewezen worden en niet
 * alleen aangenomen.
 */
'use strict';

process.env.API_AIRTABLE  = 'test-airtable-token';
process.env.BASE_AIRTABLE = 'appTEST0000000000';
process.env.WHATSAPP_TOKEN = 'test-whatsapp-token';
process.env.PHONE_NUMBER_ID = 'test-phone-number-id';

const cron = require('../api/cron-followup.js');
const runAfspraakOpvolging = cron.runAfspraakOpvolging;

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 300)}`);
  ok ? pass++ : fail++;
};

ck('runAfspraakOpvolging is geëxporteerd', typeof runAfspraakOpvolging === 'function', typeof runAfspraakOpvolging);

const NOW = new Date('2026-09-12T12:00:00.000Z');

function jsonRes(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

const DEALER_CLIENT = { id: 'recClient1', fields: { Vertical: 'dealership', Language: 'nl' } };
const NIET_DEALER_CLIENT = { id: 'recClient2', fields: { Language: 'nl' } }; // leeg = vastgoed

function maakLead({ id = 'recLead1', optedOut = false, historyTs = null } = {}) {
  const history = historyTs === null ? [] : [{ role: 'user', content: 'hoi', ts: historyTs }];
  return { id, fields: { 'Opted Out': optedOut, 'Conversation History': JSON.stringify(history) } };
}

function maakAppointment({ id = 'rec001', status = 'no_show', notes = '', leadId = 'recLead1' } = {}) {
  return {
    id,
    fields: {
      fldt3zlcrFKGAGw3E: status,
      Notes: notes,
      fld60vlhoxZYef4U2: 'ACME',
      fldO0Gk82OJ9m6lz7: '32470000001',
      fldnCNWPxIX6sYzZP: 'Jan Janssens',
      Lead: [leadId],
      'Appointment ID': 'ACME-2609121000',
    },
  };
}

/* Eén scenario-object per test, met een callLog om de VOLGORDE te bewijzen.
   komendeVoorLead is de enige stap die _afspraken.js zelf rechtstreeks
   aanroept met zijn eigen Airtable-query op dezelfde tabel als de hoofdquery
   hierboven -- die twee moeten in de mock uit elkaar gehouden worden, en dat
   kan omdat _afspraken.komendeVoorLead altijd op Status="booked" filtert en
   deze functie's eigen hoofdquery altijd op "Followup Sent" filtert. */
let scenario, callLog;
function setup(s) {
  scenario = Object.assign({
    appointments: [], leads: [], client: DEALER_CLIENT,
    komendeAfspraak: null, patchFails: false, sendFails: false,
  }, s);
  callLog = [];
  global.fetch = async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    callLog.push({ url, method, body: opts && opts.body });
    const decoded = decodeURIComponent(url);

    if (/graph\.facebook\.com/.test(url)) {
      if (scenario.sendFails) return jsonRes({ error: { message: 'nope', code: 131047 } }, 400);
      return jsonRes({ messages: [{ id: 'wamid.test123' }] });
    }
    if (/tblD058vEITs1xYFc\/[A-Za-z0-9]+$/.test(url) && method === 'PATCH') {
      if (scenario.patchFails) return jsonRes({ error: 'boom' }, 500);
      return jsonRes({ id: url.split('/').pop(), fields: {} });
    }
    if (/tblD058vEITs1xYFc\?filterByFormula/.test(url) && method === 'GET') {
      // De hoofdquery van runAfspraakOpvolging filtert op "Followup Sent";
      // _afspraken.komendeVoorLead filtert op Status="booked". Twee aparte
      // aanroepen op dezelfde tabel, uit elkaar gehouden op de formule-tekst.
      if (decoded.indexOf('Followup Sent') !== -1) {
        return jsonRes({ records: scenario.appointments });
      }
      if (decoded.indexOf('"booked"') !== -1) {
        return jsonRes({ records: scenario.komendeAfspraak ? [scenario.komendeAfspraak] : [] });
      }
      return jsonRes({ records: [] });
    }
    if (/tbliukTnDAbEDcZmt\?filterByFormula/.test(url) && method === 'GET') {
      return jsonRes({ records: scenario.leads });
    }
    if (/tblPidTrwGRzRt4LZ\?filterByFormula/.test(url) && method === 'GET') {
      return jsonRes({ records: scenario.client ? [scenario.client] : [] });
    }
    return jsonRes({ records: [] });
  };
}

async function run() {
  return runAfspraakOpvolging('tok', 'appTEST0000000000', 'shared-pnid', 'tok', NOW);
}

/* Top-level await bestaat alleen in een ES-module, en dit bestand is CommonJS
   (require() hierboven, geen package.json met "type":"module" in dit project).
   Zelfde IIFE-vorm als tests/dealer-boeking.test.js gebruikt voor precies
   dezelfde reden. */
(async () => {

console.log('\nno_show: geflagd VOOR de verzending, en de verzending gebeurt echt');
{
  setup({
    appointments: [maakAppointment({ status: 'no_show' })],
    leads: [maakLead({ historyTs: NOW.getTime() - 30 * 3600 * 1000 })], // > 24u -> template
  });
  const uit = await run();
  ck('checked/sent kloppen', uit.checked === 1 && uit.sent === 1, JSON.stringify(uit));

  const iPatch = callLog.findIndex((c) => c.method === 'PATCH' && /tblD058vEITs1xYFc/.test(c.url));
  const iSend  = callLog.findIndex((c) => /graph\.facebook\.com/.test(c.url));
  ck('de PATCH (Followup Sent) gebeurt vóór de verzending', iPatch !== -1 && iSend !== -1 && iPatch < iSend, { iPatch, iSend });

  const patchBody = JSON.parse(callLog[iPatch].body);
  ck('de PATCH zet Followup Sent op true', patchBody.fields['Followup Sent'] === true, patchBody);

  const sendBody = JSON.parse(callLog[iSend].body);
  ck('buiten het 24u-venster gaat het sjabloon eruit, niet vrije tekst', sendBody.type === 'template', sendBody);
  ck('het sjabloon heet "followup_24h" (naamVoor(\'followup\'))', sendBody.template && sendBody.template.name === 'followup_24h', sendBody);
}

console.log('\ncancelled binnen 24u: vrije tekst, niet het sjabloon');
{
  setup({
    appointments: [maakAppointment({ status: 'cancelled' })],
    leads: [maakLead({ historyTs: NOW.getTime() - 1 * 3600 * 1000 })], // < 24u -> freeform
  });
  const uit = await run();
  ck('sent === 1', uit.sent === 1, uit);
  const iSend = callLog.findIndex((c) => /graph\.facebook\.com/.test(c.url));
  const sendBody = JSON.parse(callLog[iSend].body);
  ck('binnen het 24u-venster gaat vrije tekst eruit', sendBody.type === 'text', sendBody);
  ck('de tekst is de geannuleerd-opvolgboodschap, geen sjabloon',
    /geannuleerd/.test(sendBody.text.body), sendBody);
}

console.log('\ntweede ronde: Followup Sent al true -> de query levert hem niet meer op -> niets verstuurd');
{
  setup({ appointments: [] /* Airtable zou hem al uitsluiten via NOT({Followup Sent}) */ });
  const uit = await run();
  ck('checked 0, sent 0', uit.checked === 0 && uit.sent === 0, uit);
  ck('er wordt alleen de hoofdquery aangeroepen, verder niets (leeg resultaat -> meteen klaar)', callLog.length === 1, callLog.length);
}

console.log('\nNotes "Afgezegd door de lead" -> al een eerlijk in-chat antwoord gehad -> geflagd, geen send');
{
  setup({
    appointments: [maakAppointment({ status: 'cancelled', notes: '[2026-09-10 10:00] Afgezegd door de lead: kan niet.' })],
    leads: [maakLead()],
  });
  const uit = await run();
  ck('niets verstuurd', uit.sent === 0, uit);
  ck('wel geflagd (PATCH gebeurde)', callLog.some((c) => c.method === 'PATCH'), callLog);
  ck('geen enkele send-poging naar Meta', !callLog.some((c) => /graph\.facebook\.com/.test(c.url)), callLog);
}

console.log('\n"Afgezegd door de AI" telt net zo goed als "Afgezegd door de lead"');
{
  setup({
    appointments: [maakAppointment({ status: 'cancelled', notes: 'Afgezegd door de AI: geen reactie.' })],
    leads: [maakLead()],
  });
  const uit = await run();
  ck('niets verstuurd', uit.sent === 0, uit);
  ck('wel geflagd', callLog.some((c) => c.method === 'PATCH'), callLog);
}

console.log('\nopgemelde (opted-out) lead -> geflagd, geen send');
{
  setup({
    appointments: [maakAppointment({ status: 'no_show' })],
    leads: [maakLead({ optedOut: true })],
  });
  const uit = await run();
  ck('niets verstuurd', uit.sent === 0, uit);
  ck('wel geflagd', callLog.some((c) => c.method === 'PATCH'), callLog);
  ck('geen send-poging', !callLog.some((c) => /graph\.facebook\.com/.test(c.url)), callLog);
}

console.log('\nlead heeft al een NIEUWE geboekte afspraak -> geflagd, geen send');
{
  setup({
    appointments: [maakAppointment({ status: 'no_show' })],
    leads: [maakLead()],
    komendeAfspraak: { id: 'recNieuw', fields: { Status: 'booked', Lead: ['recLead1'] } },
  });
  const uit = await run();
  ck('niets verstuurd', uit.sent === 0, uit);
  ck('wel geflagd', callLog.some((c) => c.method === 'PATCH'), callLog);
}

console.log('\nniet-dealership klant -> helemaal niets (geen PATCH, geen send)');
{
  setup({
    appointments: [maakAppointment({ status: 'no_show' })],
    leads: [maakLead()],
    client: NIET_DEALER_CLIENT,
  });
  const uit = await run();
  ck('niets verstuurd', uit.sent === 0, uit);
  ck('geen enkele PATCH op de afspraak', !callLog.some((c) => c.method === 'PATCH'), callLog);
  ck('checked telt de afspraak nog wel mee (hij kwam uit de query)', uit.checked === 1, uit);
}

console.log('\nPATCH mislukt -> geen send (nooit versturen zonder de vlag zeker te weten)');
{
  setup({
    appointments: [maakAppointment({ status: 'no_show' })],
    leads: [maakLead()],
    patchFails: true,
  });
  const uit = await run();
  ck('niets verstuurd', uit.sent === 0, uit);
  ck('geen enkele send-poging naar Meta', !callLog.some((c) => /graph\.facebook\.com/.test(c.url)), callLog);
}

console.log('\nlead-record niet gevonden -> geflagd, geen send, geen crash');
{
  setup({
    appointments: [maakAppointment({ status: 'no_show', leadId: 'recSpook' })],
    leads: [], // de gekoppelde lead komt niet terug in de batch-fetch
  });
  const uit = await run();
  ck('niets verstuurd, geen worp', uit.sent === 0, uit);
  ck('wel geflagd', callLog.some((c) => c.method === 'PATCH'), callLog);
}

console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
process.exit(fail === 0 ? 0 : 1);

})();
