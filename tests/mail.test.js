/*
 * Er is nog maar één weg voor e-mail, en die moet luid falen.
 *
 * ── Wat er veranderde ───────────────────────────────────────────────────────
 * Mail liep via SMTP met Resend als automatische terugval. Resend is eruit.
 *
 * Dat is een bewuste keuze, maar hij heeft een scherpe rand: een ontbrekende
 * SMTP_*-variabele werd vroeger opgevangen. Nu komt er dan geen mail meer aan
 * -- en dit zijn verificatiemails en wachtwoordherstel. Precies het soort
 * bericht waarvan niemand merkt dat het ontbreekt, behalve de klant die niet
 * binnen raakt en gewoon weggaat.
 *
 * Daarom toetst dit bestand niet of Resend weg is (dat is triviaal), maar of
 * het GAT dat hij achterlaat hard schreeuwt in plaats van stil te zijn.
 */
'use strict';

const fs   = require('fs');
const BASE = require('path').join(__dirname, '..') + '/';
const src  = fs.readFileSync(BASE + 'api/_mailer.js', 'utf8');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 220)}`);
  ok ? pass++ : fail++;
};

console.log('\nE-mail heeft nog één weg');

console.log('\n  Resend is er echt uit');
for (const rest of ['api.resend.com', 'RESEND_API_KEY', 'RESEND_FROM']) {
  ck(`geen ${rest} meer in de mailer`, src.indexOf(rest) === -1, null);
}
ck('en ook niet meer in de diagnostiek',
  fs.readFileSync(BASE + 'api/admin.js', 'utf8').indexOf('RESEND_API_KEY') === -1, null);
ck('noch in de kostenmodule',
  fs.readFileSync(BASE + 'api/_kosten.js', 'utf8').indexOf('RESEND_API_KEY') === -1, null);

console.log('\n  het gat dat hij achterlaat is luid');
ck('een ontbrekend transport wordt als FOUT gelogd, niet stil geslikt',
  /console\.error\('\[mailer\] GEEN MAILTRANSPORT/.test(src), null);
ck('en de melding noemt WELKE instelling ontbreekt',
  /\['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'\]\.filter/.test(src), null);
ck('ze zegt ook wat de gevolgen zijn, niet alleen dat er iets mist',
  /verificatiemails en/.test(src) && /komen nu niet aan/.test(src), null);

console.log('\n  en het blokkeert nooit een verzoek');
ck('sendMail geeft een resultaat terug in plaats van te gooien',
  /return \{ ok: false, error: 'geen mailtransport geconfigureerd/.test(src), null);
ck('de foutmelding noemt de drie variabelen die je moet zetten',
  /zet SMTP_HOST, SMTP_USER en SMTP_PASS/.test(src), null);

/* SMTP blijft de primaire en enige weg: als iemand die eruit sloopt, is er
   niets meer over. */
console.log('\n  SMTP staat er nog');
ck('nodemailer wordt nog gebruikt', /require\('nodemailer'\)/.test(src), null);
ck('en een geslaagde verzending meldt via: smtp',
  /return \{ ok: true, via: 'smtp'/.test(src), null);

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
