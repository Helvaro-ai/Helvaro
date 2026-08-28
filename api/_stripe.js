'use strict';
/*
 * Stripe -- betalen voor bijgekochte credits.
 *
 * -- Waarom geen stripe-pakket -------------------------------------------------
 * Twee aanroepen en één handtekeningcontrole. Daar is de officiële SDK van 4 MB
 * niet voor nodig, en elke dependency die in een serverless functie meegaat is
 * koude starttijd die een lead voelt. De REST-API is stabiel en de
 * handtekening is een HMAC-SHA256 uit de standaardbibliotheek.
 *
 * -- Geen route ----------------------------------------------------------------
 * Onderstreepje voorop. De webhook zelf is wél een route (api/stripe.js), want
 * die moet de RUWE body lezen: Stripe tekent de bytes zoals ze verstuurd zijn,
 * en JSON.parse gevolgd door JSON.stringify geeft andere bytes. Eén spatie
 * verschil en elke betaling wordt geweigerd.
 *
 * -- Wat hier NIET gebeurt -----------------------------------------------------
 * Deze module bepaalt geen prijs. Wat een bedrag aan credits oplevert komt uit
 * credits.topupOfferte(), en die rekent op zijn beurt met de plantabel. Een
 * betaalmodule die zelf een prijs berekent is een tweede waarheid, en dan is
 * het een kwestie van tijd tot ze uit elkaar lopen.
 *
 * -- Tenant --------------------------------------------------------------------
 * De projectcode komt van de aanroeper, uit de geverifieerde sessie, en gaat
 * mee als metadata op de sessie bij Stripe. Bij de webhook komt hij dus terug
 * van Stripe -- niet uit de body van wie de webhook ook aanroept, want die is
 * getekend en dus niet te vervalsen. Dat is de enige reden dat de webhook een
 * tenant mag geloven.
 */

const crypto = require('crypto');

const API = 'https://api.stripe.com/v1';

function secret() {
  return String(process.env.STRIPE_SECRET_KEY || '').trim();
}

function webhookSecret() {
  return String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
}

/* ── Hoort deze sleutel bij deze omgeving? ───────────────────────────────────
 * configured() keek alleen of het ergens op een Stripe-sleutel leek, en liet
 * sk_test_ en sk_live_ allebei door in elke omgeving. Twee manieren waarop dat
 * misgaat, en ze zijn niet even erg:
 *
 *   • Een LIVE-sleutel buiten productie. Elke preview-deploy, elke branch van
 *     iemand die iets uitprobeert, kan dan een echte kaart belasten en een echt
 *     abonnement aanmaken. Dat is geld van een klant, en niet terug te draaien
 *     met een deploy. -> weigeren.
 *
 *   • Een TEST-sleutel in productie. Dan lijkt betalen te werken maar komt er
 *     nooit geld binnen, en dat valt pas op als iemand de omzet naloopt.
 *     Vervelend, maar niets raakt stuk en niemand wordt onterecht belast.
 *     -> luid melden, niet blokkeren; anders zet ik met deze wijziging zelf
 *     de betaalstroom uit op een moment dat niemand daarom vroeg.
 *
 * VERCEL_ENV is 'production' | 'preview' | 'development'. Staat hij niet gezet
 * (lokaal, of een test), dan doen we geen uitspraak: dan is er geen omgeving om
 * tegen af te zetten en zou elke keuze een gok zijn.
 */
let _gemeldSleutelMismatch = false;
function omgeving() {
  return String(process.env.VERCEL_ENV || '').trim().toLowerCase();
}
function sleutelPastBijOmgeving() {
  const s = secret();
  const env = omgeving();
  if (!env) return true;                       // geen oordeel zonder omgeving
  if (/^sk_live_/.test(s) && env !== 'production') {
    if (!_gemeldSleutelMismatch) {
      _gemeldSleutelMismatch = true;
      console.error(`[stripe] LIVE-sleutel in omgeving "${env}" — betalen is hier UITGEZET. `
        + 'Een live sleutel buiten productie belast echte kaarten vanaf een preview-deploy. '
        + 'Zet in Vercel een sk_test_-sleutel voor Preview/Development.');
    }
    return false;
  }
  if (/^sk_test_/.test(s) && env === 'production') {
    if (!_gemeldSleutelMismatch) {
      _gemeldSleutelMismatch = true;
      console.error('[stripe] TEST-sleutel in PRODUCTIE — klanten kunnen "betalen" zonder dat er geld binnenkomt. '
        + 'Betalen blijft aan staan (uitzetten zou de verkoop stilleggen), maar dit hoort meteen recht.');
    }
    return true;                               // melden, niet blokkeren
  }
  return true;
}

/** Is Stripe aangesloten? Zonder sleutel gedraagt alles zich als "niet aan". */
function configured() {
  return /^sk_(test|live)_/.test(secret()) && sleutelPastBijOmgeving();
}

function webhookConfigured() {
  return /^whsec_/.test(webhookSecret());
}

class StripeError extends Error {
  constructor(message, code) { super(message); this.name = 'StripeError'; this.code = code || 'stripe_error'; }
}

