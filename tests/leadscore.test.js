/*
 * api/_leadscore.js -- score, temperatuur en volgende actie voor een
 * dealership-lead. Puur bestand, geen fetch: `nu` wordt altijd expliciet
 * meegegeven zodat een test niet van de systeemklok afhangt.
 */
'use strict';

const leadscore = require('../api/_leadscore.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 400));
  ok ? pass++ : fail++;
};

console.log('\n— bereken: de uitersten —');
{
  const alles = leadscore.bereken({
    voertuigCode: 'V1',
    koop: {
      budget: 30000, termijn: 'kort', financiering: 'goedgekeurd', intentie: 'sterk',
      inruil: { merk: 'bmw', model: 'x3' },
    },
    afspraak: { gevraagd: true, type: 'proefrit', geboekt: true },
  });
  ck('alle signalen samen geven 100', alles.score === 100, JSON.stringify(alles));
  ck('100 is hot', alles.temperatuur === 'hot', alles.temperatuur);

  const niets = leadscore.bereken({});
  ck('geen signalen geeft 0', niets.score === 0, JSON.stringify(niets));
  ck('0 is cold', niets.temperatuur === 'cold', niets.temperatuur);
  ck('geen signalen geeft geen redenen', Array.isArray(niets.redenen) && niets.redenen.length === 0, niets.redenen);

  /* voertuig(15) + budget(15) + termijn(10, NIET kort) + financiering(10) = 50 */
  const warm = leadscore.bereken({
    voertuigCode: 'V1',
    koop: { budget: 20000, termijn: 'middel', financiering: 'goedgekeurd' },
  });
  ck('een warme mix geeft precies 50', warm.score === 50, JSON.stringify(warm));
  ck('50 is warm, niet hot en niet cold', warm.temperatuur === 'warm', warm.temperatuur);
}

console.log('\n— bereken: geen dubbeltelling proefrit/bezichtiging —');
{
  const proef = leadscore.bereken({ afspraak: { gevraagd: true, type: 'proefrit' } });
  ck('type=proefrit geeft precies 15', proef.score === 15, JSON.stringify(proef));

  const bezicht = leadscore.bereken({ afspraak: { gevraagd: true, type: 'bezichtiging' } });
  ck('type=bezichtiging geeft precies 10', bezicht.score === 10, JSON.stringify(bezicht));

  /* Een gek samengeplakt type matcht geen van beide exacte strings en valt
     terug op de generieke "afspraak"-tak (5 punten) -- NOOIT 15+10=25. Dit
     bewijst dat er geen manier is om via één aanroep beide tellingen te
     activeren, ook niet met een verzonnen waarde. */
  const beide = leadscore.bereken({ afspraak: { gevraagd: true, type: 'proefritbezichtiging' } });
  ck('een onbekend/samengesteld type geeft nooit 25 (nooit dubbel geteld)',
     beide.score !== 25 && beide.score === 5, JSON.stringify(beide));
}

console.log('\n— bereken: individuele regels —');
{
  ck('termijn "lang" geeft 10, niet 20 (de +10 kort-bonus is voor "kort" alleen)',
     leadscore.bereken({ koop: { termijn: 'lang' } }).score === 10, null);

  ck('termijn "kort" geeft wel de volle 20 (10 + 10)',
     leadscore.bereken({ koop: { termijn: 'kort' } }).score === 20, null);

  ck('financiering "nodig" geeft 0 punten',
     leadscore.bereken({ koop: { financiering: 'nodig' } }).score === 0, null);

  ck('financiering "goedgekeurd" geeft wel 10',
     leadscore.bereken({ koop: { financiering: 'goedgekeurd' } }).score === 10, null);

  ck('een lege inruil ({}) geeft 5 punten (er IS een inruilwagen genoemd)',
     leadscore.bereken({ koop: { inruil: {} } }).score === 5, null);

  ck('geen inruil (null) geeft 0 punten',
     leadscore.bereken({ koop: { inruil: null } }).score === 0, null);
}

console.log('\n— bereken: gooit nooit, ook niet op rommel —');
{
  const rommel = [null, undefined, 'zomaar een string', 42, [1, 2, 3], true,
    { koop: 'geen object', afspraak: 'ook geen object', wens: 123 },
    { afspraak: { gevraagd: true, type: { rare: 'waarde' } } }];
  for (const [i, r] of rommel.entries()) {
    let uitkomst, gegooid = false;
    try { uitkomst = leadscore.bereken(r); } catch (_) { gegooid = true; }
    ck(`rommel ${i + 1} gooit niet`, gegooid === false, r);
    ck(`rommel ${i + 1} geeft een geldig resultaat terug`,
       uitkomst && typeof uitkomst.score === 'number' && ['hot', 'warm', 'cold'].indexOf(uitkomst.temperatuur) !== -1,
       JSON.stringify(uitkomst));
  }
}

