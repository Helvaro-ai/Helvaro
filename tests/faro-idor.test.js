/*
 * Faro en andermans gegevens.
 *
 * Een id in een Faro-gesprek komt uit een taalmodel. Dat model kan er een
 * verzinnen, er een overnemen uit een geplakt bericht, of er een krijgen via
 * een prompt-injectie. Deze test doet precies dat: hij geeft de tools en de
 * uitvoerder ids en namen van een ANDERE klant en bewijst dat er niets
 * terugkomt en niets geschreven wordt.
 *
 * De schrijvende lead-functies zelf staan al in tests/faro-writes.test.js.
 * Hier: de leestools, de afsprakenacties en de bevestigingsstap ertussen.
 *
 * De Airtable-dubbel filtert bewust NIET op tenant: hij geeft rijen van beide
 * klanten terug, alsof de formule ooit stuk gaat. Wat hier groen blijft, blijft
 * dus groen op de controle in de code, niet op die ene regel formuletekst.
 */
'use strict';

process.env.API_AIRTABLE   = 'patTest';
process.env.BASE_AIRTABLE  = 'appTest';
process.env.SESSION_SECRET = 'test-sessie-geheim-niet-echt';
delete process.env.FARO_DEMO_MODE;

const MIJN   = 'recAAAAAAAAAAAAAA';
const HUNNE  = 'recBBBBBBBBBBBBBB';
const HUN_EVENT = 'evt-van-de-andere-klant';

let schrijfacties = [];

function lead(id, code, naam, gesprek) {
  return { id, createdTime: '2026-09-20T10:00:00.000Z',
    fields: { 'Project Code': code, Name: naam, 'Conversation History': gesprek || '' } };
}

global.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url));
  const methode = opts.method || 'GET';
  if (methode !== 'GET') schrijfacties.push({ methode, url: u });
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  if (/Appointments|afspraken|tblD058vEITs1xYFc/i.test(u)) {
    // Geeft de afspraak van de ANDERE klant terug, ongeacht de formule.
    return ok({ records: [{ id: 'recAFSPRAAK000000', fields: { 'Project Code': 'ANDERE', 'Google Event ID': HUN_EVENT } }] });
  }
  return ok({ records: [
    lead(MIJN,  'TELJO',  'Jan Eigen', 'Klant: hallo\nAI: dag'),
    lead(HUNNE, 'ANDERE', 'Geheime Koper', 'Klant: mijn budget is 90k'),
  ] });
};

const leadsRead = require('../api/_leads-read.js');
const tools     = require('../api/_faro/tools.js');
const actions   = require('../api/_faro/actions.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 240)}`);
  ok ? pass++ : fail++;
};
const ctx = () => ({ projectCode: 'TELJO', userId: 'user-teljo', lang: 'nl' });
const lekt = (x) => /Geheime Koper|90k/.test(JSON.stringify(x || {}));

async function run(naam, args) {
  const t = tools.get(naam);
  return t.run(args, ctx());
}

(async () => {
  console.log('\nFaro: andermans ids leveren niets op');

  console.log('\n  de leeslaag zelf');
  const { leads } = await leadsRead.fetchLeads('TELJO', { token: 't', baseId: 'b' });
  ck('fetchLeads geeft alleen eigen rijen, ook als Airtable meer teruggeeft',
    leads.length === 1 && !lekt(leads), leads.map((l) => l.naam));

  console.log('\n  leestools');
  const perId = await run('get_lead', { id: HUNNE });
  ck('get_lead met andermans id: geen lead', perId.data && perId.data.lead === null, perId.data);
  ck('en niets van die lead in het antwoord', !lekt(perId), perId.summary);

  const perNaam = await run('get_lead', { name: 'Geheime Koper' });
  ck('get_lead met andermans naam: geen lead', perNaam.data && perNaam.data.lead === null, perNaam.data);

  const gesprek = await run('get_conversation', { leadId: HUNNE });
  ck('get_conversation met andermans id: geen berichten',
    Array.isArray(gesprek.data.messages) && gesprek.data.messages.length === 0, gesprek.data);
  ck('en het gesprek lekt niet', !lekt(gesprek), gesprek.summary);

  const zoek = await run('search_leads', { query: 'Geheime' });
  ck('search_leads vindt andermans lead niet', !lekt(zoek), zoek.summary);

  const alle = await run('get_leads', {});
  ck('get_leads toont alleen eigen leads', !lekt(alle), alle.summary);

  const eigen = await run('get_lead', { id: MIJN });
  ck('controle: de eigen lead wordt wel gevonden',
    eigen.data && eigen.data.lead && eigen.data.lead.naam === 'Jan Eigen', eigen.data);

  console.log('\n  de bevestigingsstap');
  const vanAnder = actions.stage({ projectCode: 'ANDERE', userId: 'user-ander', action: 'delete_lead', payload: { leadId: HUNNE } });
  const idVanAnder = vanAnder.actionId || vanAnder.id || vanAnder;
  let fout = null;
  try { await actions.execute({ actionId: idVanAnder, ctx: ctx() }); } catch (e) { fout = e; }
  ck('een actie van een andere klant uitvoeren: not_found', fout && fout.code === 'not_found', fout && fout.code);

  const andereGebruiker = actions.stage({ projectCode: 'TELJO', userId: 'iemand-anders', action: 'delete_lead', payload: { leadId: MIJN } });
  fout = null;
  try { await actions.execute({ actionId: andereGebruiker.actionId || andereGebruiker.id || andereGebruiker, ctx: ctx() }); } catch (e) { fout = e; }
  ck('een actie van een andere gebruiker in dezelfde zaak: not_found', fout && fout.code === 'not_found', fout && fout.code);

  console.log('\n  afspraken');
  schrijfacties = [];
  for (const actie of ['cancel_appointment', 'move_appointment']) {
    const st = actions.stage({ projectCode: 'TELJO', userId: 'user-teljo', action: actie,
      payload: { eventId: HUN_EVENT, startISO: '2026-10-01T10:00:00.000Z', durationMin: 30 } });
    fout = null;
    try { await actions.execute({ actionId: st.actionId || st.id || st, ctx: ctx() }); } catch (e) { fout = e; }
    ck(`${actie} op andermans afspraak wordt geweigerd`, !!fout, fout && fout.code);
  }
  ck('en er is niets geschreven in Airtable', schrijfacties.length === 0, schrijfacties);

  console.log(`\n  ${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
