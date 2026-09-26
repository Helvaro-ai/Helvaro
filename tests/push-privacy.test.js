'use strict';
/*
 * Pushmeldingen tonen geen persoonsgegevens (audit 26/09).
 *
 * Een pushmelding staat op het vergrendelscherm van de dealer, zichtbaar voor
 * wie er naast staat. De teksten push.* en meld.* in api/_i18n.js mogen dus geen
 * naam, onderwerp of berichttekst invullen; een tijdstip of aantal mag wel.
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got).slice(0, 240)}`); ok ? pass++ : fail++; };

const bron = fs.readFileSync(BASE + 'api/_i18n.js', 'utf8');
const regels = bron.split('\n').filter((r) => /^\s*'(push|meld)\.[a-z0-9.]+':/.test(r));
ck('er zijn pushteksten gevonden', regels.length >= 8, regels.length);
const VERBODEN = /\{(naam|name|onderwerp|subject|bericht|message|tekst|telefoon|phone|email)\}/;
const fout = regels.filter((r) => VERBODEN.test(r)).map((r) => r.trim().slice(0, 90));
ck('geen enkele pushtekst vult een naam, onderwerp of bericht in', fout.length === 0, fout);

/* De afzenders geven ook geen naam meer mee als variabele. */
for (const f of ['api/_assistent.js', 'api/_webboeking.js', 'api/_email/mailbox.js']) {
  const s = fs.readFileSync(BASE + f, 'utf8');
  const blok = (s.match(/stuurVertaald\(\{[\s\S]{0,400}?\}\)/g) || []).join('\n');
  ck(`${f}: stuurVertaald krijgt geen naam mee`, !/naam\s*:/.test(blok), blok.slice(0, 200));
}
console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
