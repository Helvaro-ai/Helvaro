/*
 * Een supportlink opende het mailprogramma van de privélaptop.
 *
 * ── Waarom dat een probleem is ──────────────────────────────────────────────
 * Een makelaar leest dit dashboard vaak op een eigen laptop. Het
 * standaard-mailprogramma daar is zijn zakelijke adres niet, of er staat er
 * helemaal geen ingesteld. Een `mailto:` opent dan het verkeerde account of
 * zichtbaar niets — en in beide gevallen is de vraag niet gesteld.
 *
 * Nu opent er een venster met het adres en een kopieerknop, zodat hij kan
 * mailen vanaf de plek waar hij zijn zakelijke post écht leest.
 *
 * ── Wat hier NIET verandert ─────────────────────────────────────────────────
 * De twee plekken waar een onderwerp én een tekst klaarstaan (de
 * WhatsApp-koppelvraag en "Account klaarzetten") houden hun mailto. Daar is de
 * voorgeschreven tekst het halve punt; die gooi je weg als je alleen het adres
 * kopieert. Dit bestand bewaakt dat onderscheid in beide richtingen, zodat
 * niemand later per ongeluk de verkeerde helft omzet.
 *
 * CLAUDE.md verbiedt daarnaast mailto op een moment dat iemand wil betalen;
 * dat blijft de zaak van tests/zelfbediening.test.js.
 */
'use strict';

const path = require('path');
delete require.cache[require.resolve('../api/dashboard.js')];
const mod = require('../api/dashboard.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 260));
  ok ? pass++ : fail++;
};

let html = '';
mod({ method: 'GET', url: '/dashboard', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });

console.log('\n— het venster bestaat en doet wat het moet —');
ck('toonMailModal staat in de uitgestuurde pagina',
   /function toonMailModal\(adres, opties\)/.test(html), null);
ck('met een kopieerknop',            html.indexOf('Kopieer adres') !== -1, null);
ck('en een bevestiging na kopiëren', html.indexOf('Gekopieerd') !== -1, null);
ck('het is een echte dialoog voor schermlezers',
   /overlay\.setAttribute\('role', 'dialog'\)/.test(html), null);
ck('Escape sluit hem',               /if \(e\.key === 'Escape'\) sluit\(\)/.test(html), null);
ck('het adres is te selecteren als het klembord weigert',
   /user-select:all/.test(html), null);
ck('en er is een terugval op execCommand',
   /kopieerTerugval/.test(html) && /execCommand\('copy'\)/.test(html), null);
ck('de terugval wordt ook echt gebruikt als de Clipboard API weigert',
   /if \(!ok\) ok = kopieerTerugval\(adres\);/.test(html), null);

console.log('\n— de kale supportlinks openen het venster, niet de mailclient —');
{
  /* Elke <a> met een mailto naar het supportadres MAAR zonder ?subject= en
     zonder &body= hoort een onclick te hebben die het venster opent. */
  const ankers = html.match(/<a\b[^>]*mailto:[^>]*>/g) || [];
  const kaal = ankers.filter(a => a.indexOf('&body=') === -1);
  const kaalZonderModal = kaal.filter(a => a.indexOf('toonMailModal') === -1);

  ck('er zijn kale supportlinks gevonden om te controleren', kaal.length >= 3, kaal.length);
  ck('en ze openen allemaal het venster',
     kaalZonderModal.length === 0,
     kaalZonderModal.map(a => a.slice(0, 110)).join('\n        '));
  ck('elke onclick geeft false terug, anders volgt de browser de href alsnog',
     kaal.filter(a => a.indexOf('toonMailModal') !== -1)
         .every(a => a.indexOf('return false') !== -1), null);
}

console.log('\n— maar een klaargezette tekst blijft een echte mail —');
{
  /* Deze twee dragen een onderwerp én een body. Ze moeten mailto BLIJVEN: het
     venster kopieert alleen een adres en zou de tekst weggooien. */
  ck('de WhatsApp-koppelvraag houdt zijn voorgeschreven tekst',
     html.indexOf('subject=WhatsApp%20koppelen&body=') !== -1, null);
  ck('en "Account klaarzetten" ook',
     html.indexOf("encodeURIComponent('Account klaarzetten')") !== -1, null);

  const metTekst = (html.match(/<a\b[^>]*mailto:[^>]*&body=[^>]*>/g) || []);
  ck('geen van die twee is per ongeluk omgezet',
     metTekst.every(a => a.indexOf('toonMailModal') === -1),
     metTekst.map(a => a.slice(0, 110)).join('\n        '));
}

console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
