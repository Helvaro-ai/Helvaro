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
 * Dat is bij de snede zelf ook gedaan: de pagina was in alle vier de talen
 * byte voor byte dezelfde, met dezelfde sha256. Twee keer bleek er een
 * regelafbreking te veel te staan -- zonder die vergelijking waren die er
 * gewoon in gebleven.
 *
 * ── Waarom hier NIET de hele pagina gehasht wordt ──────────────────────────
 * De eerste versie van dit bestand zette de vier paginahashes hard in de code.
 * Dat was te breed: die test werd rood bij ELKE inhoudswijziging -- een
 * vertaling, een knop, een woord -- en dan is hij binnen een week iets wat je
 * wegklikt in plaats van leest. Een controle die altijd afgaat, bewaakt niets.
 *
 * Gehasht wordt nu waar dit bestand OVER gaat: het CSS-blok. Dat hoort door een
 * refactor niet te veranderen, en verandert wel als iemand er echt aan werkt --
 * dan is één bewuste regel bijwerken de juiste prijs.
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
    dash({ method: 'GET', url: '/dashboard?lang=' + lang, headers: { host: 'test' }, query: { lang } },
         { setHeader() {}, status() { return this; }, send(b) { html = String(b); res(html); },
           json() {}, end() { res(html); } });
  });
}

/* Het CSS-blok. Bewust de hele hash en niet alleen een lengte: een lengte laat
   een verwisseling van twee even lange stukken door.

   ── Wat deze twee getallen nu bewaken ─────────────────────────────────────
   Bij de snede zelf stond hier de hash van het blok zoals het UIT dashboard.js
   kwam, en dat bewees precies wat het moest bewijzen: de verhuizing veranderde
   geen byte. Dat bewijs is geleverd, één keer, in die commit -- het is geen
   eigenschap die je opnieuw kunt aantonen zodra er legitiem iets aan de CSS
   verandert.

   Wat blijft, is een tripwire: de CSS hoort nooit ONGEMERKT te veranderen.
   Wie hier iets aanpast, past deze twee getallen bewust mee aan en ziet in de
   diff hoeveel bytes erbij kwamen. Een wijziging die je niet kon verklaren is
   dan meteen een gesprek in plaats van een verrassing.

   Bijgewerkt na de drie raakdoel-fixes en na het meekleuren van Clerks
   "last used"-badge op de Google-knop. Daarna voor de
   ingeklapte zijbalk (+1.060 bytes): merkteken in plaats van woordmerk, alles op de
   middenas. Daarna (+337 bytes) het antwoordvak op de Gesprekken-pagina, en (+328) de agenda-werkbalk op telefoons.
   Daarna (+1.265 bytes) Fase 4 (ontwerpsysteem): het volledige warme-neutrale
   palet in beide thema's (grond/kaart/rand/tekst/status), 4/8/12-hoekschaal,
   een vlakke primaire knop i.p.v. een doorschijnend verloop, en de gedode
   knopgloed en stuiterende curves. Verklaarbaar aan de grootte: elke
   kleurwaarde in :root en [data-theme="light"] is vervangen, en er kwamen een
   handvol nieuwe alias-tokens (--ground/--raised/--ink-surface/--edge,
   --btn-primary-bg/--btn-primary-text) bij. Zie CHANGELOG.md.

   Daarna (-330 bytes) Fase 4 vervolg: de drie --card / --card-elevated
   linear-gradient()-waarden (licht en donker, plus het vastgezette
   .login-brand-side-blok) vervangen door de platte tonen die de opdracht
   voorschrijft -- de brief verbiedt verlopen buiten de ene kaartrand-schaduw
   in de modal. Kleiner geworden omdat een platte hexwaarde korter is dan een
   driestops-gradient.

   Daarna (+381 bytes) de opdracht-punten 1 en 2 van dezelfde ronde: de twee
   losse root-niveau [data-theme="light"]-blokken (het paletblok en het
   knop-tokenblok bij --btn-rim) samengevoegd tot EEN blok direct na :root,
   de dubbele .gradient-text-override verwijderd (herhaalde exact wat de
   thema-onafhankelijke basisregel al deed), en de zijbalk laten meebewegen
   met het thema in plaats van in beide thema's donker te blijven -- opdracht
   van de eigenaar. Groter geworden door de nieuwe [data-theme="light"]
   .sidebar-tokenrebind en de bijbehorende uitleg; drie letterlijke,
   donker-getunede kleuren op .sidebar .user-name/.user-role/.btn-logout zijn
   juist verwijderd omdat de tokenrebind ze overbodig maakt. */
const CSS_BYTES = 386516;
const CSS_SHA   = 'd728fe5fe3befa9f';

(async () => {
  console.log('\n  het CSS-blok is precies wat er uit dashboard.js kwam');
  {
    const css = styles.css();
    const sha = crypto.createHash('sha256').update(css).digest('hex').slice(0, 16);
    ck('byte voor byte gelijk aan het oorspronkelijke blok',
      css.length === CSS_BYTES && sha === CSS_SHA,
      { bytes: css.length, sha, verwacht: { bytes: CSS_BYTES, sha: CSS_SHA } });
  }

  console.log('\n  en de pagina komt in alle vier de talen heel uit de renderer');
  for (const taal of ['nl', 'fr', 'en', 'de']) {
    const html = await render(taal);
    /* Geen hash meer, wel de vangnetten die er echt toe doen: er komt HTML uit,
       en het CSS-blok zit erin. Dat tweede is het punt van de hele snede -- als
       de module ooit niet meer aangeroepen wordt, staat de app zonder opmaak
       en zegt geen enkele andere test er iets over. */
    ck(taal + ': er komt een volledige pagina uit', html.length > 100000, html.length);
    /* Het CSS staat sinds de asset-splitsing niet meer inline maar op
       /dashboard.css?v=<hash>: de pagina moet ernaar verwijzen, en de
       asset-route moet het hele blok teruggeven. */
    ck(taal + ': verwijst naar het CSS-bestand', /dashboard\.css\?v=[0-9a-f]{12}/.test(html), null);
    const css = await new Promise((res) => {
      let uit = '';
      dash({ method: 'GET', url: '/dashboard?lang=' + taal + '&asset=css', headers: {}, query: { lang: taal, asset: 'css' } },
           { setHeader() {}, status() { return this; }, send(b) { uit = String(b); res(uit); }, json() {}, end() { res(uit); } });
    });
    ck(taal + ': met het CSS-blok erin', css.length > 300000, css.length);
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
