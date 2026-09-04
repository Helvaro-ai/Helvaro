/*
 * Wat een koper zocht, en welke auto daar later bij past.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * Dit is de enige plek in Helvaro waar een BERICHT wordt voorgesteld aan iemand
 * die er niet om vroeg. Elke andere uitgaande boodschap is een antwoord: de
 * lead schreef, wij antwoorden. Hier beslissen wij dat iemand van twee maanden
 * geleden iets wil horen.
 *
 * Dat maakt de fouten hier duurder dan elders. Een gemiste match kost een deal.
 * Een VERKEERDE match kost het nummer: wie een Mercedes zocht en een Audi
 * aangeboden krijgt, leest dat als spam, en dan is die lead voorgoed weg --
 * inclusief de kans dat je hem later wel iets goeds kon melden.
 *
 * Vandaar de vorm van het algoritme, en vandaar de tests:
 *
 *  1. MERK IS HARD. Punten voor de rest, maar een verkeerd merk is geen match,
 *     hoe goed de prijs ook is.
 *  2. DE REST IS ZACHT. Wie "onder de 30.000" zocht en er nu een van 30.500
 *     binnenkrijgt, is een goede match. Een harde grens wijst precies de deal
 *     af die een verkoper met één telefoontje wel had gemaakt.
 *  3. MAAR NIET ONBEPERKT ZACHT. Twee keer het budget is geen match meer.
 *  4. EEN LEGE WENS MATCHT NOOIT. Anders krijgt iedereen die ooit iets vroeg
 *     een bericht bij elke nieuwe auto, en dat is hoe je nummer geblokkeerd
 *     raakt.
 *  5. AFGEMELD IS AFGEMELD, ook als de match perfect is.
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
const wens = require('../api/_wens');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

const auto = (o) => Object.assign({
  merk: 'Mercedes-Benz', model: 'GLB', prijs: 33500, km: 82000,
  inschrijving: '06/2020', brandstof: 'diesel', transmissie: 'automaat',
}, o);
const W = { merk: 'mercedes', minJaar: 2019, maxKm: 100000, maxPrijs: 35000 };

console.log('\n  een wens opschonen');
ck('leeg geeft null',            wens.normaliseer({}) === null);
ck('null geeft null',            wens.normaliseer(null) === null);
ck('geen object geeft null',     wens.normaliseer('mercedes') === null);
ck('alleen een merk is genoeg',  !!wens.normaliseer({ merk: 'BMW' }));
ck('merk wordt kleingeschreven', wens.normaliseer({ merk: 'BMW' }).merk === 'bmw');
ck('nul of negatief budget telt niet mee', wens.normaliseer({ merk: 'bmw', maxPrijs: 0 }).maxPrijs === undefined);
{
  /* Een bouwjaar buiten dit bereik is een typfout of een verzinsel, en een wens
     met minJaar 20190 laat NOOIT meer iets matchen -- die lead is dan stil
     onbereikbaar geworden. */
  ck('een onzinnig bouwjaar wordt weggelaten',
    wens.normaliseer({ merk: 'bmw', minJaar: 20190 }).minJaar === undefined);
  ck('een geldig bouwjaar blijft', wens.normaliseer({ merk: 'bmw', minJaar: 2019 }).minJaar === 2019);
}

console.log('\n  het merk is hard, de rest is zacht');
ck('een ander merk is GEEN match, ook niet spotgoedkoop',
  wens.scoor(W, auto({ merk: 'Audi', model: 'A4', prijs: 12000, km: 10000 })) === null);
ck('het juiste merk met alles binnen bereik is een volle match',
  wens.scoor(W, auto()).score === 100, wens.scoor(W, auto()));
{
  const net = wens.scoor(W, auto({ prijs: 36500 }));   // 4% boven budget
  ck('net boven budget blijft een match', net !== null && net.score >= 80, net);
  ck('en zegt er waarom bij', net.redenen.indexOf('net boven budget') !== -1, net.redenen);
}
ck('ruim boven budget is GEEN match', wens.scoor(W, auto({ prijs: 70000 })) === null);
{
  const meer = wens.scoor(W, auto({ km: 115000 }));    // 15% meer kilometers
  ck('iets meer kilometers blijft een match', meer !== null, meer);
  ck('veel meer kilometers niet', wens.scoor(W, auto({ km: 180000 })) === null);
}
{
  const ouder = wens.scoor(W, auto({ inschrijving: '03/2018' }));
  ck('een jaar ouder blijft een match', ouder !== null, ouder);
  ck('drie jaar ouder niet', wens.scoor(W, auto({ inschrijving: '03/2016' })) === null);
}

console.log('\n  een wens zonder criterium matcht nooit');
{
  /* normaliseer() laat een leeg object al vallen, maar scoor() moet er zelf ook
     tegen kunnen: een wens waarvan elk veld onbekend is op het voertuig levert
     maximum 0 op, en 0/0 is geen 100%. */
  ck('lege wens', wens.scoor({}, auto()) === null);
  ck('geen voertuig', wens.scoor(W, null) === null);
}

