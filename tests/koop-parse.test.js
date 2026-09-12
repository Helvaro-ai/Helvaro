/*
 * api/whatsapp.js -- het KOOP:{...}-blok wordt ontleed zoals WENS, alleen
 * bewaard bij dealership, en de leadscore wordt elke dealership-beurt
 * herberekend (Fase 4).
 *
 * Bron-niveau, net als tests/cron-eerlijk.test.js en tests/klok-en-nawerk.
 * test.js: dit knipt commentaar uit het bestand en zoekt op tekst, in plaats
 * van het gesprek echt te draaien (dat vraagt een AI-aanroep en een hele
 * Airtable-mock, en whatsapp.js knipt zijn eigen parseerblokken al met opzet
 * zo dat ze zonder require() werken -- zie de kop bij de WENS/KOOP-parse zelf).
 */
'use strict';

const fs   = require('fs');
const BASE = require('path').join(__dirname, '..') + '/';
const wa   = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 300)}`);
  ok ? pass++ : fail++;
};

/* Commentaar eruit voordat er op code gezocht wordt -- /* * /, // en <!-- -->,
   zelfde drie soorten als de briefing vraagt. In deze codebase staan de
   afwegingen in lange blokken erboven en die noemen bijna altijd het woord
   waar je op zoekt; een test die dat meeleest is groen om de verkeerde reden. */
const zonderCommentaar = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/<!--[\s\S]*?-->/g, '');

const code = zonderCommentaar(wa);

console.log('\nKOOP wordt ontleed zoals WENS, en nooit aan de koper getoond');
{
  ck('_koop staat bovenaan als require', /const _koop\s*=\s*require\(['"]\.\/_koop['"]\)/.test(code), null);
  ck('_leadscore staat bovenaan als require', /const _leadscore\s*=\s*require\(['"]\.\/_leadscore['"]\)/.test(code), null);

  ck('de KOOP-regex parse bestaat, naast de WENS-regex',
    /const koopMatch = cleaned\.match\(\/KOOP:/.test(code) && /const wensMatch = cleaned\.match\(\/WENS:/.test(code), null);

  ck('KOOP gebruikt _koop.normaliseer op de geparseerde JSON',
    /koop = _koop\.normaliseer\(/.test(code), null);

  ck('het geparseerde blok wordt uit de tekst geknipt (net als WENS)',
    /cleaned = cleaned\.replace\(\/KOOP:\\s\*\\\{\[\\s\\S\]\*\?\\\}\/, ''\)\.trim\(\);/.test(code), null);

  ck('een onvolledig KOOP-blok heeft een eigen vangnet, tot einde regel',
    /cleaned\.indexOf\('KOOP:'\) !== -1[\s\S]{0,200}cleaned = cleaned\.replace\(\/KOOP:\[\^\\n\]\*\/g, ''\)\.trim\(\);/.test(code), null);

  ck('koop gaat mee in beide return-objecten van de AI-turn',
    /return \{ done: true,[\s\S]{0,200}wens, koop,/.test(code)
      && /return \{ done: false, message: cleaned, summary: runningSummary, appointment, cancel, wens, koop \};/.test(code), null);
}

console.log('\nde koopinfo wordt alleen bewaard binnen de DEALERSHIP-grens');
{
  ck('de koop-merge staat achter dezelfde tenant-grens als de wens',
    /if \(vertical === _vertical\.DEALERSHIP && aiResponse\.koop\) \{/.test(code), null);

  ck('en schrijft via _koop.naarNotities, niet rechtstreeks',
    /_koop\.naarNotities\(basisK, aiResponse\.koop\)/.test(code), null);

  /* Het gevaarlijkste detail: de merge moet ECHT binnen die if-grens staan,
     niet er los naast. Vergelijk de positie van de aanroep met de positie van
     de eerstvolgende sluitende functie/blok-grens die er niet bij hoort. */
  const iGuard = code.indexOf("if (vertical === _vertical.DEALERSHIP && aiResponse.koop) {");
  const iCall  = code.indexOf('_koop.naarNotities(basisK, aiResponse.koop)');
  const iNext  = code.indexOf('if (vertical === _vertical.DEALERSHIP) {', iGuard + 1);
  ck('de _koop.naarNotities-aanroep valt tussen de guard en het volgende blok',
    iGuard !== -1 && iCall !== -1 && iNext !== -1 && iGuard < iCall && iCall < iNext,
    { iGuard, iCall, iNext });
}

console.log('\nde leadscore wordt elke dealership-beurt herberekend');
{
  ck('_leadscore.bereken( wordt aangeroepen in de dealership-tak',
    /if \(vertical === _vertical\.DEALERSHIP\) \{[\s\S]{0,1200}_leadscore\.bereken\(\{/.test(code), null);

  ck('de score wordt via _leadscore.naarNotities teruggeschreven',
    /_leadscore\.naarNotities\(notitiesVoorScore, uitkomst\)/.test(code), null);

  ck('er wordt alleen gelogd als de temperatuur verandert (geen regel per beurt)',
    /vorigeScore\.temperatuur !== uitkomst\.temperatuur/.test(code)
      && /_activiteit\.log\(projectCode, 'lead_score_calculated',/.test(code), null);

  ck('geboekt komt uit de Appointment Booked-vlag op de lead, niet verzonnen',
    /geboekt: Boolean\(lead\.fields\['fldyIGNetqcSEkoaK'\]\)/.test(code), null);
}

console.log('\nBOOK aanvaardt een optioneel afspraaktype, gevalideerd tegen AFSPRAAK_TYPES');
{
  ck('het BOOK-blok geeft bookData.type door aan appointment.type',
    /appointment = \{ start: bookData\.start, duration: bookData\.duration \|\| 30, type: bookData\.type \};/.test(code), null);

  ck('dealerType valideert tegen _dealerBoeking.AFSPRAAK_TYPES',
    /_dealerBoeking\.AFSPRAAK_TYPES\.indexOf\(gevraagdType\) !== -1/.test(code), null);

  ck('een ongeldig of ontbrekend type valt terug op standaardType(vertical)',
    /_dealerBoeking\.AFSPRAAK_TYPES\.indexOf\(gevraagdType\) !== -1 \? gevraagdType : _dealerBoeking\.standaardType\(vertical\)/.test(code), null);
}

console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
process.exit(fail === 0 ? 0 : 1);
