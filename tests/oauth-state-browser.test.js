'use strict';
/* OAuth-state gebonden aan de browser (audit S-10, 2026-10-09).
 *
 * De state voor Google Agenda / Gmail / Microsoft was getekend en tijdgebonden,
 * maar niet aan een browser gebonden. Een aanvaller vroeg een koppelings-URL
 * voor ZIJN account op, stuurde die naar een dealer, en na diens akkoord stond
 * de agenda of mailbox van de dealer op het account van de aanvaller.
 *
 * Nu zet het starten van de koppeling een eenmalige nonce-cookie, en de
 * terugkeer telt alleen met diezelfde cookie. */
const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

process.env.SESSION_SECRET = 'oauth-state-test';
process.env.BASE_AIRTABLE = 'appTest'; process.env.API_AIRTABLE = 'patTest';
process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 'csec';
process.env.GOOGLE_REDIRECT_URI = 'https://app.helvaro.pro/api/gcal?action=callback';
delete process.env.CLERK_ENABLED; delete process.env.UPSTASH_REDIS_REST_URL;

// Google's token-endpoint faalt bewust: we willen alleen zien OF de state
// geaccepteerd werd (dan volgt een tokenruil), niet de hele koppeling.
global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }), text: async () => 'invalid_grant' });

function sessie(pc) {
  const s = crypto.createHmac('sha256', process.env.SESSION_SECRET).update('helvaro-session-v1').digest('hex');
  const p = Buffer.from(JSON.stringify({ projectCode: pc, clientName: 'Test BV', exp: Date.now() + 3600000 })).toString('base64url');
  return `hvs1.${p}.${crypto.createHmac('sha256', s).update(p).digest('base64url')}`;
}
const h = require(path.join(__dirname, '..', 'api', 'leads.js'));
function nieuweRes() {
  return { statusCode: 200, _h: {}, _j: null,
    setHeader(k, v) { this._h[k.toLowerCase()] = v; }, getHeader(k) { return this._h[k.toLowerCase()]; },
    status(c) { this.statusCode = c; return this; }, json(o) { this._j = o; return this; }, send(b) { this._j = b; return this; }, end() { return this; } };
}

(async () => {
  // 1. aanvaller start de koppeling voor zijn eigen account
  const start = nieuweRes();
  await h({ method: 'POST', url: '/api/leads?__gcal=1', query: { __gcal: '1' }, headers: { 'x-api-key': sessie('AANVALLER1') }, body: { mode: 'connect' } }, start);
  assert.strictEqual(start.statusCode, 200, 'connect geeft een URL');
  const koek = [].concat(start._h['set-cookie'] || []).find(c => c.startsWith('hv_oauth_n='));
  assert.ok(koek && /HttpOnly/.test(koek) && /Secure/.test(koek) && /SameSite=Lax/.test(koek), 'nonce-cookie gezet: ' + koek);
  const nonce = koek.split(';')[0].split('=')[1];
  const state = new URL(start._j.url).searchParams.get('state');
  assert.ok(state, 'state in de Google-URL');

  async function terug(cookie) {
    const r = nieuweRes();
    const q = { __gcal: '1', action: 'callback', state, code: 'google-code' };
    await h({ method: 'GET', url: '/api/gcal?' + new URLSearchParams({ action: 'callback', state, code: 'google-code' }), query: q,
      headers: cookie ? { cookie } : {} }, r);
    return r._h.location || '';
  }
  // 2. het slachtoffer (andere browser, geen of andere cookie) keurt goed: geweigerd
  assert.ok((await terug('')).includes('gcal=invalid_state'), 'zonder nonce-cookie: geweigerd');
  assert.ok((await terug('hv_oauth_n=iets-anders-iets-anders-12')).includes('gcal=invalid_state'), 'met een andere nonce: geweigerd');
  // 3. dezelfde browser die startte: state geaccepteerd (daarna faalt de nep-tokenruil)
  const zelf = await terug('hv_oauth_n=' + nonce);
  assert.ok(!zelf.includes('invalid_state'), 'eigen browser: state geaccepteerd (kreeg ' + zelf + ')');
  console.log('oauth-state-browser: ok');
})().catch(e => { console.error(e); process.exit(1); });
