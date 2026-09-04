/*
 * De dealership-vertical, en vooral: dat vastgoed er niets van merkt.
 *
 * ── Wat hier bewezen wordt ──────────────────────────────────────────────────
 * Helvaro draait. Er zijn betalende makelaars in. Een tweede markt erbij
 * bouwen mag op geen enkele manier het gedrag van de eerste veranderen, en dat
 * is niet iets wat je hoopt -- dat toon je aan.
 *
 * Vier dingen staan hier op scherp:
 *
 *  1. LEEG IS VASTGOED. Elk bestaand klantrecord heeft `Vertical` leeg. Zou
 *     leeg iets anders betekenen, dan neemt de uitrol elke makelaar zijn
 *     pandcontext af. Elk pad dat misgaat -- null, onbekende waarde, ontbrekend
 *     veld -- moet op vastgoed uitkomen.
 *
 *  2. LEEG IS GEEN KORTING. Een dealer die de kortingsvelden nooit invult heeft
 *     niet stilzwijgend ingestemd met korting. Een AI die uit een leeg veld
 *     "onbeperkt" leest, geeft de zaak weg.
 *
 *  3. DRIE STANDEN, GEEN TWEE. Zonder de middelste stand ('navragen') wordt
 *     elke vraag om meer korting ofwel stilletjes toegestaan ofwel botweg
 *     geweigerd, en allebei kost dat de dealer de deal.
 *
 *  4. HERKENNEN GOKT NOOIT. Bij gelijkspel komt er geen voertuig uit. Een
 *     proefrit voor de verkeerde auto kost de dealer een ochtend en de koper
 *     zijn vertrouwen.
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..') + '/';
const vertical  = require('../api/_vertical');
const vehicles  = require('../api/_vehicles');
const autoscout = require('../api/_autoscout');
const prompts   = require('../api/_ai/prompts');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

/* ───────────────────────────────────────────────────────────────────────── */
console.log('\n  leeg betekent vastgoed, op elk pad dat misgaat');
ck('leeg record',        vertical.van({}) === 'vastgoed');
ck('null',               vertical.van(null) === 'vastgoed');
ck('undefined',          vertical.van(undefined) === 'vastgoed');
ck('geen object',        vertical.van('dealership') === 'vastgoed');
ck('lege string',        vertical.van({ Vertical: '' }) === 'vastgoed');
ck('onbekende waarde',   vertical.van({ Vertical: 'garage' }) === 'vastgoed', vertical.van({ Vertical: 'garage' }));
ck('alleen letterlijk "dealership" schakelt om', vertical.van({ Vertical: 'dealership' }) === 'dealership');
ck('hoofdletters tellen ook', vertical.van({ Vertical: 'DEALERSHIP' }) === 'dealership');
ck('het veld-id werkt net zo goed als de naam',
  vertical.van({ fldJeZtaPXfHdWcdr: 'dealership' }) === 'dealership');

console.log('\n  leeg betekent geen korting, nooit onbeperkt');
{
  const g = vertical.kortingsgrenzen({});
  ck('geen velden -> nul ruimte', g.maxKorting === 0 && g.faroMag === 0, g);
  ck('en dan is elk bedrag "nee"', vertical.mag(1, g) === 'nee' && vertical.mag(50000, g) === 'nee');
  ck('nul gevraagd blijft "ja"',  vertical.mag(0, g) === 'ja');
}

console.log('\n  drie standen, en de middelste is het hele punt');
{
  const g = vertical.kortingsgrenzen({ 'Max Discount EUR': 3000, 'Faro Discount Limit EUR': 1500 });
  ck('binnen zijn ruimte -> ja',        vertical.mag(1500, g) === 'ja');
  ck('net erboven -> navragen',         vertical.mag(1501, g) === 'navragen');
  ck('op het plafond -> navragen',      vertical.mag(3000, g) === 'navragen');
  ck('boven het plafond -> nee',        vertical.mag(3001, g) === 'nee');
}

console.log('\n  de striktste grens wint van wat er ingetypt is');
{
  const scheef = vertical.kortingsgrenzen({ 'Max Discount EUR': 1000, 'Faro Discount Limit EUR': 9999 });
  ck('faro boven het plafond wordt geklemd', scheef.faroMag === 1000, scheef);
  const neg = vertical.kortingsgrenzen({ 'Max Discount EUR': -500, 'Faro Discount Limit EUR': -100 });
  ck('negatieve waarden tellen als nul', neg.maxKorting === 0 && neg.faroMag === 0, neg);
}

