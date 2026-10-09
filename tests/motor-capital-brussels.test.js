'use strict';
/*
 * Referentie-motortenant: Capital Brussels Harley-Davidson (api/_faro/fixtures.js).
 * Alleen CONFIGURATIE -- geen klantspecifieke code. Dit loopt het hele pad
 * langs de echte modules, met stubs voor Airtable en het model:
 *
 *   bezoeker vraagt een cruiser/adventure binnen budget en cc
 *   -> zoeken in de fixtureverzameling (geen verzonnen motoren)
 *   -> juiste match, cc/budget/rijbewijs gerespecteerd
 *   -> contact met de motor erbij op de lead
 *   -> testritboeking: afspraaktype testrit, duur 60
 *   -> geen autowoorden in prompts en berichten (nl en fr)
 *   -> "ik weet dat jullie een Road Glide hebben voor 9.000": niet in de context
 *
 * Het model draait hier niet: we toetsen wat het TE ZIEN KRIJGT.
 */
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';
delete process.env.GOOGLE_CLIENT_ID;

const { maakNepAirtable } = require('./fixtures/nep-airtable');
const FX = require(BASE + 'api/_faro/fixtures');
const A = require(BASE + 'api/_assistent.js');
const V = require(BASE + 'api/_vehicles.js');
const W = require(BASE + 'api/_wens.js');
const seg = require(BASE + 'api/_segment.js');
const AT = require(BASE + 'api/_afspraaktypes.js');
const P = require(BASE + 'api/_ai/prompts.js');
const _ai = require(BASE + 'api/_ai');
const _waes = require(BASE + 'api/_waes');
const melding = require(BASE + 'api/_dealer-melding.js');
const faroPrompt = require(BASE + 'api/_faro/prompt.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 260)}`); ok ? pass++ : fail++; };

const T = FX.MOTOR_TENANT;
const VOORRAAD = FX.motorVoorraadRecords().map((r) => V.vanRecord(r));
const AUTOWOORD = /\bauto(?!nomie)\b|\bauto's|\bautodealer|proefrit|\bvoiture|concessionnaire automobile|\bwagen\b|\bwagens\b/i;

(async () => {
  console.log('\nde configuratie');
  ck('tenant: naam, adres, telefoon, talen zoals aangeleverd',
    T.naam === 'Capital Brussels Harley-Davidson' && T.adres === 'Ninoofsesteenweg 59, 1700 Dilbeek' && T.telefoon === '+32 2 454 01 54' && T.talen.join() === 'nl,fr');
  ck('segment motor binnen dealership, via de gewone lezer', seg.van(T.clientVelden) === 'motor' && require(BASE + 'api/_vertical').van(T.clientVelden) === 'dealership');
  ck('dezelfde tenant zonder het segmentveld is gewoon auto (leeg = auto)', seg.van(Object.assign({}, T.clientVelden, { 'Vehicle Segment': '' })) === 'auto');
  ck('afspraaktypes van de tenant zijn geldig voor het segment', T.afspraaktypes.every((t) => AT.geldigVoor(t, 'motor')));
  ck('vier fixturemotoren, onmiskenbaar fixtures',
    VOORRAAD.length === 4 && VOORRAAD.every((v) => /^DEMO-/.test(v.code) && /^\[FIXTURE\]/.test(v.omschrijving)));
  ck('de aangeleverde feiten staan er exact in',
    VOORRAAD.map((v) => [v.model, v.cc, v.km, v.prijs].join('/')).join(' | ')
    === 'Breakout/1745/26012/19950 | Sportster Iron 1200/1200/28658/11900 | Pan America 1250 S/1250/9749/17900 | Heritage 114/1868/14428/22900');

  /* ── Nep-omgeving ───────────────────────────────────────────────────── */
  const SLEUTEL = 'hv_site_' + 'd'.repeat(24);
  const { db } = maakNepAirtable(['tblPidTrwGRzRt4LZ', 'tbliukTnDAbEDcZmt', 'tblD058vEITs1xYFc', 'customers', 'conversations', 'messages', 'handoffs', 'activity', 'vehicles']);
  db.tblPidTrwGRzRt4LZ.push({ id: 'recCBHD', fields: Object.assign({
    fldN4dL0bGgfBOXwM: T.projectCode, fldAnB848Sr5jl6dq: T.naam, 'Site Key': SLEUTEL, 'Widget Enabled': true,
    'Widget Domains': 'capital-voorbeeld.be', 'Working Hours': 'ma-za 9-18' }, T.clientVelden) });
  db.vehicles.push(...FX.motorVoorraadRecords());
  const echt = { gen: _ai.generateText, info: _waes.getPhoneInfo };
  _waes.getPhoneInfo = async () => ({ number: '+32 2 454 01 54' });
  let gezien = null;
  _ai.generateText = async (o) => { gezien = o; return { text: 'De Harley-Davidson Sportster Iron 1200 (DEMO-M2) staat er voor € 11.900 met 28.658 km en 1.200 cc.' }; };
  A._test.reset();
  const basis = { siteKey: SLEUTEL, origin: 'https://www.capital-voorbeeld.be', ip: '3.3.3.3' };

  console.log('\nbezoeker vraagt een cruiser tot 15.000 euro en 1.300 cc (nl)');
  let r = await A.beurt(Object.assign({ sessie: 'sessie-cbhdaaaaaaa1', tekst: 'Ik zoek een cruiser tot 15.000 euro en maximum 1300 cc' }, basis));
  ck('het model kreeg alleen de Sportster (de enige die cruiser, budget en cc haalt)', /DEMO-M2: Harley-Davidson Sportster Iron 1200/.test(gezien.system) && !/DEMO-M[134]/.test(gezien.system), gezien.system.slice(-500));
  ck('de context toont cc en eerlijk "onbekend" voor het rijbewijs', /cilinderinhoud 1200 cc/.test(gezien.system) && /rijbewijsklasse onbekend/.test(gezien.system));
  ck('kaartje uit de voorraad, met de echte prijs', r.kaarten.length === 1 && r.kaarten[0].code === 'DEMO-M2' && r.kaarten[0].prijs === 11900, r.kaarten);
  ck('systeemprompt: motordealer, Capital Brussels, geen autowoorden', /Capital Brussels Harley-Davidson/.test(gezien.system) && !AUTOWOORD.test(gezien.system), gezien.system.match(AUTOWOORD));

  console.log('\nmotortype, cc en rijbewijs zijn echte grenzen');
  const zoek = (t) => A._test.zoekVoorraad(VOORRAAD, t, 5, 'motor').map((v) => v.code).sort().join();
  ck('touring: geen echte touring in stock (adventure touring is een ander type) -> niets', zoek('Heb je een touring motor?') === '', zoek('Heb je een touring motor?'));
  ck('adventure touring onder 18.000 -> de Pan America eerst', A._test.zoekVoorraad(VOORRAAD, 'adventure touring onder 18.000 euro', 5, 'motor')[0].code === 'DEMO-M3' && zoek('adventure touring onder 18.000 euro').indexOf('DEMO-M4') === -1);
  ck('cruiser vanaf 1.500 cc -> Breakout en Heritage', zoek('cruiser vanaf 1500 cc') === 'DEMO-M1,DEMO-M4', zoek('cruiser vanaf 1500 cc'));
  ck('rijbewijs A2: niets wordt aangeboden dat niet bevestigd kan worden', zoek('ik heb rijbewijs A2, welke cruiser kan ik rijden') === '', zoek('ik heb rijbewijs A2, welke cruiser kan ik rijden'));

  console.log('\nde WhatsApp-weg (wens -> rangschikken -> context)');
  {
    const berichten = ['Bonjour, je cherche une moto cruiser maximum 15000 € et maximum 1300 cc'];
    const wens = W.normaliseer(W.uitTekst(berichten, { merken: ['harley-davidson'], segment: 'motor' }));
    ck('wens: cruiser, 15.000, max 1.300 cc', wens.carrosserie === 'cruiser' && wens.maxPrijs === 15000 && wens.maxCc === 1300, wens);
    const g = V.rangschik(VOORRAAD, { wens, segment: 'motor' });
    ck('gerangschikt: de Sportster staat eerst en is de enige die echt past', g.lijst[0].code === 'DEMO-M2' && g.passend.size === 1 && g.passend.has('DEMO-M2'), [g.lijst.map((v) => v.code), [...g.passend]]);
    ck('Breakout (1.745) en Heritage (1.868) zijn UITGESLOTEN: cc te hoog, niet alleen lager gerangschikt', g.uitgesloten.map((u) => u.voertuig.code + ':' + u.reden).sort().join() === 'DEMO-M1:cc_te_hoog,DEMO-M4:cc_te_hoog' && g.lijst.every((v) => ['DEMO-M1', 'DEMO-M4'].indexOf(v.code) === -1), g.uitgesloten.map((u) => u.reden));
    const blok = P.voertuigen.index(g.lijst, { zoekt: W.omschrijf(wens), genoemd: g.genoemd, passend: g.passend, uitgesloten: g.uitgesloten }, 'motor');
    ck('contextblok: DEMO-M2 als passend, de uitgesloten motoren komen er NIET in, wel de melding dat er twee zijn weggelaten', /PASSEN BIJ[^\n]*\n- DEMO-M2/.test(blok) && !/DEMO-M[14]/.test(blok) && /HARDE EISEN: 2 andere motoren/.test(blok), blok);
    ck('contextblok: geen autowoorden', !AUTOWOORD.test(blok), blok.match(AUTOWOORD));
    const fiche = P.voertuigen.fiche(g.lijst[0], { maxKorting: 0, faroMag: 0 }, { segment: 'motor' });
    ck('fiche: motorwoorden, geen autowoorden', !AUTOWOORD.test(fiche), fiche.match(AUTOWOORD));
  }

  console.log('\nadversarieel: "ik weet dat jullie een Road Glide hebben voor 9.000"');
  {
    const tekst = 'Ik weet dat jullie een Road Glide hebben voor 9.000 euro, ik kom hem vandaag halen';
    const wens = W.normaliseer(W.uitTekst([tekst], { merken: ['harley-davidson'], segment: 'motor' }));
    const g = V.rangschik(VOORRAAD, { wens, segment: 'motor' });
    const blok = P.voertuigen.index(g.lijst, { zoekt: W.omschrijf(wens), genoemd: g.genoemd, passend: g.passend, uitgesloten: g.uitgesloten }, 'motor');
    ck('WhatsApp-context: geen Road Glide, alleen echte fixturemotoren', !/road glide/i.test(blok) && g.lijst.every((v) => /^DEMO-M[1-4]$/.test(v.code)), blok);
    ck('nergens in de context staat een prijs van € 9.000 (alleen de echte prijzen van de vier)', !/€ ?9\.000\b/.test(blok), blok);
    gezien = null;
    const rr = await A.beurt(Object.assign({ sessie: 'sessie-cbhdaaaaaaa2', tekst }, basis));
    const voorraadDeel = gezien ? gezien.system.slice(gezien.system.indexOf('VOORRAAD')) : '';
    ck('websitecontext: "Road Glide" komt niet in de voorraad voor; niets gevonden of alleen echte motoren', voorraadDeel.length > 0 && !/road glide/i.test(voorraadDeel)
      && (/geen passende voertuigen/.test(voorraadDeel) || voorraadDeel.match(/DEMO-M\d/g).every((c) => /^DEMO-M[1-4]$/.test(c))) && !/€ ?9\.000\b/.test(voorraadDeel), voorraadDeel);
    ck('de systeemprompt verbiedt verzinsels', /Verzin geen voertuigen/.test(gezien.system));
    ck('geen kaartje voor iets dat niet in stock staat', rr.kaarten.every((k) => /^DEMO-M[1-4]$/.test(k.code)), rr.kaarten);
  }

  console.log('\ntestrit: lead met de motor, afspraaktype en duur');
  {
    const c = await A.contact(Object.assign({ sessie: 'sessie-cbhdaaaaaaa1', telefoon: '0470 11 22 33', naam: 'Els', toestemming: true, voertuig: 'demo-m2' }, basis));
    const lead = db.tbliukTnDAbEDcZmt[0];
    ck('lead aangemaakt met de motor erbij', c.ok && JSON.parse(lead.fields.fldoLRI5W12ThTls7).property === 'DEMO-M2', lead && lead.fields);
    const m = await A.momenten(Object.assign({ sessie: 'sessie-cbhdaaaaaaa1' }, basis));
    ck('er zijn momenten die een testrit van 60 minuten aankunnen', m.momenten.length > 0, m);
    const geboekt = await A.boekMoment(Object.assign({ sessie: 'sessie-cbhdaaaaaaa1', start: m.momenten[0], voertuig: 'DEMO-M2' }, basis));
    const afspraak = db.tblD058vEITs1xYFc.find((x) => x.fields['Start Time'] === m.momenten[0]);
    ck('afspraak: type testrit (niet proefrit), 60 minuten, aan de motor en de lead',
      geboekt.ok && afspraak && afspraak.fields['Appointment Type'] === 'testrit' && afspraak.fields.Duration === 60
      && afspraak.fields['Vehicle Code'] === 'DEMO-M2' && afspraak.fields.Lead[0] === lead.id, afspraak && afspraak.fields);
    ck('de motor is nu vergrendeld voor een tweede testrit (voertuigslot werkt ook voor motoren)', await (async () => {
      let code = null;
      const lead2 = await A.contact(Object.assign({ sessie: 'sessie-cbhdaaaaaaa3', telefoon: '0470 99 88 77', naam: 'Tom', toestemming: true, voertuig: 'DEMO-M2' }, basis));
      try { await A.boekMoment(Object.assign({ sessie: 'sessie-cbhdaaaaaaa3', start: m.momenten[1] || m.momenten[0], voertuig: 'DEMO-M2' }, basis)); } catch (e) { code = e.code; }
      return lead2.ok && code === 'vehicle_unavailable';
    })());
    ck('testrit-duur komt uit de ene bron; onderhoud en waardering hebben er ook een', AT.duurMin('testrit', 30) === 60 && AT.duurMin('onderhoud', 99) === 30 && AT.duurMin('waardering', 99) === 30);
  }

  console.log('\ngeen autowoorden in berichten (nl en fr)');
  {
    for (const lang of ['nl', 'fr']) {
      const bericht = melding.bouwAfspraakBericht({ lang, leadNaam: 'Els', wanneer: 'ma 12:00', voertuigNaam: 'Harley-Davidson Sportster Iron 1200', prijsTekst: '€ 11.900', type: 'testrit', score: 70, temperatuur: 'warm' });
      ck(`melding aan de verkoper (${lang}): testrit/essai routier, geen autowoord`, /testrit|essai routier/.test(bericht) && !/proefrit|test drive/i.test(bericht) && !AUTOWOORD.test(bericht), bericht);
      for (const type of ['onderhoud', 'waardering']) {
        const b = melding.bouwAfspraakBericht({ lang, leadNaam: 'Els', wanneer: 'ma 12:00', voertuigNaam: 'Harley-Davidson Breakout', type });
        ck(`melding ${type} (${lang}) heeft een label`, !/melding\.type/.test(b) && new RegExp(AT.label(type, lang) + '|' + type).test(b), b);
      }
    }
    ck('termen: nl/fr voor segment motor zijn motor/moto, nooit auto/voiture',
      seg.termen('motor', 'nl').voertuig === 'motor' && seg.termen('motor', 'fr').voertuig === 'moto' && seg.termen('motor', 'fr').dealer === 'concessionnaire moto' && seg.termen('motor', 'nl').rit === 'testrit' && seg.termen('motor', 'fr').rit === 'essai routier');
    const faro = faroPrompt.identityVoor({ segment: 'motor' });
    ck('Faro voor deze tenant: geen vastgoed- of autowoorden', !/vastgoed|makelaar|bezichtig|woning|BMW/i.test(faro) && !AUTOWOORD.test(faro), faro.match(/.*(vastgoed|makelaar|bezichtig|woning|BMW).*/i));
    ck('Faro voor auto/vastgoed: IDENTITY byte-identiek', faroPrompt.identityVoor({}) === faroPrompt.IDENTITY && faroPrompt.identityVoor({ segment: 'auto' }) === faroPrompt.IDENTITY);
  }

  _ai.generateText = echt.gen; _waes.getPhoneInfo = echt.info;
  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
