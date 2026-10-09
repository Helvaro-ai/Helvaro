/* Inlogbegrenzing per ACCOUNT, naast die per IP.
 *
 * De IP-begrenzer (40 per 15 min) stopte geen aanvaller die zijn gokken over veel
 * IP's spreidt. Nu: tien pogingen per e-mailadres per 15 minuten, ongeacht het
 * IP; een geslaagde login zet de teller terug. Ook: een onbekend e-mailadres
 * rekent even lang als een bestaand (geen tijdsorakel). */
'use strict';
const assert = require('assert');
const path = require('path');
const bcrypt = require('bcryptjs');

process.env.SESSION_SECRET = 'login-account-test';
process.env.BASE_AIRTABLE = 'appTest'; process.env.API_AIRTABLE = 'patTest';
delete process.env.CLERK_ENABLED; delete process.env.ADMIN_KEY;
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;

const HASH = bcrypt.hashSync('goed-wachtwoord', 4);
global.fetch = async (url) => {
  const u = decodeURIComponent(String(url));
  if (u.includes('tbl2hrPW7gIx5XF4S') && /bestaat@test\.be|reset@test\.be/.test(u)) {
    const email = /reset@test\.be/.test(u) ? 'reset@test.be' : 'bestaat@test.be';
    return { ok: true, status: 200, text: async () => '', json: async () => ({ records: [{ id: 'recUSERUSERUSER01',
      fields: { Email: email, 'Password Hash': HASH, 'Project Code': 'TEST01', 'Client Name': 'Test BV', Status: 'Active' } }] }) };
  }
  return { ok: true, status: 200, text: async () => '', json: async () => ({ records: [] }) };
};
const h = require(path.join(__dirname, '..', 'api', 'auth.js'));
let ipTeller = 0;
async function login(email, password) {
  const res = { _c: 200, _j: null, _h: {}, setHeader(k, v) { this._h[k] = v; return this; }, getHeader(k) { return this._h[k]; },
    status(c) { this._c = c; return this; }, json(o) { this._j = o; return this; }, send(b) { this._j = b; return this; }, end() { return this; } };
  ipTeller++;
  await h({ method: 'POST', url: '/api/auth', query: {}, headers: { 'content-type': 'application/json',
    'x-forwarded-for': `10.0.${ipTeller >> 8}.${ipTeller & 255}` }, body: { email, password } }, res);
  return res;
}

(async () => {
  // 1. tien foute pogingen vanaf tien IP's: allemaal 401; de elfde: 429
  for (let i = 0; i < 10; i++) {
    const r = await login('bestaat@test.be', 'fout-' + i);
    assert.strictEqual(r._c, 401, `poging ${i + 1} hoort 401 te zijn, kreeg ${r._c} ${JSON.stringify(r._j)}`);
  }
  const elfde = await login('bestaat@test.be', 'fout-11');
  assert.strictEqual(elfde._c, 429, 'elfde poging op hetzelfde account (ander IP) wordt begrensd');
  // ook het juiste wachtwoord wacht nu (anders is de begrenzer een orakel)
  assert.strictEqual((await login('bestaat@test.be', 'goed-wachtwoord'))._c, 429);

  // 2. een geslaagde login zet de teller terug
  for (let i = 0; i < 5; i++) await login('reset@test.be', 'fout-' + i);
  const ok = await login('reset@test.be', 'goed-wachtwoord');
  assert.ok(ok._c === 200 && ok._j && ok._j.success !== false, 'juist wachtwoord logt in: ' + ok._c + ' ' + JSON.stringify(ok._j).slice(0, 120));
  for (let i = 0; i < 9; i++) {
    const r = await login('reset@test.be', 'fout-na-' + i);
    assert.strictEqual(r._c, 401, `na een geslaagde login begint de teller opnieuw (poging ${i + 1})`);
  }

  // 3. geen tijdsorakel: onbekend adres doet ook een bcrypt-vergelijking
  const t0 = Date.now(); await login('onbekend@test.be', 'x'); const onbekendMs = Date.now() - t0;
  assert.ok(onbekendMs >= 25, 'onbekend adres rekent ook bcrypt (kost ' + onbekendMs + ' ms)');
  console.log('login-per-account: ok');
})().catch(e => { console.error(e); process.exit(1); });
