#!/usr/bin/env node
'use strict';
/*
 * Alle tests, met een exitcode die klopt.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * Er was geen runner. Ik draaide de map steeds met een node -e eenregelaar, en
 * op 2026-09-07 ging dat mis op precies de manier waarop dat misgaat: die
 * eenregelaar PRINTTE "groen: 105 / 106" en gaf zelf exit 0 terug, waardoor de
 * `&& git commit` erachter gewoon doorliep. Een rode test is toen mee de
 * geschiedenis in gegaan.
 *
 * De les zit niet in "beter opletten" maar in de exitcode. Een controle die de
 * uitkomst alleen op het scherm zet, is geen controle -- alles wat erachter
 * hangt gelooft nog steeds dat het goed ging.
 *
 * Draaien:  node tests/run-all.js
 *           node tests/run-all.js taal          (alleen bestanden met 'taal')
 */
const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const HIER   = __dirname;
const filter = process.argv[2] || '';
const bestanden = fs.readdirSync(HIER)
  .filter((f) => f.endsWith('.test.js'))
  .filter((f) => !filter || f.indexOf(filter) > -1)
  .sort();

if (!bestanden.length) {
  console.error('Geen testbestanden gevonden' + (filter ? ' voor "' + filter + '"' : '') + '.');
  process.exit(1);
}

const start = Date.now();
const stuk = [];
let ok = 0;

for (const f of bestanden) {
  try {
    execFileSync(process.execPath, [path.join(HIER, f)], { stdio: 'pipe', timeout: 120000 });
    ok++;
    process.stdout.write('.');
  } catch (e) {
    stuk.push({ bestand: f, uit: String(e.stdout || '') + String(e.stderr || '') });
    process.stdout.write('x');
  }
  if ((ok + stuk.length) % 60 === 0) process.stdout.write('\n');
}

const sec = ((Date.now() - start) / 1000).toFixed(1);
console.log('\n\n  ' + ok + ' groen, ' + stuk.length + ' rood  (' + bestanden.length + ' bestanden, ' + sec + 's)');

/* De uitvoer van wat FAALDE tonen, en niet van wat slaagde: als er iets rood
   is, is dat het enige wat je wil lezen. */
for (const s of stuk) {
  console.log('\n══ ' + s.bestand + ' ' + '═'.repeat(Math.max(0, 66 - s.bestand.length)));
  const regels = s.uit.split('\n').filter((r) => /FOUT|Error|error:|at /.test(r));
  console.log((regels.length ? regels.slice(0, 14) : s.uit.split('\n').slice(-14)).join('\n'));
}

process.exit(stuk.length ? 1 : 0);
