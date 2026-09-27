'use strict';
/*
 * Het inlogscherm spreekt autohandel (audit 26/09).
 *
 * De slides naast het inlogformulier (api/dashboard.js, sleutels promo.* in
 * api/_i18n.js) toonden een woning in Gent, bezichtigingen en een schatting in
 * Brugge. Vóór het inloggen is er nog geen tenant, dus elke autodealer zag dat
 * als eerste. Deze test houdt vastgoedwoorden uit die slides, in alle talen.
 */
const path = require('path');
const fs = require('fs');
const BASE = path.join(__dirname, '..') + '/';
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got).slice(0, 240)}`); ok ? pass++ : fail++; };

const bron = fs.readFileSync(BASE + 'api/_i18n.js', 'utf8');
const VASTGOED = /woning|bezichtiging|verhuizen|(^|[^a-z])schatting|property|viewing|move soon|maison|visite|déménager|immobilie|besichtigung|umziehen/i;
const AUTO = { nl: /BMW|proefrit|inruil/i, fr: /BMW|essai|reprise/i, en: /BMW|test drive|trade-in/i, de: /BMW|Probefahrt|Inzahlungnahme/i };

const sleutels = [...bron.matchAll(/'(promo\.(?:chat\.\d|s[123]\.[a-z0-9]+)|login\.pitch)':\s*\{([\s\S]*?)\},/g)];
ck('de promo-sleutels zijn gevonden', sleutels.length >= 15, sleutels.length);
const alles = {};
for (const [, k, body] of sleutels) {
  for (const taal of ['nl', 'fr', 'en', 'de']) {
    const m = new RegExp(taal + ":\\s*'((?:[^'\\\\]|\\\\.)*)'").exec(body);
    ck(`${k} heeft ${taal}`, !!m, body.slice(0, 80));
    if (!m) continue;
    alles[taal] = (alles[taal] || '') + ' ' + m[1];
    ck(`${k} (${taal}) zonder vastgoedwoorden`, !VASTGOED.test(m[1]), m[1]);
  }
}
for (const [taal, re] of Object.entries(AUTO)) ck(`de slides in het ${taal} gaan over wagens`, re.test(alles[taal] || ''), (alles[taal] || '').slice(0, 120));

const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
ck('het inlogscherm gebruikt deze sleutels nog', /T\('promo\.chat\.1'\)/.test(dash) && /T\('promo\.s3\.t1'\)/.test(dash));
console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
