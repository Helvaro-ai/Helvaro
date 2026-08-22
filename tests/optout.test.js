/*
 * Afmelden: wie STOP zegt, krijgt niets meer.
 *
 * ── Wat er niet was ─────────────────────────────────────────────────────────
 * Geen enkele afmeldweg. Een lead die STOP stuurde kreeg een vriendelijk
 * AI-antwoord over het pand, en de opvolgcron stuurde de dag erna gewoon weer
 * een bericht. Dat is vervelend, het is tegen het beleid van Meta (en het
 * nummer is voorlopig gedeeld, dus één klant die dit fout doet raakt iedereen),
 * en het is in strijd met de AVG -- "STOP" IS bezwaar.
 *
 * ── Waar deze test op let ───────────────────────────────────────────────────
 * Vooral op de VALSE POSITIEF. Een te ruime match kost een lead die juist
 * geïnteresseerd was ("stop me maar een berichtje als er iets nieuws is"), en
 * die tweede kans krijg je niet. Een gemiste afmelding is vervelend maar
 * herstelbaar: die persoon typt het nog een keer.
 */
const BASE = require('path').join(__dirname, '..') + '/';
const O = require(BASE + 'api/_optout.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

console.log('\n— dit is een afmelding —');
for (const t of ['STOP', 'stop', 'Stop.', 'stop!', 'STOP ', 'unsubscribe', 'UNSUBSCRIBE',
                 'afmelden', 'uitschrijven', 'geen berichten meer',
                 'arrêtez', 'arrêtez !', 'désabonner',
                 'abmelden', 'abbestellen',
                 'baja', 'cancellami',
                 'stop met mij te berichten']) {
  ck(`"${t}"`, O.isAfmelding(t) === true);
}

console.log('\n— en dit NIET —');
/* Elk van deze is een lead die je verliest als je hem verkeerd leest. */
for (const t of ['stop me maar een berichtje als er iets nieuws is',
                 'ik wil geen reclame maar wel graag info over dit pand',
                 'kan je stoppen met dat ene pand maar het andere wel sturen',
                 'wanneer kan ik langskomen',
                 'hallo', 'ja', 'ok', '',
                 'ik hoorde dat de bus stopt voor de deur',
                 'we moeten stoppen met twijfelen, ik wil het huis zien']) {
  ck(`"${t}"`, O.isAfmelding(t) === false);
}

console.log('\n— de vlag lezen —');
ck('geen veld = niet afgemeld', O.isAfgemeld({}) === false);
ck('null-fields ook', O.isAfgemeld(null) === false);
ck('true telt', O.isAfgemeld({ 'Opted Out': true }) === true);
/* Airtable kan een checkbox als string of getal teruggeven, afhankelijk van
   typecast en de weergave. Alle drie moeten tellen; een afmelding die niet
   gelezen wordt is een afmelding die niet werkt. */
ck('de string "true" ook', O.isAfgemeld({ 'Opted Out': 'true' }) === true);
ck('en 1 ook', O.isAfgemeld({ 'Opted Out': 1 }) === true);
ck('false is niet afgemeld', O.isAfgemeld({ 'Opted Out': false }) === false);

console.log('\n— markeren faalt zacht —');
/* Het veld bestaat mogelijk nog niet in Airtable. Dan weigert Airtable de hele
   PATCH. Dat mag de WhatsApp-beurt niet omvergooien, maar het moet wél luid
   het log in: zolang dat veld er niet is, WERKT de afmelding niet. */
let gelogd = '';
const echteError = console.error;
console.error = (...a) => { gelogd += a.join(' '); };
(async () => {
  const ok1 = await O.markeer(async () => {}, 'recLEAD');
  ck('een geslaagde patch geeft true', ok1 === true);

  const ok2 = await O.markeer(async () => { throw new Error('UNKNOWN_FIELD_NAME'); }, 'recLEAD');
  console.error = echteError;
  ck('een mislukte patch geeft false', ok2 === false);
  ck('en zegt in het log welk veld er moet komen', /Opted Out/.test(gelogd), gelogd.slice(0, 120));
  ck('en waarschuwt wat er anders gebeurt', /blijft deze lead berichten krijgen/.test(gelogd), gelogd.slice(0, 200));

  console.log('\n— de bevestiging naar de lead —');
  ck('nl', /geen berichten meer/.test(O.bevestiging('nl')), O.bevestiging('nl'));
  ck('fr', /plus de messages/.test(O.bevestiging('fr')), O.bevestiging('fr'));
  ck('en', /no more messages|not receive any more/.test(O.bevestiging('en')), O.bevestiging('en'));
  ck('een onbekende taal valt terug op Engels', O.bevestiging('xx') === O.bevestiging('en'));
  /* Geen "weet je het zeker?" en geen laatste aanbod. Wie STOP typt is klaar,
     en nog één keer proberen is precies waarom mensen blokkeren in plaats van
     afmelden. */
  ck('geen laatste verkooppoging', !/aanbod|korting|zeker\?/i.test(O.bevestiging('nl')), O.bevestiging('nl'));

  console.log('\n— de uitgaande deur weigert —');
  const wa = require(BASE + 'api/_wa-send.js');
  let code = '';
  try { await wa.sendFreeform({ to: '32470123456', text: 'hoi', windowOpen: true, optedOut: true }); }
  catch (e) { code = e.code; }
  ck('een vrij bericht wordt geweigerd', code === 'opted_out', code);

  code = '';
  try { await wa.sendTemplate({ to: '32470123456', template: 'x', optedOut: true }); }
  catch (e) { code = e.code; }
  ck('een template ook — juist die, want die mag buiten het 24-uursvenster',
     code === 'opted_out', code);

  /* Zonder het veld gedraagt alles zich als vroeger. Anders zou deze wijziging
     elke bestaande aanroeper in één keer breken. */
  code = '';
  try { await wa.sendFreeform({ to: '32470123456', text: 'hoi', windowOpen: false }); }
  catch (e) { code = e.code; }
  ck('zonder optedOut verandert er niets aan het oude gedrag', code === 'window_closed', code);

  console.log('\n— de lussen die uit zichzelf berichten sturen —');
  const fs = require('fs');
  const cron = fs.readFileSync(BASE + 'api/cron-followup.js', 'utf8');
  ck('de opvolglus slaat afgemelde leads over', /_optout\.isAfgemeld\(lead\.fields\)/.test(cron));
  ck('de herinneringslus ook', /afgemeldeLeads\.has\(id\)/.test(cron));
  /* In JavaScript en niet in de filterformule: het veld bestaat mogelijk nog
     niet, en één onbekende veldnaam laat de HELE query mislukken -- dan stopt
     de opvolging voor iedereen. */
  ck('en niet via de Airtable-formule, die zou stukgaan op een ontbrekend veld',
     !/filterByFormula[^`]*Opted Out/.test(cron));

  const wapp = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');
  ck('de webhook herkent een afmelding', /_optout\.isAfmelding\(text\)/.test(wapp));
  ck('en doet dat VOOR de AI draait',
     wapp.indexOf('_optout.isAfmelding(text)') < wapp.indexOf('const aiResponse = await runAI'), null);
  ck('een al afgemelde lead krijgt geen antwoord meer',
     /_optout\.isAfgemeld\(lead\.fields\)/.test(wapp));
  ck('maar zijn bericht wordt wel bewaard',
     /afgemeld — bericht bewaard/.test(wapp));
  ck('en de makelaar hoort ervan', /\[Afgemeld\]/.test(wapp));

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
