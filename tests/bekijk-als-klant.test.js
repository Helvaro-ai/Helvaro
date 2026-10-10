'use strict';
/* "Bekijk als klant" (review 2, 2026-10-10): de admin-cookie won altijd van de
 * klantsleutel in de header, dus de beheerder zag een leeg dashboard. Alleen
 * bij een geldige admin-cookie gaat de header nu voor. Een gewone klantcookie
 * blijft winnen (geen sessiewissel via een header). */
const assert = require('assert');
const path = require('path');
process.env.ADMIN_KEY = 'test-admin-k';
const s = require(path.join(__dirname, '..', 'api', '_session.js'));
const adm = s.mintAdminToken();
const lees = (cookie, header) => s.readToken({ headers: Object.assign({}, cookie ? { cookie: s.SESSION_COOKIE + '=' + encodeURIComponent(cookie) } : {}, header ? { 'x-api-key': header } : {}) });
assert.strictEqual(lees(adm, 'KLANTSLEUTEL123'), 'KLANTSLEUTEL123', 'admin-cookie + klantsleutel: de klant');
assert.strictEqual(lees('hvs1.payload.sig', 'ANDERE-SLEUTEL'), 'hvs1.payload.sig', 'klantcookie wint van een header');
assert.strictEqual(lees('adm2.1234567890123.' + 'A'.repeat(43), 'X-SLEUTEL'), 'adm2.1234567890123.' + 'A'.repeat(43), 'vervalste admin-cookie geeft geen voorrang');
assert.strictEqual(lees(null, 'H-SLEUTEL'), 'H-SLEUTEL', 'alleen header');
assert.strictEqual(lees(adm, ''), adm, 'admin zonder header blijft admin');
console.log('bekijk-als-klant: ok');