console.log('\n  de blob in en uit, zonder de rest te slopen');
{
  ck('lege blob geeft null', wens.uitNotities('') === null);
  ck('platte tekst geeft null', wens.uitNotities('bel maandag') === null);
  ck('kapotte JSON werpt niet', wens.uitNotities('{kapot') === null);

  const met = wens.naarNotities(JSON.stringify({
    _v: 1, notes: [{ id: 'a', text: 'bel maandag' }], escalated: { at: 'x' }, property: 'V2',
  }), W);
  const d = JSON.parse(met);
  ck('notities blijven staan',      d.notes.length === 1 && d.notes[0].text === 'bel maandag');
  ck('de escalatievlag blijft',     !!d.escalated);
  ck('de aanbodcode blijft',        d.property === 'V2');
  ck('en de wens staat erin',       d.wens && d.wens.merk === 'mercedes', d.wens);
  ck('met een tijdstempel',         !!d.wensAt);

  ck('dezelfde wens opnieuw schrijft niets',
    wens.naarNotities(met, W) === null);
  ck('een gewijzigde wens schrijft wel',
    wens.naarNotities(met, Object.assign({}, W, { maxPrijs: 40000 })) !== null);
  ck('een lege wens schrijft niets', wens.naarNotities('{}', {}) === null);

  const oud = JSON.parse(wens.naarNotities('een losse notitie van vroeger', W));
  ck('oude platte tekst gaat niet verloren', oud.notes[0].text === 'een losse notitie van vroeger');
}

console.log('\n  wie krijgt er een bericht');
{
  const leads = [
    { id: 'r1', naam: 'Jan',  notities: JSON.stringify({ wens: W }) },
    { id: 'r2', naam: 'Piet', notities: JSON.stringify({ wens: { merk: 'audi', maxPrijs: 40000 } }) },
    { id: 'r3', naam: 'Els',  notities: JSON.stringify({ wens: { merk: 'mercedes', maxPrijs: 60000 } }) },
    { id: 'r4', naam: 'Zonder wens', notities: '{}' },
    { id: 'r5', naam: 'Gestopt', optedOut: true, notities: JSON.stringify({ wens: W }) },
  ];
  const t = wens.matchLeads(leads, auto());
  const namen = t.map((x) => x.naam);
  ck('Jan en Els passen', namen.indexOf('Jan') !== -1 && namen.indexOf('Els') !== -1, namen);
  ck('Piet niet (ander merk)', namen.indexOf('Piet') === -1, namen);
  ck('wie geen wens heeft valt weg', namen.indexOf('Zonder wens') === -1, namen);

  /* Afgemeld is afgemeld, en dat is geen detail: iemand die STOP typte en toch
     "goed nieuws!" krijgt, is een klacht bij Meta en een risico voor het
     nummer waar ALLE klanten op zitten. */
  ck('wie zich afmeldde krijgt niets, ook bij een perfecte match',
    namen.indexOf('Gestopt') === -1, namen);

  ck('de beste staat bovenaan', t[0].naam === 'Jan', t.map((x) => x.naam + ':' + x.score));
  ck('elke match zegt waarom', t.every((x) => x.redenen && x.redenen.length > 0));
  ck('en wat die persoon zocht', t.every((x) => x.wens && Object.keys(x.wens).length));

  /* Een drempel die ECHT discrimineert. 99 deed dat niet: Els zocht "mercedes
     tot 60.000" en die twee criteria kloppen allebei volledig, dus zij scoort
     net als Jan 100%. Een score is een percentage van wat er GEVRAAGD is, niet
     van alles wat een auto heeft -- wie weinig eisen stelt, is sneller
     tevreden. Dat is juist gedrag, en de test hoort het niet tegen te spreken.
     Met een lead die op 85% uitkomt is het verschil wel zichtbaar. */
  const bijnaLeads = leads.concat([
    { id: 'r6', naam: 'Bijna', notities: JSON.stringify({ wens: { merk: 'mercedes', maxPrijs: 32000 } }) },
  ]);
  const alle = wens.matchLeads(bijnaLeads, auto());
  ck('wie net boven zijn budget zit haalt geen 100%',
    alle.some((x) => x.naam === 'Bijna' && x.score < 100), alle.map((x) => x.naam + ':' + x.score));
  ck('een hogere ondergrens filtert die eruit',
    wens.matchLeads(bijnaLeads, auto(), { minScore: 95 }).length < alle.length,
    { met: alle.length, streng: wens.matchLeads(bijnaLeads, auto(), { minScore: 95 }).length });
  ck('max begrenst de lijst', wens.matchLeads(leads, auto(), { max: 1 }).length === 1);
}

console.log('\n  de wens in gewone woorden');
ck('leesbaar', wens.omschrijf(W) === 'Mercedes, vanaf 2019, max 100.000 km, tot € 35.000', wens.omschrijf(W));
ck('lege wens geeft lege tekst', wens.omschrijf({}) === '');

