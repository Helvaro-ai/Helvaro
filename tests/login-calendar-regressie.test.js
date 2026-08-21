/*
 * Twee bugs die allebei pas zichtbaar werden bij ECHT gebruik, en die allebei
 * onzichtbaar zijn in de bron van api/dashboard.js -- want dat bestand is één
 * sjabloonliteral, en wat de browser krijgt is niet wat je leest.
 *
 * 1. Wisselen van inloggen naar registreren gaf een LEEG paneel.
 *    Clerk monteert met React en ruimt asynchroon op. De oude code wiste de
 *    innerHTML van hetzelfde element en gaf dat element opnieuw aan Clerk; de
 *    tweede mount deed dan niets, zonder fout. Gemeten in de browser met een
 *    nagemaakte Clerk: na de wissel stonden er 0 kinderen in het paneel.
 *
 * 2. Elke kolomknop in de kalender boekte een dag te vroeg.
 *    toISOString() zet om naar UTC, en een Date op lokale middernacht in
 *    Brussel is in UTC de vorige dag. Klikte je op vrijdag, dan opende het
 *    boekvenster op donderdag.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ck(naam, cond, ctx) {
  console.log(`  ${cond ? 'OK  ' : 'FOUT'}  ${naam}`);
  if (!cond && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  cond ? pass++ : fail++;
}

/* De UITGESTUURDE JavaScript, niet de bron. */
const mod = require('../api/dashboard.js');
let html = '';
mod({ method: 'GET', url: '/dashboard', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
const js = (html.match(/<script>([\s\S]*?)<\/script>/g) || [])
  .map((x) => x.replace(/<\/?script>/g, '')).sort((a, b) => b.length - a.length)[0] || '';

console.log('\n— het inlogpaneel wordt vervangen, niet leeggemaakt —');
const iHost = js.indexOf('function clerkHost()');
const clerkHost = iHost === -1 ? '' : js.slice(iHost, js.indexOf('function mountClerkSignIn', iHost));
ck('clerkHost bestaat', clerkHost.length > 0);
ck('het element wordt vervangen door een vers knooppunt', clerkHost.indexOf('replaceChild') !== -1);
/* Dit is de fout zelf: hetzelfde element leegmaken en hergebruiken. */
ck('het element wordt NIET leeggemaakt en hergebruikt',
   !/host\.innerHTML\s*=\s*''\s*;\s*return host/.test(clerkHost), clerkHost.slice(-200));
ck('unmount wordt nog steeds geprobeerd', clerkHost.indexOf('unmountSignIn') !== -1);

console.log('\n— een leeg paneel wordt opgemerkt in plaats van getoond —');
ck('er is een vangnet', js.indexOf('function clerkVangnet') !== -1);
/* Heette clerkLeegMelding: een tekstje IN het lege paneel. Dat was nog steeds
   een dood scherm -- je kon alleen verversen. Nu komt het eigen formulier
   terug, zodat inloggen altijd kan, wat Clerk ook doet. */
ck('en het eigen formulier komt terug als het leeg blijft', js.indexOf('function terugNaarEigenFormulier') !== -1);
ck('tonen en verbergen zit op één plek', js.indexOf('function eigenFormulier') !== -1);
ck('beide schermen gebruiken het vangnet',
   (js.split('clerkVangnet(host,').length - 1) >= 2);

console.log('\n— kalenderdatums zijn lokaal, niet UTC —');
ck('lokaleDatum bestaat', js.indexOf('function lokaleDatum') !== -1);
/* Geen enkele kalenderdatum mag nog via toISOString gemaakt worden. Bestands-
   namen van PDF's mogen dat wel -- die zijn geen kalenderdatum. */
const verdacht = js.split('\n')
  .filter((l) => /toISOString\(\)\.slice\(0,\s*10\)/.test(l))
  .filter((l) => !/doc\.save|helvaro-rapport|helvaro-vergelijking/.test(l));
ck('geen kalenderdatum meer uit toISOString', verdacht.length === 0, verdacht.join(' // '));

console.log('\n— en lokaleDatum rekent goed —');
/* Dezelfde functie, hier uitgevoerd, in de tijdzone van een Vlaamse makelaar. */
const fn = new Function(js.slice(js.indexOf('function lokaleDatum'),
                                js.indexOf('\n}', js.indexOf('function lokaleDatum')) + 2)
                        + '; return lokaleDatum;')();
const vrijdag = new Date('2026-08-21T00:00:00');   // lokale middernacht
ck('21 augustus blijft 21 augustus', fn(vrijdag) === '2026-08-21', fn(vrijdag));
const winter = new Date('2026-12-14T00:00:00');
ck('ook in de winter', fn(winter) === '2026-12-14', fn(winter));
ck('een onmogelijke datum geeft leeg', fn(new Date('onzin')) === '');

console.log('\n— de wissel wacht op Clerk in plaats van meteen op te geven —');
/* De bug die de eigenaar zag: klikken terwijl Clerk nog laadt gaf "het
   registratiescherm kon niet geladen worden", terwijl het een seconde later
   gewoon werkte. De controle was synchroon op window.Clerk. */
ck('naarRegistreren wacht op clerkInit', /await\s+clerkInit\(\)/.test(js.slice(js.indexOf('async function naarRegistreren'), js.indexOf('async function naarRegistreren') + 1600)));
ck('en er is een weg terug naar inloggen', js.indexOf('async function naarInloggen') !== -1);
ck('met een zichtbare schakelaar tussen de twee', html.indexOf('login-modus') !== -1);
ck('die beide standen als tab aanbiedt', (html.match(/login-modus-knop/g) || []).length >= 2);

console.log('\n— registreren is bereikbaar, ook als Clerk niet laadt —');
/* Registreren loopt volledig via Clerk. Laadde die niet, dan stond er
   helemaal niets: alleen een inlogformulier, zonder enige aanwijzing waar een
   nieuwe klant heen moest. Een bezoeker die zich wil aanmelden gaat dan weg. */
ck('er is een knop "Account aanmaken" in de basis-HTML', html.indexOf('btn-naar-registreren') !== -1);
ck('die knop staat NIET in het Clerk-blok', html.indexOf('btn-naar-registreren') < html.indexOf('id="clerk-signin"'));
ck('en er is een afhandeling voor', js.indexOf('function naarRegistreren') !== -1);
const iReg = js.indexOf('function naarRegistreren');
const naarReg = iReg === -1 ? '' : js.slice(iReg, iReg + 3600);
ck('met Clerk: het registratiescherm', naarReg.indexOf('mountClerkSignUp') !== -1);
/* Hier stond: "zonder Clerk een e-mailadres in plaats van een dode knop".
   Dat was beter dan niets, maar het is handwerk per klant -- iemand die zich
   's avonds wil aanmelden moet dan wachten tot er iemand mailt, en die is de
   volgende ochtend weg. Zelfaanmelden bestond al (api/admin.js, mode=onboard,
   achter PUBLIC_SIGNUP_ENABLED); de knop wist er alleen niet van. */
ck('zonder Clerk maar met zelfaanmelden: naar de aanmeldpagina', naarReg.indexOf("'/onboard'") !== -1);
ck('en dat hangt aan de serververvlag', naarReg.indexOf('OPEN_SIGNUP') !== -1);
ck('staat alles uit, dan een eerlijke melding en geen mailadres',
   naarReg.indexOf('Aanmelden staat tijdelijk uit') !== -1 && naarReg.indexOf('hello@helvaro.pro') === -1);
ck('en bij een storing een eerlijke melding', naarReg.indexOf('kon niet geladen worden') !== -1);

console.log('\n— de themaknop leest ook op een telefoon —');
/* Onder 900px vallen de panelen onder elkaar en landt de knop op het
   formulierpaneel, dat ALTIJD wit is. Zijn kleuren kwamen uit het donkere
   thema: gemeten 2,05:1. De regel heeft de id nodig, anders verliest hij van
   .btn-icon verderop in hetzelfde sjabloon. */
ck('de mobiele regel wint op specificiteit',
   /#login-page \.login-theme-toggle\s*\{/.test(html));
ck('en zet een eigen tekstkleur', /#login-page \.login-theme-toggle[\s\S]{0,220}--login-text/.test(html));

console.log('\n— de link onder het formulier gebruikt tokens —');
ck('geen hardgecodeerde grijstint meer op die regel',
   html.indexOf('color:#6b7280;text-decoration:none">Wachtwoord vergeten') === -1);
ck('wel een tokenkleur', /\.login-link\s*\{[\s\S]{0,160}var\(--login-muted\)/.test(html));

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
