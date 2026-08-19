/*
 * Prijsadvies. De gevaarlijke fout hier is niet een verkeerd getal maar een
 * getal dat zich voordoet als iets wat het niet is: budgetten van kopers zijn
 * geen verkoopstatistiek. Die grens wordt hieronder net zo hard getest als de
 * rekenkunde.
 */
const p = require('../api/_faro/pricing.js');

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${name}`);
  if (!ok) console.log(`        kreeg ${JSON.stringify(actual)}, verwachtte ${JSON.stringify(expected)}`);
  ok ? pass++ : fail++;
}
function ck(name, cond, ctx) {
  console.log(`  ${cond ? 'OK  ' : 'FOUT'}  ${name}`);
  if (!cond) console.log('        ' + JSON.stringify(ctx));
  cond ? pass++ : fail++;
}

const lead = (waarde, dagenGeleden = 1, tekst = '3 slaapkamers gent') => ({
  verwachteWaarde: waarde,
  datum: new Date(Date.now() - dagenGeleden * 86400000).toISOString(),
  samenvatting: tekst,
});

console.log('\n— rekenkunde —');
check('mediaan van een oneven reeks', p.median([1, 2, 3]), 2);
check('mediaan van een even reeks middelt', p.median([1, 2, 3, 4]), 3);
check('mediaan van niets is null', p.median([]), null);
check('p50 valt samen met de mediaan', p.percentile([100, 200, 300], 0.5), 200);
check('p75 interpoleert', p.percentile([100, 200, 300, 400], 0.75), 325);
check('percentiel van een enkele waarde', p.percentile([42], 0.9), 42);

console.log('\n— segment: ALLE woorden moeten voorkomen —');
ck('een segment met twee woorden matcht beide',
   p.matchesSegment({ samenvatting: 'ruime woning in gent, 3 slaapkamers' }, 'gent slaapkamers'), null);
ck('en matcht niet op maar een van de twee',
   !p.matchesSegment({ samenvatting: 'appartement in gent' }, 'gent slaapkamers'), null);
ck('leeg segment matcht alles', p.matchesSegment({ samenvatting: '' }, ''), null);

console.log('\n— te weinig gegevens: liever niets dan een verzonnen prijs —');
const weinig = p.advise({ leads: [lead('300k'), lead('400k')], segment: 'gent' });
check('geen prijs bij een steekproef van twee', weinig.aanbevolenPrijs, null);
check('en dat wordt gemarkeerd', weinig.vraagzijde.betrouwbaar, false);
ck('met een reden die uitlegt waarom', /Onder 8/.test(weinig.vraagzijde.reden), weinig.vraagzijde.reden);

const geenBudget = p.advise({ leads: [lead('onbekend'), lead('n.v.t.')], segment: 'gent' });
check('leads zonder bruikbaar budget geven geen prijs', geenBudget.aanbevolenPrijs, null);
check('en tellen niet mee als budget', geenBudget.vraagzijde.aantalMetBudget, 0);
ck('maar de leads zelf worden wel geteld', geenBudget.vraagzijde.aantalLeads === 2, geenBudget.vraagzijde);

console.log('\n— een echte steekproef —');
const budgetten = ['300k', '320.000', '350k', '350000', '375k', '400k', '420.000', '450k', '480k', '500k'];
const echt = p.advise({ leads: budgetten.map((v, i) => lead(v, i + 1)), segment: 'gent' });
ck('nu wel een prijs', Number.isFinite(echt.aanbevolenPrijs), echt.aanbevolenPrijs);
check('en die is betrouwbaar bevonden', echt.vraagzijde.betrouwbaar, true);
ck('het advies is de p75, niet de mediaan',
   echt.aanbevolenPrijs === echt.vraagzijde.p75 && echt.aanbevolenPrijs > echt.vraagzijde.mediaan,
   { advies: echt.aanbevolenPrijs, p75: echt.vraagzijde.p75, mediaan: echt.vraagzijde.mediaan });
ck('de spreiding klopt met de invoer',
   echt.vraagzijde.laagste === 300000 && echt.vraagzijde.hoogste === 500000, echt.vraagzijde);

console.log('\n— een uitschieter moet opvallen, niet meesturen —');
// Negen bescheiden budgetten en een van 3 miljoen: het gemiddelde ontspoort,
// de mediaan niet. Precies het geval waarin een makelaar te duur zou prijzen.
const scheef = p.advise({
  leads: ['300k', '310k', '320k', '330k', '340k', '350k', '360k', '370k', '380k', '3M']
    .map((v, i) => lead(v, i + 1)),
  segment: 'gent',
});
ck('het gemiddelde ligt fors boven de mediaan',
   scheef.vraagzijde.gemiddelde > scheef.vraagzijde.mediaan * 1.2, scheef.vraagzijde);
ck('en daar wordt voor gewaarschuwd',
   scheef.uitleg.some((u) => /gemiddelde/.test(u) && /mediaan/.test(u)), scheef.uitleg);
ck('het advies blijft in de buurt van de echte budgetten',
   scheef.aanbevolenPrijs < 500000, scheef.aanbevolenPrijs);

console.log('\n— de grens die niet overschreden mag worden —');
// Dit is het hele punt van de module. Zonder externe bron mag er nergens iets
// staan wat als verkoopstatistiek of marktwaarde te lezen is.
ck('zonder marktbron is de enige bron "eigen leads"',
   JSON.stringify(echt.bronnen) === JSON.stringify(['eigen leads']), echt.bronnen);
check('en markt blijft leeg', echt.markt, null);
ck('het advies zegt zelf dat het geen verkoopstatistiek is',
   echt.uitleg.some((u) => /geen verkoopstatistiek/.test(u)), echt.uitleg);
ck('nergens wordt het woord marktwaarde geclaimd',
   !echt.uitleg.some((u) => /marktwaarde/i.test(u)), echt.uitleg);

// En met een bron erbij MOET die bron genoemd worden.
const metMarkt = p.advise({
  leads: budgetten.map((v, i) => lead(v, i + 1)),
  segment: 'gent',
  market: { mediaanPrijs: 412000, bron: 'Statbel', gemeente: 'Gent' },
});
ck('met een marktbron staat die erbij', metMarkt.bronnen.indexOf('Statbel') !== -1, metMarkt.bronnen);
ck('en het cijfer wordt genoemd met zijn bron',
   metMarkt.uitleg.some((u) => /Statbel/.test(u) && /412/.test(u)), metMarkt.uitleg);

console.log('\n— periode —');
// Een budget van twee jaar geleden zegt niets over de prijs van vandaag.
const oud = p.advise({ leads: budgetten.map((v, i) => lead(v, 400 + i)), segment: 'gent', days: 180 });
check('oude leads vallen buiten het venster', oud.vraagzijde.aantalMetBudget, 0);
const alles = p.advise({ leads: budgetten.map((v, i) => lead(v, 400 + i)), segment: 'gent', days: 0 });
ck('met days:0 telt alles mee', alles.vraagzijde.aantalMetBudget === 10, alles.vraagzijde);

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
