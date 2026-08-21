/*
 * De schrijfkant van Faro.
 *
 * Twee soorten fouten worden hier getest, en de tweede is de gevaarlijke:
 *
 *   1. gewone validatie (onbekende status, lege notitie)
 *   2. ISOLATIE -- een lead-id komt uit een chatgesprek en een taalmodel kan
 *      er een verzinnen. Als een verzonnen of gestolen id de rij van een ANDERE
 *      klant raakt, dan schrijft de ene makelaar in het dossier van de andere.
 *
 * Plus een drift-test: dezelfde Airtable-veld-ids staan ook in api/leads.js.
 * Twee kopieen van een constante lopen uit elkaar, en die fout is stil.
 */
const fs = require('fs');
const path = require('path');

process.env.API_AIRTABLE  = 'test-key';
process.env.BASE_AIRTABLE = 'test-base';

const w = require('../api/_faro/writes.js');

let pass = 0, fail = 0;
function ck(name, cond, ctx) {
  console.log(`  ${cond ? 'OK  ' : 'FOUT'}  ${name}`);
  if (!cond) console.log('        ' + JSON.stringify(ctx));
  cond ? pass++ : fail++;
}
async function throws(name, fn, code) {
  try {
    await fn();
    ck(name, false, 'geen fout gegooid');
  } catch (err) {
    ck(name, err && err.code === code, { kreeg: err && err.code, verwacht: code, msg: err && err.message });
  }
}

/* Airtable-dubbel. Houdt bij wat er geschreven wordt, zodat een test kan
   bewijzen dat er NIETS geschreven is. */
const MINE   = 'recAAAAAAAAAAAAAA';
const THEIRS = 'recBBBBBBBBBBBBBB';
let writes = [];

global.fetch = async (url, opts = {}) => {
  const method = opts.method || 'GET';
  const u = String(url);
  if (method !== 'GET') writes.push({ method, url: u, body: opts.body });

  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });

  // Klanten-rij opzoeken
  if (u.includes(w.CLIENTS_TABLE) && u.includes('filterByFormula')) {
    return ok({ records: [{ id: 'recCLIENT0000000', fields: {} }] });
  }
  if (u.includes(w.CLIENTS_TABLE)) return ok({ id: 'recCLIENT0000000', fields: {} });

  // Losse lead ophalen: eigendom hangt aan het id.
  if (u.endsWith(MINE))   return ok({ id: MINE,   fields: { 'Project Code': 'TELJO', Name: 'Jan', Notities: 'oud' } });
  if (u.endsWith(THEIRS)) return ok({ id: THEIRS, fields: { 'Project Code': 'ANDERE', Name: 'Niet van jou' } });
  return ok({ records: [] });
};

const ctx = { projectCode: 'TELJO', userId: 'user_1' };

