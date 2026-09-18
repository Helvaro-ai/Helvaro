/*
 * Tijdzonecorrectie op wat een AI-model als boekingstijd schrijft.
 *
 * ── De twee bugs die dit vastlegt ────────────────────────────────────────
 * 1. api/whatsapp.js: de boekingsprompt vraagt het model om zelf
 *    "+02:00 (zomer) of +01:00 (winter)" te kiezen (api/_ai/prompts.js).
 *    Rond de omschakeling zelf (laatste zondag van maart/oktober) is dat
 *    precies het soort rekenwerk waar een taalmodel naast kan zitten.
 * 2. api/_faro/tools.js (move_appointment, schedule_followup): het
 *    voorbeeld in de tool-beschrijving is een tijdstip ZONDER offset
 *    ("2026-08-21T14:00:00"). Date.parse() op zo'n tekst leest hem als de
 *    tijdzone van de SERVER (UTC op Vercel), niet als Brussel -- dus elke
 *    boeking via dat pad stond 1-2 uur verschoven, ELKE keer, niet alleen
 *    rond de omschakeling. Erger nog: de bevestigingskaart toonde het
 *    UUR uit diezelfde (foute) instant terug zonder timeZone: 'Europe/
 *    Brussels', dus de kaart "loog niet zichtbaar" -- wie hem goedkeurde
 *    zag precies het uur dat het model schreef, en had geen enkele reden
 *    om te twijfelen.
 *
 * Dit bestand bewijst corrigeerNaarBrusselseTijd() (api/_afspraken.js) en
 * dat beide aanroeppunten hem ook echt gebruiken.
 */
'use strict';

process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'appZelftest';
process.env.API_AIRTABLE  = process.env.API_AIRTABLE  || 'patZelftest';

const fs = require('fs');
const path = require('path');
const A = require('../api/_afspraken.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + JSON.stringify(ctx));
  ok ? pass++ : fail++;
};

console.log('\n— buiten de omschakeling: gewoon zomer, gewoon winter —');
{
  ck('14:00 in juni (zomer, CEST) -> 12:00 UTC',
     A.corrigeerNaarBrusselseTijd('2026-06-12T14:00:00') === '2026-06-12T12:00:00.000Z',
     A.corrigeerNaarBrusselseTijd('2026-06-12T14:00:00'));
  ck('14:00 in januari (winter, CET) -> 13:00 UTC',
     A.corrigeerNaarBrusselseTijd('2026-01-12T14:00:00') === '2026-01-12T13:00:00.000Z',
     A.corrigeerNaarBrusselseTijd('2026-01-12T14:00:00'));
}

console.log('\n— op de omschakeldag zelf (laatste zondag van maart/oktober) —');
{
  /* 29 maart 2026: de klok springt om 02:00 lokaal naar 03:00 (CET -> CEST).
     14:00 die middag is dus onbetwistbaar zomertijd, ook al is het DEZELFDE
     dag als de omschakeling. */
  ck('29 maart 2026, 14:00 -> al zomertijd, dus 12:00 UTC',
     A.corrigeerNaarBrusselseTijd('2026-03-29T14:00:00') === '2026-03-29T12:00:00.000Z',
     A.corrigeerNaarBrusselseTijd('2026-03-29T14:00:00'));
  /* 01:30 diezelfde ochtend, VOOR de sprong: nog wintertijd. */
  ck('29 maart 2026, 01:30 (voor de sprong) -> nog wintertijd, 00:30 UTC',
     A.corrigeerNaarBrusselseTijd('2026-03-29T01:30:00') === '2026-03-29T00:30:00.000Z',
     A.corrigeerNaarBrusselseTijd('2026-03-29T01:30:00'));

  /* 25 oktober 2026: de klok gaat om 03:00 lokaal terug naar 02:00
     (CEST -> CET). 14:00 die middag is onbetwistbaar al wintertijd. */
  ck('25 oktober 2026, 14:00 -> al wintertijd, dus 13:00 UTC',
     A.corrigeerNaarBrusselseTijd('2026-10-25T14:00:00') === '2026-10-25T13:00:00.000Z',
     A.corrigeerNaarBrusselseTijd('2026-10-25T14:00:00'));
  /* 01:30 diezelfde ochtend, VOOR de terugval: nog zomertijd. */
  ck('25 oktober 2026, 01:30 (voor de terugval) -> nog zomertijd, 23:30 UTC (24 okt)',
     A.corrigeerNaarBrusselseTijd('2026-10-25T01:30:00') === '2026-10-24T23:30:00.000Z',
     A.corrigeerNaarBrusselseTijd('2026-10-25T01:30:00'));
}

