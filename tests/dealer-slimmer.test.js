'use strict';
/*
 * Een slimmere assistent voor de dealer.
 *
 * Drie dingen die de assistent tot 2026-09-26 dom lieten lijken:
 *   1. Wist hij niet welke auto bedoeld werd, dan kreeg het model de eerste
 *      twaalf auto's OP CODE -- ook als de koper net "automaat SUV tot 25.000"
 *      had geschreven en de passende auto's op plek 30 stonden.
 *   2. De wens en de koopinfo (budget, financiering, inruil) werden bewaard,
 *      maar nooit teruggegeven. Het model ziet twintig berichten; wat daarvoor
 *      gezegd werd, vroeg hij opnieuw.
 *   3. 'Petrol' en 'benzine' waren twee verschillende dingen.
 */
const path = require('path');
const fs = require('fs');
const BASE = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`);
  ok ? pass++ : fail++;
};

const wens = require(BASE + 'api/_wens.js');
const vehicles = require(BASE + 'api/_vehicles.js');
const prompts = require(BASE + 'api/_ai/prompts.js');

console.log('\nde wens uit wat hij NU schrijft');
{
  const M = { merken: ['BMW', 'Audi', 'Volkswagen'] };
  const t = (x, o) => wens.uitTekst(x, o);
  const a = t('Ik zoek een automaat SUV tot 25.000 euro');
  ck('automaat + SUV + tot 25.000', a && a.transmissie === 'automaat' && a.carrosserie === 'suv' && a.maxPrijs === 25000, a);
  const b = t('iets onder 20k, diesel, max 120.000 km, vanaf 2019');
  ck('20k + diesel + km-grens + bouwjaar', b && b.maxPrijs === 20000 && b.brandstof === 'diesel' && b.maxKm === 120000 && b.minJaar === 2019, b);
  ck('"max 100.000 km" is een km-grens, geen budget', (() => { const x = t('max 100.000 km graag'); return x && x.maxKm === 100000 && !x.maxPrijs; })(), t('max 100.000 km graag'));
  ck('Frans: électrique jusqu\'à 30 000 €', (() => { const x = t('je cherche une voiture électrique jusqu\'à 30 000 €'); return x && x.brandstof === 'elektrisch' && x.maxPrijs === 30000; })());
  ck('de laatste grens telt: "tot 20k... nee tot 24,5k"', (t('tot 20k... nee eigenlijk tot 24,5k') || {}).maxPrijs === 24500);
  ck('merk alleen als het in de voorraad zit', (t('Hebben jullie een BMW break?', M) || {}).merk === 'bmw');
  ck('twee merken is geen merkwens', !(t('BMW of Audi, maakt niet uit, tot 25k', M) || {}).merk);
  ck('INRUIL: zijn oude Audi diesel is niet wat hij zoekt', t('Ik heb een Audi A4 diesel met 150.000 km om in te ruilen', M) === null, t('Ik heb een Audi A4 diesel met 150.000 km om in te ruilen', M));
  const c = t(['Ik zoek een BMW automaat', 'Ik heb een Audi diesel om in te ruilen, budget tot 30.000'], M);
  ck('inruilbericht levert alleen het budget, de eerdere wens blijft', c && c.merk === 'bmw' && c.transmissie === 'automaat' && c.maxPrijs === 30000 && !c.brandstof, c);
  ck('"de auto van de garage" is geen automaat en geen bestelwagen', t('Is de auto van de garage nog beschikbaar?') === null);
  ck('een vraag naar de prijs is geen budget', t('Wat is de prijs van de Golf?') === null);
  ck('een bedrag zonder bovengrens-woord telt niet', t('ik zag hem voor 25.000 staan') === null);
  ck('onzin-bedrag telt niet', t('tot 5 euro') === null);
}

console.log('\nsynoniemen');
{
  ck('Petrol = benzine', wens.zelfdeSoort('brandstof', 'Petrol', 'benzine'));
  ck('Essence = benzine', wens.zelfdeSoort('brandstof', 'Essence', 'benzine'));
  ck('Automatic = automaat', wens.zelfdeSoort('transmissie', 'Automatic', 'automaat'));
  ck('DSG = automaat', wens.zelfdeSoort('transmissie', '7-traps DSG', 'automaat'));
  ck('Touring = break', wens.zelfdeSoort('carrosserie', 'Touring', 'break'));
  ck('Diesel is geen benzine', !wens.zelfdeSoort('brandstof', 'Diesel', 'benzine'));
  ck('Handgeschakeld is geen automaat', !wens.zelfdeSoort('transmissie', 'Handgeschakeld', 'automaat'));
  ck('Plug-in hybride telt als hybride, niet als elektrisch', wens.soortVan('brandstof', 'Plug-in hybride (benzine/elektrisch)') === 'hybride');
  const m = wens.scoor({ brandstof: 'benzine' }, { brandstof: 'Petrol' });
  ck('scoor() gebruikt het: benzine-wens past op een Petrol-auto', m && m.score === 100, m);
  const lead = wens.matchLeads([{ id: 'l1', notities: JSON.stringify({ wens: { brandstof: 'benzine', transmissie: 'automaat' } }) }],
    { code: 'V1', brandstof: 'Petrol', transmissie: 'Automatic' });
  ck('en dus ook "wie past bij deze nieuwe auto" (matchLeads)', lead.length === 1, lead);
}

/* Een voorraad waar de passende auto's achteraan staan op code. */
const auto = (code, velden) => Object.assign({ code, status: 'beschikbaar', merk: '', model: '', uitvoering: '', inschrijving: '' }, velden);
const VOORRAAD = [];
for (let i = 1; i <= 20; i++) VOORRAAD.push(auto('V' + i, { merk: 'Ford', model: 'Transit', carrosserie: 'Bestelwagen', transmissie: 'Handgeschakeld', prijs: 30000 + i }));
VOORRAAD.push(auto('V21', { merk: 'Kia', model: 'Sportage', carrosserie: 'SUV', transmissie: 'Automatic', prijs: 23950 }));
VOORRAAD.push(auto('V22', { merk: 'Hyundai', model: 'Tucson', carrosserie: 'SUV', transmissie: 'Automaat', prijs: 24500 }));
VOORRAAD.push(auto('V23', { merk: 'Volkswagen', model: 'Golf', carrosserie: 'Hatchback', transmissie: 'Handgeschakeld', prijs: 18950, kleur: 'Zwart' }));
VOORRAAD.push(auto('V24', { merk: 'Volkswagen', model: 'Golf', carrosserie: 'Hatchback', transmissie: 'DSG', prijs: 21950, kleur: 'Wit' }));
VOORRAAD.push(auto('V25', { merk: 'Volvo', model: 'XC90', carrosserie: 'SUV', transmissie: 'Automatic', prijs: 54950 }));

console.log('\nde lijst in de volgorde die er voor deze koper toe doet');
{
  const w = wens.uitTekst('Ik zoek een automaat SUV tot 25.000 euro');
  const r = vehicles.rangschik(VOORRAAD, { wens: w });
  ck('de twee passende SUV\'s staan bovenaan', r.lijst[0].code === 'V21' || r.lijst[0].code === 'V22', r.lijst.slice(0, 3).map((v) => v.code));
  ck('en zijn als passend gemarkeerd', r.passend.has('V21') && r.passend.has('V22'), Array.from(r.passend));
  ck('de XC90 van 54.950 past niet (ruim boven budget)', !r.passend.has('V25'));
  ck('een manuele Golf binnen budget is GEEN automaat SUV', !r.passend.has('V23') && !r.passend.has('V24'), Array.from(r.passend));
  ck('maar de Golf met DSG (automaat, juiste prijs) staat wel meteen na de passende',
    r.lijst[2].code === 'V24', r.lijst.slice(0, 4).map((v) => v.code));
  ck('er valt niets weg', r.lijst.length === VOORRAAD.length);
  const blok = prompts.voertuigen.index(r.lijst, { zoekt: wens.omschrijf(w), genoemd: r.genoemd, passend: r.passend });
  ck('het model ziet WAT HIJ ZOEKT', /WAT HIJ ZOEKT \(uit het gesprek\): .*suv/.test(blok), blok.slice(0, 300));
  ck('en de passende auto\'s in een eigen groep', /PASSEN BIJ WAT HIJ ZOEKT[^\n]*\n- V2[12] \| [^\n]+\n- V2[12] \|/.test(blok), blok.slice(0, 500));
  ck('met de opdracht er een of twee voor te stellen, niets te verzinnen', /Noem nooit een auto die hier niet staat/.test(blok));
  const regels = blok.split('\n').filter((l) => /^- V\d+ \|/.test(l));
  ck('nooit meer dan twaalf auto\'s in de prompt', regels.length === 12, regels.length);
  ck('de rest wordt geteld', /\(en nog 13 andere\)/.test(blok));
}
{
  const w = wens.uitTekst('een elektrische cabrio');
  const r = vehicles.rangschik(VOORRAAD, { wens: w });
  const blok = prompts.voertuigen.index(r.lijst, { zoekt: wens.omschrijf(w), genoemd: r.genoemd, passend: r.passend });
  ck('niets past: het model moet dat eerlijk zeggen', /Niets in de voorraad past echt bij wat hij zoekt/.test(blok), blok.slice(-400));
}
{
  const m = vehicles.matchUitTekst(VOORRAAD, 'is die Golf nog beschikbaar?');
  ck('"die Golf" bij twee Golfs: twijfel', m.reden === 'meerdere' && m.kandidaten.length === 2, m.reden);
  const r = vehicles.rangschik(VOORRAAD, { kandidaten: m.kandidaten });
  ck('de genoemde Golfs staan helemaal bovenaan', r.lijst[0].model === 'Golf' && r.lijst[1].model === 'Golf');
  const blok = prompts.voertuigen.index(r.lijst, { zoekt: '', genoemd: r.genoemd, passend: r.passend });
  ck('met de vraag welke van de twee', /HIJ NOEMDE EEN VAN DEZE \(vraag welke/.test(blok) && /- V23 \|/.test(blok) && /- V24 \|/.test(blok), blok.slice(0, 400));
}
{
  const zonder = prompts.voertuigen.index(VOORRAAD);
  ck('zonder opties: het oude blok, zonder groepen', !/PASSEN|HIJ NOEMDE|WAT HIJ ZOEKT/.test(zonder) && /^VOERTUIGEN DIE DEZE DEALER NU AANBIEDT:\n- V1 \|/.test(zonder));
  ck('zonder opties: nog steeds de eerste twaalf op volgorde', zonder.split('\n')[12].startsWith('- V12 |'), zonder.split('\n')[12]);
}

console.log('\nwat al bekend is, gaat terug naar het model');
{
  ck('niets bekend: geen blok', prompts.voertuigen.profiel({}) === '' && prompts.voertuigen.profiel(null) === '');
  const p = prompts.voertuigen.profiel({ zoekt: 'Bmw, suv, tot € 30.000', aankoop: 'financiering nodig, inruil: Audi A4' });
  ck('zoekt en aankoop staan erin', /Zoekt: Bmw, suv/.test(p) && /Aankoop: financiering nodig, inruil: Audi A4/.test(p), p);
  ck('met de opdracht het niet opnieuw te vragen', /Vraag dit NIET opnieuw/.test(p));
  const koop = require(BASE + 'api/_koop.js');
  const blob = JSON.stringify({ wens: { merk: 'bmw', maxPrijs: 30000 }, koop: { financiering: 'nodig', inruil: { merk: 'audi', model: 'a4' } } });
  ck('de Notities-blob levert de wens', wens.omschrijf(wens.uitNotities(blob)) === 'Bmw, tot € 30.000', wens.omschrijf(wens.uitNotities(blob)));
  ck('en de koopinfo', /inruil/.test(koop.omschrijf(koop.uitNotities(blob))), koop.omschrijf(koop.uitNotities(blob)));
}

console.log('\nde WhatsApp-kant gebruikt het');
{
  const wa = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');
  ck('de lijst wordt gerangschikt met wens en genoemde kandidaten',
    /_vehicles\.rangschik\(voorraad, \{ wens: wensNu, kandidaten: uitkomst\.kandidaten \}\)/.test(wa));
  ck('de wens = bewaard + wat hij nu schrijft (nieuwste wint)',
    /Object\.assign\(\{\}, bekendProfiel\.wens \|\| \{\},\s*_wens\.uitTekst\(laatsteBerichten, \{ merken \}\) \|\| \{\}\)/.test(wa));
  ck('het profiel gaat mee in de prompt', /_ai\.prompts\.voertuigen\.profiel\(/.test(wa) && /if \(profielBlok\) pandSectie \+=/.test(wa));
}

console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
