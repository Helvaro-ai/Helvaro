'use strict';
/* De sessie-payload droeg de permanente API-sleutel mee, leesbaar voor iedereen
 * met het token (base64). Audit S-09, 2026-10-09. */
const assert = require('assert');
const path = require('path');
const bcrypt = require('bcryptjs');
process.env.SESSION_SECRET = 'sessie-sleutel-test';
process.env.BASE_AIRTABLE = 'appTest'; process.env.API_AIRTABLE = 'patTest';
delete process.env.CLERK_ENABLED; delete process.env.ADMIN_KEY; delete process.env.UPSTASH_REDIS_REST_URL;
const HASH = bcrypt.hashSync('goed-wachtwoord', 4);
global.fetch = async (url) => {
  if (String(url).includes('tbl2hrPW7gIx5XF4S')) return { ok: true, status: 200, text: async () => '', json: async () => ({ records: [{ id: 'recUSERUSERUSER01',
    fields: { Email: 'klant@test.be', 'Password Hash': HASH, 'API Key': 'PERMANENTE-SLEUTEL-123', 'Project Code': 'TEST01', 'Client Name': 'Test BV' } }] }) };
  return { ok: true, status: 200, text: async () => '', json: async () => ({ records: [] }) };
};
const h = require(path.join(__dirname, '..', 'api', 'auth.js'));
(async () => {
  const res = { _c: 200, _j: null, _h: {}, setHeader(k, v) { this._h[k] = v; }, getHeader(k) { return this._h[k]; }, status(c) { this._c = c; return this; }, json(o) { this._j = o; return this; }, send(b) { this._j = b; return this; }, end() { return this; } };
  await h({ method: 'POST', url: '/api/auth', query: {}, headers: { 'x-forwarded-for': '10.9.9.9' }, body: { email: 'klant@test.be', password: 'goed-wachtwoord' } }, res);
  assert.strictEqual(res._c, 200, 'login slaagt: ' + JSON.stringify(res._j));
  const tok = res._j.apiKey;
  const payload = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString('utf8'));
  assert.ok(!('apiKey' in payload), 'geen apiKey in de sessie-payload');
  assert.ok(!JSON.stringify(res._j).includes('PERMANENTE-SLEUTEL-123'), 'de permanente sleutel staat nergens in het antwoord');
  assert.strictEqual(payload.projectCode, 'TEST01');
  console.log('sessie-zonder-apisleutel: ok');
})().catch(e => { console.error(e); process.exit(1); });
