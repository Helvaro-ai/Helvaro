/*
 * Het weekrapport is bereikbaar voor een klant.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * api/_faro/rapport.js was af en getest -- tests/faro-rapport.test.js dekt de
 * hele berekening met 24 checks. Alleen: NIEMAND riep de module aan. Het enige
 * bestand dat hem require'de was zijn eigen test.
 *
 * Dat is een bijzonder soort schuld. De code is niet stuk, de test is niet
 * stuk, en toch kan geen enkele klant erbij. Er is geen foutmelding, geen
 * kapotte knop, geen logregel -- de functie bestaat gewoon en gebeurt nooit.
 * Precies daarom is het jarenlang onopgemerkt te houden.
 *
 * faro-rapport.test.js bewaakt of de BEREKENING klopt. Dit bestand bewaakt of
 * er iemand bij kan. Die twee zijn niet hetzelfde, en de eerste alleen was hier
 * niet genoeg.
 *
 * Wat hier vastligt:
 *
 *  1. DE TOOL BESTAAT EN IS OPVRAAGBAAR. Een tool die niet in ALL staat is
 *     onzichtbaar voor het model.
 *  2. HIJ LEEST ALLEEN. Een leestool die per ongeluk om bevestiging vraagt
 *     wordt een muur waar een simpele vraag op stukloopt.
 *  3. EEN LEGE WEEK ZEGT IETS. Een tabel met nullen ziet eruit als een storing;
 *     "er kwam niets binnen" is een antwoord.
 *  4. GEEN VERZONNEN VERGELIJKING. Zonder vorige week is "+100%" een sprong
 *     vanaf nul die niemand gemaakt heeft.
 *  5. HET ADVIES VOLGT DE TAAL. De aanbevelingen zijn sleutels en geen zinnen,
 *     juist zodat een Waalse makelaar zijn advies in het Frans krijgt.
 */
'use strict';
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
const data  = require(BASE + 'api/_faro/data.js');
const tools = require(BASE + 'api/_faro/tools.js');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}
const DAG = 86400000;
const nu = Date.now();
/* De datalaag omleiden: dit is een eenheidstest, geen Airtable-test. */
const metLeads = (leads) => { data.leadsFor = async () => ({ leads, truncated: false }); };
const draai = (args, ctx) => tools.get('get_week_report').run(args || {}, ctx || { projectCode: 'T', lang: 'nl' });

