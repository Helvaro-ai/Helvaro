#!/usr/bin/env node
'use strict';
/*
 * Eén controle: staat er een losse backtick of een ${ in api/dashboard.js op een
 * plek waar dat de template literal breekt?
 *
 * ── Waarom dit bestaat ───────────────────────────────────────────────────────
 * api/dashboard.js is één template literal van 25.000+ regels (zie
 * HELVARO-ARCHITECTUUR §4.1). Een backtick in een COMMENTAAR binnen die string
 * sluit de string af, en dan is de rest van het bestand geen tekst meer maar
 * code. Node meldt dat als een SyntaxError op een regel die er niets mee te
 * maken heeft -- "Unexpected identifier 'position'" op een CSS-commentaar.
 *
 * tests/pagina-parseert.test.js vangt dit ook, maar pas nadat het bestand al
 * geladen is en tussen 92 andere tests. Dit script zegt in één regel WELKE
 * regel het is, en het draait in een halve seconde.
 *
 * De valkuil is niet theoretisch: hij is bij het schrijven van deze codebase
 * drie keer op één dag gemaakt, elke keer door in een commentaar een
 * CSS-eigenschap tussen backticks te zetten omdat dat in Markdown netjes staat.
 *
 *   node scripts/backtick-check.js
 */
const fs = require('fs');
const path = require('path');
const bestand = path.join(__dirname, '..', 'api', 'dashboard.js');
const bron = fs.readFileSync(bestand, 'utf8');

/* De literal begint bij de eerste backtick na 'return `' en eindigt bij de
   afsluitende. Alles daartussen is pagina-inhoud. In plaats van dat bereik te
   raden -- wat fout gaat zodra iemand de vorm verandert -- laten we Node zelf
   oordelen: als het bestand parseert, is er niets aan de hand. Parseert het
   niet, dan zoeken we de regel op die de gebruiker moet zien. */
let ok = true;
try {
  new (require('vm').Script)(bron, { filename: bestand });
} catch (e) {
  ok = false;
  const m = /:(\d+)\b/.exec(String(e.stack || '').split('\n')[0] + ' ' + (e.message || ''));
  const regelnr = e.lineNumber || (m ? Number(m[1]) : null);
  console.error('\n  api/dashboard.js parseert NIET.');
  console.error('  ' + (e.message || e));
  if (regelnr) {
    const regels = bron.split('\n');
    const van = Math.max(0, regelnr - 4), tot = Math.min(regels.length, regelnr + 2);
    console.error('\n  rond regel ' + regelnr + ':');
    for (let i = van; i < tot; i++) {
      const merk = (i + 1 === regelnr) ? ' >> ' : '    ';
      console.error(merk + (i + 1) + '  ' + regels[i].slice(0, 110));
    }
  }
  console.error('\n  Bijna altijd: een backtick of een dollar-accolade in een COMMENTAAR');
  console.error('  binnen de template literal. Schrijf de eigenschap zonder backticks.\n');
}
/* ── Parseren is niet renderen ──────────────────────────────────────────────
   Deze controle zei "parseert" terwijl de pagina stuk was. Dat kan, want de
   template literal is voor de parser gewoon een string -- pas als je hem
   UITVOERT worden de ${...}-stukken geevalueerd, en dan pas blijkt dat er een
   functie in staat die aan die kant niet bestaat.

   Precies dat is hier gebeurd: ${escHtml(tr('...'))} in wat een CLIENT-sjabloon
   moest zijn. De server ziet die ${ ook en probeert hem uit te voeren; escHtml
   en tr bestaan daar niet, dus ReferenceError -- en elke klant krijgt het
   inlogscherm te zien.

   De regel om te onthouden: in dit bestand hoort een client-interpolatie
   \${...} te schrijven, met backslash. Zonder backslash is het de server. */
if (ok) {
  process.env.FARO_WORKSPACE_ENABLED = process.env.FARO_WORKSPACE_ENABLED || '1';
  process.env.API_AIRTABLE  = process.env.API_AIRTABLE  || 'check';
  process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'check';
  try {
    const dash = require(bestand);
    let lengte = 0;
    dash({ method: 'GET', url: '/dashboard', headers: {}, query: {} },
         { setHeader() {}, status() { return this; }, send(b) { lengte = String(b).length; },
           json() {}, end() {} });
    if (lengte < 100000) {
      ok = false;
      console.error('\n  api/dashboard.js parseert wel maar levert een LEGE pagina (' + lengte + ' tekens).');
      console.error('\n  Bijna altijd: een ${...} die een CLIENT-interpolatie had moeten zijn.');
      console.error('  Schrijf \\${...} met backslash -- zonder backslash voert de SERVER hem uit,');
      console.error('  en daar bestaan escHtml/tr/faroEsc niet. De handler vangt die fout zelf op');
      console.error('  en stuurt een foutpagina, dus je ziet hier 0 tekens in plaats van een stack.\n');
    }
  } catch (e) {
    ok = false;
    console.error('\n  api/dashboard.js parseert wel maar RENDERT niet:');
    console.error('  ' + (e.message || e));
    if (/is not defined/.test(String(e.message))) {
      console.error('\n  Bijna altijd: een ${...} die een CLIENT-interpolatie had moeten zijn.');
      console.error('  Schrijf \\${...} met backslash -- zonder backslash voert de SERVER hem uit,');
      console.error('  en daar bestaan escHtml/tr/faroEsc niet.\n');
    }
  }
}

if (ok) console.log('api/dashboard.js parseert en rendert.');
process.exit(ok ? 0 : 1);
