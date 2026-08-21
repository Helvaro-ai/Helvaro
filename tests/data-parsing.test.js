// Vrije tekst uit "Verwachte Waarde", en de eenheid van de reactietijd.
//
// Beide zijn gevonden door de app te draaien en de cijfers te lezen, niet door
// de code te lezen: de pipeline stond op € 1.200.003 waar € 1.650.000 hoorde,
// en het dashboard meldde een gemiddelde reactietijd van "55u" voor iets dat in
// seconden is opgeslagen. Ze staan hier zodat ze niet stilletjes terugkomen.
const BASE = require('path').join(__dirname, '..') + '/';
const { parseBudget } = require(BASE + 'api/_faro/data.js');

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = Object.is(actual, expected);
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${name}`);
  if (!ok) console.log(`        kreeg ${JSON.stringify(actual)}, verwachtte ${JSON.stringify(expected)}`);
  ok ? pass++ : fail++;
}

console.log('\n— bedragen uit vrije tekst —');
// De makelaar begint lang niet altijd met het bedrag.
check('kamertelling vooraan wordt niet voor het bedrag aangezien', parseBudget('3 slaapkamers, 450.000'), 450000);
check('gevels vooraan idem',                                       parseBudget('2 gevels 300k'), 300000);
check('"kamers" is geen k van duizend',                            parseBudget('4 kamers'), null);
check('een huisnummer is geen budget',                             parseBudget('huisnummer 12'), null);

console.log('\n— schrijfwijzen —');
check('Vlaamse punt als duizendtal', parseBudget('450.000'), 450000);
check('Engelse punt als komma',      parseBudget('1.2M'), 1200000);
check('spatie als duizendtal',       parseBudget('rond de 350 000'), 350000);
check('bereik pakt de ondergrens',   parseBudget('400k-500k'), 400000);
check('bereik voluit idem',          parseBudget('tussen 400.000 en 500.000'), 400000);
check('euroteken telt als bewijs',   parseBudget('€350'), 350);

console.log('\n— niets bruikbaars —');
// null en niet 0: een budgetfilter moet onbekende leads UITSLUITEN, niet ze op
// nul zetten en daarmee elke minBudget-vraag laten matchen.
check('onbekend geeft null', parseBudget('onbekend'), null);
check('leeg geeft null',     parseBudget(''), null);
check('null geeft null',     parseBudget(null), null);

console.log('\n— reactietijd wordt in SECONDEN opgeslagen —');
// De formatter leeft in api/dashboard.js's template; hier wordt de regel zelf
// gecontroleerd, zodat 'u' er niet nog eens per ongeluk op komt.
const src = require('fs').readFileSync(BASE + 'api/dashboard.js', 'utf8');
check('de kaart hardcodeert geen uren meer', /suffix: 'u',\s*\n\s*desc: 'Gemiddelde reactietijd'/.test(src), false);
check('er is een fmtDuration-formatter',     /function fmtDuration\(sec\)/.test(src), true);

console.log('\n— win rate —');
check('win rate deelt niet meer door alle leads',
      /winRate = leads\.length > 0 \? Math\.round\(100 - /.test(src), false);
check('win rate kent een onbeslist-geval',
      /const winRate = beslist > 0 \?/.test(src), true);

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