(async () => {

console.log('\n  de tool bestaat en is bereikbaar');
{
  const namen = tools.ALL.map((t) => t.name);
  ck('get_week_report staat in ALL', namen.indexOf('get_week_report') !== -1);
  ck('en is opvraagbaar via get()', !!tools.get('get_week_report'));
  /* Zonder dit ziet het model de tool niet, en dan is hij net zo onbereikbaar
     als toen hij helemaal niet bestond. */
  const defs = tools.definitions();
  ck('en staat in de definitions die het model krijgt',
    defs.some((d) => (d.name || (d.function && d.function.name)) === 'get_week_report'));
  ck('het is een leestool', tools.get('get_week_report').kind === 'read');
  /* Een leestool achter een bevestiging is een muur waar een simpele vraag op
     stukloopt. */
  ck('en vraagt dus geen bevestiging', tools.requiresConfirmation('get_week_report') === false);
}

console.log('\n  hij rekent met de echte module, niet met een kopie');
{
  metLeads([
    { id: 'r1', naam: 'Marie',  datum: new Date(nu - 2 * DAG).toISOString(), qualified: true,  afspraakGeboekt: true },
    { id: 'r2', naam: 'Joris',  datum: new Date(nu - 3 * DAG).toISOString(), qualified: true,  afspraakGeboekt: false },
    { id: 'r3', naam: 'Fatima', datum: new Date(nu - 4 * DAG).toISOString(), qualified: false },
  ]);
  const uit = await draai();
  ck('drie leads geteld',        uit.data.rapport.cijfers.leads === 3, uit.data.rapport.cijfers);
  ck('twee gekwalificeerd',      uit.data.rapport.cijfers.gekwalificeerd === 2);
  ck('een afspraak',             uit.data.rapport.cijfers.geboekt === 1);
  ck('met een statblok erbij',   uit.components.some((c) => c.type === 'stat_group'), uit.components.map((c) => c.type));
  /* Gekwalificeerd zonder afspraak is waar het geld ligt; dat hoort het advies
     te zijn als er niemand op een mens wacht. */
  ck('en het advies gaat over de lead zonder afspraak',
    uit.data.aanbeveling && uit.data.aanbeveling.sleutel === 'faro.rap.adv.geenAfspraak',
    uit.data.aanbeveling);
}

console.log('\n  wie op een mens wacht gaat voor alles');
{
  metLeads([
    { id: 'r1', naam: 'Sofie', datum: new Date(nu - 1 * DAG).toISOString(), qualified: true, afspraakGeboekt: false,
      aiPaused: true, samenvatting: 'vroeg naar een hypotheek' },
    { id: 'r2', naam: 'Joris', datum: new Date(nu - 3 * DAG).toISOString(), qualified: true, afspraakGeboekt: false },
  ]);
  const uit = await draai();
  ck('het advies is "wacht op jou"',
    uit.data.aanbeveling && uit.data.aanbeveling.sleutel === 'faro.rap.adv.wacht', uit.data.aanbeveling);
  /* Een getal waar je zelf naar moet gaan zoeken is geen advies. De leads gaan
     als kaart mee. */
  ck('en de lead gaat als kaart mee', uit.components.some((c) => c.type === 'lead_card'),
    uit.components.map((c) => c.type));
}

console.log('\n  een lege week is een antwoord, geen storing');
{
  metLeads([]);
  const uit = await draai();
  ck('hij zegt dat er niets binnenkwam', /niets binnen/i.test(uit.summary), uit.summary);
  /* Een tabel met nullen ziet eruit alsof het product stuk is. */
  ck('en toont geen tabel met nullen', uit.components.length === 0, uit.components.length);
  ck('maar geeft het rapport wel mee',  !!uit.data.rapport);
}

console.log('\n  geen verzonnen vergelijking');
{
  /* Alleen deze week, niets ervoor. "+3 t.o.v. vorige week" zou dan een sprong
     vanaf nul zijn die niemand gemaakt heeft. */
  metLeads([
    { id: 'r1', datum: new Date(nu - 2 * DAG).toISOString(), qualified: true, afspraakGeboekt: true },
  ]);
  const uit = await draai();
  ck('vergelijkbaar staat uit', uit.data.rapport.vergelijkbaar === false, uit.data.rapport.vergelijkbaar);
  ck('en er staat geen verschil in de tekst', !/t\.o\.v\. vorige week/.test(uit.summary), uit.summary);

  /* Mét een vorige week mag het wel. */
  metLeads([
    { id: 'a', datum: new Date(nu - 2 * DAG).toISOString(),  qualified: true, afspraakGeboekt: true },
    { id: 'b', datum: new Date(nu - 10 * DAG).toISOString(), qualified: true, afspraakGeboekt: false },
  ]);
  const met = await draai();
  ck('met een vorige week wel', met.data.rapport.vergelijkbaar === true);
  ck('en dan staat het verschil bij de cijfers',
    met.components[0] && met.components[0].stats.some((s) => /vorige week/.test(s.sub || '')),
    met.components[0] && met.components[0].stats);
}

console.log('\n  het advies volgt de taal van de klant');
{
  metLeads([
    { id: 'r1', naam: 'Sofie', datum: new Date(nu - 1 * DAG).toISOString(), qualified: true, aiPaused: true },
  ]);
  const nl = await draai({}, { projectCode: 'T', lang: 'nl' });
  const fr = await draai({}, { projectCode: 'T', lang: 'fr' });
  const de = await draai({}, { projectCode: 'T', lang: 'de' });
  ck('Nederlands', /wachten op jou/i.test(nl.summary), nl.summary.slice(-60));
  ck('Frans',      /vous attendent/i.test(fr.summary), fr.summary.slice(-60));
  ck('Duits',      /warten auf Sie/i.test(de.summary), de.summary.slice(-60));
  /* Zonder taal in ctx moet er nog steeds iets uitkomen, en niet een lege zin. */
  const zonder = await draai({}, { projectCode: 'T' });
  ck('zonder taal valt hij terug op Nederlands', /wachten op jou/i.test(zonder.summary), zonder.summary.slice(-60));
}

console.log('\n  enkelvoud waar het hoort');
{
  metLeads([
    { id: 'r1', datum: new Date(nu - 2 * DAG).toISOString(), qualified: true, afspraakGeboekt: true },
  ]);
  const uit = await draai();
  /* "1 afspraken" is precies het soort ding dat een product amateuristisch
     laat lijken. Het viel pas op toen deze tool die zin voor het eerst toonde. */
  ck('1 lead, niet 1 leads',         /\b1 lead\b/.test(uit.summary) && !/\b1 leads\b/.test(uit.summary), uit.summary);
  ck('1 afspraak, niet 1 afspraken', /\b1 afspraak\b/.test(uit.summary) && !/\b1 afspraken\b/.test(uit.summary), uit.summary);
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
})();
