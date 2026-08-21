/*
 * Eén definitie van "in welke fase zit deze lead".
 *
 * Er waren er drie, en ze spraken elkaar tegen:
 *   - het pipelinebord keek voor "verloren" naar qualified===false &&
 *     status==='completed' (de AI diskwalificeerde hem);
 *   - Analyse keek naar status==='verloren' (de makelaar zette hem zo);
 *   - "gewonnen" was op het bord opgepikt===true en op Analyse afspraakGeboekt.
 *
 * Gevolg voor een makelaar: een lead die hij zelf op "Verloren" zette bleef in
 * de kolom Nieuw staan, en zijn win rate telde leads mee die op het bord nog
 * in "Afspraak" hingen.
 *
 * Deze test draait de ECHTE functie uit de uitgestuurde JavaScript -- niet een
 * kopie ervan, want dan test je je eigen kopie.
 */
const mod = require('../api/dashboard.js');

let pass = 0, fail = 0;
function ck(naam, cond, ctx) {
  console.log(`  ${cond ? 'OK  ' : 'FOUT'}  ${naam}`);
  if (!cond && ctx !== undefined) console.log('        ' + JSON.stringify(ctx).slice(0, 260));
  cond ? pass++ : fail++;
}

let html = '';
mod({ method: 'GET', url: '/dashboard', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
const js = (html.match(/<script>([\s\S]*?)<\/script>/g) || [])
  .map((x) => x.replace(/<\/?script>/g, '')).sort((a, b) => b.length - a.length)[0] || '';

const i = js.indexOf('function pipelineStageOf');
const bron = js.slice(i, js.indexOf('\n}', i) + 2);
const fase = new Function(bron + '; return pipelineStageOf;')();

console.log('\n— de fasen zelf —');
ck('een verse lead is nieuw',        fase({}) === 'new', fase({}));
ck('gekwalificeerd',                 fase({ qualified: true }) === 'qualified');
ck('afspraak geboekt',               fase({ qualified: true, afspraakGeboekt: true }) === 'afspraak');
ck('opgepikt telt als gewonnen',     fase({ qualified: true, afspraakGeboekt: true, opgepikt: true }) === 'won');
ck('de AI diskwalificeerde hem',     fase({ qualified: false, status: 'completed' }) === 'lost');

console.log('\n— de handmatige markering telt, en gaat vóór —');
/* Dit is de bug die een makelaar zag: hij zette een lead op "Verloren" in het
   paneel, en het kaartje bleef in Nieuw staan. */
ck('een lead die de makelaar op verloren zet, IS verloren',
   fase({ status: 'verloren' }) === 'lost', fase({ status: 'verloren' }));
ck('ook als hij daarvoor gekwalificeerd was',
   fase({ qualified: true, status: 'verloren' }) === 'lost');
ck('ook als er een afspraak stond',
   fase({ qualified: true, afspraakGeboekt: true, status: 'verloren' }) === 'lost');
ck('ook als hij al opgepikt was — de makelaar weet iets wat de AI niet weet',
   fase({ qualified: true, afspraakGeboekt: true, opgepikt: true, status: 'verloren' }) === 'lost');

console.log('\n— elke lead zit in precies één fase —');
/* Zou een lead in twee kolommen kunnen vallen, dan tellen de chips boven het
   bord op tot meer dan het totaal. */
const varianten = [];
for (const q of [undefined, true, false])
  for (const a of [undefined, true])
    for (const o of [undefined, true])
      for (const st of [undefined, 'completed', 'verloren'])
        varianten.push({ qualified: q, afspraakGeboekt: a, opgepikt: o, status: st });
const fasen = ['new', 'qualified', 'afspraak', 'won', 'lost'];
ck(`alle ${varianten.length} combinaties geven een geldige fase`,
   varianten.every((v) => fasen.indexOf(fase(v)) !== -1),
   varianten.filter((v) => fasen.indexOf(fase(v)) === -1).slice(0, 3));

console.log('\n— en je kunt er weer uit —');
/* De keerzijde van "verloren gaat vóór": zonder een uitweg zou een lead die de
   makelaar op verloren zette voor altijd in die kolom vastzitten. Sleep je hem
   terug, dan moet die markering weg -- anders staat de kaart even op de goede
   plek en klapt hij terug. */
const iApply = js.indexOf('function applyPipelineStageLocally');
const applyBron = js.slice(iApply, js.indexOf('\n}', js.indexOf('switch (stage)', iApply)) + 2);
const apply = new Function(applyBron + '; return applyPipelineStageLocally;')();

for (const doel of ['new', 'qualified', 'afspraak', 'won']) {
  const lead = { status: 'verloren', qualified: true, afspraakGeboekt: true, opgepikt: true };
  apply(lead, doel);
  ck(`terugslepen naar ${doel} laat hem daar ook staan`, fase(lead) === doel, { doel, kreeg: fase(lead), lead });
}
/* Naar lost slepen schrijft status:'completed' over de handmatige markering
   heen. Dat is geen verlies van informatie: 'completed' met qualified:false is
   de andere manier waarop deze code "verloren" opschrijft, en pipelineStageOf
   leest ze allebei. Wat telt is dat de kaart in Verloren blijft. */
const blijft = { status: 'verloren' };
apply(blijft, 'lost');
ck('naar lost slepen houdt hem verloren', fase(blijft) === 'lost', blijft);

console.log('\n— het bord en de cijfers gebruiken dezelfde functie —');
/* De echte borging: staat er ergens nog een eigen regeltje, dan lopen ze weer
   uit elkaar zodra iemand er één aanpast. */
ck('geen kolomfilter met een eigen verloren-regel',
   !/leads\.filter\(l =>[^)]*qualified === false && l\.status === 'completed'\)/.test(js), null);
ck('geen cijfer meer op status===verloren',
   !/filter\(l => l\.status === 'verloren'/.test(js), null);
ck('geen win rate meer op afspraakGeboekt',
   !/gewonnenCount = leads\.filter\(l => l\.afspraakGeboekt\)/.test(js), null);
ck('de kolommen draaien op pipelineStageOf',
   (js.match(/pipelineStageOf\(l\) === '/g) || []).length >= 5,
   (js.match(/pipelineStageOf\(l\) === '/g) || []).length);

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
