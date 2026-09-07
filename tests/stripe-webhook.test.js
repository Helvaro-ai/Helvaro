/*
 * De webhook-route zelf: api/stripe.js.
 *
 * tests/stripe.test.js dekt de handtekening en het aanmaken van een betaling.
 * Deze dekt wat de ROUTE ermee doet, en dat is een ander soort risico: elk
 * antwoord dat hier fout gekozen is, kost geld of een klant.
 *
 *   400  Stripe probeert het NIET opnieuw. Alleen voor iets dat een tweede keer
 *        ook fout gaat, zoals een handtekening die niet klopt.
 *   500  Stripe probeert het WEL opnieuw. Voor een storing aan onze kant.
 *   200  klaar. Ook voor gebeurtenissen die ons niet aangaan -- anders blijft
 *        Stripe ze eeuwig aanbieden.
 *
 * Een verkeerde keuze hier is stil: de klant heeft betaald, en of hij zijn
 * credits krijgt hangt af van een statuscode die niemand ooit ziet.
 */
process.env.API_AIRTABLE = 'stub';
process.env.BASE_AIRTABLE = 'stub';
process.env.STRIPE_SECRET_KEY = 'sk_test_zelftest';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_zelftest';

const crypto = require('crypto');
const { Readable } = require('stream');
const BASE = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

