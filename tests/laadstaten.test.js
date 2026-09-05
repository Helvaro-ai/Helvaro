/*
 * Wachten ziet er overal hetzelfde uit.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * In de browser geteld stonden er VIJF manieren om "even wachten" te zeggen,
 * en welke je kreeg hing af van welk scherm je toevallig opende:
 *
 *   dashboard / resultaten   shimmer-balken
 *   gesprekken / activiteit  het kale woord "Laden..."
 *   pipeline                 "Pipeline laden..."
 *   AI-beeld (stijlen)       "Stijlen laden..."
 *   AI-beeld / kalender      de LEGE-staat hergebruikt (.pi-empty, .cal-sidebar-empty)
 *
 * Die laatste is de ergste: "we halen het op" was dan niet te onderscheiden
 * van "er is niets". Iemand met een lege agenda en iemand met een trage
 * verbinding zagen letterlijk hetzelfde scherm.
 *
 * Nu is er een vorm in plaats van een woord -- laadvlak() in api/dashboard.js,
 * gebouwd op de .skeleton die er al was. Drie dingen moeten waar blijven:
 *
 *  1. GEEN LOS WOORD MEER IN BEELD. Zodra iemand ergens weer "Laden..." in de
 *     HTML zet is de consistentie weg, en dat is precies hoe het de vorige keer
 *     is gegroeid.
 *
 *  2. HET BLIJFT HOORBAAR. Een schermlezer die alleen shimmer-divs krijgt
 *     hoort niets. Daarom aria-busy plus verborgen tekst -- verborgen uit
 *     BEELD, niet uit de voorleesboom. display:none zou het weer stilzetten.
 *
 *  3. HET VULT ZIJN BAK. Gemeten toen dit gebouwd werd: op het pipeline-bord
 *     (flex) klapte het vlak in tot 42px van 1164px, en in de rasters van
 *     AI-beeld tot een enkele cel van 117px van 1121px. Het stond er wel, maar
 *     je zag het niet. Zonder deze twee regels is de placeholder er voor de
 *     vorm en niet voor de gebruiker.
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
/* Commentaar eruit: dit bestand legt zijn eigen keuzes uit met de woorden die
   het verbiedt, en een test die zijn eigen uitleg leest keurt zichzelf goed. */
