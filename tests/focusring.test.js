/*
 * Waar ben ik, als ik niet klik?
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * Met een ECHTE Tab-toets gemeten -- programmatische focus telt in Chrome niet
 * als :focus-visible en geeft dus een vals beeld. Wat er toen te zien was:
 *
 *   .btn-icon          zandring van de app          goed
 *   .nav-item          eigen ring van de app        goed
 *   .ap-chip           Chrome's eigen ring #F5ECD7
 *   .ap-btn / .fm-btn  Chrome's eigen ring #121212  op een donkere kaart
 *                                                   1,27:1 -- onzichtbaar
 *   .cal-nav-btn       Chrome's eigen ring, oranje
 *
 * Drie verschillende ringen, waarvan een die je op de helft van de app niet
 * ziet. Op "Je assistent" staan tien chips, acht knoppen en vijf tekstvelden
 * achter elkaar; wie daar met het toetsenbord doorheen gaat raakt kwijt waar
 * hij is.
 *
 * Wat hier bewaakt wordt:
 *
 *  1. DE VLOER HEEFT SPECIFICITEIT NUL. :where() is geen detail maar de hele
 *     truc: elke bestaande focusregel moet hier gewoon van winnen, zodat
 *     .btn-icon en .nav-image hun eigen ring houden. Wordt :where() ooit
 *     weggehaald, dan overschrijft deze regel alles wat er al was.
 *
 *  2. DE KLEUR VERSCHILT PER THEMA, EN DAT MOET. Zand haalt 10-13:1 op de
 *     donkere vlakken en 1,3:1 op de lichte. Er bestaat geen enkele kleur die
 *     het op alle zes de vlakken haalt -- nagerekend. Vandaar een token.
 *
 *  3. HET IS OUTLINE EN GEEN BOX-SHADOW. box-shadow zou de eigen schaduw van
 *     een element tijdens focus vervangen, en outline doet niets met layout.
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
/* Dit bestand en de bron leggen hun keuzes uit met dezelfde woorden die ze
   bewaken. Commentaar eruit, anders keurt de test de uitleg goed. */
const code = dash.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── contrast, om de tokens NA te rekenen in plaats van ze te geloven ──── */
const kanaal = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const hex2 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => { const [r, g, b] = hex2(h).map(kanaal); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ct  = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };

console.log('\n  er is een vloer voor de focusring');
{
  const regel = /:where\(button, a\[href\], input, select, textarea, summary,[\s\S]{0,120}?\):focus-visible \{([^}]*)\}/.exec(code);
  ck('de regel bestaat', !!regel);
  ck('en gebruikt outline, niet box-shadow',
    regel && /outline:\s*2px solid/.test(regel[1]) && !/box-shadow/.test(regel[1]),
    regel && regel[1].trim());
  ck('met een offset, zodat hij niet tegen de rand plakt',
    regel && /outline-offset:\s*2px/.test(regel[1]));

  /* Zonder :where() is de specificiteit niet nul en verliest elke bestaande
     focusregel. Dat zou de ringen die WEL goed waren kapotmaken. */
  ck('de selector staat in :where() -- specificiteit nul',
    /:where\(button, a\[href\]/.test(code));

  /* [tabindex="-1"] hoort er niet bij: dat is programmatische focus, geen
     tabstop, en die krijgt terecht geen ring.

     Op de HELE bron kijken was hier waardeloos -- dezelfde selector staat nog
     twee keer in het bestand, in de focus-trap van de modals. Een mutatie die
     hem uit DEZE regel haalde bleef daardoor groen. Dus op de selector van de
     regel zelf. */
  const sel = /(:where\(button, a\[href\][\s\S]{0,160}?\):focus-visible)\s*\{/.exec(code);
  ck('en slaat tabindex="-1" over',
    sel && /\[tabindex\]:not\(\[tabindex="-1"\]\)/.test(sel[1]),
    sel && sel[1]);
}

console.log('\n  de kleur klopt op elk vlak waar hij kan landen');
{
  const donker = /--focus-ring:\s*(#[0-9A-Fa-f]{6})/.exec(code);
  ck('er is een --focus-ring token', !!donker);

  const alle = [...code.matchAll(/--focus-ring:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]);
  /* Drie plekken: :root (donker), [data-theme="light"], en .sidebar -- die
     laatste omdat de zijbalk in BEIDE thema's donker blijft. */
  ck('en hij is per context gezet', alle.length === 3, alle);

  const donkereVlakken = ['#14120E', '#2A2824', '#181409'];
  const lichteVlakken  = ['#F6F3EC', '#FFFFFF', '#EEE9DE'];

  const zand = alle.filter((c) => ct(c, '#14120E') > 5);
  const goud = alle.filter((c) => ct(c, '#F6F3EC') >= 3);
  ck('de donkere ring bestaat', zand.length >= 1, alle);
  ck('de lichte ring bestaat', goud.length === 1, alle);

  /* WCAG 1.4.11: een niet-tekstuele indicator heeft 3:1 nodig. Dit is geen
     formaliteit -- op 1,27:1 is de ring er wel en zie je hem niet. */
  if (zand.length) {
    const laagste = Math.min(...donkereVlakken.map((v) => ct(zand[0], v)));
    ck('donkere ring haalt 3:1 op elk donker vlak', laagste >= 3, { ring: zand[0], laagste: +laagste.toFixed(2) });
  }
  if (goud.length) {
    const laagste = Math.min(...lichteVlakken.map((v) => ct(goud[0], v)));
    ck('lichte ring haalt 3:1 op elk licht vlak', laagste >= 3, { ring: goud[0], laagste: +laagste.toFixed(2) });
    /* Met marge, niet net erboven. #9E8242 haalde 3,03:1 op kaart-alt en dat
       is te krap voor iets waarop je moet kunnen zien waar je bent. */
    ck('en met marge, niet nipt', laagste >= 3.4, { ring: goud[0], laagste: +laagste.toFixed(2) });
  }

  /* Het omgekeerde ook: als iemand ooit één kleur voor beide thema's zet,
     valt de helft van de app terug op onzichtbaar. */
  if (zand.length && goud.length) {
    ck('de twee ringen zijn niet dezelfde kleur', zand[0].toUpperCase() !== goud[0].toUpperCase());
  }
}

console.log('\n  en of er iets gebeurde toen je drukte');
{
  const regel = /:where\(button, \[role="button"\], a\[class\*="btn"\]\):active[^{]*\{([^}]*)\}/.exec(code);
  ck('er is een vloer voor drukterugkoppeling', !!regel);
  /* Eén pixel omlaag: precies wat .nav-item al deed. Dit maakt er de huisregel
     van in plaats van een uitzondering. */
  ck('een duwtje van een pixel', regel && /transform:\s*translateY\(1px\)/.test(regel[1]), regel && regel[1].trim());
  /* Een knop die niets doet hoort ook niet te bewegen -- dat zou juist zeggen
     dat er wél iets gebeurde. */
  ck('behalve als de knop uitstaat',
    /\):active:not\(:disabled\):not\(\[aria-disabled="true"\]\)/.test(code));
  /* Zonder :where() wint deze regel van de dertien knoppen die al een eigen
     :active hebben, en dan verdwijnt juist het werk dat er al goed was. */
  ck('ook hier specificiteit nul', /:where\(button, \[role="button"\], a\[class\*="btn"\]\):active/.test(code));
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
