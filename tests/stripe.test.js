// Stripe: de handtekening, de vorm van het verzoek, en wat er gebeurt als
// dezelfde betaling twee keer binnenkomt.
process.env.API_AIRTABLE = 'stub';
process.env.BASE_AIRTABLE = 'stub';
process.env.STRIPE_SECRET_KEY = 'sk_test_zelftest';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_zelftest';

const crypto = require('crypto');
const BASE = require('path').join(__dirname, '..') + '/';
const _stripe = require(BASE + 'api/_stripe.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

function teken(body, secret, t) {
  const ts = t || Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  return `t=${ts},v1=${sig}`;
}

(async () => {
  console.log('\n— de handtekening —');
  const body = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } });

  ck('een geldige handtekening wordt aanvaard',
     _stripe.verifyWebhook(body, teken(body, 'whsec_zelftest')).type === 'checkout.session.completed');

  const metFout = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };

  ck('een handtekening met de verkeerde sleutel wordt geweigerd',
     metFout(() => _stripe.verifyWebhook(body, teken(body, 'whsec_iemandanders'))) === 'bad_signature');

  // Dit is het geval dat ertoe doet: de handtekening klopt, maar de inhoud is
  // onderweg veranderd. Precies wat een aanvaller zou proberen.
  const gesjoemeld = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', metadata: { credits: '999999' } } } });
  ck('een gewijzigde body met de oude handtekening wordt geweigerd',
     metFout(() => _stripe.verifyWebhook(gesjoemeld, teken(body, 'whsec_zelftest'))) === 'bad_signature');

  ck('zonder handtekening geen doorgang',
     metFout(() => _stripe.verifyWebhook(body, '')) === 'no_signature');

  ck('een handtekening van een uur oud wordt geweigerd',
     metFout(() => _stripe.verifyWebhook(body, teken(body, 'whsec_zelftest', Math.floor(Date.now() / 1000) - 3600))) === 'too_old');

  // Een handtekening uit de TOEKOMST is net zo verdacht als een oude.
  ck('een handtekening uit de toekomst wordt geweigerd',
     metFout(() => _stripe.verifyWebhook(body, teken(body, 'whsec_zelftest', Math.floor(Date.now() / 1000) + 3600))) === 'too_old');

  // Stripe stuurt bij een sleutelwissel twee v1-handtekeningen mee. Eén goede
  // is genoeg; werkte dit niet, dan viel elke betaling uit tijdens een rotatie.
  const t = Math.floor(Date.now() / 1000);
  const goed = crypto.createHmac('sha256', 'whsec_zelftest').update(`${t}.${body}`).digest('hex');
  ck('bij twee handtekeningen volstaat de juiste',
     _stripe.verifyWebhook(body, `t=${t},v1=${'0'.repeat(64)},v1=${goed}`).type === 'checkout.session.completed');

  console.log('\n— de vorm van het verzoek aan Stripe —');
  let verstuurd = null;
  global.fetch = async (url, opts) => {
    verstuurd = { url, body: opts.body, auth: opts.headers.Authorization };
    return { ok: true, status: 200, json: async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/x' }) };
  };
  const offerte = { geldig: true, bedragEur: 249.99, credits: 3000, basisCredits: 3000, bonusCredits: 0, bonusPct: 0, gesprekken: 150 };
  const sessie = await _stripe.createCheckout({ projectCode: 'TELJO', offerte, origin: 'https://app.helvaro.pro' });

  ck('er komt een betaalpagina terug', sessie.url === 'https://checkout.stripe.com/x', sessie);
  ck('de projectcode gaat mee als metadata',
     verstuurd.body.includes('metadata%5BprojectCode%5D=TELJO'), verstuurd.body);
  ck('het aantal credits gaat mee als metadata',
     verstuurd.body.includes('metadata%5Bcredits%5D=3000'), verstuurd.body);
  // 249,99 euro is 24999 cent. Met Math.floor was dit 24998 geworden, elke keer.
  ck('het bedrag staat in hele centen, correct afgerond',
     verstuurd.body.includes('%5Bunit_amount%5D=24999'), verstuurd.body);
  ck('eenmalige betaling, geen abonnement', verstuurd.body.includes('mode=payment'), verstuurd.body);

  console.log('\n— zonder projectcode gebeurt er niets —');
  let code = null;
  try { await _stripe.createCheckout({ projectCode: '', offerte }); } catch (e) { code = e.code; }
  ck('een lege projectcode wordt geweigerd', code === 'no_tenant', code);

  code = null;
  try { await _stripe.createCheckout({ projectCode: 'TELJO', offerte: { geldig: false } }); } catch (e) { code = e.code; }
  ck('een ongeldige offerte wordt geweigerd', code === 'bad_quote', code);

  console.log('\n— dezelfde betaling twee keer —');
  // Het scenario: Stripe krijgt geen 2xx en stuurt de gebeurtenis opnieuw. Zonder
  // de controle vooraan addCredits werd de TELLER twee keer opgehoogd, ook al
  // bleef het grootboek netjes bij één regel.
  let patches = 0;
  const grootboek = [];
  global.fetch = async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    if (String(url).includes('credit_transactions')) {
      if (method === 'GET') {
        const ref = decodeURIComponent(String(url)).match(/\{Reference\}\s*=\s*"([^"]*)"/);
        const gevonden = ref ? grootboek.filter(r => r.ref === ref[1]) : [];
        return { ok: true, status: 200, json: async () => ({ records: gevonden.map(r => ({ id: 'rec' + r.ref, fields: {} })) }), text: async () => '' };
      }
      const f = JSON.parse(opts.body).fields;
      grootboek.push({ ref: f['Reference'] });
      return { ok: true, status: 200, json: async () => ({ id: 'recNieuw', fields: f }), text: async () => '' };
    }
    if (method === 'PATCH') { patches++; return { ok: true, status: 200, json: async () => ({}), text: async () => '' }; }
    return {
      ok: true, status: 200, text: async () => '',
      json: async () => ({ records: [{ id: 'rec1', fields: { 'Credit Allowance': 3000, 'Credits Used': 1000, 'Credit Period': JSON.stringify({ start: new Date().toISOString() }), 'Credit Usage By Feature': '{}' } }] }),
    };
  };
  delete require.cache[require.resolve(BASE + 'api/_credits.js')];
  delete require.cache[require.resolve(BASE + 'api/_ledger.js')];
  const credits = require(BASE + 'api/_credits.js');

  await credits.addCredits('TELJO', 600, { type: 'purchase', reference: 'stripe:cs_dubbel', note: 'test' });
  const naEerste = patches;
  await credits.addCredits('TELJO', 600, { type: 'purchase', reference: 'stripe:cs_dubbel', note: 'test' });

  ck('de eerste boeking werkt de teller bij', naEerste === 1, { naEerste });
  ck('de tweede raakt de teller NIET aan', patches === naEerste, { patches, naEerste });
  ck('en er staat één regel in het grootboek', grootboek.length === 1, grootboek);

  // Een andere referentie moet gewoon doorgaan -- anders zou de bescherming
  // ook echte tweede aankopen blokkeren.
  await credits.addCredits('TELJO', 600, { type: 'purchase', reference: 'stripe:cs_anders', note: 'test' });
  ck('een andere betaling gaat wel door', patches === naEerste + 1 && grootboek.length === 2, { patches, grootboek: grootboek.length });

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
