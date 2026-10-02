/*
 * Het leadpaneel kan dicht gaan terwijl een opslag nog loopt (Escape, een klik
 * ernaast, een andere lead). Na de await was state.activeLead dan null en gaf
 * "Cannot read properties of null" -- terwijl het opslaan zelf gelukt was, dus
 * de gebruiker zag een foutmelding bij een geslaagde actie. Elke schrijfactie
 * op state.activeLead moet daarom bewaakt zijn.
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'dashboard.js'), 'utf8');
console.log('\nLeadpaneel: opslaan terwijl het paneel sluit');
const writes = src.split('\n').filter((l) => /state\.activeLead\.[A-Za-z]+\s*=[^=]/.test(l));
ck('er zijn schrijfacties om te controleren', writes.length >= 5, writes.length);
const onbewaakt = writes.filter((l) => !/if \(state\.activeLead\)/.test(l));
ck('elke schrijfactie is bewaakt', onbewaakt.length === 0, onbewaakt.map((l) => l.trim()));
ck('parseNotities verdraagt een lege lead', /\(\(lead && lead\.notities\) \|\| ''\)/.test(src));

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
