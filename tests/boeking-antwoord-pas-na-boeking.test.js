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

console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
process.exit(fail === 0 ? 0 : 1);
