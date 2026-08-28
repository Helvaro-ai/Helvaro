/*
 * Scale is een VANAFPRIJS: 799 is de bodem, niet het tarief.
 *
 * ── Wat er misging zonder dit ───────────────────────────────────────────────
 * Het afgesproken bedrag stond alleen in de Stripe-omschrijving en nergens in
 * de code. Twee gevolgen, allebei stil:
 *
 *   1. Een kantoor dat 1.500 per maand betaalde kreeg exact dezelfde 20.000
 *      credits als een kantoor dat 799 betaalde. Precies verkeerd om: hij
 *      betaalt meer OMDAT hij meer volume heeft, dus bij hem loopt het plafond
 *      als eerste vol.
 *   2. Helvaro rekende intern met 799 terwijl er iets anders werd geïnd, dus
 *      met de verkeerde marge.
 *
 * ── De regel ────────────────────────────────────────────────────────────────
 * Credits schalen mee met het afgesproken bedrag, tegen dezelfde prijs per
 * credit als het basisplan. Wie het dubbele betaalt krijgt het dubbele, en de
 * marge blijft daarmee per definitie gelijk. Onder de vanafprijs wordt
 * geweigerd (dat is in de praktijk altijd een typefout), en een handmatig
 * creditaantal dat de marge onder de bodem duwt ook.
 *
 * ── Waar de afspraak vandaan komt ───────────────────────────────────────────
 * Uit Airtable, nooit uit de webhook. Anders bepaalt wat er in Stripe getypt is
 * hoeveel iemand mag verbruiken -- dezelfde regel die api/_abonnement.js al
 * hanteerde voor de gewone plannen.
 */
'use strict';

const plans = require('../api/_plans.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 260));
  ok ? pass++ : fail++;
};

const scale  = plans.plan('scale');
const growth = plans.plan('growth');

console.log('\n— Scale is als vanafprijs gemarkeerd, de rest niet —');
ck('Scale draagt vanaf:true',        scale.vanaf === true, scale.vanaf);
ck('Growth niet',                    !growth.vanaf, growth.vanaf);
ck('Starter niet',                   !plans.plan('starter').vanaf, null);
ck('en de bodem is de prijs uit de plantabel', scale.prijsEur === 799, scale.prijsEur);

console.log('\n— zonder afspraak kan Scale niet zelf afgerekend worden —');
{
  const r = plans.effectiefPlan('scale');
  ck('geweigerd', r.ok === false, JSON.stringify(r));
  ck('met een reden die het verkoopgesprek aanwijst',
     r.reden === 'prijs_nog_niet_afgesproken', r.reden);
  ck('en de bodemprijs komt mee, zodat de UI hem kan tonen',
     r.plan && r.plan.prijsEur === 799, r.plan && r.plan.prijsEur);
}

console.log('\n— met een afspraak schalen de credits mee —');
{
  const perCreditBasis = scale.prijsEur / scale.credits;
  for (const bedrag of [799, 1200, 1500, 2400, 5000]) {
    const r = plans.effectiefPlan('scale', { prijsEur: bedrag });
    if (!r.ok) { ck(bedrag + ' EUR wordt geaccepteerd', false, r.reden); continue; }
    const verwacht = Math.ceil((bedrag / perCreditBasis) / plans.CREDIT_AFRONDING) * plans.CREDIT_AFRONDING;
    ck(`${bedrag} EUR -> ${r.plan.credits} credits`, r.plan.credits === verwacht,
       `verwacht ${verwacht}, kreeg ${r.plan.credits}`);
  }
}

console.log('\n— en de marge blijft staan, wat het bedrag ook is —');
{
  const basisMarge = plans.marge(scale.prijsEur, scale.credits);
  for (const bedrag of [799, 1500, 2400, 5000]) {
    const r = plans.effectiefPlan('scale', { prijsEur: bedrag });
    ck(`${bedrag} EUR houdt dezelfde marge (~${Math.round(basisMarge * 100)}%)`,
       r.ok && Math.abs(r.marge - basisMarge) < 0.02,
       r.ok ? Math.round(r.marge * 100) + '%' : r.reden);
  }
}

