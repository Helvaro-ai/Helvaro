/* De daglimiet van 10 testberichten zat in een Map per serverinstantie: twee
 * instanties (of een koude start) gaven elk weer tien berichten vanaf het
 * gedeelde WhatsApp-nummer. Deze test laadt api/leads.js twee keer vers — twee
 * "instanties" — met één gedeelde (nep-)Upstash-teller, en eist dat het elfde
 * bericht over beide heen geweigerd wordt. */
const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

process.env.SESSION_SECRET = 'test-secret';
process.env.BASE_AIRTABLE = 'appTest'; process.env.API_AIRTABLE = 'patTest';
process.env.ADMIN_KEY = 'test-admin';
process.env.PHONE_NUMBER_ID = '111'; process.env.WHATSAPP_TOKEN = 'wa-test';
process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.test'; process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
delete process.env.CLERK_ENABLED;

const tellers = new Map();
let verstuurd = 0;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('https://upstash.test')) {
    if (u.endsWith('/pipeline')) {
      const cmds = JSON.parse(opts.body);
      const key = cmds[0][1];
      const n = (tellers.get(key) || 0) + 1; tellers.set(key, n);
      return { ok: true, status: 200, json: async () => [{ result: n }, { result: 100 }] };
    }
    return { ok: true, status: 200, json: async () => ({ result: 1 }) };
  }
  if (u.includes('graph.facebook.com')) {
    verstuurd++;
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.' + verstuurd }] }), text: async () => '' };
  }
  return { ok: true, status: 200, json: async () => ({ records: [] }), text: async () => '' };
};

function sessie(pc) {
  const s = crypto.createHmac('sha256', process.env.SESSION_SECRET).update('helvaro-session-v1').digest('hex');
  const p = Buffer.from(JSON.stringify({ projectCode: pc, clientName: 'Test BV', exp: Date.now() + 3600000 })).toString('base64url');
  return `hvs1.${p}.${crypto.createHmac('sha256', s).update(p).digest('base64url')}`;
}
function versLaden() {
  const api = path.join(__dirname, '..', 'api') + path.sep;
  for (const k of Object.keys(require.cache)) if (k.startsWith(api)) delete require.cache[k];
  return require(path.join(__dirname, '..', 'api', 'leads.js'));
}
const antwoord = () => ({ _c: 200, _j: null, _h: {}, setHeader(k, v) { this._h[k] = v; }, getHeader(k) { return this._h[k]; },
  status(c) { this._c = c; return this; }, json(o) { this._j = o; return this; }, send(b) { this._j = b; return this; }, end() { return this; } });

(async () => {
  const instantieA = versLaden();
  const instantieB = versLaden();
  const codes = [];
  for (let i = 0; i < 11; i++) {
    const h = i % 2 === 0 ? instantieA : instantieB;
    const r = antwoord();
    await h({ method: 'POST', headers: { 'x-api-key': sessie('QUOTUM01') }, query: {}, url: '/api/leads',
      body: { mode: 'test-message', phone: '32470000000', message: 'test ' + i } }, r);
    codes.push(r._c);
  }
  assert.deepStrictEqual(codes.slice(0, 10), Array(10).fill(200), 'eerste tien gaan door: ' + codes.join(','));
  assert.strictEqual(codes[10], 429, 'elfde over twee instanties heen wordt geweigerd: ' + codes.join(','));
  console.log('test-message-quotum-gedeeld: ok');
})().catch(e => { console.error(e); process.exit(1); });
