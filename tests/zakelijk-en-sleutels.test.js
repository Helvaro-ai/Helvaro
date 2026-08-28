/*
 * Twee dingen uit de checklist die tegen elkaar in leken te lopen.
 *
 * ── "Alleen zakelijke e-mailadressen" ───────────────────────────────────────
 * De opdracht vroeg erom. De kop van api/_signup-guard.js bevat een regel die
 * de eigenaar zelf heeft gezet: dit onderdeel WEIGERT NOOIT, en "geen eigen
 * website" mag nooit op zichzelf genoeg zijn — want de ideale klant is een
 * klein Vlaams kantoor met een zwakke webaanwezigheid.
 *
 * Diezelfde redenering geldt voor e-mail. Een makelaar in Aalst mailt vanaf
 * telenet.be of gmail. Een harde blokkade zou precies de beste prospects
 * weigeren, en de opdracht waarschuwde daar zelf voor ("geen te agressieve
 * blacklist die legitieme bedrijven weigert").
 *
 * Dus: een consumentenadres is een SIGNAAL (-10), geen muur. Alleen gmail komt
 * ruim boven de drempel en krijgt gewoon een proefaccount. Sámen met een ander
 * signaal belandt het in de handmatige controle. De echte zakelijke controle
 * staat op de plek waar hij hoort: een btw-nummer bij het abonnement.
 *
 * ── Test- en productiesleutels van Stripe ───────────────────────────────────
 * configured() liet sk_test_ en sk_live_ in ELKE omgeving door. Een live
 * sleutel op een preview-deploy belast echte kaarten van echte klanten, vanaf
 * een branch waar iemand iets uitprobeert. Dat is niet terug te draaien met een
 * deploy, dus dat wordt geweigerd. Een testsleutel in productie is vervelend
 * (het lijkt te betalen, er komt niets binnen) maar breekt niets en belast
 * niemand onterecht -- luid melden, niet blokkeren.
 */
'use strict';

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 240));
  ok ? pass++ : fail++;
};

// ── Consumentenadressen ─────────────────────────────────────────────────────
const guard = require('../api/_signup-guard.js');

console.log('\n— een consumentenadres wordt herkend —');
ck('gmail.com',        guard.isFreemailDomain('gmail.com') === true, null);
ck('telenet.be',       guard.isFreemailDomain('telenet.be') === true, null);
ck('skynet.be',        guard.isFreemailDomain('skynet.be') === true, null);
ck('hotmail.be',       guard.isFreemailDomain('hotmail.be') === true, null);
ck('een eigen domein niet', guard.isFreemailDomain('immo-teljo.be') === false, null);
ck('en hoofdletters maken niet uit', guard.isFreemailDomain('GMAIL.COM') === true, null);

console.log('\n— maar het weegt licht, precies zoals de eigenaar het vroeg —');
{
  const W = guard.WEIGHTS, T = guard.THRESHOLDS;
  ck('het gewicht bestaat', typeof W.FREEMAIL_EMAIL === 'number', W && W.FREEMAIL_EMAIL);
  ck('en is kleiner dan dat van een wegwerpadres',
     Math.abs(W.FREEMAIL_EMAIL) < Math.abs(W.DISPOSABLE_EMAIL),
     `${W.FREEMAIL_EMAIL} vs ${W.DISPOSABLE_EMAIL}`);
  const alleenGmail = T.BASE_SCORE + W.FREEMAIL_EMAIL;
  ck('gmail alléén blijft ruim geaccepteerd (geen muur)',
     alleenGmail >= T.ACCEPT_AT_OR_ABOVE, `${alleenGmail} >= ${T.ACCEPT_AT_OR_ABOVE}`);
  const gmailPlusIets = T.BASE_SCORE + W.FREEMAIL_EMAIL + W.DUPLICATE_DOMAIN + W.FINGERPRINT_REUSED;
  ck('maar gmail + twee andere signalen komt in de controle',
     gmailPlusIets < T.ACCEPT_AT_OR_ABOVE, `${gmailPlusIets} < ${T.ACCEPT_AT_OR_ABOVE}`);
}

console.log('\n— en de regel van de eigenaar staat overeind —');
{
  const bron = require('fs').readFileSync(require('path').join(__dirname, '..', 'api/_signup-guard.js'), 'utf8');
  ck("er is nergens een 'reject'-uitslag bijgekomen",
     !/decision\s*=\s*['"]reject['"]/.test(bron) && !/=>\s*['"]reject['"]/.test(bron), null);
  ck("de uitslag blijft accept of flag",
     /\? 'accept' : 'flag'/.test(bron), null);
}

// ── Stripe-sleutels ─────────────────────────────────────────────────────────
console.log('\n— een live sleutel mag niet buiten productie draaien —');
function metStripe(sleutel, env) {
  const oud = { k: process.env.STRIPE_SECRET_KEY, e: process.env.VERCEL_ENV };
  process.env.STRIPE_SECRET_KEY = sleutel;
  if (env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env;
  delete require.cache[require.resolve('../api/_stripe.js')];
  const st = require('../api/_stripe.js');
  const uit = st.configured();
  process.env.STRIPE_SECRET_KEY = oud.k; process.env.VERCEL_ENV = oud.e;
  if (oud.k === undefined) delete process.env.STRIPE_SECRET_KEY;
  if (oud.e === undefined) delete process.env.VERCEL_ENV;
  return uit;
}
const stil = (fn) => { const e = console.error; console.error = () => {}; try { return fn(); } finally { console.error = e; } };

ck('live in preview     -> UIT',        stil(() => metStripe('sk_live_abc123', 'preview')) === false, null);
ck('live in development -> UIT',        stil(() => metStripe('sk_live_abc123', 'development')) === false, null);
ck('live in productie   -> aan',        stil(() => metStripe('sk_live_abc123', 'production')) === true, null);
ck('test in preview     -> aan',        stil(() => metStripe('sk_test_abc123', 'preview')) === true, null);
ck('test in productie   -> aan (wel gemeld, niet geblokkeerd)',
   stil(() => metStripe('sk_test_abc123', 'production')) === true, null);
ck('zonder omgeving geen oordeel',      stil(() => metStripe('sk_live_abc123', undefined)) === true, null);
ck('geen sleutel blijft uit',           stil(() => metStripe('', 'production')) === false, null);
ck('rommel blijft uit',                 stil(() => metStripe('geen-sleutel', 'production')) === false, null);

console.log('\n— en het wordt luid gemeld, zonder de sleutel te tonen —');
{
  const regels = [];
  const e = console.error; console.error = (...a) => regels.push(a.join(' '));
  metStripe('sk_live_GEHEIMEWAARDE123', 'preview');
  console.error = e;
  const alles = regels.join('\n');
  ck('er is een melding',            /LIVE-sleutel in omgeving/.test(alles), alles);
  ck('de sleutel staat er NIET in',  alles.indexOf('sk_live_GEHEIMEWAARDE123') === -1, alles);
  ck('en er staat wat te doen',      /sk_test_/.test(alles), alles);
}

console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
