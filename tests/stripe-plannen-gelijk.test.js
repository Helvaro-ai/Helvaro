/*
 * Stripe en api/_plans.js moeten hetzelfde zeggen.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * Bij Helvaro Scale stond in Stripe `credits_per_month: unlimited` terwijl
 * _plans.js 20.000 toekent. Dat was geen tegenspraak in de verkoop -- Scale
 * WORDT als onbeperkt-binnen-fair-use verkocht, en 20.000 is de drempel
 * waarboven je het gesprek aangaat, niet een limiet die iemand afknijpt (zie
 * api/_credits.js: een leadgesprek wordt nooit geblokkeerd). Maar wie de
 * productgegevens las, kon het echte getal nergens vinden. Dat is nu
 * rechtgezet: de metadata draagt het getal én de fair-use-belofte.
 *
 * ── Wat dit bestand WEL en NIET kan ─────────────────────────────────────────
 * Het praat niet met Stripe -- een test die een sleutel nodig heeft draait
 * nergens mee. Wat het wél doet: de waarden vastleggen die op dit moment in
 * Stripe staan. Verandert iemand een prijs of een creditaantal in _plans.js
 * zonder Stripe bij te werken, dan zakt deze test en staat er precies bij wat
 * er in Stripe aangepast moet worden.
 *
 * Prijzen horen in _plans.js en nergens anders (CLAUDE.md). Dit bestand is dus
 * geen tweede bron van waarheid: het is een spiegel die klaagt als de kopie
 * scheef gaat lopen.
 */
'use strict';

const plans = require('../api/_plans.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 240));
  ok ? pass++ : fail++;
};

/* Zoals het op 2026-08-28 in het live Stripe-account staat (acct_1U7gUp...).
   Bedragen in eurocent, want zo bewaart Stripe ze. */
const STRIPE = {
  starter: {
    product: 'prod_V8z8OCkphIG3hA',
    price:   'price_1U9CIzPfx1sr2i5UuV6xgSb4',
    centen:  24999,
    metadata: { credits_per_month: '3000',  lead_conversations_per_month: '150',  visualisatie_agent: 'false' },
  },
  growth: {
    product: 'prod_V8zFfjCU6I853R',
    price:   'price_1U9CIzPfx1sr2i5UvAGkpHaT',
    centen:  49900,
    metadata: { credits_per_month: '10000', lead_conversations_per_month: '500',  visualisatie_agent: 'true' },
  },
  scale: {
    product: 'prod_V8zJUn9SaAvnBI',
    price:   'price_1U9CJ0Pfx1sr2i5UGqaTwmm0',
    centen:  79900,
    metadata: { credits_per_month: '20000', lead_conversations_per_month: '1000', visualisatie_agent: 'true' },
  },
};

console.log('\n— elk plan uit de code staat ook in Stripe —');
{
  const uitCode = plans.publiek().map(p => p.id).sort();
  const uitStripe = Object.keys(STRIPE).sort();
  ck('zelfde plannen, geen wees aan beide kanten',
     JSON.stringify(uitCode) === JSON.stringify(uitStripe),
     'code: ' + uitCode.join(',') + '  |  stripe: ' + uitStripe.join(','));
}

console.log('\n— de prijs in Stripe is de prijs uit _plans.js —');
for (const p of plans.publiek()) {
  const s = STRIPE[p.id];
  if (!s) continue;
  const verwacht = Math.round(p.prijsEur * 100);
  ck(`${p.naam}: ${p.prijsEur} EUR = ${verwacht} cent`,
     s.centen === verwacht,
     `stripe heeft ${s.centen}, code zegt ${verwacht} — pas de prijs in Stripe aan (${s.price})`);
}

console.log('\n— het creditaantal in Stripe is dat uit _plans.js —');
for (const p of plans.publiek()) {
  const s = STRIPE[p.id];
  if (!s) continue;
  ck(`${p.naam}: ${p.credits} credits`,
     s.metadata.credits_per_month === String(p.credits),
     `stripe zegt "${s.metadata.credits_per_month}", code zegt "${p.credits}" — `
     + `zet credits_per_month op de productmetadata (${s.product})`);
}

console.log('\n— en het aantal leadgesprekken volgt daar rechtstreeks uit —');
for (const p of plans.publiek()) {
  const s = STRIPE[p.id];
  if (!s) continue;
  ck(`${p.naam}: ${p.gesprekken} gesprekken`,
     s.metadata.lead_conversations_per_month === String(p.gesprekken),
     `stripe zegt "${s.metadata.lead_conversations_per_month}", afgeleid uit de code is "${p.gesprekken}"`);
}

console.log('\n— de visualisatie-agent staat aan waar de code dat zegt —');
for (const p of plans.publiek()) {
  const s = STRIPE[p.id];
  if (!s) continue;
  ck(`${p.naam}: beeldgeneratie ${p.beeldgeneratie}`,
     s.metadata.visualisatie_agent === String(p.beeldgeneratie),
     `stripe: ${s.metadata.visualisatie_agent}, code: ${p.beeldgeneratie}`);
}

console.log('\n— "onbeperkt" blijft een belofte, geen ontbrekend getal —');
{
  const scale = plans.publiek().find(p => p.id === 'scale');
  ck('Scale is in de code onbeperkt binnen fair use', scale.onbeperkt === true, scale.onbeperkt);
  ck('en draagt tóch een concreet creditaantal',
     typeof scale.credits === 'number' && scale.credits > 0, scale.credits);
  /* Dit is de fout die hier gemaakt was: het getal weglaten uit Stripe omdat de
     verkoop "onbeperkt" zegt. Dan staat er nergens meer waar de fair-use-grens
     ligt, en dat is precies het getal dat je nodig hebt als iemand er ver
     overheen gaat. */
  ck('en in Stripe staat dat getal ook, niet alleen het woord',
     /^\d+$/.test(STRIPE.scale.metadata.credits_per_month),
     STRIPE.scale.metadata.credits_per_month);
}

console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
