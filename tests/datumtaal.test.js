'use strict';
/*
 * Datums en bedragen volgen de taal van de klant.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * De constante LOCALE bestond al -- hij wordt serverzijdig gevuld met de BCP-47
 * van de paginataal (nl-BE, fr-BE, en-GB, de-BE) en er stond zelfs een
 * commentaar bij dat toLocaleDateString "op een paar plekken hard op 'nl-NL'"
 * stond. Alleen was hij daarna op precies EEN plek toegepast.
 *
 * De andere zestien bleven staan. Een Engelstalige klant zag zijn omzet als
 * "1.234.567" en zijn weekkop als "maart"; een Duitse klant kreeg 09/03 waar
 * hij 09.03 verwacht. Niets kapot, niets in de logs -- gewoon een product dat
 * in vier talen bestaat en in een daarvan telt.
 *
 * Deze test kijkt naar de UITGESTUURDE pagina en niet naar de bron, want dat is
 * waar het misgaat: de bron is een sjabloon en de vraag is wat de klant krijgt.
 */
process.env.FARO_WORKSPACE_ENABLED = process.env.FARO_WORKSPACE_ENABLED || '1';
process.env.API_AIRTABLE  = process.env.API_AIRTABLE  || 'test';
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'test';

const path = require('path');
const BASE = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

const dash = require(path.join(BASE, 'api/dashboard.js'));
function render(lang) {
  return new Promise((res) => {
    let html = '';
    dash({ method: 'GET', url: '/dashboard?lang=' + lang, headers: { 'accept-language': lang }, query: { lang } },
         { setHeader() {}, status() { return this; }, send(b) { html = String(b); res(html); },
           json() {}, end() { res(html); } });
  });
}

(async () => {
  const verwacht = { nl: 'nl-BE', fr: 'fr-BE', en: 'en-GB', de: 'de-BE' };

  console.log('\n  elke taal krijgt zijn eigen locale mee');
  for (const [taal, tag] of Object.entries(verwacht)) {
    const html = await render(taal);
    const m = /^const LOCALE = '([^']+)';/m.exec(html);
    ck(taal + ' -> ' + tag, !!m && m[1] === tag, m && m[1]);
  }

  console.log('\n  en niets valt meer terug op Nederlands');
  for (const taal of Object.keys(verwacht)) {
    const html = await render(taal);
    /* Alleen de AANROEPEN tellen. In het commentaar mag 'nl-NL' staan -- daar
       wordt juist uitgelegd waarom het weg is, en een test die een uitleg
       verbiedt maakt de code slechter. */
    const aanroepen = (html.match(/toLocale\w*\(\s*'nl-NL'/g) || []).length
                    + (html.match(/(?:Number|DateTime)Format\(\s*'nl-NL'/g) || []).length;
    ck(taal + ': geen enkele opmaakaanroep op nl-NL', aanroepen === 0, aanroepen);
  }

  /* Dat de tags kloppen is niet genoeg: ze moeten ook echt iets anders doen,
     anders is dit een test die een constante met zichzelf vergelijkt. */
  console.log('\n  en dat maakt zichtbaar verschil');
  {
    const d = new Date('2026-03-09T10:00:00Z');
    const datum = (t) => d.toLocaleDateString(t, { day: '2-digit', month: '2-digit', year: 'numeric' });
    const geld  = (t) => (1234567).toLocaleString(t);
    ck('de datum in het Duits wijkt af van het Nederlands',
      datum('de-BE') !== datum('nl-BE'), { de: datum('de-BE'), nl: datum('nl-BE') });
    ck('het bedrag in het Engels wijkt af van het Nederlands',
      geld('en-GB') !== geld('nl-BE'), { en: geld('en-GB'), nl: geld('nl-BE') });
    ck('het bedrag in het Frans wijkt af van het Nederlands',
      geld('fr-BE') !== geld('nl-BE'), { fr: geld('fr-BE'), nl: geld('nl-BE') });
  }

  console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('  STUK:', e && e.stack); process.exit(1); });
