'use strict';
/* Het beheerderstoken verloopt (audit S-14, 2026-10-09). De oude v1 was een vaste
 * afgeleide van ADMIN_KEY en gold voor altijd. De ruwe sleutel blijft werken op
 * /api/admin (public/social.html gebruikt hem). */
const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
process.env.ADMIN_KEY = 'test-admin-sleutel-xyz';
const s = require(path.join(__dirname, '..', 'api', '_session.js'));
const tok = s.mintAdminToken();
assert.ok(/^adm2\.\d{13}\.[A-Za-z0-9_-]{43}$/.test(tok), 'adm2-vorm: ' + tok);
assert.ok(s.isAdminToken(tok), 'vers token geldig');
const v1 = crypto.createHmac('sha256', process.env.ADMIN_KEY).update('helvaro-admin-v1').digest('hex');
assert.ok(!s.isAdminToken(v1), 'oud vast v1-token geldt niet meer');
const [, exp, mac] = tok.split('.');
assert.ok(!s.isAdminToken(`adm2.${Number(exp) + 1000}.${mac}`), 'verlenging zonder geldige handtekening: nee');
const oud = Date.now() - 1000;
const macOud = crypto.createHmac('sha256', process.env.ADMIN_KEY).update('helvaro-admin-v2:' + oud).digest('base64url');
assert.ok(!s.isAdminToken(`adm2.${oud}.${macOud}`), 'verlopen token: nee');
const ver = Date.now() + 7 * 24 * 3600 * 1000;
const macVer = crypto.createHmac('sha256', process.env.ADMIN_KEY).update('helvaro-admin-v2:' + ver).digest('base64url');
assert.ok(!s.isAdminToken(`adm2.${ver}.${macVer}`), 'exp verder dan de TTL: nee');
assert.ok(!s.isAdminToken(process.env.ADMIN_KEY), 'de ruwe sleutel is geen sessietoken');
console.log('admin-token-verloopt: ok');
