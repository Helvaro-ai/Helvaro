/*
 * Dynamische sleutels ('stage.' + fase, 'mail.status.' + status ...) worden niet door
 * vertaalsleutels-bestaan.test.js gezien. Hier staat per familie de echte waardenreeks, en
 * elke waarde moet in alle vier de talen een niet-lege vertaling hebben die niet de kale sleutel is.
 */
'use strict';
const i18n = require('../api/_i18n.js');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`); ok ? pass++ : fail++; };
const FAMILIES = {
  'stage.': ['new', 'qualified', 'afspraak', 'won', 'lost'],
  'score.temp.': ['hot', 'warm', 'cold'],
  'mail.status.': ['verzenden', 'mislukt', 'concept', 'dubbel'],
  'mail.klasse.': ['lead', 'klant', 'overig', 'nieuwsbrief', 'factuur', 'automatisch', 'eigen'],
  'pd.opstatus.': ['beschikbaar', 'interesse', 'afspraak', 'gereserveerd', 'verkocht', 'onbekend', 'uit_aanbod'],
};
/* Integraties: automotive (2026-10-05). Statussen van het register en de genormaliseerde bronfouten. */
FAMILIES['ig.status.'] = ['ACTIVE', 'BETA', 'COMING_SOON', 'FEED_REQUIRED', 'MANUAL', 'DISABLED'];
FAMILIES['ig.fout.'] = ['AUTH_ERROR', 'RATE_LIMIT', 'PROVIDER_DOWN', 'INVALID_DATA', 'MISSING_FIELD', 'DUPLICATE_VEHICLE', 'PERMISSION_DENIED', 'SYNC_TIMEOUT', 'UNKNOWN_ERROR', 'ACTIVATIE', 'NIET_BESCHIKBAAR'];
FAMILIES['ig.err.'] = ['onbekende_provider', 'provider_niet_beschikbaar', 'ongeldig_adres', 'ongeldige_gegevens', 'geen_gegevens', 'geen_versleuteling', 'ongeldige_bewaartermijn', 'algemeen'];
for (const id of ['dealership', 'real_estate', 'construction', 'kitchen', 'renovation', 'other']) FAMILIES['markt.' + id + '.'] = ['t', 's'];
console.log('\nDynamische vertaalsleutelfamilies');
for (const taal of ['nl', 'fr', 'en', 'de']) {
  const w = i18n.woordenboek(taal);
  const mist = [];
  for (const [voorvoegsel, waarden] of Object.entries(FAMILIES)) {
    for (const v of waarden) { const k = voorvoegsel + v; if (!w[k] || w[k] === k) mist.push(k); }
  }
  ck(taal + ': alle familiesleutels bestaan', mist.length === 0, mist);
}
/* De bron in Faro's leadpaneel gaat door bronLabel (Sindi live: "Advertentie" op een Engels scherm). */
{
  const dash = require('fs').readFileSync(require('path').join(__dirname, '..', 'api', 'dashboard.js'), 'utf8');
  ck("het leadpaneel vertaalt de bron via bronLabel", /rij\.veld === 'bron' \? bronLabel\(/.test(dash));
  for (const taal of ['nl', 'fr', 'en', 'de']) ck(taal + ': bron.advertentie bestaat', !!i18n.woordenboek(taal)['bron.advertentie']);
}
console.log(`\n  ${pass} ok, ${fail} fout\n`); process.exit(fail ? 1 : 0);
