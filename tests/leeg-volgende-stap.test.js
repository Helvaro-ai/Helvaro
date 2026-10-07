'use strict';
/*
 * Resultaten en Analyse zonder data (2026-10-07): de lege staat noemt EEN
 * volgende stap, met een knop naar een bestaande pagina (Setup). Alleen de
 * bestaande .empty-state-opmaak; geen nieuwe indeling.
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
const i18n = require(BASE + 'api/_i18n.js');
const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`);
  ok ? pass++ : fail++;
};

console.log('\nteksten in vier talen');
const woordenboeken = {};
for (const taal of ['nl', 'fr', 'en', 'de']) woordenboeken[taal] = i18n.woordenboek(taal);
for (const sleutel of ['res.leegDesc', 'an.leegTitel', 'an.leegDesc', 'leeg.naarSetup']) {
  ck(sleutel + ' in nl/fr/en/de, niet leeg', ['nl', 'fr', 'en', 'de'].every((t) => String(woordenboeken[t][sleutel] || '').trim().length > 3), sleutel);
}
ck('de teksten zijn echt vertaald (niet overal het Nederlands)', ['fr', 'en', 'de'].every((t) => woordenboeken[t]['an.leegDesc'] !== woordenboeken.nl['an.leegDesc']) && ['fr', 'de'].every((t) => woordenboeken[t]['leeg.naarSetup'] !== woordenboeken.nl['leeg.naarSetup']));
ck('de beschrijving NOEMT de stap (Setup / configuration / Einrichtung)', /Setup/.test(woordenboeken.nl['res.leegDesc']) && /configuration/i.test(woordenboeken.fr['res.leegDesc']) && /Setup/.test(woordenboeken.en['res.leegDesc']) && /Einrichtung/.test(woordenboeken.de['res.leegDesc']));

console.log('\nbedrading');
ck('de knop gaat naar een bestaande pagina: Setup (page-formulier)', /navigateTo\(&quot;formulier&quot;\)/.test(dash.slice(dash.indexOf('function leegVolgendeStap'), dash.indexOf('function leegVolgendeStap') + 500)) && /id="page-formulier"/.test(dash));
ck('Resultaten (alles-leeg) gebruikt de volgende stap in de bestaande empty-state', /periodeLeeg \? resultatenLeegKnoppen\(\) : leegVolgendeStap\(\)/.test(dash) && /class="empty-state" style="grid-column:1\/-1"/.test(dash));
const an = dash.slice(dash.indexOf('function renderAnalyse'), dash.indexOf('function renderAnalyse') + 9000);
ck('Analyse: zonder leads dezelfde lege staat in de bestaande funnel-container', /funnelEl && !total/.test(an) && /empty-state/.test(an) && /leegVolgendeStap\(\)/.test(an));
ck('Analyse: met leads verandert er niets (de lege staat hangt aan !total)', /if \(funnelEl && !total\)/.test(an));
ck('dashboard.js blijft onder de 22.000 regels', dash.split('\n').length < 22000, dash.split('\n').length);

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
