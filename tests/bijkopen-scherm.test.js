/*
 * Credits bijkopen: wat het scherm zegt moet zijn wat de kassa doet.
 *
 * ── Waar dit over gaat ──────────────────────────────────────────────────────
 * Twee dingen zijn hier veranderd, en allebei raken ze geld:
 *
 *   1. Het koopvenster toont nu een uitgesplitst bedrag (subtotaal, btw,
 *      totaal). Zodra je een btw-bedrag TOONT, beweer je iets. Dat mag alleen
 *      als het klopt met wat er van de kaart gaat.
 *   2. De snelkeuzes stonden als lijstje in de browser. Ze staan nu in
 *      api/_credits.js, bij de rest van de bedragen.
 *
 * ── De koppeling die je niet mag verbreken ──────────────────────────────────
 * api/_stripe.js zet GEEN automatic_tax aan en rekent `bedragEur * 100` af. Er
 * komt dus niets bovenop, en een bedrag waar niets bovenop komt is inclusief
 * btw. Daarom staat BTW_MODUS op 'inclusief'.
 *
 * Zet iemand ooit automatic_tax aan zonder BTW_MODUS mee te veranderen, dan
 * toont het scherm EUR 100 terwijl er EUR 121 afgeschreven wordt. Dat is geen
 * schoonheidsfoutje: dat is de klant iets anders laten betalen dan hij zag.
 * Deze test valt om op precies dat moment.
 *
 * ── De creditbalk ───────────────────────────────────────────────────────────
 * De balk in de zijbalk toont alleen nog een percentage en een streep; de
 * cijfers zitten achter een klik. Dat mag NOOIT betekenen dat de cijfers
 * verdwijnen -- ze verhuizen naar het venster, samen met de weg om bij te
 * kopen. Dat is wat hieronder gecontroleerd wordt.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const plans = require('../api/_plans.js');
const credits = require('../api/_credits.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 260));
  ok ? pass++ : fail++;
};
const lees = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

console.log('\n— btw splitst een totaal, en telt exact terug op —');
{
  const b = plans.btwSplits(100);
  ck('EUR 100 -> 82,64 excl', b && b.exclEur === 82.64, JSON.stringify(b));
  ck('en 17,36 btw',          b && b.btwEur === 17.36, JSON.stringify(b));
  ck('tarief 21%',            b && b.pct === 21, b && b.pct);

  /* Vastgelegde uitkomsten, want dit zijn bedragen die op een factuur komen.
     Ze zijn met de hand na te rekenen: 25 / 1,21 = 20,661... -> 20,66, en de
     btw is de rest. Alleen de SOM controleren is niet genoeg: die klopt bij
     deze opzet altijd (de btw is per definitie het restant), ook als het netto
     bedrag er een cent naast zit. */
  const verwacht = [
    [25,     20.66,   4.34],
    /* 25,01 hoort erbij: 25,01 / 1,21 = 20,6694... en dat moet OMHOOG. Alle
       ronde bedragen hieronder vallen toevallig naar beneden af, dus zonder
       deze regel zou afkappen in plaats van afronden onopgemerkt blijven. */
    [25.01,  20.67,   4.34],
    [49.99,  41.31,   8.68],
    [100,    82.64,  17.36],
    [249.99, 206.60, 43.39],
    [250,    206.61, 43.39],
    [500,    413.22, 86.78],
    [5000,  4132.23, 867.77],
  ];
  for (const [bedrag, excl, btw] of verwacht) {
    const r = plans.btwSplits(bedrag);
    ck(`\u20AC ${bedrag} -> ${excl} + ${btw}`,
       r && r.exclEur === excl && r.btwEur === btw, JSON.stringify(r));
  }

  /* En het geheel telt exact terug op -- geen zwevend centje op de factuur. */
  let scheef = null;
  for (const bedrag of [25, 33.33, 49.99, 50, 99.99, 100, 249.99, 250, 500, 1234.56, 5000]) {
    const r = plans.btwSplits(bedrag);
    if (!r || Math.round((r.exclEur + r.btwEur) * 100) !== Math.round(r.totaalEur * 100)) {
      scheef = { bedrag, r }; break;
    }
  }
  ck('excl + btw is bij elk bedrag exact het totaal', scheef === null, JSON.stringify(scheef));

  ck('het totaal is het bedrag zelf, er komt niets bovenop',
     plans.btwSplits(250).totaalEur === 250, plans.btwSplits(250));
}

console.log('\n— en weigert onzin in plaats van een bedrag te verzinnen —');
for (const slecht of [0, -10, null, undefined, NaN, 'honderd', {}]) {
  ck(`${JSON.stringify(slecht)} -> null`, plans.btwSplits(slecht) === null, plans.btwSplits(slecht));
}

