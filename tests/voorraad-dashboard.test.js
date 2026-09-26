'use strict';
/*
 * De voorraad in het dashboard van de dealer: de etalage-telling, de
 * dalingsvraag, en op elke kaart het verschil tussen verkocht en gearchiveerd.
 *
 * De twee kaarthulpjes (pdStatusLabel, pdVerkochtNog) worden uit het ECHT
 * uitgestuurde script gehaald en uitgevoerd -- niet nagebouwd -- zodat deze
 * test faalt als de code in de browser iets anders doet dan hier staat.
 */
const path = require('path');
const fs = require('fs');
const BASE = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

const vsync = require(BASE + 'api/_voorraad-sync.js');
const i18n = require(BASE + 'api/_i18n.js');
const dashBron = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
const leads = fs.readFileSync(BASE + 'api/leads.js', 'utf8');

/* Het uitgestuurde script, in het Engels. */
function script(taal) {
  delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
  const dash = require(BASE + 'api/dashboard.js');
  let js = '';
  dash({ method: 'GET', url: '/dashboard.js?lang=' + taal, query: { asset: 'js', lang: taal }, headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { js = String(b); }, end(b) { if (b) js = String(b); }, json() {} });
  return js;
}

const js = script('en');

console.log('\néén bron voor de veertien dagen');
{
  const m = /var HV_BEWAAR_DAGEN = (\d+);/.exec(js);
  ck('de termijn staat in het uitgestuurde script', !!m);
  ck('en is DEZELFDE als op de server', m && Number(m[1]) === vsync.BEWAAR_DAGEN, m && m[1]);
  ck('niet hardgecodeerd in de bron', /var HV_BEWAAR_DAGEN = \$\{_vsync\.BEWAAR_DAGEN\};/.test(dashBron));
}

console.log('\nop de kaart: verkocht en gearchiveerd zijn twee dingen');
{
  const f1 = /function pdStatusLabel\(p\) \{[\s\S]*?\n\}/.exec(js);
  const f2 = /function pdVerkochtNog\(p\) \{[\s\S]*?\n\}/.exec(js);
  ck('pdStatusLabel staat in het script', !!f1);
  ck('pdVerkochtNog staat in het script', !!f2);
  if (f1 && f2) {
    const T_DICT = i18n.woordenboek('en');
    const tr = (k, v) => { let s = T_DICT[k] || k; for (const x in (v || {})) s = s.split('{' + x + '}').join(v[x]); return s; };
    const escHtml = (s) => String(s);
    const maak = new Function('T_DICT', 'tr', 'escHtml', 'HV_BEWAAR_DAGEN',
      f1[0] + '\n' + f2[0] + '\nreturn { pdStatusLabel, pdVerkochtNog };');
    const { pdStatusLabel, pdVerkochtNog } = maak(T_DICT, tr, escHtml, vsync.BEWAAR_DAGEN);

    ck('verkocht -> "sold"', pdStatusLabel({ status: 'verkocht' }) === 'sold', pdStatusLabel({ status: 'verkocht' }));
    ck('gearchiveerd -> "archived", NIET "sold"', pdStatusLabel({ status: 'verkocht', gearchiveerd: true }) === 'archived');
    /* De fout die hier zat: 'onder bod' en 'uit aanbod' met een spatie, de
       sleutels met een underscore -- dus rauw Nederlands op een Engelse kaart. */
    ck('"onder bod" (met spatie) wordt vertaald', pdStatusLabel({ status: 'onder bod' }) === 'under offer', pdStatusLabel({ status: 'onder bod' }));
    ck('"uit aanbod" (met spatie) wordt vertaald', pdStatusLabel({ status: 'uit aanbod' }) === 'withdrawn', pdStatusLabel({ status: 'uit aanbod' }));

    const dag = 86400000, nu = Date.now();
    const nog = (d, extra) => pdVerkochtNog(Object.assign({ status: 'verkocht', verkochtOp: new Date(nu - d * dag).toISOString() }, extra || {})).replace(/<[^>]+>/g, '');
    ck('5 dagen verkocht: nog 9 dagen', nog(5) === '9 more days on the website', nog(5));
    ck('enkelvoud bij 1 dag', nog(13.5) === '1 more day on the website', nog(13.5));
    ck('over de termijn maar nog niet gearchiveerd: laatste dag', nog(14.3) === 'last day on the website', nog(14.3));
    ck('gearchiveerd: geen aftelling', nog(30, { gearchiveerd: true }) === '');
    ck('niet verkocht: geen aftelling', pdVerkochtNog({ status: 'beschikbaar' }) === '');
    ck('verkocht zonder datum: geen verzonnen aftelling', pdVerkochtNog({ status: 'verkocht', verkochtOp: '' }) === '');
  }
}

console.log('\nde voorraadkaart');
{
  ck('de etalage-telling staat op de kaart', /r\.etalage\.length \? '<div class="inv-cijfers inv-etalage">'/.test(dashBron));
  ck('de dalingsvraag staat op de kaart', /var dalingRegel = r\.daling/.test(dashBron));
  ck('en vraagt eerst bevestiging', /function voorraadBevestigDaling\(n\) \{\s*\n\s*showConfirmModal\(/.test(dashBron));
  ck('en stuurt bevestigDaling mee', /voorraadVraag\('inventory-sync', \{ bevestigDaling: true \}\)/.test(dashBron));
}

console.log('\nde server');
{
  const blok = leads.slice(leads.indexOf("body.mode === 'inventory-status' || body.mode === 'inventory-check'"));
  ck('bevestigDaling alleen bij een handmatige sync, en alleen als echte true',
    /inventory-sync'\) uit = await _inventaris\.sync\(projectCode, \{[^}]*bevestigDaling: body\.bevestigDaling === true \}\)/.test(blok));
  ck('de telling gaat mee bij status/controle/sync', /uit\.telling = require\('\.\/_voorraad-sync'\)\.telling\(alle\)/.test(blok));
  ck('maar niet bij het bewaren van de bron', /if \(uit && body\.mode !== 'inventory-source'\)/.test(blok));
  ck('en een mislukte telling breekt de status niet', /catch \(e\) \{ console\.warn\('\[' \+ body\.mode \+ '\] telling mislukt/.test(blok));
  ck('de cron bevestigt NOOIT zelf een daling', !/bevestigDaling/.test(fs.readFileSync(BASE + 'api/cron-followup.js', 'utf8')));
}

console.log('\n"Gebruiker" in de profielhoek');
{
  ck('niet meer hardgecodeerd', !/>Gebruiker</.test(dashBron) && !/\|\| 'Gebruiker'/.test(dashBron));
  const per = ['nl', 'fr', 'en', 'de'].map((l) => i18n.t(l, 'profiel.standaardNaam'));
  ck('in vier talen', per.every((w) => w && w !== 'profiel.standaardNaam') && new Set(per).size === 4, per);
  ck('Engels: "User"', /id="user-name">User</.test(script('en').length ? (function () {
    delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
    const d = require(BASE + 'api/dashboard.js'); let html = '';
    d({ method: 'GET', url: '/dashboard?lang=en', query: { lang: 'en' }, headers: {} },
      { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
    return html;
  })() : ''));
}

console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
