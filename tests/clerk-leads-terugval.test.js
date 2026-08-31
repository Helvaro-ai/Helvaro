/*
 * Een geslaagde Clerk-sessie viel door naar het oude API-sleutelpad.
 *
 * ── Wat de eigenaar zag ─────────────────────────────────────────────────────
 * Inloggen lukt, het dashboard komt op, en meteen "Je sessie is verlopen".
 * Opnieuw inloggen doet hetzelfde. Eindeloos.
 *
 * ── Wat er werkelijk gebeurde ───────────────────────────────────────────────
 * api/leads.js authenticeert in twee stappen. Eerst Clerk: die zet projectCode,
 * clientName en calendlyLink. Daarna het oude pad met een API-sleutel, en dat
 * begint met:
 *
 *     const raw     = projectCode ? '' : _session.readToken(req);
 *     const session = projectCode ? null : verifySession(raw);
 *     if (session) { ... } else { ...oude sleutel... }
 *
 * Allebei die ternaries zijn juist: als Clerk het al gedaan heeft, is er geen
 * oude sleutel nodig. Maar de else eronder had geen voorwaarde. Een geslaagde
 * Clerk-sessie kwam er dus ALTIJD in terecht, met raw = '', en dat blok
 * antwoordt op een lege sleutel netjes "Ongeldige API key".
 *
 * Gevolg: elke Clerk-gebruiker kreeg 401 op elke aanvraag, terwijl de sessie
 * een regel eerder correct geverifieerd was. Live bevestigd met een
 * diagnose-eindpunt: token geldig, tenant gevonden, projectcode aanwezig -- en
 * toch 401 "Ongeldige API key".
 *
 * ── Waarom deze test de handler ECHT draait ─────────────────────────────────
 * Een controle op de broncode zou hier niets bewijzen: het verschil is één
 * ontbrekende voorwaarde, en of die klopt blijkt pas als de code loopt. Dus:
 * _clerk.verifySession nagemaakt, de handler aangeroepen, en gekeken wat de
 * gebruiker terugkrijgt.
 */
'use strict';

const path = require('path');

let pass = 0, fail = 0;
const ck = (naam, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${naam}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 200));
  ok ? pass++ : fail++;
};

function nepRes() {
  const r = { _code: 0, _json: null, _headers: {} };
  r.setHeader = (k, v) => { r._headers[k.toLowerCase()] = v; };
  r.status = (c) => { r._code = c; return r; };
  r.json = (j) => { r._json = j; return r; };
  r.end = () => r;
  return r;
}

(async () => {
  const clerkPad = path.join(__dirname, '..', 'api', '_clerk.js');
  const leadsPad = path.join(__dirname, '..', 'api', 'leads.js');

  /* Een geslaagde Clerk-sessie nabootsen. Dat is precies de toestand die live
     kapot was: verifySession geeft een tenant terug MET projectcode. */
  delete require.cache[require.resolve(clerkPad)];
  const clerk = require(clerkPad);
  clerk.verifySession = async () => ({
    userId: 'user_test', projectCode: 'TENANT_A',
    clientName: 'Testkantoor', calendlyLink: '', em: 'test@example.be',
  });

  delete require.cache[require.resolve(leadsPad)];
  const leads = require(leadsPad);

  const res = nepRes();
  await leads({
    method: 'GET',
    url: '/api/leads',
    query: {},
    headers: { 'x-vercel-forwarded-for': '203.0.113.9' },
  }, res);

  console.log('\n— een geldige Clerk-sessie valt niet meer door naar het sleutelpad —');
  /* De kern: NIET 401 met "Ongeldige API key". Dat de aanvraag daarna op
     Airtable stukloopt is prima -- er staan in deze test geen tokens. Waar het
     om gaat is dat de AUTHENTICATIE hem niet meer afwijst. */
  const foutTekst = (res._json && res._json.error) || '';
  ck('geen "Ongeldige API key" meer', foutTekst !== 'Ongeldige API key',
     `${res._code} ${JSON.stringify(res._json).slice(0, 120)}`);
  ck('en geen "API key ontbreekt"', foutTekst !== 'API key ontbreekt', foutTekst);
  ck('de sessie wordt dus geaccepteerd', res._code !== 401,
     `${res._code} ${foutTekst}`);

  /* En andersom: wie NIETS meestuurt hoort nog steeds geweigerd te worden.
     Zonder deze helft zou "iedereen toelaten" ook groen zijn. */
  delete require.cache[require.resolve(clerkPad)];
  const clerk2 = require(clerkPad);
  clerk2.verifySession = async () => null;
  delete require.cache[require.resolve(leadsPad)];
  const leads2 = require(leadsPad);

  const res2 = nepRes();
  await leads2({
    method: 'GET', url: '/api/leads', query: {},
    headers: { 'x-vercel-forwarded-for': '203.0.113.10' },
  }, res2);
  ck('zonder enige sessie blijft het 401', res2._code === 401,
     `${res2._code} ${JSON.stringify(res2._json)}`);

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
