'use strict';
/*
 * De Stripe-webhook. De enige plek waar credits van een betaling komen.
 *
 * -- Waarom dit een eigen route is ---------------------------------------------
 * Alles wat er de laatste tijd bij kwam hangt aan api/leads.js via body.mode,
 * omdat Vercel Hobby op twaalf functies zat. Deze kan dat niet, om één reden:
 * Stripe tekent de RUWE bytes van de body. Vercel parst een JSON-body
 * automatisch, en de bytes die je daarna terugkrijgt uit JSON.stringify zijn
 * niet dezelfde -- andere sleutelvolgorde, andere witruimte, andere
 * getalnotatie. De handtekening zou dan bij elke betaling falen, en het zou
 * eruitzien als een probleem bij Stripe.
 *
 * Vandaar de config onderaan: geen bodyParser, we lezen de stream zelf.
 *
 * Het AANMAKEN van een betaling zit wél gewoon op api/leads.js (mode
 * credit-checkout). Daar staat de sessiecontrole al, en die hoort op één plek
 * te blijven staan.
 *
 * -- Wat een webhook mag geloven -----------------------------------------------
 * Niets, tot de handtekening klopt. Daarna alles, want dan komt het van Stripe.
 * De projectcode staat in de metadata die WIJ bij het aanmaken hebben
 * meegegeven; hij komt dus niet uit het verzoek van een vreemde. Dit is de
 * enige plek in de codebase waar een tenant niet uit een sessie komt, en deze
 * uitzondering hangt volledig aan die handtekening.
 *
 * -- Twee keer hetzelfde ------------------------------------------------------
 * Stripe stuurt een gebeurtenis opnieuw als hij geen 2xx krijgt, en soms ook
 * zonder reden. De boeking gebruikt de sessie-id als referentie, en
 * api/_ledger.js weigert een tweede regel met dezelfde referentie. Twee keer
 * dezelfde webhook levert dus één keer credits op.
 */

const _stripe = require('./_stripe');
const credits = require('./_credits');

/* Meer dan dit hoeft een webhook nooit te zijn. Een grens zodat een verkeerd
   gerichte upload deze functie niet leegtrekt. */
const MAX_BODY = 1024 * 256;

