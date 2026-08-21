// Faro's HTTP route under Clerk.
//
// Faro is the page a user lands on straight after logging in. It had no Clerk
// path at all, which meant that switching Clerk on would have turned the first
// screen of the product into a 401 for every customer — while api/leads.js kept
// working, so the failure would have looked like "Faro is broken", not "auth is
// misconfigured". These tests exist so that cannot come back silently.
const BASE = require('path').join(__dirname, '..') + '/';

let CLAIMS = null;
require.cache[require.resolve(BASE + 'node_modules/@clerk/backend')] = {
  id: require.resolve(BASE + 'node_modules/@clerk/backend'),
  loaded: true,
  exports: {
    verifyToken: async () => { if (!CLAIMS) throw new Error('invalid'); return CLAIMS; },
    createClerkClient: () => ({ users: { getUser: async () => { throw new Error('not found'); } } }),
  },
};

// The handler is stubbed: what is under test is which auth context the route
// hands it, not what Faro does with it.
let HANDED = null;
require.cache[require.resolve(BASE + 'api/_faro/handler.js')] = {
  id: require.resolve(BASE + 'api/_faro/handler.js'),
  loaded: true,
  exports: { handle: async (_req, res, auth) => { HANDED = auth; return res.status(200).json({ ok: true }); } },
};

function fresh() {
  Object.keys(require.cache)
    .filter((k) => k.includes('/api/_clerk') || k.includes('/api/faro.js'))
    .forEach((k) => delete require.cache[k]);
  return require(BASE + 'api/faro.js');
}

function mkRes() {
  const out = { code: 0, body: null };
  return {
    out,
    status(c) { out.code = c; return this; },
    json(b) { out.body = b; return this; },
  };
}

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${name}`);
  if (!ok) console.log(`        kreeg ${JSON.stringify(actual)}, verwachtte ${JSON.stringify(expected)}`);
  ok ? pass++ : fail++;
}

async function call(req) {
  HANDED = null;
  const res = mkRes();
  await fresh()(req, res);
  return res.out;
}

(async () => {
  process.env.CLERK_ENABLED = '1';
  process.env.CLERK_SECRET_KEY = 'sk_test_stub';
  process.env.SESSION_SECRET = 'test-secret-for-faro-route';

  const post = (headers) => ({ method: 'POST', headers, body: {} });

  console.log('\n— Clerk-sessie bereikt Faro —');
  CLAIMS = { sub: 'user_1', projectCode: 'KLANT_A', clientName: 'Klant A' };
  let out = await call(post({ authorization: 'Bearer abc' }));
  check('route geeft 200 in plaats van 401', out.code, 200);
  check('en geeft de juiste tenant door', HANDED && HANDED.projectCode, 'KLANT_A');
  check('userId is de Clerk-gebruiker, niet de projectcode', HANDED && HANDED.userId, 'user_1');
  check('een Clerk-gebruiker is nooit admin', HANDED && HANDED.isAdmin, false);

  console.log('\n— tenants blijven gescheiden —');
  CLAIMS = { sub: 'user_2', projectCode: 'KLANT_B' };
  await call(post({ authorization: 'Bearer abc' }));
  check('klant B krijgt de eigen code', HANDED && HANDED.projectCode, 'KLANT_B');

  console.log('\n— sessie zonder projectcode —');
  // Leeg leest verderop als "admin, toon alles". Dat mag Faro nooit bereiken.
  CLAIMS = { sub: 'user_3', projectCode: '' };
  out = await call(post({ authorization: 'Bearer abc' }));
  check('wordt geweigerd', out.code, 401);
  check('en de handler is niet aangeroepen', HANDED, null);

  console.log('\n— schrijven met alleen de Clerk-cookie —');
  // De __session-cookie is first-party sinds de DNS geverifieerd is; csrfOk()
  // herkent hem niet, dus een POST mag er niet op leunen.
  CLAIMS = { sub: 'user_1', projectCode: 'KLANT_A' };
  out = await call(post({ cookie: '__session=abc' }));
  check('wordt geweigerd', out.code, 401);
  check('en de handler is niet aangeroepen', HANDED, null);

  console.log('\n— schakelaar uit —');
  delete process.env.CLERK_ENABLED;
  out = await call(post({ authorization: 'Bearer abc' }));
  check('zonder de vlag geldt weer alleen de klassieke sessie', out.code, 401);

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
