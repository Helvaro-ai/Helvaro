/*
 * api/dashboard.js -- de dealer-stukken van W4 (overzicht, score-kaart,
 * pipeline-filters, instellingen, i18n-pariteit).
 *
 * Bron-niveau, zelfde reden als tests/koop-parse.test.js: dashboard.js is
 * client-JS die in een tekststring zit, geen module om te require'n en te
 * bevragen. Commentaar wordt eruit geknipt voordat er op tekst gezocht wordt,
 * anders is een test groen om de verkeerde reden -- de afwegingscommentaren
 * hierboven noemen zelf bijna elk woord waar je op zoekt.
 */
'use strict';

const fs   = require('fs');
const BASE = require('path').join(__dirname, '..') + '/';
const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
const i18n = fs.readFileSync(BASE + 'api/_i18n.js', 'utf8');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 300)}`);
  ok ? pass++ : fail++;
};

/* Commentaar eruit, /* * /, // en <!-- -->, zelfde drie soorten als de
   briefing vraagt en dezelfde regex als tests/koop-parse.test.js. */
const zonderCommentaar = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/<!--[\s\S]*?-->/g, '');

const code = zonderCommentaar(dash);
const i18nCode = zonderCommentaar(i18n);

console.log('\n— dealer-overzicht op het dashboard —');
{
  ck('mode "dealer-overzicht" wordt opgevraagd', /mode:\s*'dealer-overzicht'/.test(code), null);

  const fnMatch = /function renderDealerOverzicht\s*\(\)\s*\{([\s\S]*?)\n\}/.exec(code);
  ck('renderDealerOverzicht() bestaat', !!fnMatch, null);
  ck('het overzicht is gepoort door isDealer()', !!fnMatch && /isDealer\(\)/.test(fnMatch[1]), fnMatch && fnMatch[1].slice(0, 200));

  ck('geladen via loadDealerOverzicht, aangeroepen vanuit refreshData', /loadDealerOverzicht\(\)/.test(code), null);
  ck('gecached in state.dealer', /state\.dealer\s*=/.test(code), null);
}

console.log('\n— pipeline: filters + dealer-kaartjes —');
{
  ck('de zes filterchips bestaan (PIPE_FILTER_DEFS)', /PIPE_FILTER_DEFS/.test(code), null);
  ck('elke filter-id uit de spec komt voor', ['hot', 'warm', 'cold', 'afspraak', 'financiering', 'inruil']
    .every((id) => code.indexOf("id: '" + id + "'") !== -1), null);
  ck('de pipe-filter-chip klasse wordt echt gebruikt', code.indexOf('pipe-filter-chip') !== -1, null);
  ck('de kaart toont de voertuigcode voor dealers', /pipe-vehicle-chip/.test(code), null);
}

console.log('\n— leadpaneel: score-kaart + verloren reden —');
{
  ck('dealerScoreKaart gebruikt score.reden.* labels', code.indexOf("tr('score.reden.' + r)") !== -1, null);
  ck('de volgende actie komt uit actie.*', code.indexOf("tr('actie.' + actie)") !== -1, null);
  ck('de dealer-verlies-reden select bestaat, apart van panel-verlies-reden', /panel-dealer-verlies-reden/.test(code), null);
  ck('hij schrijft naar blob.verloren, niet naar het Reason-veld', /data\.verloren\s*=\s*reden/.test(code), null);
  ck('de negen dealership-redenen staan er allemaal', ['prijs', 'verkocht', 'financiering', 'elders', 'geen_reactie', 'niet_geinteresseerd', 'timing', 'mismatch', 'anders']
    .every((r) => code.indexOf("'" + r + "'") !== -1), null);
}

console.log('\n— vehicles page: operationele status + kandidaten —');
{
  ck('pdOperationeleStatus spiegelt api/_vehicles.js', /function pdOperationeleStatus/.test(code), null);
  ck('de kandidaten-uitklapper bestaat', /pd-kandidaten-toggle/.test(code), null);
  ck('afspraken worden opgehaald voor de voorraadpagina', /mode:\s*'appointments-list'/.test(code), null);
}

console.log('\n— activiteitenlogboek: server-events gemerged —');
{
  ck('mode "activity-list" wordt opgevraagd voor de dealer-feed', /loadDealerActiviteit[\s\S]{0,400}mode:\s*'activity-list'/.test(code), null);
  const SOORTEN = [
    'appointment_protection_triggered', 'duplicate_lead_blocked', 'duplicate_vehicle_blocked',
    'vehicle_reserved_blocked', 'vehicle_sold_blocked', 'vehicle_unavailable_blocked',
    'appointment_created', 'appointment_creation_failed', 'lead_score_calculated',
    'employee_notification_sent', 'employee_notification_failed', 'followup_scheduled',
    'followup_sent', 'appointment_reminder_sent', 'vehicle_match_found', 'old_lead_match_found',
  ];
  ck('alle 16 SOORTEN hebben een act.<soort> i18n-sleutel in _i18n.js',
     SOORTEN.every((s) => i18nCode.indexOf("'act." + s + "'") !== -1),
     SOORTEN.filter((s) => i18nCode.indexOf("'act." + s + "'") === -1));
}

console.log('\n— instellingen: extra werknemersnummers —');
{
  ck('het veld staat in de HTML (ap-notify-phones-extra)', /ap-notify-phones-extra/.test(code), null);
  ck('config-save stuurt notifyPhonesExtra mee', /notifyPhonesExtra:/.test(code), null);
}

console.log('\n— i18n-pariteit voor de nieuwe Fase 6-sleutels —');
{
  /* Elke sleutel '...': { ... } als los blok. Geen genest object in de nieuwe
     sleutels (allemaal platte strings), dus [^}]* volstaat -- zelfde aanname
     als de rest van dit bestand voor multi-regel entries. */
  const KEY_RE = /'([a-zA-Z0-9_.]+)':\s*\{([^}]*)\}/g;
  const PREFIXEN = ['dash.aandacht.', 'act.', 'koop.', 'verloren.reden.', 'pipe.filter.'];
  const gevonden = {};
  PREFIXEN.forEach((p) => { gevonden[p] = []; });

  let m;
  while ((m = KEY_RE.exec(i18nCode))) {
    const sleutel = m[1];
    const prefix = PREFIXEN.find((p) => sleutel.indexOf(p) === 0);
    if (!prefix) continue;
    const body = m[2];
    const heeftAlle = ['nl:', 'fr:', 'en:', 'de:'].every((t) => body.indexOf(t) !== -1);
    gevonden[prefix].push({ sleutel, heeftAlle });
  }

  PREFIXEN.forEach((prefix) => {
    const lijst = gevonden[prefix];
    ck(`er bestaan sleutels met prefix "${prefix}"`, lijst.length > 0, lijst.length);
    const missend = lijst.filter((x) => !x.heeftAlle).map((x) => x.sleutel);
    ck(`alle "${prefix}"-sleutels hebben nl/fr/en/de`, missend.length === 0, missend);
  });
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail > 0 ? 1 : 0);
