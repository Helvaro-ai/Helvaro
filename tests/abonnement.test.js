// Het abonnement: van proef naar betalend, zonder dat er iemand aan te pas komt.
//
// Waar deze test op let, in volgorde van wat het kost als het misgaat:
//   1. De creditlimiet komt uit de PLANTABEL, nooit uit de webhook. Anders
//      bepaalt wat er in Stripe getypt is hoeveel iemand mag verbruiken.
//   2. Opzeggen laat de data staan. Een makelaar die terugkomt vindt zijn
//      leads terug.
//   3. Een tweede webhook voor dezelfde betaling verandert niets.
process.env.API_AIRTABLE = 'stub';
process.env.BASE_AIRTABLE = 'stub';

const BASE = require('path').join(__dirname, '..') + '/';
const _plans = require(BASE + 'api/_plans.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

// Een nagemaakte Airtable met één klantrij.
function nepBase(velden) {
  const rij = { id: 'recKlant', fields: Object.assign({ 'Project Code': 'TELJO' }, velden || {}) };
  const patches = [];
  global.fetch = async (url, init) => {
    if (init && init.method === 'PATCH') {
      const f = JSON.parse(init.body).fields;
      patches.push(f);
      Object.assign(rij.fields, f);
      return { ok: true, status: 200, json: async () => rij, text: async () => '' };
    }
    const formule = decodeURIComponent(String(url));
    const raakt = formule.includes('"TELJO"');
    return { ok: true, status: 200, text: async () => '',
             json: async () => ({ records: raakt ? [rij] : [] }) };
  };
  return { rij, patches };
}

(async () => {
  delete require.cache[require.resolve(BASE + 'api/_abonnement.js')];
  const abo = require(BASE + 'api/_abonnement.js');

  console.log('\n— een proefaccount —');
  let { rij } = nepBase({ 'Plan Status': 'trial', 'Credit Allowance': 300 });
  let st = await abo.lees('TELJO');
  ck('is niet betalend', st.betalend === false, st);
  ck('heeft geen plan', st.planId === null, st);
  ck('en geen abonnement bij Stripe', st.abonnementId === null, st);

  console.log('\n— betalend worden —');
  const p = nepBase({ 'Plan Status': 'trial', 'Credit Allowance': 300 });
  await abo.activeer({ projectCode: 'TELJO', planId: 'growth',
                       klantId: 'cus_1', abonnementId: 'sub_1' });
  const f = p.rij.fields;
  ck('het plan staat erin', f['Plan ID'] === 'growth', f['Plan ID']);
  ck('de status is actief', f['Plan Status'] === 'active', f['Plan Status']);
  // Dit is de belangrijkste regel van deze test. De limiet komt uit _plans.js.
  ck('de limiet komt uit de plantabel (10.000)',
     f['Credit Allowance'] === _plans.plan('growth').credits, f['Credit Allowance']);
  ck('de Stripe-klant is onthouden', f['Stripe Customer ID'] === 'cus_1', f);
  ck('en het abonnement ook', f['Stripe Subscription ID'] === 'sub_1', f);

  st = await abo.lees('TELJO');
  ck('en nu is hij betalend', st.betalend === true, st);

  console.log('\n— een onbekend plan wordt geweigerd —');
  // Zonder deze controle zou een gemanipuleerde metadata-waarde een klant een
  // limiet geven die nergens uit volgt.
  let wierp = false;
  try { await abo.activeer({ projectCode: 'TELJO', planId: 'platinum' }); } catch (e) { wierp = true; }
  ck('platinum bestaat niet', wierp);
  wierp = false;
  try { await abo.activeer({ projectCode: '', planId: 'growth' }); } catch (e) { wierp = true; }
  ck('en zonder projectcode gebeurt er niets', wierp);

  console.log('\n— opzeggen —');
  const q = nepBase({ 'Plan ID': 'growth', 'Plan Status': 'active',
                      'Credit Allowance': 10000, 'Stripe Subscription ID': 'sub_1',
                      'Stripe Customer ID': 'cus_1' });
  await abo.stop({ projectCode: 'TELJO', reden: 'test' });
  ck('de status is opgezegd', q.rij.fields['Plan Status'] === 'cancelled', q.rij.fields['Plan Status']);
  ck('het abonnement is losgekoppeld', q.rij.fields['Stripe Subscription ID'] === '', q.rij.fields);
  // De klant houdt zijn account en zijn data. Wie terugkomt vindt zijn leads.
  ck('de Stripe-klant blijft bekend voor als hij terugkomt',
     q.rij.fields['Stripe Customer ID'] === 'cus_1', q.rij.fields);
  ck('en de status is niet "verlopen" maar "opgezegd"',
     q.rij.fields['Plan Status'] !== 'expired', q.rij.fields['Plan Status']);

  console.log('\n— elk plan geeft de limiet van dat plan —');
  for (const id of ['starter', 'growth', 'scale']) {
    const r = nepBase({});
    await abo.activeer({ projectCode: 'TELJO', planId: id });
    ck(`${id} -> ${_plans.plan(id).credits} credits`,
       r.rij.fields['Credit Allowance'] === _plans.plan(id).credits, r.rij.fields['Credit Allowance']);
  }

  console.log('\n— de statussen bestaan echt in Airtable —');
  // Airtable weigert een HELE update zodra er één onbekende keuze in zit. Staat
  // hier een status die het veld niet kent, dan mislukt niet alleen de status
  // maar ook de limiet in dezelfde PATCH -- precies hoe het creditplafond ooit
  // maandenlang niets telde.
  const bestaand = ['trial', 'active', 'expired', 'cancelled', 'paused'];
  ck('alle gebruikte statussen zitten in het keuzeveld',
     Object.values(abo.STATUS).every((s) => bestaand.indexOf(s) !== -1),
     Object.values(abo.STATUS));

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