const code = dash.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('\n  er is een gedeelde laadstaat');
{
  ck('laadvlak() bestaat', /const laadvlak = \(vorm, aantal\) =>/.test(code));
  ck('en wordt op meerdere schermen gebruikt',
    (code.match(/\$\{laadvlak\(/g) || []).length >= 12,
    (code.match(/\$\{laadvlak\(/g) || []).length);

  /* De drie vormen. Een lijst, een raster en het bord hebben elk een andere
     omtrek; een enkele generieke balk zou de sprong niet wegnemen. */
  for (const vorm of ['rij', 'tegel', 'kolom']) {
    ck("de vorm '" + vorm + "' wordt gebruikt", code.indexOf("laadvlak('" + vorm + "'") !== -1);
  }
}

console.log('\n  geen los "Laden..." meer in de opgebouwde pagina');
{
  /* Alleen wat de server als HTML uitstuurt telt. De sleutel mag bestaan --
     hij zit in de verborgen tekst -- maar niet meer als zichtbaar element. */
  const zichtbaar = [];
  const patronen = [
    /<div[^>]*>\$\{T\('dash\.loading'\)\}<\/div>/g,
    /<div[^>]*>\$\{T\('pipe\.loading'\)\}<\/div>/g,
    /<div[^>]*>\$\{T\('pi\.styles\.load'\)\}<\/div>/g,
    /<td[^>]*>\$\{T\('dash\.loading'\)\}<\/td>/g,
  ];
  for (const p of patronen) {
    const m = code.match(p);
    if (m) zichtbaar.push.apply(zichtbaar, m.map((x) => x.slice(0, 90)));
  }
  ck('geen enkel zichtbaar laad-woord over', zichtbaar.length === 0, zichtbaar);

  /* De lege-staat mag niet meer voor "aan het laden" gebruikt worden -- dat
     was het verschil dat verdween. */
  ck('.pi-empty wordt niet meer als laadstaat gebruikt',
    !/class="pi-empty"[^>]*>\$\{T\('(dash\.loading|pi\.styles\.load)'\)\}/.test(code));
  ck('.cal-sidebar-empty ook niet',
    !/class="cal-sidebar-empty">\$\{T\('dash\.loading'\)\}/.test(code));
}

console.log('\n  het blijft hoorbaar voor wie niet kijkt');
{
  ck('elk laadvlak zegt aria-busy', /class="laadvlak laadvlak--' \+ vorm \+ '" aria-busy="true" role="status"/.test(code));
  ck('en draagt de tekst mee', /alleen-voorlezen">' \+ T\('dash\.loading'\)/.test(code));

  const sr = /\.alleen-voorlezen \{([^}]*)\}/.exec(code);
  ck('.alleen-voorlezen bestaat', !!sr);
  /* display:none en visibility:hidden halen het uit de voorleesvolgorde. Dan
     is er alsnog niets te horen en is de klasse erger dan niets, want hij
     wekt de indruk dat het geregeld is. */
  ck('en verbergt uit beeld, niet uit de voorleesboom',
    sr && !/display:\s*none/.test(sr[1]) && !/visibility:\s*hidden/.test(sr[1]),
    sr && sr[1].trim());

  /* De KPI-kaarten hadden de shimmer al; daar stond het woord er alleen
     bovenop, twaalf keer. De kaart zegt het nu zelf. */
  ck('de KPI-kaarten melden het via aria-busy',
    (code.match(/<div class="stat-card" aria-busy="true">/g) || []).length === 12,
    (code.match(/<div class="stat-card" aria-busy="true">/g) || []).length);
}

console.log('\n  het vlak vult zijn bak');
{
  const regel = /\.laadvlak \{([^}]*)\}/.exec(code);
  ck('.laadvlak is gedefinieerd', !!regel);
  /* Zonder flex-groei klapte hij op het pipeline-bord in tot 42px. */
  ck('groeit mee in een flex-bak', regel && /flex:\s*1/.test(regel[1]), regel && regel[1].trim());
  /* Zonder dit nam hij in de rasters van AI-beeld een enkele cel. */
  ck('spant de volle rij in een raster', regel && /grid-column:\s*1 \/ -1/.test(regel[1]), regel && regel[1].trim());

  /* De kolomvorm hoort even breed te zijn als een ECHTE pipeline-kolom
     (.pipeline-col is flex: 0 0 260px). Met flex:1 kromp de plaatshouder mee
     tot 79px op een telefoon, terwijl er daarna kolommen van 260px komen die
     het bord horizontaal laten scrollen -- dan belooft de plaatshouder een
     andere indeling dan wat er komt, en dat is net wat een plaatshouder-op-vorm
     hoort te voorkomen. */
  const kolom = /\.laad-kolom \{([^}]*)\}/.exec(code);
  const echt  = /\.pipeline-col \{([^}]*)\}/.exec(code);
  ck('.laad-kolom bestaat', !!kolom);
  const breedtePlaatshouder = kolom && /flex:\s*0 0 (\d+)px/.exec(kolom[1]);
  const breedteEcht         = echt  && /flex:\s*0 0 (\d+)px/.exec(echt[1]);
  ck('en is even breed als een echte kolom',
    breedtePlaatshouder && breedteEcht && breedtePlaatshouder[1] === breedteEcht[1],
    { plaatshouder: breedtePlaatshouder && breedtePlaatshouder[1], echt: breedteEcht && breedteEcht[1] });

  /* Bouwt voort op .skeleton, dat al netjes stilvalt bij prefers-reduced-motion.
     Een eigen animatie zou die uitzondering opnieuw moeten regelen -- en dat is
     precies het soort ding dat je vergeet. */
  ck('gebruikt de bestaande .skeleton', /class="skeleton laad-/.test(code));
  ck('en .skeleton valt stil bij reduced-motion',
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,200}\.skeleton, \.skeleton::after \{ animation: none/.test(code));
}

console.log('\n  en het stopt als er niets komt');
{
  const fn = /function stopSkeletten\(\) \{[\s\S]*?\n\}/.exec(code);
  ck('stopSkeletten bestaat', !!fn);
  const b = fn ? fn[0] : '';

  /* Een laadvlak is meer dan zijn balken. Ging de losse-balken-lus er eerst
     overheen, dan zette die het omhulsel bij de EERSTE balk op een streepje en
     werkte daarna op knopen die al uit de pagina waren. Vandaar: eerst het
     vlak in zijn geheel, daarna pas de losse balken. */
  ck('ruimt het hele laadvlak op', /querySelectorAll\('\.laadvlak'\)/.test(b));
  ck('en doet dat VOOR de losse balken',
    b.indexOf(".laadvlak'") !== -1 && b.indexOf(".skeleton'") !== -1
      && b.indexOf(".laadvlak'") < b.indexOf(".skeleton'"));
  ck('zet er iets leesbaars voor in de plaats', /laad-mislukt/.test(b));

  /* Blijft aria-busy staan, dan meldt een schermlezer eeuwig dat er nog iets
     loopt terwijl het al is opgegeven. */
  ck('zet aria-busy uit', /aria-busy['"]?,\s*['"]false['"]/.test(b));

  /* Dit ging een keer stil kapot. De naam van een KPI-kaart WAS het woord
     "Laden..."; toen die naam zelf een balk werd was de tekst leeg, matchte de
     oude test niets meer, en bleef er "—" boven "—" staan -- zes kaarten
     zonder dat je nog zag welke meting ontbrak. Gemeten in de browser op een
     build met de oude check: alle zes labels "—". */
  const lab = /querySelectorAll\('\.stat-label'\)[\s\S]{0,400}?\n  \}\);/.exec(b);
  ck('de KPI-naam valt terug op tekst, niet op een streepje',
    lab && /t === '—'/.test(lab[0]) && /Niet opgehaald/.test(lab[0]),
    lab && lab[0].slice(0, 200));
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