console.log('\n— de modus klopt met wat Stripe doet —');
{
  const stripe = lees('api/_stripe.js');
  const heeftTax = /automatic_tax|tax_behavior|tax_rates/.test(stripe);
  ck('Stripe telt er niets bovenop', !heeftTax, 'automatic_tax/tax_behavior gevonden');
  ck("dus de modus is 'inclusief'", plans.BTW_MODUS === 'inclusief', plans.BTW_MODUS);
  /* De koppeling zelf. Als er ooit tax in Stripe komt, moet dit meeveranderen. */
  ck('en die twee spreken elkaar niet tegen',
     heeftTax === (plans.BTW_MODUS === 'exclusief'),
     `stripe tax: ${heeftTax}, modus: ${plans.BTW_MODUS} — verander ze samen`);
  ck('het bedrag dat Stripe afrekent is het bedrag uit de offerte',
     /Math\.round\(Number\(offerte\.bedragEur\) \* 100\)/.test(stripe), null);
}

console.log('\n— de snelkeuzes komen van de server —');
{
  const p = credits.topupPresets();
  ck('er zijn tegels', p.length > 0, p.length);
  ck('elk met een bedrag, credits en gesprekken',
     p.every((t) => t.bedragEur > 0 && t.credits > 0 && t.gesprekken > 0), JSON.stringify(p));
  ck('allemaal binnen de grenzen',
     p.every((t) => t.bedragEur >= credits.TOPUP_MIN_EUR && t.bedragEur <= credits.TOPUP_MAX_EUR),
     JSON.stringify(p));
  /* Eén rekenweg. Een tegel die iets anders zegt dan de offerte voor hetzelfde
     bedrag is een tegel die liegt op het moment dat je erop klikt. */
  ck('een tegel zegt hetzelfde als de offerte voor dat bedrag',
     p.every((t) => credits.topupOfferte(t.bedragEur).credits === t.credits), JSON.stringify(p));

  /* Buiten de grenzen hoort een tegel te VERDWIJNEN, niet ongeldig te worden. */
  const bovenMax = credits.TOPUP_PRESETS.filter((n) => n > credits.TOPUP_MAX_EUR);
  ck('bedragen boven het maximum vallen weg',
     p.every((t) => bovenMax.indexOf(t.bedragEur) === -1), JSON.stringify(bovenMax));
}

