/*
 * L-03 + L-13: een agenda die niet GELEZEN kon worden is niet "vrij".
 *  - freeBusy: `errors` per agenda = null (niet gecontroleerd), nooit [].
 *  - een verlopen refresh-token (invalid_grant) wordt niet ingeslikt: de
 *    aanroeper weet dat er niet geverifieerd is, en de eigenaar krijgt de
 *    melding om opnieuw te koppelen.
 *  - de websiteboeking schrijft dan [LET OP] in de notitie, zoals WhatsApp.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const BASE = path.join(__dirname, '..') + '/';
process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';

const { maakNepAirtable } = require('./fixtures/nep-airtable');
const _gcal = require(BASE + 'api/_gcal.js');
const _afspraken = require(BASE + 'api/_afspraken.js');
const WB = require(BASE + 'api/_webboeking.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 220)}`);
  ok ? pass++ : fail++;
};

(async () => {
  console.log('\nL-13  freeBusy met agenda-fouten');
  const echteFetch = global.fetch;
  const antwoord = (cal) => { global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ calendars: { primary: cal } }) }); };
  antwoord({ errors: [{ domain: 'global', reason: 'notFound' }], busy: [] });
  ck('errors + lege busy = null (niet gecontroleerd)', (await _gcal.freeBusy('t', 'primary', 'a', 'b')) === null);
  antwoord({ busy: [] });
  const leeg = await _gcal.freeBusy('t', 'primary', 'a', 'b');
  ck('echt lege agenda blijft []', Array.isArray(leeg) && leeg.length === 0, leeg);
  antwoord({ errors: [{ reason: 'internalError' }], busy: [] });
  const cs = await _gcal.checkSlot('t', 'primary', '2030-01-01T10:00:00Z', 30);
  ck('checkSlot: niet geverifieerd bij agenda-fouten', cs.geverifieerd === false, cs);
  global.fetch = echteFetch;

  console.log('\nL-03  verlopen token');
  const { db } = maakNepAirtable(['tblPidTrwGRzRt4LZ', 'tbliukTnDAbEDcZmt', 'tblD058vEITs1xYFc', 'customers', 'conversations', 'messages', 'activity']);
  db.tblPidTrwGRzRt4LZ.push({ id: 'recC1', fields: { fldN4dL0bGgfBOXwM: 'P1', fldkYmK3jAabvytCF: 'v1:x', 'Working Hours': 'ma-za 9-18' } });
  _gcal.isConfigured = () => true;
  _gcal.decryptToken = () => 'refresh';
  _gcal.getAccessToken = async () => { const e = new Error('refresh failed: invalid_grant'); e.code = 'reauth_required'; throw e; };
  const pushes = [];
  const _push = require(BASE + 'api/_push.js');
  _push.stuurVertaald = async (o) => { pushes.push(o); return { ok: true }; };
  const g = await _afspraken.gcalVoor('P1');
  ck('gcalVoor meldt: koppeling bestaat maar is onbereikbaar', g.token === '' && g.nietBereikbaar === true && g.reauth === true, g);
  await new Promise((r) => setTimeout(r, 20));
  ck('de eigenaar krijgt de melding om opnieuw te koppelen', pushes.some((p) => p.tekstSleutel === 'push.agenda.reauth'), pushes);

  const v = await WB.vrijeMomenten('P1', { alle: true });
  ck('vrijeMomenten: agendaNietGelezen', v.agendaNietGelezen === true && v.agenda === false, v);
  await WB.boek('P1', { startISO: v.momenten[0], leadId: 'recLEAD00000000001', naam: 'Jan' });
  const rec = db.tblD058vEITs1xYFc.find((r) => r.fields['Start Time'] === v.momenten[0]);
  ck('websiteboeking: [LET OP] in de notitie', rec && /\[LET OP\]/.test(rec.fields.Notes), rec && rec.fields.Notes);

  console.log('\nWhatsApp-kant');
  const wa = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');
  ck('gcalAccess geeft nietBereikbaar door', /return \{ token: '', calId, nietBereikbaar: true, reauth \}/.test(wa));
  ck('de boeking zet agendaGeverifieerd=false daarop', /if \(gAccess\.nietBereikbaar\) agendaGeverifieerd = false/.test(wa));

  console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
