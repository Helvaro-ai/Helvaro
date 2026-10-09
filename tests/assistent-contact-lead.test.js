/*
 * L-08: contactlead van de websiteassistent -- toestemming afgedwongen, de
 * voertuigcode reist mee, en een open lead voor hetzelfde nummer/e-mailadres
 * bij dezelfde dealer wordt bijgewerkt in plaats van verdubbeld.
 */
'use strict';
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';
process.env.PHONE_NUMBER_ID = '123456';
const { maakNepAirtable } = require('./fixtures/nep-airtable');
const A = require(BASE + 'api/_assistent.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 240)}`); ok ? pass++ : fail++; };

(async () => {
  const SLEUTEL = 'hv_site_' + 'a'.repeat(24);
  const { db } = maakNepAirtable(['tblPidTrwGRzRt4LZ', 'tbliukTnDAbEDcZmt', 'customers', 'conversations', 'messages', 'handoffs', 'activity']);
  db.tblPidTrwGRzRt4LZ.push({ id: 'recC1', fields: { fldN4dL0bGgfBOXwM: 'P1', 'Site Key': SLEUTEL, 'Widget Enabled': true, 'Widget Domains': 'garage-voorbeeld.be' } });
  const basis = { siteKey: SLEUTEL, origin: 'https://www.garage-voorbeeld.be', ip: '1.2.3.4' };
  const leads = () => db.tbliukTnDAbEDcZmt;
  const blob = (l) => JSON.parse(l.fields.fldoLRI5W12ThTls7);

  console.log('\ntoestemming');
  let fout = null;
  try { await A.contact(Object.assign({ sessie: 'sessie-aaaaaaaaaaaa1', email: 'a@x.be', voertuig: 'V3' }, basis)); } catch (e) { fout = e.code; }
  ck('zonder toestemming: geweigerd, niets aangemaakt', fout === 'consent_required' && leads().length === 0, { fout, n: leads().length });

  console.log('\nvoertuigcode');
  await A.contact(Object.assign({ sessie: 'sessie-aaaaaaaaaaaa1', email: 'a@x.be', toestemming: true, voertuig: 'v3' }, basis));
  ck('code staat op de lead', leads().length === 1 && blob(leads()[0]).property === 'V3', leads().length && blob(leads()[0]));

  console.log('\neen open lead voor dezelfde persoon');
  await A.contact(Object.assign({ sessie: 'sessie-bbbbbbbbbbbb2', email: 'A@X.be', toestemming: true, voertuig: 'V9' }, basis));
  ck('zelfde e-mail, andere sessie: geen tweede lead', leads().length === 1, leads().length);
  ck('de tweede wagen staat erbij', blob(leads()[0]).properties && blob(leads()[0]).properties.indexOf('V9') > -1, blob(leads()[0]));
  db.tbliukTnDAbEDcZmt.push({ id: 'recTEL', fields: { fldSmczuyUJd26HLe: 'P1', fld6YaitW0lMqHUrd: '32470111222', fld8mkrEWcyq7mUip: 'new', fldoLRI5W12ThTls7: JSON.stringify({ _v: 1, notes: [], tasks: [], calls: [] }) } });
  await A.contact(Object.assign({ sessie: 'sessie-cccccccccccc3', telefoon: '0470 11 12 22', toestemming: true, voertuig: 'V5' }, basis));
  ck('zelfde telefoonnummer (andere schrijfwijze): bestaande lead bijgewerkt, geen extra', leads().length === 2, leads().length);
  ck('en de wagen staat op die lead', blob(leads()[1]).property === 'V5', blob(leads()[1]));
  const ander = await A.contact(Object.assign({ sessie: 'sessie-dddddddddddd4', telefoon: '0470 99 88 77', toestemming: true }, basis));
  ck('ander nummer: wel een nieuwe lead', ander.ok && leads().length === 3, leads().length);
  console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
