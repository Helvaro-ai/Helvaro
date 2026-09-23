/*
 * DECISION op een eigen regel werd nooit gelezen (tot 2026-09-23).
 *
 * De prompt vraagt het model DECISION:{...} op een EXTRA aparte regel te
 * zetten. In runAI() stond de vangregel die stuurregels wegknipt VOOR de
 * DECISION-parser -- dus het blok was al weg voordat iemand het zocht. Gevolg:
 * done/qualified/reason/escalate kwamen nooit door; een gekwalificeerde lead
 * bleef 'in_progress' en een escalatie werd geen escalatie.
 *
 * Deze test knipt het echte parseerblok uit api/whatsapp.js (dezelfde ankers
 * als tests/afzeggen-gesprek.test.js) en voert het uit.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`);
  ok ? pass++ : fail++;
};

const bron = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');
const i = bron.indexOf('  // 1. Pull out the running SUMMARY:{...} line (present on every turn).');
const j = bron.indexOf('  return { done: false, message: cleaned, summary: runningSummary, appointment, cancel');
ck('parseerblok gevonden', i !== -1 && j > i, { i, j });
const eind = bron.indexOf('\n', j);
const blok = bron.slice(i, eind);
/* Het blok verwijst naar module-variabelen (_wens, _koop, _project, _lang...);
   die geven we mee als parameters met dezelfde naam. */
const _wens = require(BASE + 'api/_wens.js');
const _koop = require(BASE + 'api/_koop.js');
const _project = require(BASE + 'api/_project.js');
const _dealerBoeking = require(BASE + 'api/_dealer-boeking.js');
const parse = new Function('raw', 'ctx', '_wens', '_koop', '_project', '_dealerBoeking', blok);
const run = (raw) => parse(raw, {}, _wens, _koop, _project, _dealerBoeking);

console.log('\nDECISION op een eigen regel');
let r = run('Top, ik geef het door aan de verkoper.\nSUMMARY:{"summary":"Zoekt BMW X5"}\nDECISION:{"qualified":true,"reason":"budget ok","ability":"high","urgency":"high","fit":"good","leadScore":8}');
ck('done wordt true', r.done === true, r);
ck('qualified komt door', r.qualified === true, r.qualified);
ck('reason komt door', r.reason === 'budget ok', r.reason);
ck('de lead ziet geen DECISION', !/DECISION/.test(r.message), r.message);
ck('de lead ziet geen SUMMARY', !/SUMMARY/.test(r.message), r.message);
ck('de gewone tekst blijft', /verkoper/.test(r.message), r.message);

console.log('\nescalatie komt door');
r = run('Daar moet ik even navragen bij het team.\nDECISION:{"qualified":false,"escalate":true,"question":"garantie?"}');
ck('escalate true', r.escalate === true, r);
ck('done true (finale beurt)', r.done === true);

console.log('\nkapotte DECISION lekt niet');
r = run('Prima.\nDECISION:{kapot');
ck('geen crash, done false', r.done === false, r);
ck('en de regel is weg', !/DECISION/.test(r.message), r.message);

console.log('\ngewone beurt zonder DECISION');
r = run('Welke kleur zoek je?\nSUMMARY:{"summary":"x"}');
ck('done false', r.done === false);
ck('bericht schoon', r.message === 'Welke kleur zoek je?', r.message);

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
