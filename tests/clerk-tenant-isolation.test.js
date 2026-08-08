// Tenant isolation under Clerk. This is the migration's dangerous edge: if a
// session can reach the API without a projectCode, an empty projectCode reads
// as "admin, show everything" further down and one misconfigured user sees the
// whole database.
const BASE = require('path').join(__dirname, '..') + '/';

// Stub @clerk/backend so we control exactly what the token resolves to.
let CLAIMS = null;
let CLERK_USER = null;
require.cache[require.resolve(BASE + 'node_modules/@clerk/backend')] = {
  id: require.resolve(BASE + 'node_modules/@clerk/backend'),
  loaded: true,
  exports: {
    verifyToken: async () => { if (!CLAIMS) throw new Error('invalid'); return CLAIMS; },
    createClerkClient: () => ({ users: { getUser: async () => {
      if (!CLERK_USER) throw new Error('not found');
      return CLERK_USER;
    } } }),
  },
};

function fresh() {
  Object.keys(require.cache)
    .filter(k => k.includes('/api/_clerk'))
    .forEach(k => delete require.cache[k]);
  return require(BASE + 'api/_clerk.js');
}

const req = { headers: { cookie: '__session=whatever' } };
let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${name}`);
  if (!ok) console.log(`        kreeg ${JSON.stringify(actual)}, verwachtte ${JSON.stringify(expected)}`);
  ok ? pass++ : fail++;
}

(async () => {
  process.env.CLERK_ENABLED = '1';
  process.env.CLERK_SECRET_KEY = 'sk_test_stub';

  console.log('\n— projectCode uit de token-claims —');
  CLAIMS = { sub: 'user_1', projectCode: 'KLANT_A', clientName: 'Klant A' };
  let c = fresh();
  let s = await c.verifySession(req);
  check('sessie krijgt projectCode van klant A', s && s.projectCode, 'KLANT_A');

  console.log('\n— GEEN projectCode: moet dicht falen —');
  CLAIMS = { sub: 'user_2' };
  CLERK_USER = { id: 'user_2', publicMetadata: {}, primaryEmailAddress: { emailAddress: 'x@y.be' } };
  c = fresh();
  s = await c.verifySession(req);
  check('gebruiker zonder projectCode krijgt GEEN sessie', s, null);

  console.log('\n— lege projectCode telt ook als ontbrekend —');
  CLAIMS = { sub: 'user_3' };
  CLERK_USER = { id: 'user_3', publicMetadata: { projectCode: '' }, primaryEmailAddress: { emailAddress: 'x@y.be' } };
  c = fresh();
  s = await c.verifySession(req);
  check('lege projectCode geeft GEEN sessie', s, null);

  console.log('\n— projectCode uit publicMetadata (geen custom claim) —');
  CLAIMS = { sub: 'user_4' };
  CLERK_USER = { id: 'user_4', publicMetadata: { projectCode: 'KLANT_B', clientName: 'Klant B' },
                 primaryEmailAddress: { emailAddress: 'b@y.be' } };
  c = fresh();
  s = await c.verifySession(req);
  check('valt terug op publicMetadata', s && s.projectCode, 'KLANT_B');
  check('klant B krijgt NIET de code van klant A', s && s.projectCode === 'KLANT_A', false);

  console.log('\n— ongeldig token —');
  CLAIMS = null;
  c = fresh();
  s = await c.verifySession(req);
  check('ongeldig token geeft geen sessie', s, null);

  console.log('\n— schakelaar uit —');
  delete process.env.CLERK_ENABLED;
  CLAIMS = { sub: 'user_1', projectCode: 'KLANT_A' };
  c = fresh();
  s = await c.verifySession(req);
  check('met de schakelaar uit wordt Clerk volledig genegeerd', s, null);

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