console.log('\n  het voertuig overschrijft de dealer, maar alleen als er iets staat');
{
  const klant = { 'Max Discount EUR': 3000, 'Faro Discount Limit EUR': 1500 };
  const leeg  = vertical.kortingsgrenzen(klant, { maxKorting: null, faroKorting: null });
  ck('leeg voertuig -> dealerinstelling', leeg.maxKorting === 3000 && leeg.faroMag === 1500 && leeg.bron === 'dealer', leeg);
  const eigen = vertical.kortingsgrenzen(klant, { maxKorting: 500, faroKorting: 250 });
  ck('eigen regel wint', eigen.maxKorting === 500 && eigen.faroMag === 250 && eigen.bron === 'voertuig', eigen);
}

console.log('\n  het afspraakwoord verschilt, het afsprakensysteem niet');
ck('vastgoed nl',   vertical.afspraakWoord({}, 'nl') === 'bezichtiging');
ck('dealership nl', vertical.afspraakWoord({ Vertical: 'dealership' }, 'nl') === 'proefrit');
ck('dealership fr', vertical.afspraakWoord({ Vertical: 'dealership' }, 'fr') === 'essai');
ck('onbekende taal valt terug op nl', vertical.afspraakWoord({ Vertical: 'dealership' }, 'zz') === 'proefrit');
{
  /* Er mag GEEN tweede agendasysteem bijkomen. Als api/_afspraken.js hier
     genoemd zou worden om iets eigens te doen, is dat het begin daarvan. */
  const bron = fs.readFileSync(BASE + 'api/_vertical.js', 'utf8');
  ck('_vertical bouwt geen eigen agenda', !/_afspraken|APPOINTMENTS_TABLE|tblD058/.test(bron));
}

/* ───────────────────────────────────────────────────────────────────────── */
console.log('\n  AutoScout24: de link is de koppeling');
{
  const echt = 'Hallo, ik heb interesse in het volgende voertuig. Aanbodnummer: '
    + 'https://www.autoscout24.be/aanbod/bmw-m4-competition-a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d';
  const r = autoscout.lees(echt);
  ck('herkent het aanbod', r.isAutoscout === true);
  ck('haalt het nummer eruit', r.aanbodId === 'a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d', r.aanbodId);

  /* Een domein dat autoscout24 in zijn NAAM heeft is geen AutoScout24. Dit is
     precies het soort bijna-goed dat later een verkeerde auto oplevert -- of
     erger, een lead koppelt aan het aanbod van iemand anders. */
  const nep = autoscout.lees('kijk op https://mijn-autoscout24-tips.blogspot.com/aanbod/x-a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d');
  ck('een lookalike-domein telt NIET mee', nep.isAutoscout === false, nep);

  ck('geen link -> geen aanbod', autoscout.lees('is die M4 nog vrij?').isAutoscout === false);
  ck('leestekens achter de link horen bij de zin',
    autoscout.aanbodIdUit('https://www.autoscout24.be/aanbod/vw-golf?id=98765432') === '98765432');
  ck('lege invoer werpt niet', autoscout.lees('').isAutoscout === false && autoscout.lees(null).isAutoscout === false);
}

console.log('\n  herkennen gokt nooit');
{
  const voorraad = [
    { code: 'V1', merk: 'Volkswagen', model: 'Golf', uitvoering: 'GTI', kleur: 'zwart', inschrijving: '03/2021', autoscout: '', status: 'beschikbaar' },
    { code: 'V2', merk: 'Volkswagen', model: 'Golf', uitvoering: 'GTD', kleur: 'grijs', inschrijving: '03/2021', autoscout: '', status: 'beschikbaar' },
    { code: 'V3', merk: 'BMW',        model: 'M4',   uitvoering: 'Competition xDrive', kleur: 'zwart', inschrijving: '05/2023', autoscout: '', status: 'beschikbaar' },
  ];
  const eenduidig = vehicles.matchUitTekst(voorraad, 'is die M4 nog beschikbaar?');
  ck('één duidelijke treffer geeft het voertuig', eenduidig.voertuig && eenduidig.voertuig.code === 'V3', eenduidig.reden);

  const dubbel = vehicles.matchUitTekst(voorraad, 'ik zoek een Golf');
  ck('twee Golfs -> GEEN voertuig, wel kandidaten',
    dubbel.voertuig === null && dubbel.reden === 'meerdere' && dubbel.kandidaten.length === 2, dubbel.reden);

  const uitvoering = vehicles.matchUitTekst(voorraad, 'de Golf GTI graag');
  ck('de uitvoering hakt de knoop door', uitvoering.voertuig && uitvoering.voertuig.code === 'V1', uitvoering.reden);

  ck('niets herkenbaar -> null', vehicles.matchUitTekst(voorraad, 'goedemiddag').voertuig === null);
  ck('lege voorraad -> null',    vehicles.matchUitTekst([], 'M4').voertuig === null);

  /* V1 mag niet matchen in V10 -- woordgrenzen, niet substring. */
  const veel = [{ code: 'V1', merk: 'Audi', model: 'A1', uitvoering: '', kleur: '', inschrijving: '', autoscout: '', status: 'beschikbaar' },
                { code: 'V10', merk: 'Audi', model: 'A6', uitvoering: '', kleur: '', inschrijving: '', autoscout: '', status: 'beschikbaar' }];
  const w = vehicles.matchUitTekst(veel, 'graag info over V10');
  ck('V10 matcht niet als V1', w.voertuig && w.voertuig.code === 'V10', w.voertuig && w.voertuig.code);
}

