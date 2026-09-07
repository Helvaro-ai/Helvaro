'use strict';
/*
 * De opsplitsing van api/dashboard.js.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * HELVARO-ARCHITECTUUR noemt het opsplitsen van dashboard.js "de grootste
 * openstaande schuld" met "hoog risico". Terecht: het bestand was 28.127 regels
 * en het geheel is EEN template literal, waarin een backtick in een commentaar
 * genoeg is om de hele app op het inlogscherm te zetten. Dat is echt gebeurd,
 * en tijdens dit werk nog drie keer bijna.
 *
 * De eerste snede is het CSS-blok. Dat was de veiligste die er is, en dat is
 * gemeten en niet gehoopt:
 *
 *     backticks in het blok:        0
 *     backslashes:                  0
 *     ${}-invullingen:              0
 *
 * Er viel dus niets te ontsnappen en niets om te zetten -- de inhoud is
 * letterlijk verplaatst.
 *
 * ── Wat deze test doet, en waarom juist dit ────────────────────────────────
 * Een refactor die niets aan gedrag verandert, hoor je te BEWIJZEN en niet te
 * beweren. De sterkst mogelijke controle is hier beschikbaar: de uitgestuurde
 * pagina moet byte voor byte dezelfde zijn. Niet "ziet er goed uit", niet "de
 * tests zijn groen" -- identiek.
 *
 * Daarom staan de vier sha256's hieronder hard in de code. Verandert er iets
 * aan de CSS, dan hoort deze test rood te worden en hoor je de hashes bewust
 * bij te werken. Dat is precies de bedoeling: het maakt "ik heb even iets aan
 * de stijlen gedaan" een zichtbare handeling in plaats van een stille.
 */
process.env.FARO_WORKSPACE_ENABLED = '1';
process.env.API_AIRTABLE  = process.env.API_AIRTABLE  || 'test';
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'test';

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const BASE = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

const dash   = require(path.join(BASE, 'api/dashboard.js'));
const styles = require(path.join(BASE, 'api/_dash/styles.js'));

function render(lang) {
  return new Promise((res) => {
    let html = '';
    dash({ method: 'GET', url: '/dashboard?lang=' + lang, headers: {}, query: { lang } },
         { setHeader() {}, status() { return this; }, send(b) { html = String(b); res(html); },
           json() {}, end() { res(html); } });
  });
}

/* De pagina zoals hij was VOOR de snede. Bewust de hele hash en niet een
   lengte: een lengte laat een verwisseling van twee even lange stukken door. */
const VERWACHT = {
  nl: { bytes: 1561201, sha: '75e5712ac107e480' },
  fr: { bytes: 1568562, sha: '2e73e177036a621a' },
  en: { bytes: 1559302, sha: '7cb06850dee5a1b6' },
  de: { bytes: 1566317, sha: 'd1cb3cc2dcd1dba9' },
};

(async () => {
  console.log('\n  de pagina is niet veranderd door de snede');
  for (const [taal, v] of Object.entries(VERWACHT)) {
    const html = await render(taal);
    const sha = crypto.createHash('sha256').update(html).digest('hex').slice(0, 16);
    ck(taal + ': byte voor byte gelijk', html.length === v.bytes && sha === v.sha,
       { bytes: html.length, sha, verwacht: v });
  }

  console.log('\n  het CSS-blok is nog steeds vrij van invullingen');
  {
    const css = styles.css();
    /* Deze drie zijn de reden dat de snede veilig WAS. Sluipt er later een
       backtick of een ${...} in, dan is het bestand niet meer los te zien van
       de context van dashboard.js -- en dan komt de val terug die dit hele
       bestand moest wegnemen. */
    ck('geen backticks',      css.indexOf('`') === -1,  css.indexOf('`'));
    ck('geen backslashes',    css.indexOf('\\') === -1, css.indexOf('\\'));
    ck('geen ${}-invullingen', css.indexOf('${') === -1, css.indexOf('${'));
    ck('en het is echt de hele stylesheet', css.length > 300000, css.length);
  }

  console.log('\n  dashboard.js is er kleiner op geworden');
  {
    const bron = fs.readFileSync(path.join(BASE, 'api/dashboard.js'), 'utf8');
    const regels = bron.split('\n').length;
    /* Was 28.127. Blijft hij daaronder, dan is de snede intact; kruipt hij er
       weer overheen, dan is er iets teruggeplakt in plaats van in een module
       gezet. Ruime marge, want er mag natuurlijk wel code bijkomen. */
    ck('onder de 22.000 regels', regels < 22000, regels);
    ck('en roept de stijlmodule aan', /_dashStyles\.css\(\)/.test(bron));
    ck('en heeft geen eigen <style>-inhoud meer van 9.000 regels',
      bron.indexOf('SELF-HOSTED FONTS') === -1, null);
  }

  console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('  STUK:', e && e.stack); process.exit(1); });