console.log('\n— de route stuurt tegels en btw mee —');
{
  const leads = lees('api/leads.js');
  const i = leads.indexOf("body.mode === 'credit-quote'");
  const blok = leads.slice(i, i + 1400);
  ck('credit-quote bestaat', i > -1, null);
  ck('met de tegels van de server', /presets: credits\.topupPresets\(\)/.test(blok), null);
  ck('en de btw-uitsplitsing', /btw: require\('\.\/_plans'\)\.btwSplits\(/.test(blok), null);
  ck('de offerte wordt op de server berekend, niet overgenomen',
     /credits\.topupOfferte\(body\.amountEur\)/.test(blok), null);
}

console.log('\n— het koopvenster toont wat de server zegt, en rekent zelf niets —');
{
  const dash = lees('api/dashboard.js');
  ck('er zijn tegels in plaats van pillen', dash.indexOf('id="koop-tegels"') !== -1, null);
  ck('ze worden uit d.presets getekend', /koopState\.presets = d\.presets/.test(dash), null);
  ck('en er staat geen bedragenlijst meer in de browser',
     dash.indexOf('KOOP_PRESETS') === -1, null);

  ck('de bedragregels bestaan', dash.indexOf('id="koop-rijen"') !== -1, null);
  /* Het blok dat de regels echt tekent -- niet de tak die ze leegmaakt. */
  const rijen = (dash.match(/rijen\.innerHTML =\s*\n?\s*'<div class="koop-rij"[\s\S]{0,700}?;/) || [''])[0];
  ck('het blok dat de regels tekent is gevonden', rijen.length > 0, null);
  ck('subtotaal komt uit b.exclEur',  /euroBonFmt\(b\.exclEur\)/.test(rijen), null);
  ck('btw uit b.btwEur',              /euroBonFmt\(b\.btwEur\)/.test(rijen), null);
  ck('totaal uit b.totaalEur',        /euroBonFmt\(b\.totaalEur\)/.test(rijen), null);
  ck('het tarief wordt niet hardgecodeerd', /b\.pct/.test(rijen) && !/21\s*%/.test(rijen), rijen.slice(0, 160));

  /* De browser mag geen enkel bedrag zelf uitrekenen -- niet de credits en
     niet de btw. Anders is het getal dat de klant ziet ook het getal dat hij
     kan aanpassen. */
  /* Alleen de koopcode bekijken: elders in het bestand staan SVG-coordinaten
     waar toevallig "1.21" in voorkomt, en die zeggen niets over btw. */
  const koopFn = (dash.match(/async function koopOfferteOphalen\(\) \{[\s\S]*?\n\}/) || [''])[0];
  ck('koopOfferteOphalen is gevonden', koopFn.length > 0, null);
  ck('nergens een btw-berekening in de frontend',
     !/1\.21|\*\s*0\.21|pct\s*\/\s*100/.test(koopFn), null);
  ck('en de credits worden niet zelf gedeeld',
     !/koopState\.bedrag\s*\/\s*[0-9.]+/.test(dash), null);
}

console.log('\n— de creditbalk toont alleen een percentage en een streep —');
{
  const dash = lees('api/dashboard.js');
  const widget = dash.slice(dash.indexOf('id="credit-usage-widget"'),
                            dash.indexOf('id="credit-usage-widget"') + 1000);
  ck('de balk is een knop', /class="credit-usage-btn"/.test(widget), null);
  ck('met het percentage', widget.indexOf('id="credit-usage-pct"') !== -1, null);
  ck('en de streep', widget.indexOf('id="credit-usage-fill"') !== -1, null);
  /* Dit is de eis: de cijfers staan NIET meer altijd in beeld. */
  ck('de vaste cijferregel eronder is weg', dash.indexOf('credit-usage-sub') === -1, null);
  ck('hij zegt aan schermlezers of hij open staat', /aria-expanded="false"/.test(widget), null);
  ck('en wijst naar het venster dat hij opent', /aria-controls="credit-usage-pop"/.test(widget), null);
}

console.log('\n— en de cijfers staan in het venster erachter —');
{
  const dash = lees('api/dashboard.js');
  const fn = (dash.match(/function tekenCreditPop\(\) \{[\s\S]*?\n\}/) || [''])[0];
  ck('tekenCreditPop bestaat', fn.length > 0, null);
  ck('gebruikt / limiet',     /d\.used/.test(fn) && /d\.allowance/.test(fn), null);
  ck('resterende gesprekken', /leadsRemaining/.test(fn), null);
  ck('dagen tot de nieuwe periode', /d\.daysLeft/.test(fn), null);
  ck('en de kleur volgt dezelfde drempels als de balk',
     /pct >= 100 \? 'red' : \(pct >= 80 \? 'amber' : ''\)/.test(fn), null);

  ck('er kan van hieruit bijgekocht worden', /creditPopBijkopen/.test(fn), null);
  ck('en het venster gaat dan dicht',
     /function creditPopBijkopen\(\) \{[\s\S]{0,120}sluitCreditPop\(\);[\s\S]{0,80}openKoopModal\(\)/.test(dash), null);

  /* Boven de limiet blijft de toon dezelfde als in api/_credits.js: er wordt
     niets geblokkeerd, dus er hoort hier niets te staan dat dat suggereert. */
  ck('boven de limiet blijft het eerlijk', /blijft/.test(fn) && /overLimit/.test(fn), null);
}

console.log('\n— het venster is te sluiten zonder muis, en blijft bij zijn knop —');
{
  const dash = lees('api/dashboard.js');
  ck('Escape sluit het', /e\.key !== 'Escape'[\s\S]{0,260}sluitCreditPop\(\)/.test(dash), null);
  ck('en geeft de focus terug', /sluitCreditPop\(\);[\s\S]{0,140}knop\.focus\(\)/.test(dash), null);
  ck('buiten klikken sluit het', /pop\.contains\(e\.target\)[\s\S]{0,220}sluitCreditPop\(\)/.test(dash), null);
  ck('een klik op de knop zelf sluit het niet meteen weer',
     /knop\.contains\(e\.target\)\) return;/.test(dash), null);
  /* position:fixed weet niets van de knop waar het bij hoort. */
  ck('bij resize gaat het dicht', /addEventListener\('resize', sluitCreditPop\)/.test(dash), null);
  ck('en het past zich aan als het bovenaan niet past',
     /function plaatsCreditPop\(\)[\s\S]{0,600}window\.innerHeight/.test(dash), null);

  ck('openen haalt verse cijfers op',
     /function toggleCreditPop\(e\) \{[\s\S]{0,700}loadCreditUsage\(true\)/.test(dash), null);
  ck('en een lopende verbruiksmelding werkt het venster bij',
     /pop\.style\.display !== 'none'\) tekenCreditPop\(\)/.test(dash), null);
}

console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