function ruweBody(req) {
  /* Eerst kijken of de body er al IS.

     De config onderaan zet bodyParser uit, en dan komt de body als stream. Maar
     die config is een afspraak met de runtime, geen garantie: bij een andere
     Vercel-versie of een verkeerd overgenomen instelling parst hij toch. Dan is
     req.body een OBJECT, blijft de stream leeg, en faalt elke handtekening --
     wat eruitziet als een probleem bij Stripe en het niet is.

     Dit is het enige stuk van de betaalketen dat ik niet lokaal kan bewijzen,
     dus het vangt beide gevallen op:
       Buffer of string  -> gebruiken zoals hij is, byte voor byte
       object            -> WEIGEREN, niet opnieuw serialiseren. JSON.stringify
                            geeft andere bytes (sleutelvolgorde, witruimte,
                            getalnotatie) en dan zou de handtekening ONTERECHT
                            falen, of erger: toevallig kloppen op een body die
                            niet is wat Stripe stuurde.
       niets             -> de stream lezen, het normale geval. */
  /* ── De volgorde hieronder IS de reparatie ────────────────────────────────
     Dit stond andersom: eerst drie keer naar req.body kijken, en pas als dat
     niets opleverde de stream lezen. Dat leek de voorzichtige volgorde en was
     precies de bug.

     In Vercel's Node-runtime is `req.body` namelijk een LAZY GETTER. Hem
     uitlezen is niet passief: die getter slurpt de stream op en parst hem. De
     controle die moest vaststellen ÓF de body al geparst was, veroorzaakte dus
     dat hij geparst werd -- waarna de code zichzelf afwees met "al geparst" en
     500 teruggaf.

     Gemeten op productie, en het verklaart alle vier de gevallen:
       geldige JSON                  -> 500 "Verkeerd geconfigureerd"
       ONgeldige JSON                -> 400 (getter kon niet parsen, viel door)
       zonder content-type           -> 500
       met stripe-signature erbij    -> 500   <- dit is wat Stripe stuurt

     Gevolg: elke echte betaling gaf 500, Stripe probeerde het opnieuw, kreeg
     weer 500, en de credits werden nooit geboekt. Niemand merkte het omdat de
     live-sleutel nog nooit door een echte checkout was gegaan.

     api/whatsapp.js doet hetzelfde soort handtekeningcontrole en werkt wél --
     die leest de stream als eerste, "before the Vercel req.body getter has a
     chance to consume it". Dat is hier nu ook de volgorde.

     De req.body-tak blijft bestaan, maar als TERUGVAL en niet als eerste stap:
     voor een runtime die de stream toch al opgegeten heeft, en voor de tests,
     die een verzoek nabootsen zonder echte stream. */
  const streamBruikbaar = !!(req && req.readable === true && req.readableEnded !== true);

  if (!streamBruikbaar) return uitBody(req);

  return new Promise((resolve, reject) => {
    const delen = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > MAX_BODY) { reject(new Error('body te groot')); req.destroy(); return; }
      delen.push(c);
    });
    req.on('end', () => {
      const buf = Buffer.concat(delen);
      /* Leeg betekent dat er langs ons om al iets met de stream gebeurd is.
         Dan alsnog terugvallen in plaats van een lege body te laten tekenen --
         die zou de handtekening onterecht laten falen. */
      if (buf.length) return resolve(buf);
      try { resolve(uitBody(req)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

/* Wat er van req.body te maken valt. Alleen aanroepen als de stream géén optie
   meer is -- het uitlezen van deze property is wat de stream opeet. */
function uitBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  if (req.body && typeof req.body === 'object') {
    /* NIET opnieuw serialiseren. JSON.stringify geeft andere bytes
       (sleutelvolgorde, witruimte, getalnotatie) dan wat Stripe getekend heeft:
       de handtekening zou dan onterecht falen, of erger, toevallig kloppen op
       een body die niet is wat Stripe stuurde. */
    throw new Error(
      'de body is al geparst tot een object voordat deze route hem kon lezen. '
      + 'De ruwe bytes zijn dan weg en de handtekening valt niet meer te controleren.');
  }
  return Buffer.alloc(0);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Alleen POST' });
  }

  if (!_stripe.webhookConfigured()) {
    /* 503 en geen 500: dit is een instelling die ontbreekt, geen storing. En
       bewust GEEN 200 -- dan zou Stripe denken dat het aankwam en de
       gebeurtenis weggooien, terwijl de klant zijn credits nooit krijgt. */
    console.error('[stripe] webhook binnengekomen maar STRIPE_WEBHOOK_SECRET ontbreekt — '
                + 'de betaling is wel gelukt, de credits zijn NIET geboekt.');
    return res.status(503).json({ error: 'Webhook niet geconfigureerd' });
  }

  let gebeurtenis;
  try {
    const body = await ruweBody(req);
    gebeurtenis = _stripe.verifyWebhook(body, req.headers['stripe-signature']);
  } catch (e) {
    /* Een geparste body is ONZE fout, geen ongeldige handtekening. 500 dus:
       Stripe biedt hem opnieuw aan, en zodra de config klopt komt de betaling
       alsnog binnen in plaats van verloren te gaan. */
    if (/al geparst/.test(e.message)) {
      console.error('[stripe] ' + e.message);
      return res.status(500).json({ error: 'Verkeerd geconfigureerd' });
    }
    /* 400 zodat Stripe het NIET opnieuw probeert: een handtekening die niet
       klopt, klopt de tweede keer ook niet. */
    console.warn('[stripe] webhook geweigerd:', e.message);
    return res.status(400).json({ error: 'Handtekening ongeldig' });
  }

  const object = (gebeurtenis.data && gebeurtenis.data.object) || {};

  /* ── Abonnementen ────────────────────────────────────────────────────────
     Dit is wat "werkt zonder dat er iemand nodig is" echt betekent: een klant
     kiest een plan, betaalt, en zijn limiet staat goed voordat hij terug is op
     het dashboard. Er komt geen mens meer aan te pas. */
  if (gebeurtenis.type === 'checkout.session.completed' && object.mode === 'subscription') {
    const meta = object.metadata || {};
    const code = String(meta.projectCode || object.client_reference_id || '').trim();
    const planId = String(meta.plan || '').trim();
    if (!code || !planId) {
      console.error(`[stripe] abonnement ${object.id} zonder bruikbare metadata — handmatig nakijken.`);
      return res.status(200).json({ ontvangen: true, fout: 'metadata ontbreekt' });
    }
    try {
      const abo = require('./_abonnement');
      await abo.activeer({ projectCode: code, planId,
                           klantId: object.customer, abonnementId: object.subscription });
      return res.status(200).json({ ontvangen: true, plan: planId });
    } catch (e) {
      console.error(`[stripe] abonnement activeren mislukt voor ${code}:`, e.message);
      return res.status(500).json({ error: 'Activeren mislukt' });   // 500 = Stripe probeert opnieuw
    }
  }

  /* Een verlenging. Elke maand opnieuw, en dat is precies waar de creditperiode
     hoort te herstarten: zonder dit blijft een klant op het verbruik van vorige
     maand staan en loopt hij halverwege tegen zijn plafond. */
  if (gebeurtenis.type === 'invoice.paid' && object.subscription) {
    const code = String((object.subscription_details && object.subscription_details.metadata
                        && object.subscription_details.metadata.projectCode) || '').trim();
    if (!code) return res.status(200).json({ ontvangen: true, genegeerd: 'geen projectcode op de factuur' });
    try {
      const credits = require('./_credits');
      await credits.resetPeriod(code);
      console.log(`[stripe] nieuwe periode gestart voor ${code} na een betaalde factuur.`);
    } catch (e) {
      console.warn(`[stripe] periode herstarten mislukt voor ${code}:`, e.message);
    }
    return res.status(200).json({ ontvangen: true });
  }

  /* Opgezegd of verlopen. Data blijft staan -- zie api/_abonnement.js. */
  if (gebeurtenis.type === 'customer.subscription.deleted') {
    const code = String((object.metadata || {}).projectCode || '').trim();
    if (!code) return res.status(200).json({ ontvangen: true, genegeerd: 'geen projectcode' });
    try {
      const abo = require('./_abonnement');
      await abo.stop({ projectCode: code, reden: 'abonnement gestopt bij Stripe' });
    } catch (e) {
      console.error(`[stripe] stoppen mislukt voor ${code}:`, e.message);
      return res.status(500).json({ error: 'Stoppen mislukt' });
    }
    return res.status(200).json({ ontvangen: true, gestopt: true });
  }

  /* Alle overige gebeurtenissen krijgen 200 -- anders blijft Stripe ze
     eindeloos opnieuw aanbieden. */
  if (gebeurtenis.type !== 'checkout.session.completed') {
    return res.status(200).json({ ontvangen: true, genegeerd: gebeurtenis.type });
  }

  const sessie = object;
  const meta = sessie.metadata || {};
  const projectCode = String(meta.projectCode || sessie.client_reference_id || '').trim();
  const aantal = Math.round(Number(meta.credits) || 0);

  /* Betaald is niet hetzelfde als afgerond. Een sessie kan compleet zijn
     terwijl de betaling nog loopt (bankoverschrijving); dan komt er later een
     aparte gebeurtenis. Credits geven voor geld dat er nog niet is, is precies
     het soort fout dat pas maanden later opvalt. */
  if (sessie.payment_status !== 'paid') {
    console.warn(`[stripe] sessie ${sessie.id} afgerond maar payment_status=${sessie.payment_status} — nog geen credits geboekt.`);
    return res.status(200).json({ ontvangen: true, wachtOpBetaling: true });
  }

  if (!projectCode || !(aantal > 0)) {
    /* 200, want opnieuw sturen lost dit niet op. Maar wel luid: hier is geld
       binnen zonder dat we weten van wie. */
    console.error(`[stripe] betaalde sessie ${sessie.id} zonder bruikbare metadata `
                + `(projectCode=${JSON.stringify(projectCode)}, credits=${JSON.stringify(meta.credits)}). `
                + 'Deze klant heeft betaald en GEEN credits gekregen — handmatig bijboeken.');
    return res.status(200).json({ ontvangen: true, fout: 'metadata ontbreekt' });
  }

  try {
    await credits.addCredits(projectCode, aantal, {
      type: 'purchase',
      /* De sessie-id als referentie: stuurt Stripe dezelfde gebeurtenis nog
         eens, dan ziet het grootboek dat hij er al is. */
      reference: `stripe:${sessie.id}`,
      note: `Bijgekocht via Stripe — € ${(Number(sessie.amount_total || 0) / 100).toFixed(2)}`,
      meta: {
        stripeSession: sessie.id,
        bedragEur: Number(sessie.amount_total || 0) / 100,
        bonusPct: Number(meta.bonusPct) || 0,
      },
    });
    console.log(`[stripe] ${aantal} credits geboekt voor ${projectCode} (sessie ${sessie.id}).`);
    return res.status(200).json({ ontvangen: true, geboekt: aantal });
  } catch (e) {
    /* 500 zodat Stripe het opnieuw probeert -- Airtable kan er even uit
       liggen, en dan is nog eens proberen precies wat je wil. */
    console.error(`[stripe] credits boeken mislukt voor ${projectCode} (sessie ${sessie.id}):`, e.message);
    return res.status(500).json({ error: 'Boeken mislukt' });
  }
};

/* Deze export deed NIETS en gaf een vals gevoel van veiligheid.
   `config.api.bodyParser` is een Next.js-conventie; dit project is vanilla
   CommonJS zonder Next.js, dus Vercel keek er nooit naar. De echte bescherming
   is de leesvolgorde in ruweBody() hierboven: de stream eerst, req.body pas als
   terugval. api/whatsapp.js doet hetzelfde en heeft dan ook geen config-export.

   Hij blijft staan omdat hij geen kwaad kan en wel documenteert wat de bedoeling
   is als dit ooit naar een runtime gaat die hem wél leest. */
module.exports.config = { api: { bodyParser: false } };
