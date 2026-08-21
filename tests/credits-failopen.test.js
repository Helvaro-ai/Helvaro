// De fail-open van het creditsysteem, en wat er gebeurt met verbruik dat niet
// weggeschreven kon worden.
process.env.API_AIRTABLE = 'stub';
process.env.BASE_AIRTABLE = 'stub';
const BASE = require('path').join(__dirname, '..') + '/';

// Airtable ligt plat: elke fetch faalt.
global.fetch = async () => { throw new Error('ECONNREFUSED'); };

const c = require(BASE + 'api/_credits.js');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`); ok ? pass++ : fail++; };

(async () => {
  const CODE = 'TESTKLANT';
  console.log('\n— tijdens een storing —');
  let r = await c.checkCredits(CODE, 'faro_chat');
  ck('eerste aanroep mag door (klant niet buitensluiten)', r.allowed === true, r);
  ck('en is gemarkeerd als ongemeten', r.unmetered === true, r);

  console.log('\n— verloren verbruik wordt geteld —');
  for (let i = 0; i < 5; i++) await c.recordUsage(CODE, 'faro_chat', { credits: 3 });
  const lost = c.unrecordedFor(CODE);
  ck('5 mislukte boekingen geteld', lost.calls === 5, lost);
  ck('en de credits opgeteld (5 x 3)', lost.credits === 15, lost);
  ck('met een begintijd om vanaf te herstellen', typeof lost.since === 'string', lost);

  console.log('\n— de fail-open heeft een bodem —');
  for (let i = 0; i < c.UNMETERED_CEILING; i++) await c.recordUsage(CODE, 'faro_chat', { credits: 1 });
  r = await c.checkCredits(CODE, 'faro_chat');
  ck('voorbij het plafond wordt geweigerd', r.allowed === false, r);
  ck('met een reden die de UI kan tonen', r.reason === 'metering_unavailable', r);
  ck('en een uitlegbare boodschap', typeof r.message === 'string' && r.message.length > 10, r);

  console.log('\n— een andere klant heeft er geen last van —');
  r = await c.checkCredits('ANDERE_KLANT', 'faro_chat');
  ck('blijft gewoon toegestaan', r.allowed === true, r);

  console.log('\n— herstel —');
  c.clearUnrecorded(CODE);
  r = await c.checkCredits(CODE, 'faro_chat');
  ck('na opschonen mag het weer', r.allowed === true, r);

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