console.log('\n— wat er geweigerd hoort te worden —');
{
  const g = [
    ['onder de vanafprijs',            { prijsEur: 600 },                 'onder_vanafprijs'],
    ['ver onder de vanafprijs',        { prijsEur: 1 },                   'onder_vanafprijs'],
    ['een absurd creditaantal',        { prijsEur: 1500, credits: 200000 }, 'marge_te_laag'],
  ];
  for (const [naam, afspraak, reden] of g) {
    const r = plans.effectiefPlan('scale', afspraak);
    ck(`${naam} -> ${reden}`, r.ok === false && r.reden === reden, JSON.stringify(r));
  }
  const vast = plans.effectiefPlan('growth', { prijsEur: 900 });
  ck('een afspraak op een plan met vaste prijs -> geweigerd',
     vast.ok === false && vast.reden === 'plan_heeft_vaste_prijs', JSON.stringify(vast));
  const onbekend = plans.effectiefPlan('bestaatniet', { prijsEur: 900 });
  ck('een onbekend plan -> geweigerd', onbekend.ok === false, JSON.stringify(onbekend));
}

console.log('\n— een handmatig afgesproken creditaantal mag, zolang de marge houdt —');
{
  const r = plans.effectiefPlan('scale', { prijsEur: 1500, credits: 30000 });
  ck('1500 EUR met 30.000 credits wordt geaccepteerd', r.ok === true, JSON.stringify(r));
  ck('en gebruikt dat getal, niet de berekening', r.ok && r.plan.credits === 30000, r.ok && r.plan.credits);
  ck('de marge blijft boven de bodem', r.ok && r.marge >= plans.MINIMUM_MARGE, r.ok && r.marge);
}

console.log('\n— de gewone plannen veranderen niet —');
{
  for (const id of ['starter', 'growth']) {
    const basis = plans.plan(id);
    const r = plans.effectiefPlan(id);
    ck(`${basis.naam} blijft ${basis.prijsEur} EUR / ${basis.credits} credits`,
       r.ok && r.plan.prijsEur === basis.prijsEur && r.plan.credits === basis.credits,
       JSON.stringify(r.plan));
    ck(`${basis.naam} is niet als afgesproken gemarkeerd`, r.ok && r.plan.afgesproken === false, null);
  }
}

console.log('\n— de betaalroute en de activatie gebruiken het effectieve plan —');
{
  const fs = require('fs'), path = require('path');
  const leads = fs.readFileSync(path.join(__dirname, '..', 'api/leads.js'), 'utf8');
  const abo   = fs.readFileSync(path.join(__dirname, '..', 'api/_abonnement.js'), 'utf8');

  ck('plan-checkout roept effectiefPlan aan', /_plans\.effectiefPlan\(basisPlan\.id, afspraak\)/.test(leads), null);
  ck('en rekent af met het effectieve plan, niet het basisplan',
     /const plan = effectief\.plan;/.test(leads), null);
  ck('zonder afspraak krijgt de klant een voorstel-aanbod, geen kale fout',
     /code: 'plan_op_maat'/.test(leads), null);

  ck('activeer() past de afspraak toe voor vanafprijs-plannen',
     /if \(plan\.vanaf\) \{[\s\S]{0,900}effectiefPlan\(plan\.id, afspraak\)/.test(abo), null);
  ck('en leest die uit Airtable, niet uit de webhook',
     /Agreed Plan Price EUR/.test(abo) && !/body\.credits|event\.credits/.test(abo), null);
  ck('een kapotte afspraak laat de klant niet buiten staan',
     /teruggevallen op de vanafprijs/.test(abo), null);
}

console.log('\n— de klant kan zelf een voorstel vragen —');
{
  const dash = require('fs').readFileSync(require('path').join(__dirname, '..', 'api/dashboard.js'), 'utf8');
  ck('plan_op_maat opent het berichtvenster',
     /d\.code === 'plan_op_maat'[\s\S]{0,400}toonSupportModal/.test(dash), null);
  ck('met een onderwerp dat opvalt', /onderwerp: 'Voorstel voor Scale'/.test(dash), null);
  ck('de vanafprijs komt van de server', /d\.vanafPrijsEur \?/.test(dash), null);
  /* En staat er NIET als getal in de frontend. Prijzen horen in api/_plans.js en
     nergens anders (CLAUDE.md); tests/zelfbediening.test.js bewaakt dat breed,
     hier houden we het specifiek voor dit venster. */
  ck('en nergens als hardgecodeerd bedrag',
     !/vanafPrijsEur \|\| \d/.test(dash), null);
}

console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
