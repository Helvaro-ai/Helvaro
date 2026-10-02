'use strict';
/*
 * Het inlogscherm: beweging die je kunt stoppen en tekst die leesbaar is
 * (audit 26/09, WCAG 2.2.2 en 1.4.3).
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
let pass = 0, fail = 0;
const ck = (n, ok) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`); ok ? pass++ : fail++; };
const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
const css = fs.readFileSync(BASE + 'api/_dash/styles.js', 'utf8');
const i18n = fs.readFileSync(BASE + 'api/_i18n.js', 'utf8');

/* WCAG 2.2.2: beweging die uit zichzelf doorloopt moet te pauzeren. De eenvoudigste
   manier om daaraan te voldoen is er geen te hebben: de diavoorstelling wisselt
   alleen op een klik. Dat is ook wat de pagina op een trage laptop licht houdt. */
const slideshow = (dash.match(/function initLoginSlideshow\(\) \{[\s\S]*?\n\}\n/) || [''])[0];
ck('de diavoorstelling bestaat', slideshow.length > 100);
ck('en loopt niet uit zichzelf door (geen timer)', !/setInterval|setTimeout|requestAnimationFrame/.test(slideshow.replace(/\/\*[\s\S]*?\*\//g, '')));
ck('er is geen pauzeknop meer, want er is niets om te pauzeren', !/brand-pauze/.test(dash) && !/brand-pauze/.test(css));
ck('de dia\'s fade en schuiven niet meer', /#login-page \.brand-slide \{[^}]*transition: none/.test(css));
ck('geen oneindige animatie op het inlogscherm', !/#login-page[^{]*\{[^}]*animation:[^;}]*infinite/.test(css));
const blok = (css.match(/#clerk-toggle \{[\s\S]*?\}/) || [''])[0];
ck('de tekst onder het inlogvak gebruikt geen --text-disabled meer', /color: var\(--text-secondary\)/.test(blok) && !/text-disabled/.test(blok.replace(/\/\*[\s\S]*?\*\//g, '')));

/* De echte kleuren narekenen: --text-muted-c tegen de kaartachtergrond. */
function lum(hex) { const c = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function contrast(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
const muted = [...css.matchAll(/--text-muted-c:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]);
const kaart = [...css.matchAll(/--bg-card:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]);
if (muted.length && kaart.length) {
  const paren = muted.map((m, i) => contrast(m, kaart[Math.min(i, kaart.length - 1)]));
  ck('--text-muted-c haalt 4,5:1 op de kaartachtergrond (' + paren.map((x) => x.toFixed(2)).join(', ') + ')', paren.every((x) => x >= 4.5));
}
console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