console.log('\n  het telefoonnummer blijft uit de modelcontext');
{
  /* Faro heeft geen nummer nodig om te zeggen wie je moet bellen, en een nummer
     in een modelcontext is een nummer dat daar niet hoeft rond te slingeren.
     De verzendweg zoekt het zelf op via het lead-id. */
  const bron = fs.readFileSync(BASE + 'api/_faro/tools.js', 'utf8');
  const blok = bron.slice(bron.indexOf("name: 'find_buyers'"), bron.indexOf("name: 'get_properties'"));
  /* Opmerkingen eruit voor we kijken. De vorige versie viel over de opmerking
     die UITLEGT dat het nummer niet meegaat -- dezelfde val als eerder in dit
     project: een test die zijn eigen proza leest, bewaakt niets. */
  const zonderProza = blok.slice(blok.indexOf('matches: treffers.map'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  ck('find_buyers geeft geen telefoonnummer terug',
    !/telefoon|phone/i.test(zonderProza), zonderProza.slice(0, 200));
  ck('maar wel het lead-id', /leadId/.test(zonderProza));
}

console.log('\n  Faro schrijft de wens op via een blok, niet via het schema');
{
  const pr = fs.readFileSync(BASE + 'api/_ai/prompts.js', 'utf8');
  ck('er is een WENS-opdracht', /WENS:\{/.test(pr));
  ck('hij staat bij een bekende auto', /r\.push\(WENS_OPDRACHT\)/.test(pr));
  /* Het gedeelde antwoordschema mag NIET veranderd zijn: dat staat onder een
     momentopname en geldt voor elke bestaande makelaar. */
  ck('het gedeelde antwoordschema kent geen wens-veld',
    !/"wens":/.test(pr.slice(pr.indexOf('const whatsappGesprek'))), null);

  const wa = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');
  ck('whatsapp.js knipt het blok eruit', /cleaned\.replace\(\/WENS:/.test(wa));
  ck('en bewaart alleen bij dealership',
    /vertical === _vertical\.DEALERSHIP && aiResponse\.wens/.test(wa));
}

console.log('\n  het WENS-blok komt echt uit een antwoord (geen bronlezerij)');
{
  /* De controles hierboven lezen de BRON: staat de instructie er, wordt het
     blok eruit geknipt. Dat is nuttig maar het is niet hetzelfde als bewijzen
     dat het werkt. Hier wordt het parseerblok uit api/whatsapp.js geknipt en
     ECHT uitgevoerd op een antwoord zoals het model het zou schrijven.

     Zelfde aanpak als tests/afzeggen-gesprek.test.js voor CANCEL. Het is de
     enige manier om deze code te draaien zonder de hele webhook na te bouwen,
     en het vangt precies wat een regex-test mist: een blok dat wel herkend
     wordt maar niet uit de tekst verdwijnt, of andersom. */
  const bron = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');
  const START = '  // 1. Pull out the running SUMMARY:{...} line (present on every turn).';
  const EIND  = '  return { done: false, message: cleaned, summary: runningSummary, appointment, cancel';
  const i = bron.indexOf(START);
  const j = bron.indexOf(EIND);
  ck('het parseerblok is te vinden', i !== -1 && j > i, { i, j });

  const eind = bron.indexOf('\n', j);
  const parse = new Function('raw', 'ctx', '_wens', bron.slice(i, eind === -1 ? j + EIND.length : eind));

  const r = parse('Ik hou het voor je in de gaten.\nWENS:{"merk":"mercedes","minJaar":2019,"maxPrijs":35000}', {}, wens);
  ck('de wens komt eruit', r.wens && r.wens.merk === 'mercedes', r.wens);
  ck('met de grenzen erbij', r.wens && r.wens.minJaar === 2019 && r.wens.maxPrijs === 35000, r.wens);
  ck('de koper ziet het blok NIET', r.message.indexOf('WENS') === -1, r.message);
  ck('en de gewone tekst blijft staan', /in de gaten/.test(r.message), r.message);

  /* Een kapot blok mag NOOIT zichtbaar worden voor de koper. Dat is de reden
     dat het knippen buiten de try staat: een parsefout kost een wens, geen
     gesprek. */
  const kapot = parse('Prima!\nWENS:{merk:mercedes', {}, wens);
  ck('kapotte JSON levert geen wens op', !kapot.wens, kapot.wens);
  /* En hij ziet het blok ook dan NIET. De regex hierboven eist een sluitende
     accolade; zonder die accolade knipt hij niets weg en las de koper letterlijk
     WENS:{merk:mercedes in zijn WhatsApp. Een interne markering die bij de klant
     belandt is erger dan een gemiste wens. */
  ck('en de koper ziet het kapotte blok evenmin', kapot.message.indexOf('WENS') === -1, kapot.message);
  ck('maar zijn gewone tekst blijft wel staan', /Prima/.test(kapot.message), kapot.message);

  const zonder = parse('Gewoon een antwoord zonder blok.', {}, wens);
  ck('zonder blok blijft wens leeg', !zonder.wens);
  ck('en het bericht ongemoeid', zonder.message === 'Gewoon een antwoord zonder blok.', zonder.message);
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