console.log('\n  de proefrit-rem zit in de code, niet in de prompt');
ck('beschikbaar mag',   vehicles.kanProefrit('beschikbaar') === true);
ck('gereserveerd mag',  vehicles.kanProefrit('gereserveerd') === true);
ck('verkocht mag niet', vehicles.kanProefrit('verkocht') === false);
ck('uit aanbod mag niet', vehicles.kanProefrit('uit aanbod') === false);
ck('onbekende status valt terug op beschikbaar', vehicles.kanProefrit('rommel') === true);
{
  const wa = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');
  ck('whatsapp.js gebruikt kanProefrit als rem op boeken',
    /pandBezichtigbaar:[\s\S]{0,200}kanProefrit/.test(wa));
}

console.log('\n  de fiche verzint geen cijfers en geen korting');
{
  const auto = { code: 'V1', merk: 'BMW', model: 'M4', uitvoering: 'Competition', prijs: 74999,
    km: 55000, inschrijving: '05/2023', brandstof: 'benzine', transmissie: 'automaat',
    kw: 375, pk: 510, kleur: 'zwart', status: 'beschikbaar', troeven: [], omschrijving: '' };

  const zonder = prompts.voertuigen.fiche(auto, vertical.kortingsgrenzen({}));
  ck('zonder ruimte staat er GEEN korting toe', /GEEN korting/.test(zonder));
  ck('en er staat geen bedrag in dat hij mag weggeven', !/zelfstandig tot/.test(zonder));

  const met = prompts.voertuigen.fiche(auto, vertical.kortingsgrenzen({ 'Max Discount EUR': 3000, 'Faro Discount Limit EUR': 1500 }));
  ck('met ruimte staat de escalatie erin', /met het team/.test(met));
  ck('en de opdracht om het bedrag niet te noemen', /NOOIT uit jezelf/.test(met));
  ck('het plafond staat erbij', /3\.000/.test(met), met.slice(-260));

  const verkocht = prompts.voertuigen.fiche(Object.assign({}, auto, { status: 'verkocht' }), vertical.kortingsgrenzen({}));
  ck('verkocht -> geen proefrit inplannen', /GEEN proefrit/.test(verkocht));

  ck('geen voertuig -> lege sectie', prompts.voertuigen.fiche(null, null) === '');
  ck('lege voorraad -> lege index',  prompts.voertuigen.index([]) === '');
}

console.log('\n  vastgoed blijft precies zoals het was');
{
  const wa = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');
  /* De vastgoedtak moet nog steeds via _properties lopen en zijn eigen
     promptblok krijgen. Zou de dealership-tak die code vervangen hebben in
     plaats van ernaast te zijn gezet, dan valt dit om. */
  ck('_properties.available() wordt nog aangeroepen', /_properties\.available\(\)/.test(wa));
  ck('panden.fiche wordt nog gebruikt',   /prompts\.panden\.fiche/.test(wa));
  ck('panden.index wordt nog gebruikt',   /prompts\.panden\.index/.test(wa));
  ck('de dealership-tak staat ERNAAST, niet ervoor',
    /vertical === _vertical\.DEALERSHIP/.test(wa) && /\} else try \{/.test(wa));
  /* En het promptbestand voor het gewone gesprek is niet aangeraakt: die tekst
     wordt door een snapshot bewaakt en een stille wijziging is een gedrags-
     verandering voor élke bestaande klant. */
  const pr = fs.readFileSync(BASE + 'api/_ai/prompts.js', 'utf8');
  ck('panden-blok bestaat nog', /const panden = \{/.test(pr));
  ck('voertuigen-blok staat er los naast', /const voertuigen = \{/.test(pr));
}

console.log('\n  tenant-isolatie: geen enkele leesweg zonder projectcode');
{
  const bron = fs.readFileSync(BASE + 'api/_vehicles.js', 'utf8');
  for (const fn of ['list', 'getByCode', 'getByAutoscout', 'save', 'archive']) {
    const re = new RegExp('async function ' + fn + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]{0,320}?no_tenant');
    ck(fn + '() weigert zonder projectcode', re.test(bron));
  }
  ck('elke query filtert op Project Code',
    (bron.match(/F\.project/g) || []).length >= 4);
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
