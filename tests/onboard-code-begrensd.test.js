'use strict';
/* Foute uitnodigingscodes worden over alle instanties geteld (audit S-11). */
const assert = require('assert');
const path = require('path');
process.env.ONBOARD_CODE = 'echte-code-123'; process.env.ADMIN_KEY = 'x';
process.env.BASE_AIRTABLE = 'appTest'; process.env.API_AIRTABLE = 'patTest';
delete process.env.PUBLIC_SIGNUP_ENABLED; delete process.env.UPSTASH_REDIS_REST_URL;
global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ records: [] }), text: async () => '' });
const admin = require(path.join(__dirname, '..', 'api', 'admin.js'));
(async () => {
  const codes = [];
  for (let i = 0; i < 12; i++) {
    const res = { _c: 200, setHeader() {}, getHeader() {}, status(c) { this._c = c; return this; }, json() { return this; }, send() { return this; }, end() { return this; } };
    await admin({ method: 'POST', url: '/api/admin', query: {}, headers: { 'x-vercel-forwarded-for': '10.1.2.3' }, body: { mode: 'onboard', inviteCode: 'gok-' + i } }, res);
    codes.push(res._c);
  }
  assert.ok(codes.slice(0, 10).every(c => c === 401 || c === 429), 'foute code geweigerd: ' + codes.join(','));
  assert.strictEqual(codes[11], 429, 'na tien foute codes per uur: 429 (' + codes.join(',') + ')');
  console.log('onboard-code-begrensd: ok');
})().catch(e => { console.error(e); process.exit(1); });
