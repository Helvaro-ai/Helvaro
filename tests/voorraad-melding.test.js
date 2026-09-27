'use strict';
/*
 * De dealer hoort het als zijn voorraadfeed stukgaat (audit 26/09).
 *
 * Een mislukte sync of een geblokkeerde massale verdwijning stond alleen op de
 * Voertuigen-pagina. meldVoorraadAlsNodig() (api/_inventaris.js) stuurt een
 * push bij de OVERGANG: de tweede mislukking op rij, of de eerste run met een
 * geblokkeerde daling. Niet elk uur opnieuw.
 */
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got).slice(0, 200)}`); ok ? pass++ : fail++; };

const PUSH = [];
require(BASE + 'api/_push.js').stuurVertaald = async (o) => { PUSH.push(o); return { ok: true }; };
const inv = require(BASE + 'api/_inventaris.js');
const feed = { type: 'feed' };
const gelukt = { ok: true }, mislukt = { ok: false };
const meld = (runs, run, res, bron = feed) => { PUSH.length = 0; inv.meldVoorraadAlsNodig('TELJO', bron, { runs }, run, res); return PUSH.slice(); };

ck('eerste mislukking: nog geen melding', meld([gelukt], mislukt).length === 0);
const tweede = meld([mislukt, gelukt], mislukt);
ck('tweede op rij: één melding', tweede.length === 1 && tweede[0].tekstSleutel === 'push.voorraad.mislukt', tweede);
ck('derde op rij: geen nieuwe melding', meld([mislukt, mislukt], mislukt).length === 0);
const daling = meld([gelukt], gelukt, { dalingGeblokkeerd: true, verdwenenAantal: 42 });
ck('geblokkeerde daling: melding met het aantal', daling.length === 1 && daling[0].tekstSleutel === 'push.voorraad.daling' && daling[0].vars.aantal === 42, daling);
ck('dezelfde daling een uur later: geen nieuwe melding', meld([{ ok: true, daling: 42 }], gelukt, { dalingGeblokkeerd: true, verdwenenAantal: 42 }).length === 0);
ck('native voorraad (geen feed): nooit een feedmelding', meld([mislukt], mislukt, null, { type: 'native' }).length === 0);
ck('gewone geslaagde sync: stil', meld([gelukt], gelukt, { dalingGeblokkeerd: false }).length === 0);

const i18n = require('fs').readFileSync(BASE + 'api/_i18n.js', 'utf8');
ck('de teksten bestaan in vier talen', ['push.voorraad.titel', 'push.voorraad.mislukt', 'push.voorraad.daling'].every((k) => new RegExp("'" + k.replace(/\./g, '\\.') + "':\\s*\\{ nl: .*fr: .*en: .*de: ").test(i18n)));
console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