/* Stripe wil formulier-codering, geen JSON. Nesting gaat via haakjes in de
   sleutel: metadata[projectCode]=TELJO. */
function encode(obj, prefix) {
  const delen = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const sleutel = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object' && !Array.isArray(v)) {
      delen.push(encode(v, sleutel));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        delen.push(typeof item === 'object'
          ? encode(item, `${sleutel}[${i}]`)
          : `${encodeURIComponent(`${sleutel}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else {
      delen.push(`${encodeURIComponent(sleutel)}=${encodeURIComponent(String(v))}`);
    }
  }
  return delen.filter(Boolean).join('&');
}

async function post(pad, body) {
  if (!configured()) throw new StripeError('Stripe is niet aangesloten (STRIPE_SECRET_KEY ontbreekt).', 'not_configured');
  const r = await fetch(`${API}${pad}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      /* Zonder versie krijg je de versie die op het account staat, en die kan
         onder je voeten veranderen zodra iemand in het dashboard iets aanzet. */
      'Stripe-Version': '2024-06-20',
    },
    body: encode(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (data && data.error && data.error.message) || `Stripe gaf ${r.status}`;
    throw new StripeError(msg, (data && data.error && data.error.code) || 'http_' + r.status);
  }
  return data;
}

/**
 * Maak een betaalpagina voor een creditaankoop.
 *
 * @param {object} o
 * @param {string} o.projectCode  de tenant, uit de geverifieerde sessie
 * @param {object} o.offerte      uitkomst van credits.topupOfferte(), server-side berekend
 * @param {string} o.email        optioneel, vult het adres alvast in
 * @param {string} o.origin       waar de klant naartoe terugkeert
 */
async function createCheckout({ projectCode, offerte, email, origin } = {}) {
  const tenant = String(projectCode || '').trim();
  if (!tenant) throw new StripeError('Betaling zonder projectcode.', 'no_tenant');
  if (!offerte || !offerte.geldig) throw new StripeError('Ongeldige offerte.', 'bad_quote');

  const basis = String(origin || 'https://app.helvaro.pro').replace(/\/$/, '');
  /* Bedragen gaan in centen. Math.round en niet Math.floor: 249.99 * 100 is in
     drijvende komma 24998.999999999996, en floor maakt daar 24998 van -- een
     cent te weinig, elke keer, en niemand die het merkt tot de boekhouding
     niet klopt. */
  const centen = Math.round(Number(offerte.bedragEur) * 100);
  if (!(centen > 0)) throw new StripeError('Bedrag van nul.', 'bad_amount');

  const omschrijving = offerte.bonusCredits > 0
    ? `${offerte.credits} credits (${offerte.basisCredits} + ${offerte.bonusCredits} bonus)`
    : `${offerte.credits} credits`;

  return post('/checkout/sessions', {
    mode: 'payment',
    success_url: `${basis}/dashboard?betaling=gelukt`,
    cancel_url: `${basis}/dashboard?betaling=geannuleerd`,
    client_reference_id: tenant,
    customer_email: email || undefined,
    /* Alles wat de webhook straks nodig heeft staat hier. De webhook mag NIETS
       geloven wat niet door Stripe is teruggegeven -- dit is de enige weg
       waarlangs een projectcode een betaling kan bereiken. */
    metadata: {
      projectCode: tenant,
      credits: String(offerte.credits),
      bedragEur: String(offerte.bedragEur),
      bonusPct: String(offerte.bonusPct || 0),
    },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: centen,
        product_data: {
          name: 'Helvaro credits',
          description: `${omschrijving} · ongeveer ${offerte.gesprekken} leadgesprekken`,
        },
      },
    }],
  });
}

/**
 * Maak een betaalpagina voor een ABONNEMENT.
 *
 * Bewust met price_data en niet met een price-id: dan hoeft er in het
 * Stripe-dashboard niets aangemaakt te worden. Zou je met price-ids werken, dan
 * is er per plan een handmatige stap die iemand moet doen én onthouden bij elke
 * prijswijziging -- en dan werkt "de klant meldt zich zelf aan" alleen zolang
 * die iemand oplet. De prijs komt uit api/_plans.js, dus de plantabel blijft de
 * enige waarheid.
 *
 * @param {object} o
 * @param {string} o.projectCode  de tenant, uit de geverifieerde sessie
 * @param {object} o.plan         een plan uit api/_plans.js
 * @param {string} o.email        optioneel
 * @param {string} o.origin       waar de klant naartoe terugkeert
 * @param {string} o.klantId      bestaande Stripe-klant, als die er al is
 */
async function createSubscription({ projectCode, plan, email, origin, klantId } = {}) {
  const tenant = String(projectCode || '').trim();
  if (!tenant) throw new StripeError('Abonnement zonder projectcode.', 'no_tenant');
  if (!plan || !plan.id || !(plan.prijsEur > 0)) throw new StripeError('Onbekend plan.', 'bad_plan');

  const basis = String(origin || 'https://app.helvaro.pro').replace(/\/$/, '');
  const centen = Math.round(Number(plan.prijsEur) * 100);

  const body = {
    mode: 'subscription',
    success_url: `${basis}/dashboard?abonnement=gelukt`,
    cancel_url: `${basis}/dashboard?abonnement=geannuleerd`,
    client_reference_id: tenant,
    /* Zowel op de sessie als op het abonnement zelf. De sessie-metadata komt
       terug bij checkout.session.completed; de abonnement-metadata bij elke
       maandelijkse factuur daarna. Zonder die tweede weet de webhook bij de
       verlenging niet meer wiens abonnement het is. */
    metadata: { projectCode: tenant, plan: plan.id },
    subscription_data: { metadata: { projectCode: tenant, plan: plan.id } },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: centen,
        recurring: { interval: 'month' },
        product_data: { name: `Helvaro ${plan.naam}`, description: plan.omschrijving || '' },
      },
    }],
  };
  /* Een bestaande klant hergebruiken, anders krijgt dezelfde makelaar bij elke
     planwissel een nieuwe klantrij in Stripe en klopt geen enkel overzicht. */
  if (klantId) body.customer = klantId;
  else if (email) body.customer_email = email;

  return post('/checkout/sessions', body);
}

/** Een lopend abonnement opzeggen per einde periode. */
async function cancelSubscription(abonnementId) {
  const id = String(abonnementId || '').trim();
  if (!id) throw new StripeError('Geen abonnement-id.', 'no_subscription');
  /* Aan het EIND van de periode, niet meteen: de klant heeft de maand betaald
     en hoort die maand te krijgen. Meteen opzeggen zou hem zijn eigen geld
     afpakken. */
  return post(`/subscriptions/${encodeURIComponent(id)}`, { cancel_at_period_end: 'true' });
}

/** Een link naar Stripe's eigen portaal: factuur, kaart, opzeggen. */
async function billingPortal({ klantId, origin } = {}) {
  const id = String(klantId || '').trim();
  if (!id) throw new StripeError('Geen Stripe-klant bekend.', 'no_customer');
  const basis = String(origin || 'https://app.helvaro.pro').replace(/\/$/, '');
  return post('/billing_portal/sessions', { customer: id, return_url: `${basis}/dashboard` });
}

/* Hoeveel seconden een getekend verzoek oud mag zijn. Stripe's eigen
   aanbeveling. Zonder deze controle kan iemand die ooit één geldig verzoek
   heeft opgevangen het eeuwig blijven afspelen. */
const TOLERANTIE_S = 300;

/**
 * Controleer de handtekening en geef de gebeurtenis terug.
 *
 * @param {string|Buffer} ruweBody  EXACT de bytes die binnenkwamen
 * @param {string} handtekening     de Stripe-Signature-header
 * @returns {object} de gebeurtenis
 * @throws {StripeError} als de handtekening niet klopt
 */
function verifyWebhook(ruweBody, handtekening) {
  if (!webhookConfigured()) throw new StripeError('STRIPE_WEBHOOK_SECRET ontbreekt.', 'not_configured');
  const kop = String(handtekening || '');
  if (!kop) throw new StripeError('Geen handtekening meegestuurd.', 'no_signature');

  let t = '';
  const v1 = [];
  for (const deel of kop.split(',')) {
    const i = deel.indexOf('=');
    if (i === -1) continue;
    const k = deel.slice(0, i).trim();
    const v = deel.slice(i + 1).trim();
    if (k === 't') t = v;
    else if (k === 'v1') v1.push(v);
  }
  if (!t || !v1.length) throw new StripeError('Handtekening heeft niet de verwachte vorm.', 'bad_signature');

  const leeftijd = Math.floor(Date.now() / 1000) - Number(t);
  if (!isFinite(leeftijd) || Math.abs(leeftijd) > TOLERANTIE_S) {
    throw new StripeError(`Verzoek is ${leeftijd}s oud; buiten de tolerantie van ${TOLERANTIE_S}s.`, 'too_old');
  }

  const body = Buffer.isBuffer(ruweBody) ? ruweBody : Buffer.from(String(ruweBody), 'utf8');
  const verwacht = crypto.createHmac('sha256', webhookSecret())
    .update(Buffer.concat([Buffer.from(`${t}.`, 'utf8'), body]))
    .digest('hex');

  /* timingSafeEqual en geen ===: een gewone stringvergelijking stopt bij het
     eerste verschillende teken, en dat verschil in tijd is genoeg om een
     handtekening teken voor teken te raden. */
  const ok = v1.some((sig) => {
    const a = Buffer.from(verwacht, 'utf8');
    const b = Buffer.from(sig, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
  if (!ok) throw new StripeError('Handtekening klopt niet.', 'bad_signature');

  try {
    return JSON.parse(body.toString('utf8'));
  } catch (e) {
    throw new StripeError('Getekende body is geen geldige JSON.', 'bad_json');
  }
}

module.exports = {
  configured, webhookConfigured, createCheckout, verifyWebhook,
  createSubscription, cancelSubscription, billingPortal,
  StripeError, TOLERANTIE_S,
  _encode: encode,
};
