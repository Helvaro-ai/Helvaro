/*
 * "Niet kunnen kijken" is niet hetzelfde als "niets bezet".
 *
 * ── Wat er misging ──────────────────────────────────────────────────────────
 * freeBusy() gaf bij ELKE storing een lege lijst terug. Een lege lijst
 * betekent "gekeken, niets bezet". De aanroeper kon dus niet zien of de agenda
 * echt leeg was of dat we er niet bij konden.
 *
 * Gevolg: bij een dood token dacht de assistent dat de hele week vrij was en
 * stelde hij tijden voor die allang bezet waren. En omdat isSlotFree() bij een
 * storing bewust true teruggeeft, werd dat voorstel daarna ook nog geboekt --
 * bovenop wat er al stond.
 *
 * Dat is geen zeldzaam samenloopje. Het Google-toestemmingsscherm staat op
 * "Testing", dus een refresh-token verloopt na zeven dagen. Vanaf dat moment
 * faalt elke agendaoproep, elke dag, en tot nu toe zonder één regel in de logs.
 *
 * ── Wat deze test WEL en NIET vastlegt ──────────────────────────────────────
 * De fail-open bij het BOEKEN blijft staan: een boeking verliezen omdat Google
 * traag was is erger dan het risico op een dubbele, en dat is een bewuste
 * productafweging. Deze test bewaakt dus niet dat het gedrag verandert, maar
 * dat het niet langer STIL is: freeBusy geeft null, en beide plekken schreeuwen
 * in de logs wanneer ze in het duister tasten.
 */
'use strict';

const fs   = require('fs');
const BASE = require('path').join(__dirname, '..') + '/';
const gcal = fs.readFileSync(BASE + 'api/_gcal.js', 'utf8');
const wa   = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

console.log('\nEen agenda die niet gelezen kan worden, zegt dat ook');

console.log('\n  freeBusy maakt het verschil zichtbaar');
{
  const m = gcal.match(/async function freeBusy\([\s\S]*?\n\}/);
  ck('freeBusy staat er', !!m, null);
  const f = m ? m[0] : '';
  ck('geeft null bij een HTTP-fout, niet []', /if \(!r\.ok\) \{[\s\S]{0,300}?return null;/.test(f), null);
  ck('geeft null bij een netwerkfout, niet []', /catch \(err\) \{[\s\S]{0,300}?return null;/.test(f), null);
  ck('en er is geen `return \\[\\]` meer als foutafhandeling',
    !/catch\s*\{\s*return \[\];\s*\}/.test(f), f.slice(-180));
  ck('beide gevallen loggen als FOUT, niet stil',
    (f.match(/console\.error\('\[GCAL\]/g) || []).length >= 2, null);
}

/* Deze twee controles keken eerst IN isSlotFree(). Die beslissing is sindsdien
   verhuisd naar checkSlot(), dat er { free, geverifieerd } van maakt zodat een
   aanroeper "vrij" en "niet kunnen kijken" uit elkaar kan houden -- zie
   tests/agenda-eerlijk.test.js, dat het gedrag met een nagebootste fetch
   dóórmeet in plaats van de bron te lezen.

   Wat hier bewaakt wordt is onveranderd en blijft de moeite waard: de
   fail-open zelf. Alleen kijken we nu naar de functie waar hij woont. */
console.log('\n  de agendacontrole blijft fail-open, maar niet stil');
{
  const m = gcal.match(/async function checkSlot\([\s\S]*?\n\}/);
  const f = m ? m[0] : '';
  ck('checkSlot staat er', !!m, null);
  /* De afweging zelf moet BLIJVEN: vrij bij twijfel. Als iemand dit ooit naar
     fail-closed omzet is dat een productbeslissing, geen opruimactie. */
  ck('behandelt een onbekende agenda nog steeds als vrij (bewuste keuze)',
    /if \(busy === null\) \{[\s\S]{0,400}?free: true/.test(f), null);
  ck('maar zegt erbij dat er NIET geverifieerd is',
    /if \(busy === null\) \{[\s\S]{0,400}?geverifieerd: false/.test(f), null);
  ck('en meldt het in de logs',
    /console\.error\('\[GCAL\] beschikbaarheid niet te controleren/.test(f), null);

  /* isSlotFree() bestaat nog en heeft nog steeds hetzelfde contract, want
     twee aanroepers en twee tests staan erop. Hij mag alleen niet stiekem
     iets anders gaan doen dan doorgeven wat checkSlot zegt. */
  const oud = gcal.match(/async function isSlotFree\([\s\S]*?\n\}/);
  ck('isSlotFree bestaat nog', !!oud, null);
  ck('en geeft simpelweg door wat checkSlot vond',
    !!oud && /checkSlot\(/.test(oud[0]) && /return uitslag\.free;/.test(oud[0]),
    oud ? oud[0] : null);
}

console.log('\n  de plek die tijden VOORSTELT valt niet meer om op null');
{
  ck('null wordt herkend', /if \(busy === null\) \{[\s\S]{0,260}?agenda niet gelezen/.test(wa), null);
  ck('en de lus loopt niet over null heen',
    /for \(const b of \(busy \|\| \[\]\)\)/.test(wa), null);
  ck('het log zegt wat het gevolg is voor de lead',
    /stelt tijden voor ZONDER de Google-agenda te kennen/.test(wa), null);
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
