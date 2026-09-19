/*
 * api/leads.js -- CSV-exports (deliverable "exports", brief §105).
 *
 * ── Wat hier bewezen wordt ───────────────────────────────────────────────────
 *   1. TENANT-SCOPING is een ECHTE tweede check in JavaScript, niet alleen een
 *      Airtable-formule die kan mis-escapen of een keer een verkeerd resultaat
 *      teruggeeft -- zelfde gewoonte als api/_activiteit.js lijst(). Getest
 *      met de ECHTE, geëxporteerde functie (filterRecordsVoorTenant), geen
 *      kopie van de logica.
 *   2. GELOKALISEERDE KOLOMNAMEN werken echt: de nieuwe csv.*-sleutels
 *      bestaan in alle vier talen en _i18n.resolveer() pakt de juiste taal
 *      op dezelfde manier als het dashboard zelf (?lang=, dan het cookie).
 *   3. Beide exportpaden (csv-export-modus en GET ?export=true) hebben een
 *      UTF-8 BOM -- de tweede miste hem, en zonder BOM toont Excel geaccen-
 *      teerde namen ("Sofie Van Élsacker") kapot.
 *   4. Beide paden gebruiken de gelokaliseerde kolomnamen, niet een los,
 *      hardgecodeerd Nederlands rijtje dat uit de pas kan gaan lopen.
 *
 * (1) en (2) draaien de ECHTE functies. (3) en (4) zijn source-checks op
 * precies de twee codeblokken, zelfde methode als tests/scherm-eerlijkheid.
 * test.js al voor ditzelfde csv-export-blok gebruikt (leads.js zelf geeft
 * geen manier om een volledige, ingelogde route-aanroep goedkoop te bouwen
 * zonder de hele auth-laag te simuleren -- zie de kop van dat bestand).
 */
'use strict';

process.env.API_AIRTABLE  = 'test-airtable-token';
process.env.BASE_AIRTABLE = 'appTEST0000000000';