(async () => {
  console.log('\n— status zetten —');
  writes = [];
  const r = await w.setLeadStatus({ leadId: MINE, status: 'completed' }, ctx);
  ck('eigen lead mag', r.status === 'completed', r);
  ck('en er is precies een PATCH gedaan', writes.filter((x) => x.method === 'PATCH').length === 1, writes);
  ck('op de juiste rij', writes[0].url.endsWith(MINE), writes[0].url);
  ck('naar het status-veld', JSON.parse(writes[0].body).fields[w.F.status] === 'completed', writes[0].body);

  await throws('een onbekende status wordt geweigerd',
    () => w.setLeadStatus({ leadId: MINE, status: 'bijna_klaar' }, ctx), 'bad_status');
  await throws('een onbekende verliesreden ook',
    () => w.setLeadStatus({ leadId: MINE, status: 'verloren', lossReason: 'zomaar' }, ctx), 'bad_reason');

  console.log('\n— isolatie: dit is waar het om gaat —');
  writes = [];
  await throws('de lead van een ANDERE klant is niet gevonden',
    () => w.setLeadStatus({ leadId: THEIRS, status: 'completed' }, ctx), 'not_found');
  ck('en er is niets geschreven', writes.length === 0, writes);

  writes = [];
  await throws('ook niet te verwijderen',
    () => w.deleteLead({ leadId: THEIRS }, ctx), 'not_found');
  ck('nog steeds niets geschreven', writes.length === 0, writes);

  writes = [];
  await throws('en er kan geen notitie in',
    () => w.appendLeadNote({ leadId: THEIRS, note: 'hallo' }, ctx), 'not_found');
  ck('en ook nu niets geschreven', writes.length === 0, writes);

  // Een lege tenant leest verderop in deze codebase als "admin, toon alles".
  // Hier moet het gewoon een weigering zijn.
  await throws('een lege projectcode geeft geen toegang',
    () => w.setLeadStatus({ leadId: MINE, status: 'completed' }, { projectCode: '', userId: 'u' }), 'not_found');

  await throws('een verzonnen id ziet er niet eens uit als een record',
    () => w.setLeadStatus({ leadId: 'lead-42', status: 'completed' }, ctx), 'not_found');

  console.log('\n— notities worden toegevoegd, niet overschreven —');
  writes = [];
  await w.appendLeadNote({ leadId: MINE, note: 'gebeld, terugbellen vrijdag' }, ctx);
  const notitie = JSON.parse(writes[0].body).fields[w.F.notities];
  ck('de oude tekst staat er nog', notitie.indexOf('oud') === 0, notitie);
  ck('en de nieuwe erachter', /terugbellen vrijdag/.test(notitie), notitie);
  // Notities draagt ook de aiPaused-vlag als JSON; overschrijven zou de AI
  // ongemerkt weer laten antwoorden op een lead die een mens had overgenomen.
  ck('dus het veld wordt nooit vervangen', notitie.length > 'oud'.length, notitie);

  await throws('een lege notitie is geen notitie',
    () => w.appendLeadNote({ leadId: MINE, note: '   ' }, ctx), 'empty');

  console.log('\n— persona —');
  writes = [];
  const p = await w.updatePersona({ aiName: 'Lotte' }, ctx);
  ck('alleen wat je meegeeft verandert', JSON.stringify(p.changed) === JSON.stringify(['AI-naam']), p);
  const body = JSON.parse(writes[writes.length - 1].body);
  ck('en het schrijft naar het AI Name-veld', body.fields[w.F.aiName] === 'Lotte', body.fields);
  ck('en raakt geen ander veld aan', Object.keys(body.fields).length === 1, body.fields);

  await throws('niets meegeven is een fout, geen stille no-op',
    () => w.updatePersona({}, ctx), 'empty');

  // Faro mag de STEM aanpassen, niet de rekening.
  writes = [];
  await throws('een veld buiten de persona-lijst bestaat hier niet',
    () => w.updatePersona({ creditAllowance: 999999 }, ctx), 'empty');
  ck('en dat schrijft dus ook niets', writes.filter((x) => x.method === 'PATCH').length === 0, writes);

  console.log('\n— veld-ids mogen niet uit elkaar lopen met api/leads.js —');
  const leadsSrc = fs.readFileSync(path.join(__dirname, '..', 'api', 'leads.js'), 'utf8');
  const paren = [
    ['status', w.F.status], ['notities', w.F.notities],
    ['dealWaarde', w.F.dealWaarde], ['verliesReden', w.F.verliesReden],
    ['aiName', w.F.aiName], ['autoReplyTpl', w.F.autoReplyTpl],
    ['aiInstructions', w.F.aiInstructions], ['clientProject', w.F.clientProject],
  ];
  for (const [naam, id] of paren) {
    ck(`${naam} (${id}) komt ook in api/leads.js voor`, leadsSrc.indexOf(id) !== -1, id);
  }
  // En de allowlists zelf.
  for (const s of w.LEAD_STATUSES) {
    ck(`status "${s}" staat ook in api/leads.js`, leadsSrc.indexOf(`'${s}'`) !== -1, s);
  }

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
