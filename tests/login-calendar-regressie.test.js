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
ck('en een melding als het toch leeg blijft', js.indexOf('function clerkLeegMelding') !== -1);
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

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
