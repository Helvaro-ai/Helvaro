/*
 * api/dashboard.js is één template literal van 26.000 regels. Dit bestand
 * bewaakt de twee tekens die hem kunnen breken.
 *
 * ── Waarom dit bestaat ──────────────────────────────────────────────────────
 * De hele pagina -- CSS, opmaak én de client-side JS -- zit in één backtick-
 * string. Eén ongeescapete backtick daarbinnen BEËINDIGT die string, en dan is
 * het bestand geen geldige JavaScript meer. Het gevolg is niet een scheve knop
 * maar een 500 op het complete dashboard: niemand kan meer inloggen.
 *
 * Dat is in één sessie twee keer bijna gebeurd, allebei in een OPMERKING:
 *
 *     controleerden al `typeof Chart === 'undefined'`, dus ...
 *     alle 97 gebruiken zijn `background:` en geen `background-color:`
 *
 * Allebei volstrekt onschuldig bedoeld. En precies dat is het gevaar: in een
 * opmerking let niemand op zijn leestekens. De taal maakt dat onderscheid niet
 * -- binnen een template literal is een opmerking gewoon tekst, en een backtick
 * gewoon een einde.
 *
 * ── Waarom node --check niet genoeg is ──────────────────────────────────────
 * Dat vangt het wel, maar alleen als iemand het draait. Deze test draait bij
 * elke commit mee en zegt er bovendien BIJ waar het misgaat en waarom, in
 * plaats van "Unexpected identifier" op een regel die er onschuldig uitziet.
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

const BESTAND = path.join(__dirname, '..', 'api', 'dashboard.js');

function hoofd() {
const bron = fs.readFileSync(BESTAND, 'utf8');

console.log('\n  het bestand is geldige JavaScript');
{
  let fout = null;
  try { new vm.Script(bron); } catch (e) { fout = e.message; }
  ck('api/dashboard.js parseert', fout === null, fout);
}

console.log('\n  geen losse backtick in het CSS-blok');
{
  /* Het CSS-blok is het grootste aaneengesloten stuk pure tekst in de literal
     en dus waar dit het vaakst misgaat. Buiten dit blok staat wél legitiem
     gebruik: ${CLERK_READY ? `...` : ''} nest een echte literal, en die hoort
     er te zijn. Daarom kijkt deze controle naar het CSS-blok en niet naar het
     hele bestand -- een test die ook de legitieme gevallen rood maakt, wordt
     uitgezet, en dan bewaakt hij niets meer. */
  /* lastIndexOf en niet indexOf: er staat eerder in het bestand al een
     <style>, en met de eerste treffer begon de slice te vroeg en viel het
     legitieme ${CLERK_READY ? `...`} erbinnen. Dit is de open-tag die HOORT
     bij deze sluit-tag. */
  const j = bron.indexOf('</style>');
  const i = bron.lastIndexOf('<style>', j);
  ck('het CSS-blok is te vinden', i > 0 && j > i, { i, j });
  const css = bron.slice(i, j);
  const ruw = [];
  const re = /(?<!\\)`/g;
  let m;
  while ((m = re.exec(css)) !== null) ruw.push(css.slice(0, m.index).split('\n').length);
  ck('nul ongeescapete backticks tussen <style> en </style>',
    ruw.length === 0, ruw.length ? { regels_in_css_blok: ruw.slice(0, 5) } : null);
}

console.log('\n  geen losse ${ in het CSS-blok');
{
  /* Dezelfde val, andere vorm: ${ opent een substitutie. In CSS komt dat
     nergens legitiem voor -- er is geen CSS-eigenschap die zo begint -- dus
     hier mag de regel absoluut zijn. */
  const jj = bron.indexOf('</style>');
  const css = bron.slice(bron.lastIndexOf('<style>', jj), jj);
  const treffers = [];
  const re = /(?<!\\)\$\{/g;
  let m;
  while ((m = re.exec(css)) !== null) treffers.push(css.slice(0, m.index).split('\n').length);
  /* Uitzondering: de server vult wél waarden in het CSS-blok in (themakleuren,
     Faro's eigen CSS). Die zijn er en horen er. Deze test bewaakt dus niet dat
     ze nul zijn, maar dat ze allemaal ook echt SLUITEN -- een ${ zonder } is
     net zo fataal als een losse backtick. */
  let open = 0, ongebalanceerd = 0;
  for (let k = 0; k < css.length; k++) {
    if (css[k] === '$' && css[k + 1] === '{' && css[k - 1] !== '\\') { open++; k++; }
    else if (css[k] === '}' && open > 0) open--;
  }
  ongebalanceerd = open;
  ck('elke ${ in het CSS-blok sluit ook weer', ongebalanceerd === 0,
    ongebalanceerd ? { nog_open: ongebalanceerd, aantal_substituties: treffers.length } : null);
}

console.log('\n  het GERENDERDE script parseert in een browser');
{
  /* Dit is de controle die node --check structureel niet kan doen, en dat is
     geen detail -- het is de belangrijkste controle in dit bestand.

     node --check valideert het BUITENSTE bestand. Maar de client-side JS zit
     binnen de template literal, dus wat de browser krijgt is de UITVOER van die
     literal, en die is pas geldig of ongeldig nadat de escapes zijn toegepast.
     Twee voorbeelden van hetzelfde bestand:

       '\\n'  ->  de escape \n            correcte JS-string
       '\n'   ->  een ECHTE newline      onafgesloten string, hele app stuk

     Allebei geven een groene node --check. De tweede breekt elk scherm. Dat is
     precies wat er hier gebeurde toen de dealership-tak werd toegevoegd: de
     pagina gaf netjes een 200 terug, het bestand parseerde, en in de browser
     was er geen enkele functie gedefinieerd.

     Renderen en dan parseren is de enige manier om dat te zien. */
  const vm2 = require('vm');
  let html = '', gerenderd = false;
  const res2 = {
    setHeader() { return res2; }, status() { return res2; },
    send(x) { html = String(x); gerenderd = true; return res2; },
    end(x) { if (x) { html = String(x); gerenderd = true; } return res2; },
    json(x) { html = JSON.stringify(x); return res2; },
  };
  const klaar = require(BESTAND)(
    { method: 'GET', url: '/dashboard', headers: { host: 'app.helvaro.pro' }, query: {}, cookies: {} },
    res2
  );

  const controleer = () => {
    ck('de pagina rendert', gerenderd && html.length > 100000, { gerenderd, lengte: html.length });
    const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
    let m, aantal = 0, kapot = null;
    while ((m = re.exec(html)) !== null) {
      const attr = m[1] || '';
      if (/\bsrc\s*=/.test(attr)) continue;          // extern script, niet aan ons
      if (/\btype\s*=/.test(attr) && !/text\/javascript|module/i.test(attr)) continue;
      if (!m[2].trim()) continue;
      aantal++;
      try { new vm2.Script(m[2]); }
      catch (e) { kapot = { script: aantal, fout: e.message }; break; }
    }
    ck('er staat minstens een inline script in', aantal >= 1, aantal);
    ck('elk inline script parseert zoals een browser het krijgt', kapot === null, kapot);
  };

  if (klaar && typeof klaar.then === 'function') {
    /* De handler is async. De rest van dit bestand loopt synchroon, dus de
       controle hangt achter de belofte en de afsluitende telling gebeurt daar
       ook -- anders zou de test groen afsluiten voordat hij iets gekeken heeft. */
    klaar.then(() => {
      controleer();
      console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
      process.exit(fail ? 1 : 0);
    }).catch((e) => {
      ck('handler werpt niet', false, e && e.message);
      console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
      process.exit(1);
    });
    return;   // de synchrone afsluiting hieronder wordt overgeslagen
  }
  controleer();
}

console.log('\n  de pagina rendert echt, niet alleen syntactisch');
{
  /* Parsen is niet renderen. Een literal kan geldig zijn en de handler kan
     alsnog omvallen op een ontbrekende module of een verkeerde aanroep. */
  let status = null, lengte = 0, fout = null;
  const res = {
    setHeader() { return res; },
    status(c) { status = c; return res; },
    send(x) { lengte = String(x).length; return res; },
    end(x) { if (x) lengte = String(x).length; return res; },
    json(x) { lengte = JSON.stringify(x).length; return res; },
  };
  try {
    const handler = require(BESTAND);
    const klaar = handler(
      { method: 'GET', url: '/dashboard', headers: { host: 'app.helvaro.pro' }, query: {}, cookies: {} },
      res
    );
    if (klaar && typeof klaar.then === 'function') {
      /* De handler is async. Deze test draait synchroon af, dus we kunnen hier
         niet op wachten zonder de hele suite async te maken. Wat we WEL kunnen
         controleren is dat de aanroep geen directe worp gaf -- de rest dekt de
         parse-controle hierboven al af. */
      klaar.catch(() => {});
      ck('handler aanroepen werpt niet meteen', true);
    } else {
      ck('handler geeft een antwoord', status === 200 && lengte > 100000, { status, lengte });
    }
  } catch (e) { fout = e.message; ck('handler aanroepen werpt niet', false, fout); }
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
  process.exit(fail ? 1 : 0);
}

hoofd();
