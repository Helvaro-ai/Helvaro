/*
 * api/_assistent.js — de websiteassistent.
 *
 * Herkomst, site key, contactregels, voertuigkaartjes alleen uit de voorraad,
 * de verkocht-race tussen modelantwoord en vertrek, doorsturen met referentie,
 * tenant-isolatie. Airtable, Meta en het model zijn nep.
 */
'use strict';
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';
process.env.PHONE_NUMBER_ID = '123456';

const { maakNepAirtable } = require('./fixtures/nep-airtable');
const A = require(BASE + 'api/_assistent.js');
const _vehicles = require(BASE + 'api/_vehicles.js');
const _ai = require(BASE + 'api/_ai');
const _waes = require(BASE + 'api/_waes.js');
const P = A._test;

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 220)}`);
  ok ? pass++ : fail++;
};

(async () => {
  console.log('\nherkomst en sleutel');
  const dom = A.domeinen('https://www.garage-voorbeeld.be/occasies\n  shop.garage-voorbeeld.be, onzin, http://x');
  ck('domeinen genormaliseerd, onzin eruit', dom.join() === 'garage-voorbeeld.be,shop.garage-voorbeeld.be', dom);
  ck('eigen domein mag', P.herkomstToegestaan('https://www.garage-voorbeeld.be', ['garage-voorbeeld.be']));
  ck('subdomein mag', P.herkomstToegestaan('https://occasies.garage-voorbeeld.be', ['garage-voorbeeld.be']));
  ck('lookalike-domein mag niet', !P.herkomstToegestaan('https://garage-voorbeeld.be.evil.example', ['garage-voorbeeld.be']));
  ck('achtervoegsel-truc mag niet', !P.herkomstToegestaan('https://evilgarage-voorbeeld.be', ['garage-voorbeeld.be']));
  ck('http mag niet', !P.herkomstToegestaan('http://garage-voorbeeld.be', ['garage-voorbeeld.be']));
  ck('geen origin mag niet', !P.herkomstToegestaan('', ['garage-voorbeeld.be']));
  ck('site key heeft een vast formaat', A.SITE_KEY.test(A.nieuweSiteKey()) && !A.SITE_KEY.test('hv_site_x'));

  console.log('\ncontactregels');
  ck('rondkijken = laag (geen contactvraag)', P.intentie('Hebben jullie SUV\'s onder 30.000?') === 'laag');
  ck('proefrit = hoog', P.intentie('Kan ik zaterdag een proefrit maken?') === 'hoog');
  ck('inruil = hoog', P.intentie('Nemen jullie mijn Golf in ruil?') === 'laag' && P.intentie('Kan ik mijn wagen inruilen? inruil') === 'hoog');
  ck('financiering (fr) = hoog', P.intentie('Est-ce que le financement est possible ?') === 'hoog');

  console.log('\nvoorraad zoeken');
  const voorraad = [
    { code: 'V1', merk: 'BMW', model: 'X5', uitvoering: 'xDrive30d', brandstof: 'diesel', prijs: 54950, km: 61000, status: 'beschikbaar', publiek: true },
    { code: 'V2', merk: 'Volkswagen', model: 'Golf', uitvoering: 'GTI', brandstof: 'benzine', prijs: 32500, km: 61000, status: 'gereserveerd', publiek: true },
    { code: 'V3', merk: 'Skoda', model: 'Octavia', brandstof: 'diesel', prijs: 18900, km: 120000, status: 'beschikbaar', publiek: true },
    { code: 'V4', merk: 'BMW', model: 'X3', prijs: 1, status: 'beschikbaar', publiek: false },
  ];
  const z = P.zoekVoorraad(voorraad, 'Hebben jullie een BMW diesel?');
  ck('BMW gevonden, niet-publieke niet', z.length === 1 && z[0].code === 'V1', z.map((v) => v.code));
  ck('Škoda zonder accent vindbaar', P.zoekVoorraad(voorraad, 'skoda octavia')[0].code === 'V3');
  ck('genoemd op merk + model', P.genoemd('De BMW X5 is er nog.', voorraad[0]) && !P.genoemd('We hebben diesels.', voorraad[0]));
  const k = P.kaart(voorraad[1]);
  ck('kaart: alleen voorraadvelden, status eerlijk', k.code === 'V2' && k.beschikbaar === false && k.status === 'gereserveerd' && !('omschrijving' in k));

  console.log('\neen beurt van begin tot eind');
  const SLEUTEL = 'hv_site_' + 'a'.repeat(24);
  const { db } = maakNepAirtable(['tblPidTrwGRzRt4LZ', 'tbliukTnDAbEDcZmt', 'customers', 'conversations', 'messages', 'handoffs', 'activity']);
  db.tblPidTrwGRzRt4LZ.push({ id: 'recC1', fields: { fldN4dL0bGgfBOXwM: 'P1', fldAnB848Sr5jl6dq: 'Garage Voorbeeld', 'Site Key': SLEUTEL, 'Widget Enabled': true, 'Widget Domains': 'garage-voorbeeld.be', 'Inventory Source': '', 'Inventory State': '' } });
  db.tblPidTrwGRzRt4LZ.push({ id: 'recC2', fields: { fldN4dL0bGgfBOXwM: 'P2', 'Site Key': 'hv_site_' + 'b'.repeat(24), 'Widget Enabled': false, 'Widget Domains': 'andere.be' } });
  const echt = { list: _vehicles.list, leesVers: _vehicles.leesVers, gen: _ai.generateText, info: _waes.getPhoneInfo };
  let versStatus = 'beschikbaar';
  _vehicles.list = async () => voorraad;
  _vehicles.leesVers = async (t, code) => ({ gelezen: true, voertuig: Object.assign({}, voorraad.find((v) => v.code === code), { status: versStatus }) });
  _waes.getPhoneInfo = async () => ({ number: '+32 470 00 00 00' });
  let gezien = null;
  _ai.generateText = async (o) => { gezien = o; return { text: 'De BMW X5 xDrive30d staat er nog voor € 54.950 met 61.000 km.' }; };
  const basis = { siteKey: SLEUTEL, origin: 'https://www.garage-voorbeeld.be', ip: '1.2.3.4' };

  let r = await A.beurt(Object.assign({ sessie: 'sessie-aaaaaaaaaaaa1', tekst: 'Hebben jullie een BMW diesel?' }, basis));
  ck('antwoord + kaart uit de voorraad', r.kaarten.length === 1 && r.kaarten[0].code === 'V1' && r.kaarten[0].prijs === 54950, r);
  ck('rondkijken: geen contactvraag', r.vraagContact === false);
  ck('model kreeg alleen voorraadkandidaten', /V1: BMW X5/.test(gezien.system) && !/V4/.test(gezien.system));
  ck('model mag niet zelf om contact vragen', /Vraag NOOIT zelf om naam/.test(gezien.system));
  ck('WhatsApp-doorsturen beschikbaar', r.handoffs && r.handoffs.whatsapp === true && r.handoffs.email === false);
  const g1 = db.conversations.find((c) => c.fields['External Thread ID'] === 'web:sessie-aaaaaaaaaaaa1');
  ck('websitegesprek bewaard met in + uit', g1 && db.messages.filter((m) => m.fields['Conversation ID'] === g1.fields['Conversation ID']).length === 2);

  r = await A.beurt(Object.assign({ sessie: 'sessie-aaaaaaaaaaaa1', tekst: 'Kan ik zaterdag een proefrit maken?' }, basis));
  ck('koopstap: contactkaartje gevraagd', r.vraagContact === true);

  versStatus = 'verkocht';
  r = await A.beurt(Object.assign({ sessie: 'sessie-aaaaaaaaaaaa2', tekst: 'Is de BMW X5 nog vrij?' }, basis));
  ck('verkocht tussen model en vertrek: geen "staat er nog", geen kaart', !/staat er nog/.test(r.antwoord) && r.kaarten.length === 0, r);
  versStatus = 'beschikbaar';

  let fout = null;
  try { await A.beurt(Object.assign({}, basis, { origin: 'https://evil.example', sessie: 'sessie-aaaaaaaaaaaa3', tekst: 'hallo' })); } catch (e) { fout = e.code; }
  ck('vreemde website geweigerd', fout === 'origin');
  fout = null;
  try { await A.beurt({ siteKey: 'hv_site_' + 'b'.repeat(24), origin: 'https://andere.be', ip: '1.1.1.1', sessie: 'sessie-bbbbbbbbbbbb1', tekst: 'hallo' }); } catch (e) { fout = e.code; }
  ck('uitgeschakelde assistent geweigerd', fout === 'uit');
  fout = null;
  try { await A.beurt(Object.assign({}, basis, { sessie: 'kort', tekst: 'hallo' })); } catch (e) { fout = e.code; }
  ck('ongeldige sessie geweigerd', fout === 'bad_session');

  console.log('\ncontact en doorsturen');
  fout = null;
  try { await A.contact(Object.assign({ sessie: 'sessie-aaaaaaaaaaaa1', naam: 'Jan' }, basis)); } catch (e) { fout = e.code; }
  ck('zonder e-mail én zonder telefoon: geweigerd', fout === 'geen_contact');
  const c = await A.contact(Object.assign({ sessie: 'sessie-aaaaaaaaaaaa1', email: 'jan@voorbeeld.be', toestemming: true }, basis));
  ck('alleen e-mail is genoeg: lead gemaakt', c.ok && db.tbliukTnDAbEDcZmt.length === 1 && db.tbliukTnDAbEDcZmt[0].fields.Email === 'jan@voorbeeld.be');
  ck('toestemming vastgelegd zoals gegeven', JSON.parse(db.tbliukTnDAbEDcZmt[0].fields.fldoLRI5W12ThTls7).consent.given === true);
  r = await A.beurt(Object.assign({ sessie: 'sessie-aaaaaaaaaaaa1', tekst: 'Kan ik een proefrit boeken?' }, basis));
  ck('na contact: niet opnieuw gevraagd', r.vraagContact === false);

  const h = await A.handoff(Object.assign({ sessie: 'sessie-aaaaaaaaaaaa1', doel: 'whatsapp' }, basis));
  ck('WhatsApp-link met referentie', /^https:\/\/wa\.me\/32470000000\?text=/.test(h.url) && /ref%20H-[A-Z0-9]{8}/.test(h.url), h);
  ck('token alleen gehasht opgeslagen', db.handoffs.length === 1 && db.handoffs[0].fields['Token Hash'] !== h.ref && db.handoffs[0].fields['Token Hash'].length === 64);
  ck('referentie herkend in WhatsApp-tekst', A.refUit('Hallo! Ik kom van jullie website. (ref ' + h.ref + ')') === h.ref);
  const gebruik = await A.gebruikHandoff('P1', h.ref, { leadId: 'recWA1' });
  ck('handoff geeft de context mee', gebruik && /Bezoeker: /.test(gebruik.context));
  ck('tweede keer gebruiken = niets (eenmalig)', (await A.gebruikHandoff('P1', h.ref, { leadId: 'recWA2' })) === null);
  ck('andere dealer kan de referentie niet gebruiken', (await A.gebruikHandoff('P2', h.ref, {})) === null);
  fout = null;
  try { await A.handoff(Object.assign({ sessie: 'sessie-aaaaaaaaaaaa1', doel: 'email' }, basis)); } catch (e) { fout = e.code; }
  ck('e-mail doorsturen zonder mailbox: eerlijk geweigerd', fout === 'geen_mailbox');

  console.log('\ninstellingen');
  let w = await A.widgetInstellingen('P1');
  ck('snippet met de sleutel', w.snippet.includes(SLEUTEL) && w.aan === true);
  w = await A.bewaarWidget('P1', { roteer: true });
  ck('nieuwe sleutel maakt de oude ongeldig', w.siteKey !== SLEUTEL && A.SITE_KEY.test(w.siteKey));
  P.reset();
  fout = null;
  try { await A.beurt(Object.assign({ sessie: 'sessie-aaaaaaaaaaaa9', tekst: 'hallo' }, basis)); } catch (e) { fout = e.code; }
  ck('oude sleutel werkt niet meer', fout === 'bad_site');
  fout = null;
  try { await A.bewaarWidget('P2', { aan: true, domeinenTekst: '' }); } catch (e) { fout = e.code; }
  ck('aanzetten zonder domein geweigerd', fout === 'geen_domein');

  console.log('\nwhatsapp gebruikt de doorverwijzing in dezelfde beurt');
  const wa = require('fs').readFileSync(BASE + 'api/whatsapp.js', 'utf8');
  const iHandoff = wa.indexOf('_assistent.gebruikHandoff(projectCode, ref');
  const iAI = wa.indexOf('const aiResponse = await runAI(');
  ck('handoff wordt opgehaald VOOR de AI-aanroep', iHandoff > 0 && iAI > iHandoff);
  ck('en de context gaat mee in de prompt', /EERDER GESPREK OP DE WEBSITE/.test(wa));

  Object.assign(_vehicles, { list: echt.list, leesVers: echt.leesVers });
  _ai.generateText = echt.gen; _waes.getPhoneInfo = echt.info;
  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