console.log('\n— uitNotities / naarNotities: round-trip en stilstand —');
{
  ck('platte tekst geeft null', leadscore.uitNotities('gewoon wat tekst') === null, null);
  ck('kapotte JSON geeft null', leadscore.uitNotities('{niet geldig') === null, null);
  ck('geldige JSON zonder score-sleutel geeft null', leadscore.uitNotities('{"_v":1}') === null, null);
  ck('score met niet-numerieke punten geeft null',
     leadscore.uitNotities(JSON.stringify({ score: { punten: 'veel', temperatuur: 'hot' } })) === null, null);

  const uitkomst = leadscore.bereken({
    voertuigCode: 'V1',
    koop: { budget: 20000, termijn: 'kort', financiering: 'goedgekeurd', intentie: 'sterk', inruil: { merk: 'bmw' } },
    afspraak: { gevraagd: true, type: 'proefrit', geboekt: true },
  });
  const raw1 = leadscore.naarNotities(null, uitkomst);
  ck('naarNotities geeft een string terug', typeof raw1 === 'string', raw1);

  const terug = leadscore.uitNotities(raw1);
  ck('round-trip: punten kloppen', terug !== null && terug.punten === uitkomst.score, JSON.stringify({ terug, uitkomst }));
  ck('round-trip: temperatuur klopt', terug.temperatuur === uitkomst.temperatuur, terug.temperatuur);
  ck('round-trip: redenen zijn de sleutels (niet de hele objecten)',
     JSON.stringify(terug.redenen) === JSON.stringify(uitkomst.redenen.map((r) => r.sleutel)), JSON.stringify(terug.redenen));

  const raw2 = leadscore.naarNotities(raw1, uitkomst);
  ck('dezelfde uitkomst nog een keer opslaan verandert niets -> null', raw2 === null, raw2);

  const andereUitkomst = leadscore.bereken({ koop: { termijn: 'kort' } });
  const raw3 = leadscore.naarNotities(raw1, andereUitkomst);
  ck('een echt andere uitkomst geeft wel weer een string', typeof raw3 === 'string', raw3);
}

console.log('\n— volgendeActie: elke tak, met een expliciete klok —');
{
  /* Zomertijd met opzet: 22:30 UTC is in Brussel al 00:30 de VOLGENDE dag
     (CEST, UTC+2). Als de code de dag naïef op UTC zou baseren in plaats van
     op Europe/Brussels, zou "vandaag" en "morgen" hier verkeerd uitkomen. */
  const nu = new Date('2026-07-10T22:30:00.000Z');   // Brussel: 2026-07-11 00:30
  const vandaagBrussel   = '2026-07-11T18:00:00.000Z'; // Brussel: 2026-07-11 20:00 -> zelfde dag als nu
  const morgenBrussel    = '2026-07-12T09:00:00.000Z'; // Brussel: 2026-07-12 11:00 -> één dag later

  ck('een vandaag geboekte afspraak -> voorbereiden',
     leadscore.volgendeActie({ nu, afspraak: { status: 'booked', startISO: vandaagBrussel } }) === 'voorbereiden', null);

  ck('een morgen geboekte afspraak -> bevestigen',
     leadscore.volgendeActie({ nu, afspraak: { status: 'booked', startISO: morgenBrussel } }) === 'bevestigen', null);

  ck('voertuig verkocht (geen afspraak) -> alternatief',
     leadscore.volgendeActie({ nu, voertuigStatus: 'verkocht' }) === 'alternatief', null);
  ck('voertuig uit aanbod (geen afspraak) -> ook alternatief',
     leadscore.volgendeActie({ nu, voertuigStatus: 'uit aanbod' }) === 'alternatief', null);

  ck('hete lead zonder afspraak -> contacteren',
     leadscore.volgendeActie({ nu, score: 90 }) === 'contacteren', null);

  ck('inruil genoemd maar geen merk/model -> inruil',
     leadscore.volgendeActie({ nu, score: 10, koop: { inruil: { km: 50000 } } }) === 'inruil', null);
  ck('inruil MET merk telt niet mee voor deze tak',
     leadscore.volgendeActie({ nu, score: 10, koop: { inruil: { merk: 'bmw' } } }) !== 'inruil', null);

  const stilte49u = new Date(nu.getTime() - 49 * 3600 * 1000).toISOString();
  ck('stilte van meer dan 48 uur, geen afspraak -> opvolgen',
     leadscore.volgendeActie({ nu, score: 10, laatsteContactISO: stilte49u }) === 'opvolgen', null);

  const stilte47u = new Date(nu.getTime() - 47 * 3600 * 1000).toISOString();
  ck('nog geen 48 uur stilte -> nog geen opvolgen',
     leadscore.volgendeActie({ nu, score: 10, laatsteContactISO: stilte47u }) !== 'opvolgen', null);

  ck('helemaal niets -> null',
     leadscore.volgendeActie({ nu }) === null, null);
  ck('geen input object -> null (gooit ook niet)',
     leadscore.volgendeActie(undefined) === null, null);
}

console.log('\n— volgendeActie: prioriteit, niet los van elkaar —');
{
  const nu = new Date('2026-07-10T22:30:00.000Z');
  const vandaagBrussel = '2026-07-11T18:00:00.000Z';

  ck('een vandaag geboekte afspraak wint van een hete score (80+)',
     leadscore.volgendeActie({ nu, score: 95, afspraak: { status: 'booked', startISO: vandaagBrussel } }) === 'voorbereiden', null);

  ck('een verkocht voertuig wint ook van een hete score',
     leadscore.volgendeActie({ nu, score: 95, voertuigStatus: 'verkocht' }) === 'alternatief', null);
}

console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
process.exit(fail === 0 ? 0 : 1);
