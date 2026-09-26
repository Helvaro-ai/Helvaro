'use strict';
/*
 * Geen volledige telefoonnummers of e-mailadressen in de logs (audit 26/09).
 *
 * api/whatsapp.js had een maskPhone(), maar ~25 console-regels gebruikten hem
 * niet. Deze test leest de bron en weigert een console-regel waarin een
 * telefoon- of mailvariabele ruw in de tekst staat.
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got).slice(0, 300)}`); ok ? pass++ : fail++; };

const { maskPhone, maskEmail } = require(BASE + 'api/_masker.js');
ck('maskPhone houdt de laatste vier cijfers', maskPhone('+32470123456') === '********3456', maskPhone('+32470123456'));
ck('maskEmail houdt de eerste letter en het domein', maskEmail('sarah@voorbeeld.be') === 's***@voorbeeld.be', maskEmail('sarah@voorbeeld.be'));
ck('maskEmail op iets zonder @', maskEmail('geen-adres') === '***' && maskEmail('') === '');

const RUW_TEL = /\$\{(phone|to|ownerPhone|waPhone|notifyPhone|leadPhone)\}/;
const RUW_MAIL_ARG = /console\.(log|warn|error|info)\([^)]*,\s*email\s*[,)]/;
for (const f of ['api/whatsapp.js', 'api/cron-followup.js', 'api/form.js', 'api/auth.js', 'api/admin.js', 'api/_clerk.js']) {
  const regels = fs.readFileSync(BASE + f, 'utf8').split('\n');
  const fout = [];
  regels.forEach((r, i) => {
    if (!/console\.(log|warn|error|info)\(/.test(r)) return;
    if (RUW_TEL.test(r) || RUW_MAIL_ARG.test(r)) fout.push(`${i + 1}: ${r.trim().slice(0, 120)}`);
  });
  ck(`${f}: geen ruwe telefoon of e-mail in console-regels`, fout.length === 0, fout);
}
console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