function teken(body, secret = 'whsec_zelftest', t = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${sig}`;
}

// Een verzoek zoals Vercel het aanlevert met bodyParser uit: een stream.
function nepReq(body, handtekening) {
  const r = Readable.from([Buffer.from(body, 'utf8')]);
  r.method = 'POST';
  r.headers = { 'stripe-signature': handtekening };
  return r;
}
function nepRes() {
  const uit = { code: 0, body: null };
  uit.status = (c) => { uit.code = c; return uit; };
  uit.json = (b) => { uit.body = b; return uit; };
  uit.setHeader = () => uit;
  uit.end = () => uit;
  return uit;
}

async function stuur(gebeurtenis, opties = {}) {
  const body = JSON.stringify(gebeurtenis);
  const res = nepRes();
  delete require.cache[require.resolve(BASE + 'api/stripe.js')];
  const handler = require(BASE + 'api/stripe.js');
  await handler(nepReq(body, opties.handtekening || teken(body)), res);
  return res;
}

// Een nagemaakte Airtable + grootboek, gedeeld door de gevallen hieronder.
function nepBase({ patchFaalt = false } = {}) {
  const staat = { patches: [], grootboek: [] };
  global.fetch = async (url, init) => {
    const u = String(url);
    const method = (init && init.method) || 'GET';
    if (u.includes('credit_transactions')) {
      if (method === 'GET') {
        const ref = (decodeURIComponent(u).match(/\{Reference\}\s*=\s*"([^"]*)"/) || [])[1];
        const gevonden = ref ? staat.grootboek.filter((r) => r.ref === ref) : [];
        return { ok: true, status: 200, text: async () => '',
                 json: async () => ({ records: gevonden.map((r) => ({ id: 'rec' + r.ref, fields: {} })) }) };
      }
      const f = JSON.parse(init.body).fields;
      staat.grootboek.push({ ref: f['Reference'], type: f['Type'], credits: f['Credits'] });
      return { ok: true, status: 200, text: async () => '', json: async () => ({ id: 'recNieuw', fields: f }) };
    }
    if (method === 'PATCH') {
      if (patchFaalt) return { ok: false, status: 503, text: async () => 'airtable plat', json: async () => ({}) };
      staat.patches.push(JSON.parse(init.body).fields);
      return { ok: true, status: 200, text: async () => '', json: async () => ({}) };
    }
    return { ok: true, status: 200, text: async () => '',
             json: async () => ({ records: [{ id: 'rec1', fields: {
               'Project Code': 'TELJO', 'Credit Allowance': 3000, 'Credits Used': 500,
               'Credit Period': JSON.stringify({ start: new Date().toISOString() }),
               'Credit Usage By Feature': '{}' } }] }) };
  };
  return staat;
}

const AANKOOP = (over = {}) => ({
  type: 'checkout.session.completed',
  data: { object: Object.assign({
    id: 'cs_1', mode: 'payment', payment_status: 'paid', amount_total: 10000,
    metadata: { projectCode: 'TELJO', credits: '1200', bedragEur: '100' },
  }, over) },
});

const ABONNEMENT = (over = {}) => ({
  type: 'checkout.session.completed',
  data: { object: Object.assign({
    id: 'cs_sub_1', mode: 'subscription', customer: 'cus_1', subscription: 'sub_1',
    metadata: { projectCode: 'TELJO', plan: 'growth' },
  }, over) },
});

(async () => {
  console.log('\n— wat er NIET door mag —');
  let s = nepBase();
  let res = await stuur(AANKOOP(), { handtekening: teken('iets anders') });
  ck('een verkeerde handtekening geeft 400 (niet opnieuw proberen)', res.code === 400, res);
  ck('en er is niets geboekt', s.grootboek.length === 0 && s.patches.length === 0, s);

  console.log('\n— een betaalde creditaankoop —');
  s = nepBase();
  res = await stuur(AANKOOP());
  ck('geeft 200', res.code === 200, res);
  ck('en boekt 1200 credits', res.body && res.body.geboekt === 1200, res.body);
  ck('met een aankoopregel in het grootboek',
     s.grootboek.length === 1 && s.grootboek[0].type === 'purchase', s.grootboek);
  ck('en de sessie-id als referentie',
     s.grootboek[0] && s.grootboek[0].ref === 'stripe:cs_1', s.grootboek);

  console.log('\n— dezelfde webhook nog een keer —');
  // Stripe stuurt opnieuw zodra hij geen 2xx krijgt. Dat mag geen tweede keer
  // credits opleveren.
  const voorPatches = s.patches.length;
  res = await stuur(AANKOOP());
  ck('geeft weer 200', res.code === 200, res);
  ck('maar de teller wordt NIET nog eens bijgewerkt', s.patches.length === voorPatches, s.patches.length);
  ck('en er staat nog steeds één regel', s.grootboek.length === 1, s.grootboek);

  console.log('\n— betaald is niet hetzelfde als afgerond —');
  s = nepBase();
  res = await stuur(AANKOOP({ payment_status: 'unpaid' }));
  ck('een onbetaalde sessie geeft 200', res.code === 200, res);
  ck('maar levert GEEN credits op', s.grootboek.length === 0, s.grootboek);

  console.log('\n— een sessie zonder bruikbare metadata —');
  s = nepBase();
  res = await stuur(AANKOOP({ metadata: {} , client_reference_id: '' }));
  // 200: opnieuw sturen lost dit niet op. Maar het hoort wel luid gelogd te
  // worden, want hier is geld binnen zonder dat we weten van wie.
  ck('geeft 200 zodat Stripe stopt met proberen', res.code === 200, res);
  ck('en zegt dat de metadata ontbreekt', res.body && res.body.fout === 'metadata ontbreekt', res.body);

  console.log('\n— een abonnement —');
  s = nepBase();
  res = await stuur(ABONNEMENT());
  ck('geeft 200', res.code === 200, res);
  ck('en zet het plan', res.body && res.body.plan === 'growth', res.body);
  const laatste = s.patches[s.patches.length - 1] || {};
  ck('op actief', laatste['Plan Status'] === 'active', laatste);
  ck('met de limiet van dat plan (10.000)', laatste['Credit Allowance'] === 10000, laatste);
  ck('en de Stripe-ids onthouden',
     laatste['Stripe Customer ID'] === 'cus_1' && laatste['Stripe Subscription ID'] === 'sub_1', laatste);

  console.log('\n— een abonnement met een verzonnen plan —');
  s = nepBase();
  res = await stuur(ABONNEMENT({ metadata: { projectCode: 'TELJO', plan: 'platinum' } }));
  // 500, want dit is een storing: Stripe mag het opnieuw proberen terwijl wij
  // uitzoeken wat er mis is. Beter dan stil 200 geven op een betaalde klant.
  ck('geeft 500 zodat Stripe het opnieuw aanbiedt', res.code === 500, res);
  ck('en er is geen limiet gezet', !s.patches.some((p) => p['Credit Allowance']), s.patches);

  console.log('\n— Airtable ligt eruit tijdens een abonnement —');
  s = nepBase({ patchFaalt: true });
  res = await stuur(ABONNEMENT());
  ck('geeft 500 zodat het opnieuw geprobeerd wordt', res.code === 500, res);

  console.log('\n— een opzegging —');
  s = nepBase();
  res = await stuur({ type: 'customer.subscription.deleted',
                      data: { object: { id: 'sub_1', metadata: { projectCode: 'TELJO' } } } });
  ck('geeft 200', res.code === 200, res);
  const na = s.patches[s.patches.length - 1] || {};
  ck('zet de status op opgezegd', na['Plan Status'] === 'cancelled', na);
  ck('koppelt het abonnement los', na['Stripe Subscription ID'] === '', na);
  // De data van de klant blijft staan: hij houdt zijn leads en zijn panden.
  ck('en raakt de creditlimiet niet aan', na['Credit Allowance'] === undefined, na);

  console.log('\n— gebeurtenissen die ons niet aangaan —');
  s = nepBase();
  for (const type of ['payment_intent.created', 'customer.updated', 'charge.succeeded']) {
    res = await stuur({ type, data: { object: {} } });
    ck(`${type} krijgt 200 en wordt genegeerd`,
       res.code === 200 && res.body && res.body.genegeerd === type, { code: res.code, body: res.body });
  }
  ck('en er is niets geboekt', s.grootboek.length === 0 && s.patches.length === 0, s);

  console.log('\n— zonder webhooksleutel —');
  const bewaard = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = '';
  res = await stuur(AANKOOP());
  // Bewust GEEN 200: dan zou Stripe denken dat het aankwam en de gebeurtenis
  // weggooien, terwijl de klant zijn credits nooit krijgt.
  ck('geeft 503 en geen 200', res.code === 503, res);
  process.env.STRIPE_WEBHOOK_SECRET = bewaard;

  console.log('\n— de stream gaat voor, en de getter wordt niet aangeraakt —');
  /* Dit is de test die er niet was, en die had dit moeten vangen.
     
     In Vercel's Node-runtime is req.body een LAZY GETTER. Hem uitlezen is niet
     passief: die getter slurpt de stream op en parst hem. ruweBody() keek eerst
     drie keer naar req.body en las pas daarna de stream -- dus de controle die
     moest vaststellen ÓF de body geparst was, veroorzaakte dat hij geparst werd.

     Op productie gemeten voordat dit gerepareerd was:
       geldige JSON                 -> 500 "Verkeerd geconfigureerd"
       ONgeldige JSON               -> 400 (getter kon niet parsen, viel door)
       met stripe-signature erbij   -> 500   <- dit is wat Stripe stuurt

     Elke echte betaling gaf dus 500. Stripe probeerde opnieuw, kreeg weer 500,
     en de credits werden nooit geboekt.

     De oude test kon dit niet zien: zijn nep-verzoek had `on: () => {}` en
     GEEN getter, dus er viel niets op te slurpen. Deze nabootsing heeft allebei. */
  {
    nepBase();
    const body = JSON.stringify(AANKOOP());
    let getterAangeraakt = false;
    const brokken = [Buffer.from(body, 'utf8')];
    const req5 = {
      method: 'POST',
      headers: { 'stripe-signature': teken(body) },
      readable: true,
      readableEnded: false,
      on(gebeurtenis, fn) {
        /* Een stream die zijn inhoud aflevert, zoals Vercel hem aanlevert
           wanneer er nog niemand aan req.body gezeten heeft. */
        if (gebeurtenis === 'data') brokken.forEach((b) => setImmediate(() => fn(b)));
        if (gebeurtenis === 'end')  setImmediate(() => setImmediate(fn));
        return req5;
      },
    };
    Object.defineProperty(req5, 'body', {
      get() { getterAangeraakt = true; return JSON.parse(body); },
    });

    const res5 = nepRes();
    delete require.cache[require.resolve(BASE + 'api/stripe.js')];
    const handler5 = require(BASE + 'api/stripe.js');
    await handler5(req5, res5);

    /* Het ene dat telt: de getter mag niet aangeraakt zijn. Gebeurt dat wel,
       dan is de body op een echte Vercel geparst en zijn de bytes weg. */
    ck('de req.body-getter is NIET aangeraakt', getterAangeraakt === false, { getterAangeraakt });
    ck('en de handtekening klopt dus', res5.code === 200, res5);
  }

  console.log('\n— als de body toch al geparst is —');
  /* De config onderaan api/stripe.js zet bodyParser uit. Dat is een afspraak
     met de runtime, geen garantie. Gaat die afspraak stuk, dan is req.body een
     object en zou elke betaling er als een ongeldige handtekening uitzien --
     terwijl er niets mis is met Stripe.

     Het mag dan NIET opnieuw geserialiseerd worden: JSON.stringify geeft andere
     bytes dan wat er getekend is. En het moet 500 geven en geen 400, zodat
     Stripe het opnieuw aanbiedt zodra de config gerepareerd is, in plaats van
     de betaling weg te gooien. */
  {
    const res3 = nepRes();
    delete require.cache[require.resolve(BASE + 'api/stripe.js')];
    const handler = require(BASE + 'api/stripe.js');
    const req3 = { method: 'POST', headers: { 'stripe-signature': teken('{}') },
                   body: { type: 'checkout.session.completed' }, on: () => {} };
    await handler(req3, res3);
    ck('een geparste body geeft 500 (Stripe probeert opnieuw)', res3.code === 500, res3);
    ck('en niet 400 (dat zou de betaling weggooien)', res3.code !== 400, res3);
  }
  {
    // Een Buffer is prima: dan is het nog steeds byte voor byte wat er getekend is.
    const body = JSON.stringify(AANKOOP());
    nepBase();
    const res4 = nepRes();
    delete require.cache[require.resolve(BASE + 'api/stripe.js')];
    const handler = require(BASE + 'api/stripe.js');
    await handler({ method: 'POST', headers: { 'stripe-signature': teken(body) },
                    body: Buffer.from(body, 'utf8'), on: () => {} }, res4);
    ck('een Buffer-body werkt gewoon', res4.code === 200, res4);
  }

  console.log('\n— alleen POST —');
  const res2 = nepRes();
  delete require.cache[require.resolve(BASE + 'api/stripe.js')];
  await require(BASE + 'api/stripe.js')({ method: 'GET', headers: {}, on: () => {} }, res2);
  ck('GET geeft 405', res2.code === 405, res2);

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
