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

console.log('\n  de proefrit en de escalatie staan in de fiche');
{
  const auto = { code: 'V1', merk: 'BMW', model: 'M4', prijs: 74999, status: 'beschikbaar', troeven: [], omschrijving: '' };
  const f = prompts.voertuigen.fiche(auto, vertical.kortingsgrenzen({ 'Max Discount EUR': 3000, 'Faro Discount Limit EUR': 1500 }));

  /* De basisprompt zegt "afspraak" -- neutraal, gedeeld, en onder een
     momentopname. Wat een afspraak IS hoort in dit blok, anders zou de
     dealership-tak de tekst raken die elke bestaande makelaar krijgt. */
  ck('de afspraak heet een proefrit', /PROEFRIT/.test(f));
  ck('en de koper hoort wat hij mee moet nemen', /rijbewijs/.test(f));

  /* Escaleren bestond al in api/whatsapp.js. Wat ontbrak is WANNEER dat hoort
     te gebeuren bij een auto -- en dat is een andere lijst dan bij een woning. */
  ck('er is een escalatielijst', /escalate/.test(f));
  for (const [wat, re] of [['korting', /meer korting dan jij mag/], ['financiering', /financiering/],
                           ['inruil', /inruilen/], ['technisch', /ongevalverleden/],
                           ['vraagt om een mens', /uitdrukkelijk naar een verkoper/]]) {
    ck('escaleert bij ' + wat, re.test(f));
  }
  ck('en belooft daarbij niets', /Doe geen toezegging/.test(f));

  /* Kwalificatie zonder vragenlijst. Het schema (ability/urgency/fit) is
     gedeeld en blijft ongemoeid; wat er niet in past gaat naar de samenvatting,
     want dat is wat de verkoper leest. */
  ck('vraagt naar financiering en inruil', /financiering wil/.test(f) && /in te ruilen/.test(f));
  ck('maar hoogstens een ding per bericht', /EEN ding per bericht/.test(f));
  ck('en zet het in de samenvatting', /in je samenvatting/.test(f));
}

console.log('\n  Faro kan bij de voorraad, en verwart hem niet met panden');
{
  const tools = require('../api/_faro/tools');
  const namen = tools.ALL.map((t) => t.name);
  ck('get_vehicles bestaat',   namen.indexOf('get_vehicles') !== -1);
  ck('get_properties bestaat nog', namen.indexOf('get_properties') !== -1);

  const gv = tools.get('get_vehicles');
  ck('het is een leesgereedschap', gv && gv.kind === 'read');
  /* Twee scherpe beschrijvingen werken beter dan een vage gedeelde: het model
     kiest zelf, en de beschrijving is wat die keuze stuurt. */
  ck('de beschrijving gaat over autos en niet over panden',
    gv && /voertuig|auto|wagen/i.test(gv.description) && !/pand|woning/i.test(gv.description));

  /* Kortingsruimte hoort niet in een modelcontext rond te slingeren. */
  const bron = fs.readFileSync(BASE + 'api/_faro/tools.js', 'utf8');
  const blok = bron.slice(bron.indexOf("name: 'get_vehicles'"), bron.indexOf("name: 'get_properties'"));
  ck('get_vehicles geeft GEEN kortingsvelden terug',
    !/maxKorting|faroKorting/.test(blok.split('vehicles: gefilterd.map')[1] || ''));
}

console.log('\n  het herkende voertuig belandt op de lead');
{
  /* Zonder dit blijft elke voertuigkaart op "Nog geen leads" staan, ook als er
     tien gesprekken over die auto lopen: de teller op het aanbodscherm leest
     de property-code uit de Notities-blob. */
  const wa = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');
  ck('er is een helper die de code wegschrijft', /function mergeAanbodCode/.test(wa));
  ck('en hij wordt aangeroepen na een treffer',
    /if \(herkendVoertuig && herkendVoertuig\.code\)[\s\S]{0,400}mergeAanbodCode/.test(wa));

  const m = /function mergeAanbodCode\(raw, code\) \{[\s\S]*?\n\}/.exec(wa);
  ck('de helper is te vinden', !!m);
  const fn = new Function('return ' + m[0])();

  ck('lege code schrijft niets', fn('{}', '') === null);
  ck('dezelfde code opnieuw schrijft niets', fn(JSON.stringify({ property: 'V2' }), 'V2') === null);

  /* Merge en geen overschrijving: in dezelfde blob staan notities, taken en de
     escalatievlag, en die mogen hier niet sneuvelen. */
  const met = JSON.parse(fn(JSON.stringify({ _v: 1, notes: [{ id: 'a', text: 'bel maandag' }], escalated: { at: 'x' } }), 'V2'));
  ck('notities blijven staan', met.notes.length === 1 && met.notes[0].text === 'bel maandag', met.notes);
  ck('de escalatievlag blijft staan', !!met.escalated, met.escalated);
  ck('en de code staat erin', met.property === 'V2', met.property);

  const oud = JSON.parse(fn('gewoon een losse notitie', 'V3'));
  ck('oude platte tekst gaat niet verloren', oud.notes[0].text === 'gewoon een losse notitie');

  /* Dezelfde sleutel als bij panden, met opzet: alles wat die code al leest
     werkt daarmee onveranderd voor allebei de markten. */
  ck('het is DEZELFDE sleutel als bij panden', 'property' in oud);
}

console.log('\n  vier talen, ook voor de markt die er net bij kwam');
{
  const i18n = require('../api/_i18n');
  const sleutels = ['veh.nav', 'veh.one', 'veh.many', 'veh.One', 'veh.stock', 'veh.none',
                    'veh.add', 'veh.testdrive', 'veh.loadFailed',
                    'prop.one', 'prop.many', 'prop.One', 'prop.viewing', 'prop.loadFailed'];
  let ontbreekt = [];
  for (const k of sleutels) {
    for (const taal of ['nl', 'fr', 'en', 'de']) {
      const v = i18n.t(taal, k);
      if (!v || v === k) ontbreekt.push(k + '/' + taal);
    }
  }
  ck('elke nieuwe sleutel bestaat in nl, fr, en en de', ontbreekt.length === 0, ontbreekt.slice(0, 6));
  ck('en ze zijn echt vertaald, niet gekopieerd',
    i18n.t('fr', 'veh.nav') !== i18n.t('nl', 'veh.nav') && i18n.t('de', 'veh.testdrive') !== i18n.t('nl', 'veh.testdrive'),
    { fr: i18n.t('fr', 'veh.nav'), de: i18n.t('de', 'veh.testdrive') });

  /* Het scherm mag geen vaste Nederlandse woorden meer bevatten voor deze
     begrippen -- anders ziet een Waalse dealer een Nederlandse navigatie. */
  const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
  const vwBlok = dash.slice(dash.indexOf('function vw(sleutel)'), dash.indexOf('function zetVertical'));
  ck('vw() loopt door de vertaaltabel', /tr\('veh\./.test(vwBlok) && /tr\('prop\./.test(vwBlok));
  ck('en heeft geen vaste Nederlandse woorden meer',
    !/'Voertuigen'|'Je voorraad'|'proefrit'/.test(vwBlok), vwBlok.slice(0, 120));
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
