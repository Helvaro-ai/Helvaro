/*
 * api/_webboeking.js + de acties 'slots'/'book' van de websiteassistent.
 *
 * Alleen echte vrije momenten binnen de openingsuren, bestaande afspraken
 * vallen weg, een willekeurig tijdstip wordt geweigerd, boeken kan alleen
 * met contactgegevens, en de afspraak hangt aan de juiste lead en dealer.
 */
'use strict';
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';
delete process.env.GOOGLE_CLIENT_ID; // geen agenda: alleen Helvaro-afspraken tellen

const { maakNepAirtable } = require('./fixtures/nep-airtable');
const WB = require(BASE + 'api/_webboeking.js');
const A = require(BASE + 'api/_assistent.js');
const P = WB._test;

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 220)}`);
  ok ? pass++ : fail++;
};

(async () => {
  console.log('\nopeningsuren en kandidaten');
  ck('ma-vr 9-18 gelezen', JSON.stringify(P.parseUren('ma-vr 9-18')) === JSON.stringify({ van: 1, tot: 5, begin: 9, eind: 18 }));
  ck('Frans en halve uren', P.parseUren('lun-sam 8:30-17').begin === 8.5);
  ck('onzin = null', P.parseUren('altijd open') === null);
  const vrijdag8u = Date.parse('2026-09-25T06:00:00Z'); // vrijdag 08:00 Brussel
  const k = P.kandidaten('ma-vr 9-18', { nu: vrijdag8u, dagen: 3 });
  ck('eerste moment = 2 uur na nu (10:00 Brussel)', k[0] === '2026-09-25T08:00:00.000Z', k[0]);
  ck('weekend overgeslagen', !k.some((iso) => /2026-09-2[67]/.test(iso)));
  ck('laatste moment eindigt voor sluiting (17:00 + 30 min)', k[k.length - 1] === '2026-09-28T15:00:00.000Z', k[k.length - 1]);
  ck('overlap met bezet blok herkend', P.overlapt(Date.parse('2026-09-25T08:00:00Z'), 30, [{ start: '2026-09-25T08:15:00Z', end: '2026-09-25T09:00:00Z' }]));

  console.log('\nvrije momenten en boeken');
  const { db } = maakNepAirtable(['tblPidTrwGRzRt4LZ', 'tbliukTnDAbEDcZmt', 'tblD058vEITs1xYFc', 'customers', 'conversations', 'messages', 'activity']);
  const SLEUTEL = 'hv_site_' + 'c'.repeat(24);
  db.tblPidTrwGRzRt4LZ.push({ id: 'recC1', fields: { fldN4dL0bGgfBOXwM: 'P1', 'Site Key': SLEUTEL, 'Widget Enabled': true, 'Widget Domains': 'garage-voorbeeld.be', 'Working Hours': 'ma-za 9-18' } });
  const nu = Date.now();
  let v = await WB.vrijeMomenten('P1', { nu, alle: true });
  ck('er zijn vrije momenten', v.momenten.length > 5, v.momenten.length);
  const eerste = v.momenten[0];
  db.tblD058vEITs1xYFc.push({ id: 'recA1', fields: { 'Project Code': 'P1', 'Start Time': eerste, Duration: 30, Status: 'booked' } });
  v = await WB.vrijeMomenten('P1', { nu, alle: true });
  ck('bestaande afspraak valt weg', v.momenten.indexOf(eerste) === -1);
  const gespreid = await WB.vrijeMomenten('P1', { nu, max: 4 });
  ck('voorstel is gespreid en begrensd', gespreid.momenten.length <= 4 && gespreid.momenten.length > 0);

  let fout = null;
  try { await WB.boek('P1', { startISO: v.momenten[0] }); } catch (e) { fout = e.code; }
  ck('boeken zonder lead geweigerd', fout === 'geen_contact');
  fout = null;
  try { await WB.boek('P1', { startISO: '2026-12-25T03:17:00.000Z', leadId: 'recLEAD00000000001' }); } catch (e) { fout = e.code; }
  ck('willekeurig tijdstip (niet voorgesteld) geweigerd', fout === 'slot_bezet');
  fout = null;
  try { await WB.boek('P1', { startISO: eerste, leadId: 'recLEAD00000000001' }); } catch (e) { fout = e.code; }
  ck('bezet tijdstip geweigerd', fout === 'slot_bezet');
  const b = await WB.boek('P1', { startISO: v.momenten[0], leadId: 'recLEAD00000000001', naam: 'Jan', telefoon: '32470000000' });
  const nieuw = db.tblD058vEITs1xYFc.find((r) => r.fields['Start Time'] === v.momenten[0]);
  ck('afspraak aangemaakt, bron website, aan de lead', b.ok && nieuw && nieuw.fields.Source === 'website' && nieuw.fields.Lead[0] === 'recLEAD00000000001' && nieuw.fields['Project Code'] === 'P1');
  fout = null;
  try { await WB.boek('P1', { startISO: v.momenten[0], leadId: 'recLEAD00000000002' }); } catch (e) { fout = e.code; }
  ck('zelfde moment niet twee keer', fout === 'slot_bezet');

  console.log('\nvia de websiteassistent');
  const basis = { siteKey: SLEUTEL, origin: 'https://garage-voorbeeld.be', ip: '9.9.9.9' };
  fout = null;
  try { await A.momenten(Object.assign({ sessie: 'sessie-dddddddddddd1' }, basis)); } catch (e) { fout = e.code; }
  ck('momenten zonder contactgegevens: geweigerd', fout === 'geen_contact');
  await A.contact(Object.assign({ sessie: 'sessie-dddddddddddd1', telefoon: '0470 11 22 33', naam: 'Els' }, basis));
  const m = await A.momenten(Object.assign({ sessie: 'sessie-dddddddddddd1' }, basis));
  ck('na contact: momenten', Array.isArray(m.momenten) && m.momenten.length > 0);
  const geboekt = await A.boekMoment(Object.assign({ sessie: 'sessie-dddddddddddd1', start: m.momenten[0] }, basis));
  const afspraak = db.tblD058vEITs1xYFc.find((r) => r.fields['Start Time'] === m.momenten[0]);
  ck('geboekt met naam en nummer van DEZE lead', geboekt.ok && afspraak && afspraak.fields['Lead Name'] === 'Els' && afspraak.fields['Lead Phone'] === '32470112233', afspraak && afspraak.fields);
  /* Lead van een andere dealer onder dezelfde sessie: mag niet. */
  const g = db.conversations.find((c) => c.fields['External Thread ID'] === 'web:sessie-dddddddddddd1');
  const lead = db.tbliukTnDAbEDcZmt.find((r) => r.id === g.fields['Lead ID']);
  lead.fields.fldSmczuyUJd26HLe = 'P2';
  fout = null;
  try { await A.momenten(Object.assign({ sessie: 'sessie-dddddddddddd1' }, basis)); } catch (e) { fout = e.code; }
  ck('lead van andere dealer: geen toegang', fout === 'tenant');

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
