/*
 * Het inlogscherm liet eerst het VERKEERDE formulier zien.
 *
 * ── Wat de eigenaar zag ─────────────────────────────────────────────────────
 * De pagina opende met ons eigen e-mail-en-wachtwoordformulier, en een seconde
 * later kwam Clerks inlogkaart eroverheen. Twee verschillende inlogschermen na
 * elkaar op dezelfde plek. Wie meteen begon te typen, was zijn invoer kwijt.
 *
 * ── Waarom het gebeurde ─────────────────────────────────────────────────────
 * Het eigen formulier stond zichtbaar in de HTML en werd pas verborgen NADAT
 * Clerks script was opgehaald, geladen en gemonteerd. Dat is een netwerkreis;
 * die duurt altijd langer dan de eerste tekenbeurt van de browser.
 *
 * ── De oplossing, en waarom hij niet gevaarlijk is ──────────────────────────
 * De server weet al of Clerk aanstaat, dus zet hij de klasse `clerk-wacht` op
 * de pagina en verbergt de CSS ons formulier meteen. Er staat een plaatshouder
 * in de vorm van het formulier dat komt.
 *
 * Het gevaar van "eerst verbergen" is een LEEG paneel als Clerk nooit komt.
 * Daarom test dit bestand vooral de vangnetten: elk pad waarop Clerk opgeeft --
 * script geblokkeerd, netwerk dat blijft hangen, mislukte mount, kaart die leeg
 * blijft -- moet de klasse weghalen en het eigen formulier terugzetten.
 *
 * Alles wordt op de UITGESTUURDE pagina gecontroleerd, met Clerk ECHT aan.
 */
process.env.CLERK_ENABLED = '1';
/* De publishable key is base64 van de Clerk-host, met een $ als sluitteken --
   zo leest api/dashboard.js hem terug. */
process.env.CLERK_PUBLISHABLE_KEY =
  'pk_test_' + Buffer.from('clerk.zelftest.dev$').toString('base64');

const path = require('path');
delete require.cache[require.resolve('../api/dashboard.js')];
const mod = require('../api/dashboard.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 240));
  ok ? pass++ : fail++;
};

let html = '';
mod({ method: 'GET', url: '/dashboard', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });

console.log('\n— Clerk staat in deze test echt aan —');
ck('de pagina draagt CLERK_READY = true', /const CLERK_READY = true;/.test(html), null);
ck('en laadt het script van de juiste host',
   html.indexOf('https://clerk.zelftest.dev/npm/@clerk/clerk-js@5') !== -1, null);

console.log('\n— het eigen formulier flitst niet meer voorbij —');
ck('de wachtklasse staat er vanaf de SERVER, niet pas na een script',
   /<div id="login-page" class="clerk-wacht">/.test(html), null);
