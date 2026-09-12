/*
 * api/_ai/prompts.js -- de KOOP-opdracht en de boekbaarheidscontext in de
 * voertuigfiche (Fase 4).
 *
 * ── Wat hier bewezen wordt ───────────────────────────────────────────────
 * 1. voertuigen.fiche()/index() dragen de KOOP-instructie, en het pand-blok
 *    van vastgoed (panden.fiche/index) draagt hem NOOIT -- dat schema is
 *    gedeeld, en deze vraag gaat alleen dealers aan.
 * 2. Een verkocht/gereserveerd/uit-aanbod voertuig met alternatieven levert
 *    een blok op dat EXACT die codes noemt en zegt er geen bij te verzinnen.
 *    Zonder alternatieven zegt de fiche eerlijk dat er niets vergelijkbaars
 *    is, in plaats van iets te verzinnen.
 * 3. De inruilregel staat in de KOOP-instructie: rustig doorvragen, nooit een
 *    schatting beloven.
 * 4. `fiche(v, grens)` -- zonder een derde argument -- krijgt nooit de
 *    context-afhankelijke alternatievenblokken. Die verschijnen ALLEEN als er
 *    een `context` wordt meegegeven. (Wat WEL altijd verschijnt, met of
 *    zonder context, is de KOOP-instructie zelf -- die is geen Fase-3-context,
 *    maar een vaste opdracht, zie het bestand zelf.)
 */
'use strict';

const prompts  = require('../api/_ai/prompts');
const vertical = require('../api/_vertical');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 400));
  ok ? pass++ : fail++;
};

const auto = {
  code: 'V1', merk: 'BMW', model: 'M4', uitvoering: 'Competition', prijs: 74999,
  km: 55000, inschrijving: '05/2023', brandstof: 'benzine', transmissie: 'automaat',
  status: 'beschikbaar', troeven: [], omschrijving: '',
};
const grens = vertical.kortingsgrenzen({});

console.log('\n— de KOOP-instructie staat in fiche() en index(), nooit bij vastgoed —');
{
  const f = prompts.voertuigen.fiche(auto, grens);
  const i = prompts.voertuigen.index([auto]);
  ck('fiche() draagt het KOOP-blok', /KOOP:\{/.test(f), f.slice(-500));
  ck('index() draagt het KOOP-blok', /KOOP:\{/.test(i), i.slice(-500));

  const pand = { code: 'P1', adres: 'Kerkstraat 1', postcode: '9000', plaats: 'Gent', type: 'huis', status: 'beschikbaar' };
  const pf = prompts.panden.fiche(pand);
  const pi = prompts.panden.index([pand]);
  ck('panden.fiche() draagt het KOOP-blok NIET', !/KOOP:\{/.test(pf), pf.slice(-300));
  ck('panden.index() draagt het KOOP-blok NIET', !/KOOP:\{/.test(pi), pi.slice(-300));
}

console.log('\n— alle mogelijke waarden staan met naam in de instructie —');
{
  const f = prompts.voertuigen.fiche(auto, grens);
  ck('financiering: cash | goedgekeurd | nodig', /cash \| goedgekeurd \| nodig/.test(f), null);
  ck('termijn: kort | middel | lang, met uitleg', /kort \(binnen ongeveer een maand\)/.test(f), null);
  ck('afspraak-waarden genoemd', /proefrit \| bezichtiging \| ophaling \| gesprek/.test(f), null);
  ck('de koper ziet het blok niet', /De koper ziet dit blok niet/.test(f), null);
  ck('verzin nooit een waarde', /Verzin nooit een waarde/.test(f), null);
}

console.log('\n— de inruilregel: doorvragen, nooit een schatting beloven —');
{
  const f = prompts.voertuigen.fiche(auto, grens);
  ck('vraagt naar merk/model/jaar/km/brandstof/transmissie/staat',
     /merk, model, bouwjaar, kilometerstand, brandstof/.test(f), null);
  ck('één ding per beurt', /één ding per beurt/.test(f), null);
  ck('belooft nooit een schatting/waarde', /Beloof NOOIT een waarde of een schatting/.test(f), null);
  ck('een collega geeft een indicatie', /collega[\s\S]*indicatie/.test(f), null);
}

console.log('\n— zonder context: geen alternatievenblok, met context: wel —');
{
  const zonder = prompts.voertuigen.fiche(Object.assign({}, auto, { status: 'verkocht' }), grens);
  ck('zonder context geen "ALTERNATIEVEN"-kop', !/ALTERNATIEVEN/.test(zonder), zonder.slice(-400));
  ck('zonder context geen "niets vergelijkbaars"-zin', !/niets vergelijkbaars/.test(zonder), null);
  // Het bestaande statusblok (v.status === 'verkocht') blijft wel gewoon staan --
  // dat is ONAFHANKELIJK van context en bestond al voor Fase 3.
  ck('het bestaande statusblok werkt nog steeds', /GEEN proefrit/.test(zonder), zonder.slice(-400));

  const context = {
    boekbaar: { ok: false, reden: 'verkocht' },
    alternatieven: [
      { voertuig: { code: 'X1', merk: 'Audi', model: 'A4', prijs: 28000 } },
      { voertuig: { code: 'X2', merk: 'Audi', model: 'A6', prijs: 31000 } },
    ],
  };
  const met = prompts.voertuigen.fiche(auto, grens, context);
  ck('met context staat de ALTERNATIEVEN-kop er wel', /ALTERNATIEVEN \(alleen deze, verzin er geen bij\):/.test(met), met.slice(-500));
  ck('en EXACT de twee opgegeven codes staan erin', /X1/.test(met) && /X2/.test(met), met.slice(-500));
  ck('geen enkele andere voertuigcode verschijnt in het alternatievenblok',
     !new RegExp('ALTERNATIEVEN[\\s\\S]*X3').test(met), null);
  ck('"verzin er geen" staat erbij', /verzin er geen/.test(met), null);
}

console.log('\n— geen alternatieven: eerlijk zeggen dat er niets is —');
{
  const context = { boekbaar: { ok: false, reden: 'gereserveerd' }, alternatieven: [] };
  const met = prompts.voertuigen.fiche(auto, grens, context);
  ck('"niets vergelijkbaars" staat erin', /niets vergelijkbaars/.test(met), met.slice(-400));
  ck('geen ALTERNATIEVEN-kop als er niets is', !/ALTERNATIEVEN \(/.test(met), null);
  ck('verwijst naar de wens vastleggen in plaats van verzinnen',
     /leg vast wat hij zoekt/.test(met) && /WENS/.test(met), met.slice(-400));
}

console.log('\n— alle vier de redenen worden gedekt (verkocht, uit_aanbod, gereserveerd, afspraak_bestaat) —');
{
  for (const reden of ['verkocht', 'uit_aanbod', 'gereserveerd', 'afspraak_bestaat']) {
    const f = prompts.voertuigen.fiche(auto, grens, { boekbaar: { ok: false, reden }, alternatieven: [] });
    ck(`reden "${reden}" krijgt een eerlijke zin`, /GEEN \(nieuwe\) proefrit/.test(f), f.slice(-300));
  }
  const okContext = prompts.voertuigen.fiche(auto, grens, { boekbaar: { ok: true, reden: null }, alternatieven: [] });
  ck('boekbaar:true levert GEEN blokkade-tekst op', !/niets vergelijkbaars/.test(okContext) && !/GEEN \(nieuwe\) proefrit/.test(okContext), okContext.slice(-300));
}

console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
process.exit(fail === 0 ? 0 : 1);
