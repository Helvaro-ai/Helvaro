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
  return new Promise((resolve, reject) => {
    const delen = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > MAX_BODY) { reject(new Error('body te groot')); req.destroy(); return; }
      delen.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(delen)));
    req.on('error', reject);
  });
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
    /* 400 zodat Stripe het NIET opnieuw probeert: een handtekening die niet
       klopt, klopt de tweede keer ook niet. */
    console.warn('[stripe] webhook geweigerd:', e.message);
    return res.status(400).json({ error: 'Handtekening ongeldig' });
  }

  /* Alleen deze ene gebeurtenis doet iets. Alle andere krijgen 200 -- anders
     blijft Stripe ze eindeloos opnieuw aanbieden. */
  if (gebeurtenis.type !== 'checkout.session.completed') {
    return res.status(200).json({ ontvangen: true, genegeerd: gebeurtenis.type });
  }

  const sessie = (gebeurtenis.data && gebeurtenis.data.object) || {};
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

/* Vercel parst een JSON-body standaard. Dat mag hier niet: zie de kop. */
module.exports.config = { api: { bodyParser: false } };
