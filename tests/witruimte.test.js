/*
 * Te veel witruimte (Sindi, 2026-10-03): pagina's met hun inhoud in een smalle
 * kolom links en een lege rechterhelft, bord-kolommen van 260px op een scherm
 * van 1440, rijen die van rand tot rand lopen, en een voetnoot zonder cijfers.
 */
'use strict';
const fs = require('fs'); const path = require('path');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`); ok ? pass++ : fail++; };
const css = require('../api/_dash/styles.js').css();
const dash = fs.readFileSync(path.join(__dirname, '..', 'api', 'dashboard.js'), 'utf8');
const regel = (sel) => { const m = new RegExp('(^|\\n)' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(css); return m ? m[2] : ''; };
console.log('\nWitruimte');
const fa = regel('.fa-wrap');
ck('facturatie: breder dan 940px', /max-width:\s*(\d+)px/.test(fa) && Number(/max-width:\s*(\d+)px/.exec(fa)[1]) >= 1200, fa);
ck('facturatie: verdeling en boekingen naast elkaar', /\.fa-onder \{ display: grid; grid-template-columns: minmax\(0, 5fr\) minmax\(0, 7fr\)/.test(css) && dash.includes('<div class="fa-onder">'));
const col = regel('.pipeline-col');
ck('pipelinekolommen vullen de breedte (geen vaste 260px)', /flex:\s*1 1 210px/.test(col) && !/flex:\s*0 0 260px/.test(col), col);
ck('instellingen: gebruikt de hele breedte (geen lege strook rechts)', /\.settings-wrap \{[^}]*max-width:\s*none/.test(css));
ck('activiteit: gebruikt de hele breedte', !/max-width/.test(regel('.activity-feed-wrap')));
ck('lege toestanden zijn compact (40px, niet 72px)', /\.empty-state \{\s*text-align: center;\s*padding: 40px 32px;/.test(css));
ck('activiteit: geen losse "…" als een groep geen namen heeft', dash.includes('const namen = ev.namen.filter(Boolean);') && dash.includes('(namen.length ? namen.slice(0, 3)'));
ck('identieke servergebeurtenissen worden één regel met teller', /const gegroepeerd = \[\]/.test(dash) && /activity-aantal/.test(dash) && /laatste\.type === ev\.type/.test(dash));
ck('de voetnoot bij resultaten verdwijnt zonder cijfers', /#resultaten-grid:has\(\.empty-state\) ~ \.res-voetnoot \{ display: none; \}/.test(css) && dash.includes('class="res-voetnoot"'));
ck('de doelkaart verschijnt pas als er iets te meten valt', /kaart\.hidden = !\(current > 0/.test(dash) && /\.revenue-goal-card\[hidden\] \{ display: none; \}/.test(css));
/* Schaal (stresstest 2026-10-04: 145 wagens, 66 leads): zoeken, filteren en bladeren. */
ck('voertuigen: zoekveld, statusfilters en "toon meer" (36 per keer)', /id="pd-zoek"/.test(dash) && /function pdFiltered\(\)/.test(dash) && /function pdToonMeer\(\)/.test(dash) && /_zicht\.slice\(0, _toon\)/.test(dash));
ck('de filterbalk verschijnt pas vanaf 12 voertuigen', /balk\.hidden = alle\.length < 12/.test(dash));
ck('leads: 50 per keer met "toon meer"', /state\.filteredLeads\.slice\(0, _leadsToon\)/.test(dash) && /leads-meer-rij/.test(dash) && /state\.leadsToon = 50;/.test(dash));
for (const taal of ['nl', 'fr', 'en', 'de']) { const w = require('../api/_i18n.js').woordenboek(taal); ck(taal + ': filter- en pagineringsteksten', ['pd.zoek', 'pd.f.alle', 'pd.f.archief', 'pd.toonMeer', 'pd.wisFilter', 'pd.geenTreffers'].every((k) => w[k])); }
console.log(`\n  ${pass} ok, ${fail} fout\n`); process.exit(fail ? 1 : 0);
