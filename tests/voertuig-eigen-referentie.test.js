/*
 * Een nieuw voertuig met een EIGEN referentie moest lukken en gaf "Voertuig niet
 * gevonden" (gevonden op de live site, 3 okt). Het formulier nodigt uit een
 * eigen referentie in te vullen, maar stuurde die als `code`, en `code` betekent
 * voor de server "wijzig DIT voertuig". Een nieuw voertuig hoort `eigenCode` te
 * sturen. Daarnaast: de foutmelding stond buiten beeld in het scrollende
 * formulier, en de statuskeuzes en hint toonden Nederlands in de Engelse versie.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`); ok ? pass++ : fail++; };

const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
const i18n = fs.readFileSync(BASE + 'api/_i18n.js', 'utf8');
const veh = fs.readFileSync(BASE + 'api/_vehicles.js', 'utf8');
const save = dash.slice(dash.indexOf('async function savePand()'), dash.indexOf('async function savePand()') + 4500);

console.log('\nVoertuig opslaan met eigen referentie');
ck('nieuw voertuig stuurt de referentie als eigenCode', /eigenCode:\s+bewerkVoertuig \? undefined : lees\('pd-f-code'\)/.test(save));
ck('en stuurt dan GEEN code (dat betekent "wijzig")', /code:\s+bewerkVoertuig \? lees\('pd-f-code'\) : ''/.test(save));
ck('de server leest eigenCode voor nieuwe voertuigen', /invoer\.eigenCode && geldigeCode\(invoer\.eigenCode\)/.test(veh));
ck('een fout scrolt in beeld', (save.match(/fout\.scrollIntoView/g) || []).length >= 1);
ck('de toasts zijn vertaald', !/'Voertuig toegevoegd'|'Voertuig bijgewerkt'/.test(dash) && /veh\.toegevoegd/.test(i18n));
const open = dash.slice(dash.indexOf('var keuzes = isDealer()'), dash.indexOf('var keuzes = isDealer()') + 600);
ck('statuskeuzes tonen de vertaalde naam, niet de Nederlandse waarde', /tr\('pd\.status\.' \+ k\.replace/.test(open));
ck('de statushint wordt als één zin vertaald (geen Nederlandse staart)', /pd\.geenAanbodVol/.test(dash) && !/' meer voor in\.'/.test(dash));
for (const taal of ['nl', 'fr', 'en', 'de']) {
  ck('pd.geenAanbodVol heeft ' + taal + ' met {x}', new RegExp("'pd\\.geenAanbodVol':[\\s\\S]{0,700}" + taal + ": '[^']*\\{x\\}").test(i18n));
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
