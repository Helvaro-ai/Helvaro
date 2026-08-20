/*
 * De WhatsApp-systeemprompt is verhuisd van api/whatsapp.js naar
 * api/_ai/prompts.js. Deze test bewaakt de enige eis die bij zo'n verhuizing
 * telt: de TEKST mag niet veranderd zijn.
 *
 * tests/fixtures/whatsapp-prompt.golden.txt is gemaakt door de OUDE code uit
 * api/whatsapp.js te evalueren met de waarden hieronder, vlak voor de
 * verhuizing. Wijkt de nieuwe functie ook maar een teken af, dan valt deze
 * test om -- en dat is precies de bedoeling: een prompt is gedrag, en gedrag
 * dat stilletjes verandert merk je pas aan je leads.
 *
 * Verandert de prompt BEWUST, dan hoort de momentopname mee te veranderen, in
 * dezelfde commit, met de reden erbij.
 */
const fs = require('fs');
const path = require('path');
const prompts = require('../api/_ai/prompts');

let pass = 0, fail = 0;
function ck(naam, cond, ctx) {
  console.log(`  ${cond ? 'OK  ' : 'FOUT'}  ${naam}`);
  if (!cond && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 400));
  cond ? pass++ : fail++;
}

const DUMMY = {
  langDirective: 'LANGDIRECTIVE', aiName: 'Mathis', clientName: 'Testmakelaar',
  firstName: 'Jan', instructions: 'INSTRUCTIES', websiteSection: '\nWEBSITE\n',
  addressSection: '\nADRES\n', hoursSection: '\nUREN\n', reasonLangNote: 'REASONNOTE',
  escalateInstruction: 'ESCALATE', matchLeadLanguage: false,
  ctx: {
    learnedPatterns: 'PATRONEN', workingHours: '9-17', appointmentDuration: 45,
    existingAppointments: ['2026-08-21T10:00'], calendarEnabled: true, bookingEnabled: true,
  },
};

/* De prompt noemt de datum van vandaag. Die hoort te verschillen per dag, dus
   hij staat als plaatshouder in de momentopname. */
function normaliseer(s) {
  return s.replace(new Date().toISOString().slice(0, 10), '__VANDAAG__');
}

console.log('\n— de verhuisde prompt is teken voor teken dezelfde —');
const golden = fs.readFileSync(path.join(__dirname, 'fixtures', 'whatsapp-prompt.golden.txt'), 'utf8');
const nu = normaliseer(prompts.whatsappGesprek.system(DUMMY));

if (nu !== golden) {
  // Waar het misging, niet alleen DAT het misging.
  let i = 0;
  while (i < Math.min(nu.length, golden.length) && nu[i] === golden[i]) i++;
  console.log('        eerste verschil op teken ' + i);
  console.log('        verwacht: ' + JSON.stringify(golden.slice(i - 60, i + 60)));
  console.log('        gekregen: ' + JSON.stringify(nu.slice(i - 60, i + 60)));
}
ck('uitvoer gelijk aan de momentopname van voor de verhuizing', nu === golden,
   `lengte nu ${nu.length}, golden ${golden.length}`);

console.log('\n— de prompt draait ook zonder enige invoer —');
let leegOk = true, leegFout = '';
try { prompts.whatsappGesprek.system(); } catch (e) { leegOk = false; leegFout = e.message; }
ck('system() zonder argumenten werpt niet', leegOk, leegFout);

console.log('\n— ook de variant met boeken in de chat is ongewijzigd —');
/* Het boekingsblok hangt aan ctx.bookingMethod === 'in_chat' en is precies het
   stuk waar geld in zit: hier staan de agendaregels en het BOOK-signaal dat
   een afspraak aanmaakt. Een tweede momentopname, want de eerste raakt dit
   blok niet aan. */
const BOEKEN = Object.assign({}, DUMMY, {
  matchLeadLanguage: true,
  ctx: Object.assign({}, DUMMY.ctx, { bookingMethod: 'in_chat', calendarEnabled: undefined, bookingEnabled: undefined }),
});
const goldenBoeken = fs.readFileSync(path.join(__dirname, 'fixtures', 'whatsapp-prompt-boeken.golden.txt'), 'utf8');
const nuBoeken = normaliseer(prompts.whatsappGesprek.system(BOEKEN));
ck('boekingsvariant gelijk aan de momentopname', nuBoeken === goldenBoeken,
   `lengte nu ${nuBoeken.length}, golden ${goldenBoeken.length}`);
ck('het BOOK-signaal staat er nog in', nuBoeken.indexOf('BOOK:{') !== -1);
ck('de afspraakduur uit de tenantconfig wordt gebruikt', nuBoeken.indexOf('45 minuten') !== -1);

console.log('\n— de onderdelen komen er echt in —');
const uit = prompts.whatsappGesprek.system(BOEKEN);
for (const [naam, naald] of [
  ['taalinstructie', 'LANGDIRECTIVE'], ['naam assistent', 'Mathis'],
  ['naam kantoor', 'Testmakelaar'], ['klantinstructies', 'INSTRUCTIES'],
  ['websiteblok', 'WEBSITE'], ['adresblok', 'ADRES'], ['urenblok', 'UREN'],
  ['reason-taal', 'REASONNOTE'], ['escalatiezin', 'ESCALATE'],
  ['geleerde patronen', 'PATRONEN'], ['afspraakduur', '45'],
]) ck(`${naam} staat in de prompt`, uit.indexOf(naald) !== -1, naald);

console.log('\n— whatsapp.js bouwt de prompt niet meer zelf —');
const wa = fs.readFileSync(path.join(__dirname, '..', 'api', 'whatsapp.js'), 'utf8');
ck('whatsapp.js gebruikt prompts.whatsappGesprek',
   /_ai\.prompts\.whatsappGesprek\.system\(/.test(wa));
ck('whatsapp.js heeft geen eigen JOUW IDENTITEIT-blok meer',
   wa.indexOf('JOUW IDENTITEIT') === -1);

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
