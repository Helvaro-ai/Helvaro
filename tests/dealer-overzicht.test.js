/*
 * api/_dealer-overzicht.js -- het dagoverzicht van de dealer-startpagina.
 * Praat met een NAGEMAAKTE Airtable: fetch wordt vervangen, net als in
 * tests/voertuigslot.test.js.
 */
'use strict';

process.env.API_AIRTABLE  = 'test-nooit-echt';
process.env.BASE_AIRTABLE = 'apptest00000000';

const overzicht = require('../api/_dealer-overzicht.js');
const _vehicles = require('../api/_vehicles.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 400));
  ok ? pass++ : fail++;
};

const echteFetch = global.fetch;
const herstel = () => { global.fetch = echteFetch; };

const LEADS_TABLE = 'tbliukTnDAbEDcZmt';
const APPOINTMENTS_TABLE = 'tblD058vEITs1xYFc';

const scoreBlob = (punten, temperatuur, extra) => JSON.stringify(Object.assign(
  { _v: 1, score: { punten, temperatuur, redenen: ['voertuig'], at: '2026-09-01T00:00:00.000Z' } },
  extra || {}
));
const koopBlob = (koop, extra) => JSON.stringify(Object.assign({ _v: 1, koop }, extra || {}));

function leadFields(over) {
  return Object.assign({
    Name: 'Naam', Phone: '+32470000000', 'Conversation State': 'in_progress',
    Qualified: false, 'Appointment Booked': false, 'Project Code': 'tenantA',
    'Created At': '2026-09-01T08:00:00.000Z',
    'Conversation History': JSON.stringify([{ role: 'user', ts: Date.parse('2026-09-19T09:00:00.000Z') }]),
    Notities: '{}',
  }, over);
}