ck('en de CSS verbergt daarmee het eigen formulier',
   /#login-page\.clerk-wacht #login-form-wrap/.test(html), null);
ck('inclusief de eigen kop, want Clerks kaart heeft er zelf een',
   /#login-page\.clerk-wacht \.login-welcome/.test(html), null);
ck('er staat een plaatshouder in de vorm van wat er komt',
   html.indexOf('id="clerk-skelet"') !== -1, null);
ck('die zichtbaar is als Clerk aanstaat',
   /<div id="clerk-skelet" aria-hidden="true">/.test(html),
   (html.match(/<div id="clerk-skelet"[^>]*>/) || [])[0]);
/* De plaatshouder mag geen tekst voorlezen aan een schermlezer: er staat niets
   dat een gebruiker moet weten, en zo meteen staat er iets anders. */
ck('en niet meegelezen wordt door een schermlezer',
   /id="clerk-skelet" aria-hidden="true"/.test(html), null);

console.log('\n— maar er blijft nooit een leeg paneel achter —');
ck('het formulier terugzetten haalt ook de wachtklasse weg',
   /if \(zichtbaar\) wachtOpClerk\(false\);/.test(html), null);
/* Dit is de kern: wie de klasse laat staan en alleen style.display zet, krijgt
   niets te zien -- een stijlregel wint van display:''. */
ck('wachtOpClerk zet de klasse op de pagina',
   /pagina\.classList\.toggle\('clerk-wacht'/.test(html), null);
ck('en verbergt de plaatshouder', /skelet\.style\.display = aan \? '' : 'none'/.test(html), null);

ck('een geblokkeerd script valt terug op het eigen formulier',
   /script kon niet geladen worden[\s\S]{0,60}af\(null\)/.test(html), null);
ck('een script dat blijft HANGEN ook — er is een harde klok',
   /laadde niet binnen 10s/.test(html) && /\}, 10000\);/.test(html), null);
/* Zonder deze klok blijft de belofte eeuwig open: geen onload, geen onerror,
   en dus ook nooit een vangnet. Precies het scherm dat dit bestand bewaakt. */
ck('en die klok lost op naar "geen Clerk", niet naar niets',
   /var af = function \(waarde\) \{ if \(!klaar\)/.test(html), null);
ck('de init-tak "Clerk niet geladen" toont het formulier ECHT',
   /niet geladen[\s\S]{0,400}eigenFormulier\(true\)/.test(html), null);
ck('een kaart die leeg blijft valt na 3 seconden terug',
   /bleef leeg na[\s\S]{0,300}terugNaarEigenFormulier/.test(html), null);
ck('en pas als Clerk aantoonbaar getekend heeft verdwijnt de plaatshouder',
   /childElementCount > 0[\s\S]{0,400}skeletWeg\(\)/.test(html), null);

console.log('\n— de merkkant stond stil op precies dit scherm —');
/* initLoginSlideshow() werd alleen in de klassieke tak aangeroepen. Met Clerk
   aan bleef de diavoorstelling rechts op dia 1 hangen, mét bolletjes die
   suggereren dat er meer komt. */
ck('de diavoorstelling start ook op het Clerk-inlogscherm',
   /mountClerkSignIn\(clerk\);[\s\S]{0,400}initLoginSlideshow\(\);/.test(html), null);

console.log('\n— een verlopen sessie geeft een scherm waar je iets mee kan —');
/* Hier werd onvoorwaardelijk het e-mailveld gefocust. Met Clerk aan is dat veld
   verborgen: je zag het loginscherm zonder iets om in te loggen. */
/* Ankerde eerst op de zin "Je sessie is verlopen". Die staat er niet meer
   letterlijk: de melding komt nu uit het woordenboek, zodat een Franstalige
   klant hem ook in zijn eigen taal krijgt. Het GEDRAG is ongewijzigd, dus toets
   op de sleutel en op de remount die erop volgt. */
ck('bij Clerk wordt de inlogkaart opnieuw gemonteerd',
   /tst\.sessieVerlopen[\s\S]{0,1400}mountClerkSignIn\(window\.Clerk\)/.test(html), null);
ck('en zonder Clerk gaat de focus nog gewoon naar het e-mailveld',
   /else \{[\s\S]{0,160}getElementById\('login-email'\);[\s\S]{0,60}focus\(\)/.test(html), null);

console.log('\n— en met Clerk UIT verandert er niets —');
delete process.env.CLERK_ENABLED;
delete process.env.CLERK_PUBLISHABLE_KEY;
delete require.cache[require.resolve('../api/dashboard.js')];
const mod2 = require('../api/dashboard.js');
let uit = '';
mod2({ method: 'GET', url: '/dashboard', headers: {} },
     { setHeader() {}, status() { return this; }, send(b) { uit = String(b); }, json() {}, end() {} });
ck('geen wachtklasse', /<div id="login-page">/.test(uit), null);
ck('de plaatshouder staat uit', /<div id="clerk-skelet" aria-hidden="true" style="display:none">/.test(uit),
   (uit.match(/<div id="clerk-skelet"[^>]*>/) || [])[0]);
ck('en het eigen formulier staat er gewoon', uit.indexOf('id="login-form-wrap"') !== -1, null);
ck('met de inlogknop', uit.indexOf('id="btn-login"') !== -1, null);

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
