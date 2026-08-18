// Tenant isolation under Clerk. This is the migration's dangerous edge: if a
// session can reach the API without a projectCode, an empty projectCode reads
// as "admin, show everything" further down and one misconfigured user sees the
// whole database.
const BASE = require('path').join(__dirname, '..') + '/';

// Stub @clerk/backend so we control exactly what the token resolves to.
let CLAIMS = null;
let CLERK_USER = null;
let LAST_VERIFY_OPTS = null;
require.cache[require.resolve(BASE + 'node_modules/@clerk/backend')] = {
  id: require.resolve(BASE + 'node_modules/@clerk/backend'),
  loaded: true,
  exports: {
    verifyToken: async (_tok, opts) => {
      LAST_VERIFY_OPTS = opts || {};
      if (!CLAIMS) throw new Error('invalid');
      // Clerk's own verifyToken rejects a token whose azp is not in the list.
      // The stub mirrors that, so the test proves the option is actually passed
      // rather than just present in the source.
      const parties = opts && opts.authorizedParties;
      if (parties && CLAIMS.azp && !parties.includes(CLAIMS.azp)) {
        throw new Error('Invalid JWT Authorized party claim (azp)');
      }
      return CLAIMS;
    },
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

  console.log('\n— GEEN projectCode: inrichten mislukt -> geen toegang —');
  // Airtable niet bereikbaar, dus provisionTenant() faalt. De sessie mag dan
  // wel uitleggen dat er gewacht wordt, maar absoluut geen projectCode dragen:
  // leeg betekent verderop in de API "admin, toon alles".
  CLAIMS = { sub: 'user_2' };
  CLERK_USER = { id: 'user_2', publicMetadata: {}, primaryEmailAddress: { emailAddress: 'x@y.be' } };
  delete process.env.API_AIRTABLE;
  c = fresh();
  s = await c.verifySession(req);
  check('mislukte inrichting geeft GEEN projectCode', s && s.projectCode, undefined);
  check('en markeert de sessie als wachtend', s && s.pending, true);

  console.log('\n— lege projectCode telt ook als ontbrekend —');
  CLAIMS = { sub: 'user_3' };
  CLERK_USER = { id: 'user_3', publicMetadata: { projectCode: '' }, primaryEmailAddress: { emailAddress: 'x@y.be' } };
  c = fresh();
  s = await c.verifySession(req);
  check('lege projectCode geeft GEEN projectCode', s && s.projectCode, undefined);

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

  // ── Transport: cookie vs bearer ────────────────────────────────────────────
  // De __session-cookie is first-party geworden zodra de DNS geverifieerd was.
  // api/_session.js's csrfOk() ziet die cookie niet als cookie-auth, dus zonder
  // deze regel zou een cross-origin schrijfverzoek meeliften op de cookie van
  // een ingelogde gebruiker.
  console.log('\n— transport: lezen mag met de cookie, schrijven niet —');
  process.env.CLERK_ENABLED = '1';
  process.env.CLERK_SECRET_KEY = 'sk_test_stub';
  CLAIMS = { sub: 'user_1', projectCode: 'KLANT_A', clientName: 'Klant A' };
  c = fresh();

  const cookieReq = (method) => ({ method, headers: { cookie: '__session=abc' } });
  const bearerReq = (method) => ({ method, headers: { authorization: 'Bearer abc' } });
  // Wat een vervalst formulier van een andere site oplevert: de cookie gaat
  // mee, de Authorization-header niet.
  const forgedWrite = { method: 'POST', headers: { cookie: '__session=abc' } };

  check('GET met alleen de cookie werkt', (await c.verifySession(cookieReq('GET'))).projectCode, 'KLANT_A');
  check('POST met alleen de cookie wordt geweigerd', await c.verifySession(forgedWrite), null);
  check('POST met bearer werkt wel', (await c.verifySession(bearerReq('POST'))).projectCode, 'KLANT_A');
  check('DELETE met alleen de cookie wordt geweigerd', await c.verifySession(cookieReq('DELETE')), null);
  check('bearer wint van de cookie', c.readClerkToken({ method: 'POST', headers: { cookie: '__session=cookie', authorization: 'Bearer header' } }), 'header');

  // ── authorizedParties ──────────────────────────────────────────────────────
  console.log('\n— authorizedParties —');
  delete process.env.CLERK_AUTHORIZED_PARTIES;
  c = fresh();
  await c.verifySession(bearerReq('GET'));
  check('standaard vastgezet op het eigen domein', c.authorizedParties(), ['https://app.helvaro.pro']);
  check('en ook echt doorgegeven aan verifyToken', LAST_VERIFY_OPTS.authorizedParties, ['https://app.helvaro.pro']);

  CLAIMS = { sub: 'user_1', projectCode: 'KLANT_A', azp: 'https://ergens-anders.be' };
  c = fresh();
  check('token van een vreemde origin wordt geweigerd', await c.verifySession(bearerReq('GET')), null);

  CLAIMS = { sub: 'user_1', projectCode: 'KLANT_A', azp: 'https://app.helvaro.pro' };
  c = fresh();
  check('token van het eigen domein wordt aanvaard', (await c.verifySession(bearerReq('GET'))).projectCode, 'KLANT_A');

  process.env.CLERK_AUTHORIZED_PARTIES = 'https://app.helvaro.pro, https://accounts.helvaro.pro';
  c = fresh();
  check('meerdere origins configureerbaar', c.authorizedParties(), ['https://app.helvaro.pro', 'https://accounts.helvaro.pro']);
  // Leeg = geen controle, niet "alles weigeren": een niet-gezette variabele mag
  // geen enkele klant buitensluiten.
  process.env.CLERK_AUTHORIZED_PARTIES = '';
  c = fresh();
  check('leeg zet de controle uit in plaats van iedereen buiten', c.authorizedParties(), undefined);
  delete process.env.CLERK_AUTHORIZED_PARTIES;

  // ── userId ─────────────────────────────────────────────────────────────────
  // api/_faro/actions.js bindt een voorstel aan de gebruiker die het maakte, en
  // controleert dat bij het bevestigen. Zonder userId zou elke Clerk-gebruiker
  // op dezelfde sleutel uitkomen en elkaars bevestigingen kunnen inlossen.
  console.log('\n— userId op de sessie —');
  CLAIMS = { sub: 'user_9', projectCode: 'KLANT_C' };
  c = fresh();
  check('sessie draagt de Clerk-gebruiker mee', (await c.verifySession(bearerReq('GET'))).userId, 'user_9');

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