(async () => {
  console.log('\n— bereken(): tellingen, prioriteit, conflicten, funnel —');
  {
    _vehicles._resetAvailability();

    const leads = [
      { id: 'l1', fields: leadFields({ Name: 'Hot Een', Qualified: true, Notities: scoreBlob(85, 'hot', { property: 'V1' }) }) },
      { id: 'l2', fields: leadFields({ Name: 'Warm Een', Notities: scoreBlob(60, 'warm', { property: 'V1' }) }) },
      { id: 'l3', fields: leadFields({ Name: 'Hot Twee', Qualified: true, Notities: scoreBlob(90, 'hot') }) },
      { id: 'l4', fields: leadFields({ Name: 'Financiering Geboekt', 'Appointment Booked': true, Notities: koopBlob({ financiering: 'cash' }) }) },
      { id: 'l5', fields: leadFields({ Name: 'Financiering Klaar', Notities: koopBlob({ financiering: 'goedgekeurd' }) }) },
      { id: 'l6', fields: leadFields({ Name: 'Vandaag Laag', Notities: scoreBlob(20, 'cold') }) },
      { id: 'l7', fields: leadFields({ Name: 'Hoger Zonder Afspraak', Notities: scoreBlob(60, 'warm') }) },
      /* Een lead van een ANDERE tenant, alsof de Airtable-formule hem toch
         teruggaf. Hij is ook nog eens 'hot' -- als dit lekt telt hot 3 i.p.v. 2. */
      { id: 'l8', fields: leadFields({ Name: 'Lek', 'Project Code': 'tenantB', Notities: scoreBlob(95, 'hot') }) },
    ];

    const appointments = [
      /* Middernacht-rand: 22:30 UTC op de 18e is 00:30 in Brussel (CEST, +2)
         op de 19e -- dus VANDAAG als "vandaag" met de klok van Brussel wordt
         gelezen, en GISTEREN bij een naïeve UTC-vergelijking. Ook de afspraak
         van lead l6, voor de prioriteitstest. */
      { id: 'a1', fields: { 'Appointment ID': 'A1', 'Start Time': '2026-09-18T22:30:00.000Z', Status: 'booked', 'Appointment Type': 'proefrit', 'Project Code': 'tenantA', 'Lead Name': 'Vandaag Laag', Lead: ['l6'] } },
      /* l4's afspraak: in de toekomst maar NIET vandaag -- sluit financiering
         uit ook al staat de financiering op orde. */
      { id: 'a2', fields: { 'Appointment ID': 'A2', 'Start Time': '2026-09-25T09:00:00.000Z', Status: 'booked', 'Appointment Type': 'gesprek', 'Project Code': 'tenantA', 'Lead Name': 'Financiering Geboekt', Lead: ['l4'] } },
    ];

    const vehicles = [
      { id: 'v1', fields: { 'Vehicle Code': 'V1', 'Project Code': 'tenantA', Make: 'BMW', Model: 'M4', Status: 'beschikbaar', 'Created At': '2020-01-01T00:00:00.000Z' } },
    ];

    let leadsUrl = '';
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes(LEADS_TABLE)) { leadsUrl = u; return { ok: true, status: 200, json: async () => ({ records: leads }) }; }
      if (u.includes(APPOINTMENTS_TABLE)) return { ok: true, status: 200, json: async () => ({ records: appointments }) };
      return { ok: true, status: 200, json: async () => ({ records: vehicles }) };
    };

    const nu = new Date('2026-09-19T10:00:00.000Z');
    const result = await overzicht.bereken('tenantA', { nu });
    herstel();

    ck('de leads-aanroep is tenant-gescoped in de formule', leadsUrl.includes('tenantA'), leadsUrl);
    ck('een lead van een andere tenant lekt niet in hot', result.vandaag.hot === 2, JSON.stringify(result.vandaag));
    ck('exact 1 afspraak vandaag, gelezen met de klok van Brussel', result.vandaag.afsprakenVandaag === 1, JSON.stringify(result.vandaag));
    ck('exact 1 voertuigconflict (V1 heeft 2 geïnteresseerde leads)', result.voertuigConflicten.length === 1 && result.voertuigConflicten[0].code === 'V1' && result.voertuigConflicten[0].aantalLeads === 2, JSON.stringify(result.voertuigConflicten));
    ck('financieringKlaar sluit de lead met een geboekte afspraak uit', result.vandaag.financieringKlaar === 1, JSON.stringify(result.vandaag));
    ck('geen waarschuwingen: alle drie de secties lazen succesvol', result.waarschuwingen.length === 0, JSON.stringify(result.waarschuwingen));

    const volgorde = result.prioriteit.map((p) => p.leadId);
    const iLaag  = volgorde.indexOf('l6');
    const iHoger = volgorde.indexOf('l7');
    ck('een afspraak vandaag wint van een hogere score zonder afspraak',
       iLaag !== -1 && iHoger !== -1 && iLaag < iHoger,
       JSON.stringify({ volgorde, scores: result.prioriteit.map((p) => [p.leadId, p.score]) }));

    ck('funnel: minder dan 10 leads -> percentages is null', result.funnel.voldoende === false && result.funnel.percentages === null, JSON.stringify(result.funnel));
    ck('funnel.leads telt de lek van tenantB niet mee', result.funnel.leads === 7, result.funnel.leads);

    ck('geen NaN of undefined in de hele uitkomst', JSON.stringify(result).indexOf('NaN') === -1 && JSON.stringify(result).indexOf('undefined') === -1, JSON.stringify(result).slice(0, 200));
  }

  console.log('\n— bereken(): >= 10 leads -> percentages worden echte getallen —');
  {
    _vehicles._resetAvailability();
    const veelLeads = [];
    for (let i = 0; i < 10; i++) {
      veelLeads.push({ id: 'v' + i, fields: leadFields({ Name: 'Lead ' + i, Qualified: i < 4 }) });
    }
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes(LEADS_TABLE)) return { ok: true, status: 200, json: async () => ({ records: veelLeads }) };
      return { ok: true, status: 200, json: async () => ({ records: [] }) };
    };
    const result = await overzicht.bereken('tenantA', { nu: new Date('2026-09-19T10:00:00.000Z') });
    herstel();

    ck('10 leads is genoeg voor een funnel', result.funnel.voldoende === true, result.funnel.leads);
    ck('percentages is nu een object met getallen', result.funnel.percentages !== null
       && typeof result.funnel.percentages.gekwalificeerd === 'number', JSON.stringify(result.funnel.percentages));
    ck('4 van de 10 gekwalificeerd is 40%', result.funnel.percentages.gekwalificeerd === 40, result.funnel.percentages.gekwalificeerd);
  }

  console.log('\n— bereken(): een mislukte afsprakenlezing blijft eerlijk ─────────────');
  {
    _vehicles._resetAvailability();
    const leads = [{ id: 'l1', fields: leadFields({}) }];
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes(LEADS_TABLE)) return { ok: true, status: 200, json: async () => ({ records: leads }) };
      if (u.includes(APPOINTMENTS_TABLE)) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ records: [] }) };
    };
    const result = await overzicht.bereken('tenantA', { nu: new Date('2026-09-19T10:00:00.000Z') });
    herstel();

    ck('waarschuwingen bevat "afspraken"', result.waarschuwingen.includes('afspraken'), JSON.stringify(result.waarschuwingen));
    ck('afsprakenVandaag blijft leeg in plaats van te doen alsof er niets gepland staat', Array.isArray(result.afsprakenVandaag) && result.afsprakenVandaag.length === 0, JSON.stringify(result.afsprakenVandaag));
    ck('vandaag.afsprakenVandaag is 0, geen crash', result.vandaag.afsprakenVandaag === 0, result.vandaag.afsprakenVandaag);
  }

  console.log(`\n  ${pass} ok, ${fail} fout\n`);
  herstel();
  process.exit(fail > 0 ? 1 : 0);
})();
