'use strict';
/*
 * Een foutmelding is het slechtste moment voor een vreemde taal.
 *
 * ── Wat er stond ────────────────────────────────────────────────────────────
 * Zes bijna-gelijke storingszinnen, alle zes hardgecodeerd in het Nederlands:
 *
 *   "Netwerkfout. Controleer je verbinding."
 *   "Netwerkfout. Probeer opnieuw."
 *   "Verbindingsfout. Probeer opnieuw."
 *   "Er ging iets mis. Controleer je verbinding en probeer opnieuw."
 *   "Opslaan mislukt. Controleer je verbinding."
 *   "Opslaan lukte niet. Controleer je verbinding en probeer opnieuw."
 *
 * Twee dingen mis. Ze waren Nederlands op een scherm dat in vier talen bestaat,
 * en dat raakt een klant precies wanneer hij al vastloopt. En zes formuleringen
 * voor één toestand voegen geen informatie toe -- ze laten alleen zien dat er
 * zes keer los over nagedacht is.
 *
 * De sleutel tst.ietsMis BESTOND AL, met alle vier de vertalingen. Hij werd
 * alleen niet gebruikt. Dat is hier het patroon van de dag: gebouwd, en toen
 * niet aangesloten.
 *
 * ── Wat hier NIET onder valt ────────────────────────────────────────────────
 * De founder-coach (sendCoachMessage) blijft Nederlands. Dat scherm is
 * back-office, wordt door stripBackoffice uit de HTML van elke klant gehaald,
 * en de enige lezer spreekt Nederlands. Vertalen zou werk zijn zonder lezer.
 */
process.env.FARO_WORKSPACE_ENABLED = process.env.FARO_WORKSPACE_ENABLED || '1';
process.env.API_AIRTABLE  = process.env.API_AIRTABLE  || 'test';
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'test';

const path = require('path');
const BASE = path.join(__dirname, '..');
const i18n = require(path.join(BASE, 'api/_i18n.js'));

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

const dash = require(path.join(BASE, 'api/dashboard.js'));
function render(lang) {
  return new Promise((res) => {
    let html = '';
    dash({ method: 'GET', url: '/dashboard?lang=' + lang, headers: {}, query: { lang } },
         { setHeader() {}, status() { return this; }, send(b) { html = String(b); res(html); },
           json() {}, end() { res(html); } });
  });
}

/* De zes zinnen, als ze nog ergens als LETTERLIJKE tekst zouden staan. Alleen
   de vorm met een aanhalingsteken ervoor: dan is het een string in de code en
   geen woord in een commentaar dat uitlegt waarom hij weg is. */
const VERBODEN = [
  "'Netwerkfout. Controleer je verbinding.'",
  "'Verbindingsfout. Probeer opnieuw.'",
  "'Er ging iets mis. Controleer je verbinding en probeer opnieuw.'",
  "'Opslaan mislukt. Controleer je verbinding.'",
  "'Opslaan lukte niet. Controleer je verbinding en probeer opnieuw.'",
];

(async () => {
  console.log('\n  de sleutels bestaan in vier talen');
  for (const k of ['tst.ietsMis', 'tst.opslaanMis', 'leeg.galerij', 'leeg.stijlen']) {
    const waarden = ['nl', 'fr', 'en', 'de'].map((l) => i18n.t(l, k));
    const compleet = waarden.every((v) => v && v !== k);
    const verschillend = new Set(waarden).size === 4;
    ck(k + ' is compleet en echt vertaald', compleet && verschillend, waarden);
  }

  console.log('\n  en niets valt terug op Nederlands');
  for (const taal of ['nl', 'fr', 'en', 'de']) {
    const html = await render(taal);
    const gevonden = VERBODEN.filter((z) => html.indexOf(z) !== -1);
    ck(taal + ': geen hardgecodeerde storingszin', gevonden.length === 0, gevonden);
  }

  console.log('\n  de vertaalde zin komt er ook echt uit');
  {
    const verwacht = { nl: 'Er ging iets mis', fr: 'Un probl', en: 'Something went wrong', de: 'Etwas ist schiefgelaufen' };
    for (const [taal, stuk] of Object.entries(verwacht)) {
      const html = await render(taal);
      ck(taal + ': ' + stuk, html.indexOf(stuk) !== -1, stuk);
    }
  }

  console.log('\n  de founder-coach mag Nederlands blijven');
  {
    const html = await render('fr');
    /* stripBackoffice haalt de founder-PAGINA weg maar niet zijn functies. Dat
       is geen lek -- er staat geen klantgegeven in -- maar het betekent wel dat
       een zoektocht naar "Nederlandse tekst in de Franse pagina" hem vindt.
       Deze regel legt vast dat dat de bedoeling is, zodat niemand hem later
       "opruimt" en denkt dat hij een gat dicht. */
    ck('sendCoachMessage staat er nog, in het Nederlands',
      /sendCoachMessage/.test(html) && /'Netwerkfout\. Probeer opnieuw\.'/.test(html), null);
  }

  console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('  STUK:', e && e.stack); process.exit(1); });
