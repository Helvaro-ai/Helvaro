/*
 * Het klantportaal van Stripe: "Beheer abonnement".
 *
 * ── Waarom deze test bestaat ────────────────────────────────────────────────
 * Het portaal van Stripe moet EENMALIG aangezet worden in het Stripe-dashboard
 * (Instellingen > Facturatie > Klantportaal). Gebeurt dat niet, dan weigert
 * Stripe ELKE portaalsessie met "No configuration provided" -- niet één keer,
 * niet bij drukte, maar altijd en voor iedere klant.
 *
 * Op de live account was er geen enkele configuratie. De knop "Beheer
 * abonnement" gaf dus een 502 met "probeer het zo meteen opnieuw", bij iets
 * dat zo meteen precies even goed werkt als nu. De klant probeert opnieuw, en
 * nog eens, en mailt uiteindelijk -- of zegt op bij zijn bank.
 *
 * Wat hier bewaakt wordt:
 *   1. Die ene oorzaak wordt apart herkend en krijgt een eigen code, zodat het
 *      scherm iets anders kan zeggen dan "probeer later opnieuw".
 *   2. Een ECHTE storing blijft een 502 -- want die mag je wél opnieuw proberen.
 *   3. Er staat geen sleutel of klant-id in het antwoord naar de browser.
 *
 * De route wordt echt aangeroepen, met een echt getekend sessietoken. Een
 * nabouw zou alleen bewijzen dat mijn kopie werkt.
 */
process.env.API_AIRTABLE   = 'patZelftest';
process.env.BASE_AIRTABLE  = 'appZelftest';
process.env.SESSION_SECRET = 'zelftest-sessiegeheim';
process.env.STRIPE_SECRET_KEY = 'sk_test_zelftest';
delete process.env.CLERK_ENABLED;

const crypto = require('crypto');
const BASE = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

/* Een sessietoken zoals api/auth.js het tekent. Zonder dit valt elk verzoek al
   op de 401 en test je niets. */
function token(projectCode) {
  const secret = crypto.createHmac('sha256', process.env.SESSION_SECRET)
    .update('helvaro-session-v1').digest('hex');
  const payload = Buffer.from(JSON.stringify({
    projectCode, exp: Date.now() + 60000,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `hvs1.${payload}.${sig}`;
}

function nepReq() {
  return {
    method: 'POST',
    query: {},
    headers: { 'x-api-key': token('TELJO'), 'x-forwarded-for': '203.0.113.' + Math.floor(Math.random() * 250) },
    body: { mode: 'billing-portal' },
  };
}
function nepRes() {
  const uit = { code: 0, body: null, headers: {} };
  uit.setHeader = (k, v) => { uit.headers[k] = v; return uit; };
  uit.getHeader = (k) => uit.headers[k];
  uit.status = (c) => { uit.code = c; return uit; };
  uit.json = (b) => { uit.body = b; return uit; };
  uit.send = (b) => { uit.body = b; return uit; };
  uit.end = () => uit;
  return uit;
}

/* Airtable geeft een klant mét Stripe-id terug; Stripe weigert het portaal met
   precies de fout die een niet-geactiveerd portaal geeft. */
function nepWereld(stripeFout) {
  global.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.indexOf('api.stripe.com') !== -1) {
      return {
        ok: false, status: stripeFout.status, text: async () => '',
        json: async () => ({ error: { message: stripeFout.message, code: stripeFout.code } }),
      };
    }
    // Airtable: de klantrij.
    return {
      ok: true, status: 200, text: async () => '',
      json: async () => ({ records: [{ id: 'rec1', fields: {
        'Project Code': 'TELJO',
        'Client Name': 'Teljo',
        'Stripe Customer ID': 'cus_zelftest',
        'Plan ID': 'growth',
        'Plan Status': 'active',
      } }] }),
    };
  };
}

async function roep(stripeFout) {
  nepWereld(stripeFout);
  delete require.cache[require.resolve(BASE + 'api/leads.js')];
  const handler = require(BASE + 'api/leads.js');
  const res = nepRes();
  await handler(nepReq(), res);
  return res;
}

(async () => {
  console.log('\n— het portaal staat niet aan in Stripe —');
  let res = await roep({
    status: 400,
    message: 'No configuration provided and your live mode default configuration has not been created. '
           + 'Provide a configuration or create your default by saving your customer portal settings in live mode at '
           + 'https://dashboard.stripe.com/settings/billing/portal.',
    code: 'parameter_missing',
  });
  ck('geen 502 "probeer later opnieuw"', res.code !== 502, res.code);
  ck('maar een 503 met een eigen code',
     res.code === 503 && res.body && res.body.code === 'portaal_niet_geactiveerd', res.body);
  ck('en de klant leest niet dat het aan hem ligt',
     /nog niet geactiveerd/i.test((res.body && res.body.error) || ''), res.body);
  /* Wat Stripe terugstuurt bevat een dashboard-URL van ONZE account. Die hoort
     niet bij de klant in de browser terecht te komen. */
  const heleAntwoord = JSON.stringify(res.body || {});
  ck('en de ruwe Stripe-tekst gaat niet mee naar de browser',
     heleAntwoord.indexOf('dashboard.stripe.com') === -1
     && heleAntwoord.indexOf('cus_zelftest') === -1
     && heleAntwoord.indexOf('sk_test') === -1, heleAntwoord);

  console.log('\n— dezelfde melding in testmodus —');
  res = await roep({
    status: 400,
    message: 'No configuration provided and your test mode default configuration has not been created.',
    code: 'parameter_missing',
  });
  ck('wordt ook herkend', res.body && res.body.code === 'portaal_niet_geactiveerd', res.body);

  console.log('\n— een echte storing blijft een storing —');
  res = await roep({ status: 500, message: 'Stripe is temporarily unavailable', code: 'api_error' });
  ck('die geeft 502, want opnieuw proberen heeft daar wél zin', res.code === 502, res.code);
  ck('en niet de portaalcode',
     !res.body || res.body.code !== 'portaal_niet_geactiveerd', res.body);

  console.log('\n— en de webhook luistert naar de juiste gebeurtenissen —');
  /* De drie die op de live account aangezet zijn. Verdwijnt er hier één uit de
     code, dan blijft Stripe hem sturen en doet niemand er iets mee. */
  const fs = require('fs');
  const stripeRoute = fs.readFileSync(BASE + 'api/stripe.js', 'utf8');
  for (const g of ['checkout.session.completed', 'invoice.paid', 'customer.subscription.deleted']) {
    ck(`${g} wordt afgehandeld`, stripeRoute.indexOf(`'${g}'`) !== -1);
  }

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
