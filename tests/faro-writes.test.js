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


  /* ── Wat de website belooft, moet Faro ook kunnen ──────────────────────────
     Op helvaro.pro staat: "Faro schrijft je advertentieteksten, hooks en
     varianten om te testen" en "Faro kent je toon, je aanbod en je sector, en
     wijkt daar niet van af."

     Geen van beide had iets onder zich. Er was alleen write_listing (EEN
     pandtekst, geen varianten, geen tekenlimiet) en er was geen enkele manier
     om de huisstijl te LEZEN -- update_ai_persona kon alleen schrijven, dus
     Faro kon instellingen overschrijven die hij nooit gezien had. */
  console.log('\n— de beloftes van de site hebben een tool onder zich —');
  {
    const tools = require('../api/_faro/tools.js');
    const namen = tools.ALL.map((t) => t.name);
    ck('er is een tool die de huisstijl LEEST', namen.indexOf('get_brand_voice') > -1, namen.join(','));
    ck('en een die advertentieteksten oplevert', namen.indexOf('write_ad_copy') > -1, null);
    ck('writes.js kan de stem van het kantoor lezen', typeof w.readBrandVoice === 'function', null);

    /* Wat er NIET in de merkcontext mag: die gaat met elke prompt mee. Plan,
       credits, Stripe-id's en sleutels horen daar niet in -- dat is de
       rekening, niet de stem. */
    const velden = Object.values(w.STEM_VELDEN);
    const verboden = velden.filter((v) => /plan|credit|stripe|key|token|vat|phone|email/i.test(v));
    ck('en er lekt niets financieels of geheims in mee', verboden.length === 0, verboden.join(','));

    const adTool = tools.ALL.find((t) => t.name === 'write_ad_copy');
    ck('advertentieteksten zijn een concept, geen publicatie', adTool.kind === 'create', adTool.kind);
    ck('en de tool vraagt om meerdere varianten',
       adTool.parameters.properties.variants.type === 'array', null);
  }

  /* De tekenlimieten zijn de reden dat deze tool meer is dan een doorgeefluik.
     Een model schrijft met plezier een Google-kop van 44 tekens; die wordt
     geweigerd en dat merkt de makelaar pas in Ads Manager. */
  console.log('\n— de tekenlimieten van Meta en Google worden echt geteld —');
  {
    const tools = require('../api/_faro/tools.js');
    const adTool = tools.ALL.find((t) => t.name === 'write_ad_copy');

    const g = await adTool.run({ platform: 'google', variants: [
      { headline: 'Verkoop je huis in Gent', body: 'Gratis schatting binnen 24 uur.' },
      { headline: 'Dit is een veel te lange kop voor Google Ads',
        body: 'En deze tekst is ook bewust veel te lang, ruim boven de negentig tekens die Google toestaat voor een description.' },
    ] }, ctx);
    ck('een te lange Google-kop wordt gemeld', /TE LANG/.test(g.components[0].body), g.summary);
    ck('met variantnummer en het echte aantal tekens',
       /variant 2 kop \(44\/30\)/.test(g.components[0].body), g.components[0].body.slice(-160));

    /* Een variant met TWEE overtredingen is nog steeds EEN variant. Mijn eerste
       versie telde de overtredingen en meldde "2 varianten te lang" bij een
       enkele kapotte variant -- wie er dan twee gaat zoeken vindt er een en
       vertrouwt de melding daarna niet meer. */
    ck('een variant met twee fouten telt als een variant',
       g.data.variantenTeLang === 1 && g.data.overtredingen === 2, JSON.stringify(g.data));

    const ok = await adTool.run({ platform: 'meta', variants: [
      { headline: 'Klaar om te verkopen?', body: 'Wij bellen je binnen het uur terug.' },
    ] }, ctx);
    ck('binnen de limiet is er geen waarschuwing', !/TE LANG/.test(ok.components[0].body), null);
    ck('en Meta heeft een RUIMERE koplimiet dan Google (40 vs 30)',
       /\[21\/40\]/.test(ok.components[0].body), ok.components[0].body.slice(0, 120));

    const leeg = await adTool.run({ platform: 'google', variants: [] }, ctx);
    ck('zonder varianten schrijft de tool niets voor je',
       /Schrijf de advertentieteksten zelf/.test(leeg.summary), leeg.summary);
    const fout = await adTool.run({ platform: 'tiktok', variants: [{ headline: 'x', body: 'y' }] }, ctx);
    ck('een onbekend platform wordt geweigerd', /meta.*google|google.*meta/i.test(fout.summary), fout.summary);

    /* En dat er NIETS gepubliceerd wordt moet in het antwoord staan, niet
       alleen in de beschrijving die de gebruiker nooit ziet. */
    ck('het antwoord zegt dat er niets gepubliceerd is',
       /niets gepubliceerd/.test(g.summary), g.summary);
  }

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