console.log('\n— het model schreef WEL een offset, maar de VERKEERDE —');
{
  /* De prompt-bug: het model rekende zelf +02:00/+01:00 uit en zat ernaast op
     precies de omschakeldag. corrigeerNaarBrusselseTijd() negeert die offset
     en herrekent op basis van de wand-kloktijd (14:00), niet op het cijfer
     achter de T. */
  const fout = A.corrigeerNaarBrusselseTijd('2026-10-25T14:00:00+02:00'); // had +01:00 moeten zijn
  ck('een verkeerd geschreven offset wordt genegeerd, het UUR blijft de intentie',
     fout === '2026-10-25T13:00:00.000Z', fout);
  ck('dus NIET wat een kale Date.parse van diezelfde string zou geven',
     fout !== new Date('2026-10-25T14:00:00+02:00').toISOString(), fout);
}

console.log('\n— een bare string zonder offset (de Faro-toolbeschrijving) —');
{
  /* Dit is letterlijk het voorbeeld uit de tool-beschrijving vóór deze fix:
     "2026-08-21T14:00:00". Een kale Date.parse() zonder offset leest dat als
     de tijdzone van de RUNTIME (UTC op Vercel) -- wisselend per omgeving, en
     dus geen stabiele testbewering hier. Wat wel overal hetzelfde hoort te
     zijn: de correctie geeft altijd de Brussel-relatieve uitkomst, ongeacht
     de tijdzone van de machine die de test draait. */
  const goed = A.corrigeerNaarBrusselseTijd('2026-08-21T14:00:00');
  ck('de correctie geeft 12:00 UTC (augustus = CEST, +02:00)', goed === '2026-08-21T12:00:00.000Z', goed);
}

console.log('\n— onleesbare invoer gaat ongewijzigd terug, wordt niet verzonnen —');
{
  ck('"volgende week" blijft ongewijzigd', A.corrigeerNaarBrusselseTijd('volgende week') === 'volgende week');
  ck('leeg blijft leeg/falsy', !A.corrigeerNaarBrusselseTijd(''));
}

console.log('\n— beide aanroeppunten gebruiken de correctie, niet een kale Date.parse —');
{
  const waSrc = fs.readFileSync(path.join(__dirname, '..', 'api', 'whatsapp.js'), 'utf8');
  /* De correctie zit BEWUST niet in het BOOK-parseerblok zelf (dat draait in
     tests/afzeggen-gesprek.test.js geïsoleerd via `new Function`, zonder
     module-scope requires) maar bij het consumeren van appt.start, vlak vóór
     startGeldig -- zie de opmerking op die plek in api/whatsapp.js. */
  const consumeBlok = (waSrc.match(/const startMs = Date\.parse\(appt\.start\);/) ? waSrc.slice(waSrc.indexOf('Tijdzonecorrectie VOOR de validatie'), waSrc.indexOf('const startMs = Date.parse(appt.start);') + 60) : '');
  ck('whatsapp.js corrigeert appt.start vóór startGeldig/Date.parse',
     /appt\.start = _afspraken\.corrigeerNaarBrusselseTijd\(appt\.start\)/.test(consumeBlok), consumeBlok.slice(0, 200));

  const toolsSrc = fs.readFileSync(path.join(__dirname, '..', 'api', '_faro', 'tools.js'), 'utf8');
  const nCorrecties = (toolsSrc.match(/corrigeerNaarBrusselseTijd\(args\.when\)/g) || []).length;
  ck('move_appointment EN schedule_followup corrigeren args.when (2 plekken)', nCorrecties === 2, nCorrecties);
  ck('geen kale Date.parse(args.when) meer over',
     !/Date\.parse\(args\.when\)/.test(toolsSrc), 'er staat nog een ongecorrigeerde Date.parse(args.when)');

  ck('de bevestigingskaart toont de tijd in Europe/Brussels, niet de serverzone',
     /WHEN_TIME = new Intl\.DateTimeFormat\('nl-BE', \{[^}]*timeZone: 'Europe\/Brussels'/.test(toolsSrc), null);
  ck('en de dag ook', /WHEN_DAY = new Intl\.DateTimeFormat\('nl-BE', \{[^}]*timeZone: 'Europe\/Brussels'/.test(toolsSrc), null);
}

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
