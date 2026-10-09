/* suggest-replies boekte zijn verbruik met `ad.usage` — een variabele die nergens
 * bestond. Elke klik gaf daardoor een 500 NA de betaalde AI-aanroep: de
 * suggesties gingen verloren. Deze test stubt de AI-router en eist een 200 met
 * drie suggesties, en dat de tokens van de router worden doorgegeven. */
const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

process.env.SESSION_SECRET = 'test-secret';
process.env.BASE_AIRTABLE = 'appTest'; process.env.API_AIRTABLE = 'patTest';
process.env.ADMIN_KEY = 'test-admin'; process.env.ANTHROPIC_API_KEY = 'sk-test';
delete process.env.CLERK_ENABLED; delete process.env.UPSTASH_REDIS_REST_URL;

const CODE = 'TESTCODE01';
const LEAD = 'recAAAAAAAAAAAAAA';
function sessie(pc) {
  const s = crypto.createHmac('sha256', process.env.SESSION_SECRET).update('helvaro-session-v1').digest('hex');
  const p = Buffer.from(JSON.stringify({ projectCode: pc, clientName: 'Test BV', exp: Date.now() + 3600000 })).toString('base64url');
  return `hvs1.${p}.${crypto.createHmac('sha256', s).update(p).digest('base64url')}`;
}
global.fetch = async (url) => {
  const u = String(url);
  if (u.endsWith('/' + LEAD)) {
    return { ok: true, status: 200, text: async () => '', json: async () => ({ id: LEAD, fields: { 'Project Code': CODE, Name: 'Test Lead',
      'Conversation History': JSON.stringify([{ role: 'user', content: 'Is de auto nog beschikbaar?' }]) } }) };
  }
  return { ok: true, status: 200, text: async () => '', json: async () => ({ records: [] }) };
};

const _ai = require(path.join(__dirname, '..', 'api', '_ai'));
_ai.converse = async () => ({ text: '{"replies":["Ja, nog beschikbaar.","Wanneer wil je langskomen?","Zal ik een proefrit inplannen?"]}', inputTokens: 120, outputTokens: 40 });
const credits = require(path.join(__dirname, '..', 'api', '_credits'));
let geboekt = null;
credits.checkCredits = async () => ({ allowed: true });
credits.recordUsage = async (pc, feat, o) => { geboekt = o; };

const h = require(path.join(__dirname, '..', 'api', 'leads.js'));
const r = { _c: 200, _j: null, _h: {}, setHeader(k, v) { this._h[k] = v; }, getHeader(k) { return this._h[k]; },
  status(c) { this._c = c; return this; }, json(o) { this._j = o; return this; }, send(b) { this._j = b; return this; }, end() { return this; } };

(async () => {
  await h({ method: 'POST', headers: { 'x-api-key': sessie(CODE) }, query: {}, url: '/api/leads', body: { mode: 'suggest-replies', leadId: LEAD } }, r);
  assert.strictEqual(r._c, 200, 'suggest-replies moet slagen, kreeg ' + r._c + ' ' + JSON.stringify(r._j));
  assert.strictEqual(r._j.replies.length, 3);
  assert.ok(geboekt, 'verbruik is geboekt');
  assert.strictEqual(geboekt.tokens, 160);
  console.log('suggest-replies-tokens: ok');
})().catch(e => { console.error(e); process.exit(1); });
