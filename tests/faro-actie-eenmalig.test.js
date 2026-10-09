'use strict';
/* Een Faro-bevestiging voert maar één keer uit, ook over serverinstanties heen
 * (audit S-15, 2026-10-09). De oude bescherming was een Map per instantie: een
 * tweede instantie voerde dezelfde bevestiging opnieuw uit. Hier: twee verse
 * kopieën van de module (twee "instanties") met één gedeelde nep-Upstash. */
const assert = require('assert');
const path = require('path');
process.env.SESSION_SECRET = 'faro-eenmalig-test';
process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.test'; process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
const store = new Map();
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('https://upstash.test')) {
    const body = JSON.parse(opts.body || '[]');
    const cmds = Array.isArray(body[0]) ? body : [body];
    const out = cmds.map(([cmd, key, val, ...rest]) => {
      if (cmd === 'SET') { if (rest.includes('NX') && store.has(key)) return { result: null }; store.set(key, val); return { result: 'OK' }; }
      if (cmd === 'DEL') { store.delete(key); return { result: 1 }; }
      return { result: null };
    });
    return { ok: true, status: 200, json: async () => (Array.isArray(body[0]) ? out : out[0]) };
  }
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
};
function vers() {
  const api = path.join(__dirname, '..', 'api') + path.sep;
  for (const k of Object.keys(require.cache)) if (k.startsWith(api)) delete require.cache[k];
  return require(path.join(__dirname, '..', 'api', '_faro', 'actions.js'));
}
(async () => {
  const A = vers(); const B = vers();
  let uitgevoerd = 0;
  for (const m of [A, B]) m.EXECUTORS.__test = async () => { uitgevoerd++; return { summary: 'ok', components: [] }; };
  const id = A.stage({ projectCode: 'TEST01', userId: 'u1', action: '__test', payload: {} });
  const ctx = { projectCode: 'TEST01', userId: 'u1', lang: 'nl' };
  await A.execute({ actionId: id, ctx });
  let fout = null;
  try { await B.execute({ actionId: id, ctx }); } catch (e) { fout = e; }
  assert.strictEqual(uitgevoerd, 1, 'maar één keer uitgevoerd over twee instanties');
  assert.ok(fout && fout.code === 'already_executed', 'tweede instantie weigert: ' + (fout && fout.code));
  // een mislukte uitvoering geeft het slot vrij voor een echte nieuwe poging
  const C = vers(); let pogingen = 0;
  C.EXECUTORS.__faal = async () => { pogingen++; if (pogingen === 1) throw new Error('tijdelijk'); return { summary: 'ok', components: [] }; };
  const id2 = C.stage({ projectCode: 'TEST01', userId: 'u1', action: '__faal', payload: {} });
  await C.execute({ actionId: id2, ctx }).catch(() => {});
  await C.execute({ actionId: id2, ctx });
  assert.strictEqual(pogingen, 2, 'na een fout mag het opnieuw');
  console.log('faro-actie-eenmalig: ok');
})().catch(e => { console.error(e); process.exit(1); });
