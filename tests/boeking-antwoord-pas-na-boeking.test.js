/*
 * L-02: het AI-antwoord ("Ingepland, tot dan") mag pas uit NADAT de boeking
 * (slot + agenda + voertuigclaim) gelukt is. Bij een botsing krijgt de lead
 * alleen het conflictbericht. Structuurtest op api/whatsapp.js, zoals
 * dubbelboeking-whatsapp.test.js.
 */
'use strict';
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ck = (n, ok, c) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`); if (!ok && c !== undefined) console.log('        ' + String(c).slice(0, 300)); ok ? pass++ : fail++; };
const b = fs.readFileSync(path.join(__dirname, '..', 'api', 'whatsapp.js'), 'utf8');

const sendIdx = b.indexOf('const sendOk = ');
const sendRegel = b.slice(sendIdx, b.indexOf('\n', sendIdx));
ck('het antwoord wordt bij een wachtende boeking niet direct verstuurd',
   /antwoordInWachtrij \? true : await sendWA\(phone, replyText/.test(sendRegel), sendRegel);

const apptIdx = b.indexOf('const apptResult = await createAppointment(');
const flushIdx = b.indexOf('await stuurAntwoordInWachtrij();   // L-02: pas NU');
ck('het antwoord gaat pas uit na een geslaagde createAppointment', apptIdx > -1 && flushIdx > apptIdx, [apptIdx, flushIdx]);

const slot = b.slice(b.indexOf('if (slotTaken) {'), b.indexOf('if (slotTaken) {') + 200);
ck('botsend slot laat het antwoord vallen', /await schrapAntwoordInWachtrij\(/.test(slot), slot);
const mis = b.slice(b.indexOf('async function meldMislukteBoeking'), b.indexOf('async function meldMislukteBoeking') + 200);
ck('mislukte boeking laat het antwoord vallen', /await schrapAntwoordInWachtrij\(/.test(mis), mis);
ck('voertuig niet boekbaar laat het antwoord vallen',
   /voertuig niet boekbaar[^\n]*\n\s*await schrapAntwoordInWachtrij\(/.test(b));
ck('race verloren laat het antwoord vallen', /dealerVerloren = true;\s*\n\s*await schrapAntwoordInWachtrij\(/.test(b));
ck('geen boeking geprobeerd: het antwoord gaat alsnog uit (voor 11c)',
   b.indexOf('await stuurAntwoordInWachtrij();\n\n  // 11c.') > -1);

// Het geschrapte antwoord staat al in Conversation History (stap 10 bewaart vóór
// de boeking). Het moet daar vervangen worden door de correctie, anders leest de
// AI de volgende beurt dat hij "Ingepland" bevestigde.
const schrap = b.slice(b.indexOf('async function schrapAntwoordInWachtrij'), b.indexOf('async function schrapAntwoordInWachtrij') + 900);
ck('schrappen herschrijft de assistent-beurt in de geschiedenis',
   /history\[i\] = \{ \.\.\.history\[i\], content: String\(correctie/.test(schrap) && /'Conversation History': JSON\.stringify\(history\)/.test(schrap), schrap.slice(0, 300));
ck('geen kale antwoordInWachtrij = false meer buiten de helpers', (b.match(/antwoordInWachtrij = false;/g) || []).length === 2);

// Review 2026-10-09: vangnet bij een fout tussen vasthouden en versturen.
ck('processMessage krijgt een nood-object', /async function processMessage\(phone, text, scopedProjectCode, inkomendId, nood = \{\}\)/.test(b));
const red = b.slice(b.indexOf('nood.redding = async'), b.indexOf('nood.redding = async') + 500);
ck('redding: afspraak staat -> antwoord alsnog', /if \(afspraakStaat\) \{ await stuurAntwoordInWachtrij\(\); return; \}/.test(red), red.slice(0, 200));
ck('redding: geen afspraak -> correctie, geen Ingepland', /schrapAntwoordInWachtrij\(correctie\)/.test(red) && /sendWA\(phone, correctie/.test(red));
ck('afspraakStaat wordt gezet vlak voor de geslaagde flush', /afspraakStaat = true;\s*\n\s*await stuurAntwoordInWachtrij\(\);   \/\/ L-02: pas NU/.test(b));
ck('de aanroeper roept de redding aan bij een fout', /\.catch\(async \(err\) => \{\s*\n[\s\S]{0,300}nood\.redding\(\)/.test(b));
ck('lead heeft al een afspraak: geen Ingepland, wel de melding',
   /lead heeft al een afspraak lopen[^\n]*\n[\s\S]{0,400}schrapAntwoordInWachtrij\(alGepland\)/.test(b));
const _lang = require(path.join(__dirname, '..', 'api', '_lang.js'));
ck('al-gepland-melding in nl/fr/en/de', ['nl', 'fr', 'en', 'de'].every(t => _lang.buildAlreadyBookedMessage(t).length > 20) && _lang.buildAlreadyBookedMessage('nl') !== _lang.buildAlreadyBookedMessage('en'));
// dedupe-sleutel overleeft het logmasker (geen 8+ cijfers op rij)
const dd = b.slice(b.indexOf('const dedupeRef ='), b.indexOf('const dedupeRef =') + 260);
ck('dedupe-sleutel zonder telefoonnummer en zonder cijferreeksen', !/\$\{phone\}/.test(dd) && /ghijklmnop/.test(dd), dd);

console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
process.exit(fail === 0 ? 0 : 1);