const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`);
  ok ? pass++ : fail++;
};

const leads = require(BASE + 'api/leads.js');
const _i18n = require(BASE + 'api/_i18n.js');

console.log('\n— filterRecordsVoorTenant(): echte tenant-scoping, geen kopie —');
{
  const fn = leads.filterRecordsVoorTenant;
  ck('is geëxporteerd', typeof fn === 'function', typeof fn);

  const records = [
    { id: 'r1', fields: { 'Project Code': 'TENANT_A', 'Name': 'Jan' } },
    { id: 'r2', fields: { 'Project Code': 'TENANT_B', 'Name': 'Piet' } },
    { id: 'r3', fields: { 'Project Code': 'TENANT_A', 'Name': 'Marie' } },
    { id: 'r4', fields: {} },                 // geen Project Code — mag nooit naar TENANT_A meegaan
    { id: 'r5', fields: { 'Project Code': '' } },
  ];
  const uit = fn(records, 'TENANT_A');
  ck('precies de twee eigen records', uit.length === 2 && uit.every((r) => r.fields['Project Code'] === 'TENANT_A'),
     uit.map((r) => r.id));
  ck('TENANT_B is echt weg, niet gemaskeerd', !uit.some((r) => r.id === 'r2'), uit);
  ck('een record zonder Project Code gaat nooit naar een ECHTE tenant',
     !fn(records, 'TENANT_A').some((r) => r.id === 'r4' || r.id === 'r5'), fn(records, 'TENANT_A'));
  ck('lege/undefined input crasht niet', JSON.stringify(fn(null, 'TENANT_A')) === '[]');
}

console.log('\n— gelokaliseerde CSV-kolomnamen bestaan echt, in alle vier talen —');
{
  const sleutels = [
    'csv.datum', 'csv.naam', 'csv.telefoon', 'csv.bron', 'csv.status', 'csv.gekwalificeerd',
    'csv.leadScore', 'csv.score', 'csv.ability', 'csv.urgency', 'csv.urgentie', 'csv.capaciteit',
    'csv.fit', 'csv.samenvatting', 'csv.reden', 'csv.bookingSent', 'csv.opgepikt',
    'csv.verwachteWaarde', 'csv.notities',
  ];
  for (const taal of ['nl', 'fr', 'en', 'de']) {
    const ontbreekt = sleutels.filter((s) => {
      const v = _i18n.t(taal, s);
      return !v || v === s;   // t() valt terug op de sleutel zelf als hij niet bestaat
    });
    ck(`alle csv.*-sleutels bestaan in '${taal}'`, ontbreekt.length === 0, ontbreekt);
  }
  ck('nl-waarden zijn de bestaande letterlijke kolomnamen (geen gedragswijziging)',
     _i18n.t('nl', 'csv.naam') === 'Naam' && _i18n.t('nl', 'csv.verwachteWaarde') === 'Verwachte Waarde'
     && _i18n.t('nl', 'csv.bookingSent') === 'Booking Sent',
     { naam: _i18n.t('nl', 'csv.naam'), waarde: _i18n.t('nl', 'csv.verwachteWaarde') });
  ck('en/fr/de vertalen ook echt (geen kopie van het Nederlands)',
     _i18n.t('en', 'csv.naam') === 'Name' && _i18n.t('fr', 'csv.naam') === 'Nom' && _i18n.t('de', 'csv.naam') === 'Name',
     { en: _i18n.t('en', 'csv.naam'), fr: _i18n.t('fr', 'csv.naam'), de: _i18n.t('de', 'csv.naam') });
}

console.log('\n— _i18n.resolveer(): dezelfde taalbron als het dashboard, voor de export —');
{
  const reqQuery = { url: '/api/leads?lang=fr', headers: {} };
  ck('?lang=fr wint', _i18n.resolveer(reqQuery) === 'fr', _i18n.resolveer(reqQuery));
  const reqCookie = { url: '/api/leads', headers: { cookie: 'hv_lang=de; andere=1' } };
  ck('zonder ?lang= pakt hij het hv_lang-cookie', _i18n.resolveer(reqCookie) === 'de', _i18n.resolveer(reqCookie));
  const reqLeeg = { url: '/api/leads', headers: {} };
  ck('zonder allebei valt hij terug op de standaardtaal', typeof _i18n.resolveer(reqLeeg) === 'string' && _i18n.resolveer(reqLeeg).length === 2);
}

console.log('\n— beide exportpaden: UTF-8 BOM + gelokaliseerde kolomnamen (source-check) —');
{
  const src = fs.readFileSync(BASE + 'api/leads.js', 'utf8');

  // De BOM is het echte teken U+FEFF, geen letterlijke tekst "﻿" -- zoek
  // dus op het teken zelf, precies zoals de bestaande A2-regel dat al deed.
  const BOM = '﻿';

  const a2Start = src.indexOf("if (body.mode === 'csv-export')");
  const a2 = src.slice(a2Start, a2Start + 5200);
  ck('A2 (csv-export-modus) bestaat', a2Start !== -1);
  ck('A2 heeft een UTF-8 BOM', a2.indexOf(BOM) !== -1);
  ck('A2 gebruikt de gelokaliseerde kolomnamen', /Tcsv\('csv\.naam'\)/.test(a2) && /_i18n\.resolveer\(req\)/.test(a2), null);
  ck('A2 filtert op tenant met de ECHTE, geëxporteerde functie (geen losse kopie)',
     /filterRecordsVoorTenant\(all, projectCode\)/.test(a2), null);

  const getStart = src.indexOf("params.get('export') === 'true'");
  const getBlok = src.slice(getStart, getStart + 1500);
  ck('GET ?export=true bestaat', getStart !== -1);
  ck('GET-pad heeft nu ook een UTF-8 BOM (miste hem eerst)', getBlok.indexOf(BOM) !== -1);
  ck('GET-pad gebruikt de gelokaliseerde kolomnamen', /Tcsv\('csv\.naam'\)/.test(getBlok) && /_i18n\.resolveer\(req\)/.test(getBlok), null);

  // De bestaande filters (periode/status) mogen niet verdwenen zijn.
  ck('A2 filtert nog steeds op periode', /grens !== null/.test(a2));
  ck('A2 filtert nog steeds op status', /statusFilter === .qualified./.test(a2));
}

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
