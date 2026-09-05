/*
 * Accenttekst staat bijna nooit op wit.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * In het lichte thema zaten 32 stukjes tekst onder 4,5:1, en ze hadden
 * ALLEMAAL dezelfde kleur: --accent-ink. Dat was #8A6A33, en het commentaar
 * erboven vertelde precies hoe het zo gekomen was -- "sand as type on white is
 * ~1.7:1, this deeper bronze is the brand's answer". Op wit klopte het ook:
 * 5,01:1.
 *
 * Alleen staat accenttekst zelden op wit. Hij staat op --bg-card-alt en de
 * andere warme tinten eromheen, en die zijn donkerder dan wit:
 *
 *   op #FFFFFF                  5,01:1   waar op gemeten was
 *   op #EEE9DE (--bg-card-alt)  4,14:1   waar hij echt staat
 *   op #EDE7D9                  4,07:1
 *   op #F3EDE0 t/m #F5F1E8      4,30 - 4,45:1
 *
 * Meet tegen het vlak waar de tekst ECHT op staat -- dezelfde les die elders
 * in dit bestand al drie keer in een commentaar staat.
 *
 * Wat hier bewaakt wordt: de kleur haalt 4,5:1 op ELK vlak waar accenttekst
 * op landt, niet alleen op de gunstigste. Met marge, want "net erboven"
 * betekent dat de volgende kleine tintwijziging hem er weer onder duwt.
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
const kanaal = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => { const [r, g, b] = rgb(h).map(kanaal); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ct  = (a, b) => { const A = lum(a), B = lum(b); return +((Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05)).toFixed(2); };

const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
const code = dash.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('\n  de accentinkt haalt het op elk vlak waar hij landt');
{
  /* Het lichte blok, niet het donkere: daar is --accent-ink zand op donker en
     gelden andere getallen. */
  const lichtBlok = /\[data-theme="light"\] \{([\s\S]*?)\n\}/.exec(code);
  ck('het lichte themablok is te vinden', !!lichtBlok);
  const m = lichtBlok && /--accent-ink:\s*(#[0-9A-Fa-f]{6})/.exec(lichtBlok[1]);
  ck('en zet --accent-ink', !!m, m && m[1]);

  const inkt = m && m[1].toUpperCase();
  /* De vlakken zijn niet verzonnen: dit zijn de samengestelde achtergronden
     die in de browser onder accenttekst gemeten zijn, op alle schermen. */
  const vlakken = ['#FFFFFF', '#EEE9DE', '#EDE7D9', '#F3EDE0', '#F4EFE3', '#F4F0E5', '#F5F1E7', '#F5F1E8'];
  if (inkt) {
    const scores = vlakken.map((v) => ({ vlak: v, ct: ct(inkt, v) }));
    const laagste = Math.min(...scores.map((s) => s.ct));
    ck('haalt 4,5:1 op alle acht de vlakken', laagste >= 4.5, { inkt, laagste, scores });
    /* Met marge. #8A6A33 haalde 5,01 op wit en zakte naar 4,07 op een tint;
       een kleur die precies op 4,5 zit is de volgende tintwijziging kwijt. */
    ck('en met marge, niet nipt', laagste >= 4.75, { inkt, laagste });
    /* Niet te ver doorgeschoten: dan is het geen accent meer maar tekstkleur. */
    ck('maar het blijft een accent, geen gewone tekst', ct(inkt, '#FFFFFF') <= 8, { opWit: ct(inkt, '#FFFFFF') });
  }
}

console.log('\n  de zijbalk is niet stiekem meegegaan');
{
  /* De zijbalk is in BEIDE thema's donker en herbindt zijn eigen tokens.
     Herbindt hij --accent-ink NIET, dan erft hij de lichte (donkere) waarde
     op een donker vlak. Nagekeken in de browser: er staat daar geen enkele
     accenttekst, dus dat is nu goed -- maar als iemand er ooit wel wat
     neerzet, hoort dat op te vallen. */
  const sb = /\.sidebar \{([\s\S]*?)\n\}/.exec(code);
  ck('.sidebar herbindt zijn tokenset', !!sb && /--text-muted:/.test(sb[1]));
  ck('maar (nog) niet --accent-ink -- geen accenttekst daarbinnen',
    sb && !/--accent-ink:/.test(sb[1]));
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
