/* Twee lekken uit de beveiligingsaudit van 2026-10-09, als regressietest.
 *
 * 1. De klantcache in api/leads.js is gesleuteld op de API key. wa-es-disconnect
 *    en wa-es-complete zetten er een item in onder de PROJECTCODE — die publiek is
 *    (formulier-URL). Daarna werkte de projectcode zelf als API key voor die
 *    tenant. Na de fix mag dat nooit: de code blijft 401.
 * 2. appointments-list zette body.from/body.to rauw in een Airtable-formule.
 *    Een from als `1"))||TRUE()||...` brak uit het projectfilter. Na de fix komt
 *    alleen een ISO-datum in de formule, en de eigen projectcode blijft erin. */
const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

process.env.SESSION_SECRET = 'test-secret';
process.env.BASE_AIRTABLE = 'appTest'; process.env.API_AIRTABLE = 'patTest';
process.env.ADMIN_KEY = 'test-admin';
delete process.env.CLERK_ENABLED; delete process.env.UPSTASH_REDIS_REST_URL;

const CODE = 'CPVWQ14A33';
function sessie(pc) {
  const s = crypto.createHmac('sha256', process.env.SESSION_SECRET).update('helvaro-session-v1').digest('hex');
  const p = Buffer.from(JSON.stringify({ projectCode: pc, clientName: 'Test BV', exp: Date.now() + 3600000 })).toString('base64url');
  return `hvs1.${p}.${crypto.createHmac('sha256', s).update(p).digest('base64url')}`;
}

const formules = [];
global.fetch = async (url) => {
  const u = String(url);
  if (u.includes('tblD058vEITs1xYFc')) formules.push(decodeURIComponent(u.split('filterByFormula=')[1].split('&')[0]));
  if (u.includes('tblPidTrwGRzRt4LZ') && decodeURIComponent(u).includes('fldN4dL0bGgfBOXwM')) {
    return { ok: true, status: 200, text: async () => '', json: async () => ({ records: [{ id: 'recCCCCCCCCCCCCCC', fields: { fldN4dL0bGgfBOXwM: CODE, fldAnB848Sr5jl6dq: 'Test BV', fldbrhlSrsmlJwcYr: '12345678' } }] }) };
  }
  return { ok: true, status: 200, text: async () => '', json: async () => ({ records: [] }) };
};
const antwoord = () => ({ _c: 200, _j: null, _h: {}, setHeader(k, v) { this._h[k] = v; }, getHeader(k) { return this._h[k]; },
  status(c) { this._c = c; return this; }, json(o) { this._j = o; return this; }, send(b) { this._j = b; return this; }, end() { return this; } });
const h = require(path.join(__dirname, '..', 'api', 'leads.js'));
const vraag = (key, body) => ({ method: 'POST', headers: { 'x-api-key': key }, query: {}, url: '/api/leads', body });

(async () => {
  // 1. projectcode als API key, vóór en ná een wa-es-actie van de echte eigenaar
  let r = antwoord(); await h(vraag(CODE, { mode: 'config-get' }), r);
  assert.strictEqual(r._c, 401, 'projectcode mag vooraf geen API key zijn');
  r = antwoord(); await h(vraag(sessie(CODE), { mode: 'wa-es-disconnect' }), r);
  r = antwoord(); await h(vraag(CODE, { mode: 'config-get' }), r);
  assert.strictEqual(r._c, 401, 'projectcode mag na wa-es-disconnect GEEN toegang geven (was 200)');

  // 2. formule-injectie via from
  const kwaad = '1"))||TRUE()||AND(TRUE(),IS_AFTER({Start Time}, "1';
  r = antwoord(); await h(vraag(sessie('ATTACKER01'), { mode: 'appointments-list', from: kwaad, to: 'ook-geen-datum' }), r);
  assert.strictEqual(r._c, 200);
  const f = formules.pop();
  assert.ok(f, 'er werd een formule gestuurd');
  assert.ok(!f.includes('TRUE()'), 'injectie mag niet in de formule staan: ' + f);
  assert.ok(f.includes('{Project Code}="ATTACKER01"'), 'eigen projectfilter blijft');
  const datums = f.match(/"\d{4}-\d\d-\d\dT[\d:.]+Z"/g) || [];
  assert.strictEqual(datums.length, 2, 'from en to zijn allebei een ISO-datum: ' + f);

  // een echte datum gaat ongewijzigd (als ISO) door
  r = antwoord(); await h(vraag(sessie('ATTACKER01'), { mode: 'appointments-list', from: '2026-10-01T00:00:00.000Z' }), r);
  assert.ok(formules.pop().includes('"2026-10-01T00:00:00.000Z"'));
  console.log('sec-clientcache-formule: ok');
})().catch(e => { console.error(e); process.exit(1); });
