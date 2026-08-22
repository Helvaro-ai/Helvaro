/*
 * De weg van "ik kan niet komen" naar een lege plek in de agenda.
 *
 * Twee stukken, allebei zonder netwerk te bewijzen:
 *
 *   1. De PROMPT biedt afzeggen alleen aan als deze lead ook echt een afspraak
 *      heeft. Zonder die rem gaat een model op "ik kan niet" een afspraak
 *      afzeggen die niet bestaat, en zegt het tegen de lead dat het geregeld is.
 *
 *   2. De PARSER haalt het CANCEL-blok uit het antwoord, ook als het onbruikbaar
 *      is. Een lead die letterlijk `CANCEL:{"reason":...}` in zijn WhatsApp ziet
 *      staan, weet meteen dat hij met een machine praat -- en dat is precies wat
 *      dit product niet wil zijn.
 */
const BASE = require('path').join(__dirname, '..') + '/';
const prompts = require(BASE + 'api/_ai/prompts.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

console.log('\n— de prompt biedt afzeggen alleen aan als er iets af te zeggen is —');
const zonder = prompts.whatsappGesprek.system({ ctx: { bookingMethod: 'in_chat' } });
const met    = prompts.whatsappGesprek.system({
  ctx: { bookingMethod: 'in_chat', eigenAfspraak: 'donderdag 12 juni 14:00' },
});

ck('zonder afspraak staat CANCEL nergens', zonder.indexOf('CANCEL:') === -1);
ck('met afspraak wel', met.indexOf('CANCEL:') !== -1);
ck('en het moment staat erbij', met.indexOf('donderdag 12 juni 14:00') !== -1);

/* Een lead die via het dashboard is ingepland, kan ook afzeggen. Die klant
   staat op 'callback' en heeft de hele boekingsuitleg niet -- maar afzeggen
   hoort daar niet aan vast te hangen. */
const callback = prompts.whatsappGesprek.system({
  ctx: { bookingMethod: 'callback', eigenAfspraak: 'vrijdag 10:00' },
});
ck('ook een callback-klant kan afzeggen', callback.indexOf('CANCEL:') !== -1);
ck('maar die krijgt de boekingsuitleg niet', callback.indexOf('BOOK:') === -1);

ck('de prompt zegt expliciet: bij twijfel niets sturen',
   /twijfel[\s\S]{0,120}NIETS/.test(met), null);

// ── De parser ───────────────────────────────────────────────────────────────
/* Het uitpakken van het antwoord zit INLINE in runAI() in api/whatsapp.js, niet
   in een eigen functie -- en runAI() praat met een model. De parser hier
   nabouwen zou alleen bewijzen dat mijn kopie werkt, dus wordt het echte blok
   uit de bron geknipt en om een functie heen gezet. Verandert de bron, dan
   verandert wat hier getest wordt mee; verdwijnen de ankers, dan faalt deze
   test in plaats van stilletjes niets meer te controleren. */
const fs = require('fs');
const bron = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');

const ANKER_START = '  // 1. Pull out the running SUMMARY:{...} line (present on every turn).';
const ANKER_EIND  = '  return { done: false, message: cleaned, summary: runningSummary, appointment, cancel };';
const i = bron.indexOf(ANKER_START);
const j = bron.indexOf(ANKER_EIND);
ck('het parseerblok is nog te vinden in api/whatsapp.js', i !== -1 && j > i, { i, j });

const blok = bron.slice(i, j + ANKER_EIND.length);
const parse = new Function('raw', 'ctx', blok);

console.log('\n— het CANCEL-blok komt uit de tekst —');
let r = parse('Jammer, dat is geen probleem. Wanneer komt het je wel uit?\nCANCEL:{"reason":"ziek","confirmed":true}', {});
ck('de afzegging wordt herkend', r.cancel && r.cancel.reason === 'ziek', r.cancel);
ck('en de lead ziet het blok NIET', r.message.indexOf('CANCEL') === -1, r.message);
ck('de gewone tekst blijft staan', /Wanneer komt het je wel uit/.test(r.message), r.message);

r = parse('Oké, ik noteer het.\nCANCEL:{"reason":"misschien","confirmed":false}', {});
ck('zonder confirmed telt het niet', r.cancel === null, r.cancel);
ck('maar het blok is er wel uit', r.message.indexOf('CANCEL') === -1, r.message);

/* Zonder sluitende accolade matcht de gewone regex niet. Dan wordt er niets
   afgezegd -- goed -- maar de regel moet er nog steeds uit: een lead die
   `CANCEL:{kapot json` in zijn WhatsApp ziet, weet meteen dat hij met een
   machine praat. Daar staat een aparte veegregel voor. */
r = parse('Prima.\nCANCEL:{kapot json', {});
ck('kapotte JSON zegt niets af', !r.cancel, r.cancel);
ck('maar de regel bereikt de lead evenmin', r.message.indexOf('CANCEL') === -1, r.message);
ck('en de gewone tekst blijft wel staan', /Prima/.test(r.message), r.message);

r = parse('Tot donderdag dan.', {});
ck('een gewoon bericht heeft geen afzegging', !r.cancel, r.cancel);

console.log('\n— afzeggen en boeken in één beurt —');
/* De prompt verbiedt dit, maar een prompt is een verzoek. Komen ze allebei
   voor, dan moeten ze allebei herkend worden: de handler zet de oude afspraak
   eerst weg en boekt daarna pas. Andersom zou de nieuwe boeking overgeslagen
   worden door de rem die de oude afspraak nog zette. */
r = parse(
  'Geen probleem, ik zet donderdag weg. Vrijdag 10u dan?\n'
  + 'CANCEL:{"reason":"kan donderdag niet","confirmed":true}\n'
  + 'BOOK:{"start":"2026-06-13T10:00:00+02:00","duration":30,"confirmed":true}', {});
ck('allebei herkend', Boolean(r.cancel && r.appointment), { cancel: r.cancel, appt: r.appointment });
ck('en geen van beide blokken staat nog in de tekst',
   r.message.indexOf('CANCEL') === -1 && r.message.indexOf('BOOK') === -1, r.message);

console.log('\n— de handler zelf —');
/* Twee dingen die alleen in de bron te zien zijn, en allebei een bug die al
   eens gemaakt is in dit bestand. */
ck('afzeggen gebeurt VOOR boeken',
   bron.indexOf('11a-bis') !== -1 && bron.indexOf('11a-bis') < bron.indexOf('11b. IN-CHAT booking'), null);
ck('een afzegging in dezelfde beurt heft de boekingsrem op',
   /const bookingSent = !afspraakAfgezegd/.test(bron), null);
ck('zonder bestaande afspraak wordt CANCEL genegeerd, niet geraden',
   /CANCEL zonder afspraak/.test(bron), null);
ck('de makelaar wordt verwittigd', /\[Afgezegd\]/.test(bron), null);
ck('en ook als het afzeggen zelf mislukte', /Afzegging NIET verwerkt/.test(bron), null);

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
