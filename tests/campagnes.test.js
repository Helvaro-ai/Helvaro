/*
 * Campagnes.
 *
 * ── Wat hier bewezen wordt ──────────────────────────────────────────────────
 * De administratie: een campagne aanmaken, leads selecteren, en de twee remmen
 * die ertoe doen. Verzenden zit er bewust niet in -- daarvoor is een
 * goedgekeurde WhatsApp-template nodig en die ligt niet in deze codebase.
 *
 * ── De twee remmen ──────────────────────────────────────────────────────────
 * 1. AFGEMELDE LEADS gaan er automatisch uit. Een campagne is precies de plek
 *    waar één gemiste afmelding honderd keer misgaat, en waar het gedeelde
 *    WhatsApp-nummer op het spel staat.
 * 2. LEADS VAN EEN ANDER KANTOOR komen er niet in. De formule filtert op
 *    record-id en NIET op projectcode -- dat kan ook niet, want dan zou een
 *    vreemde lead als "bestaat niet" tellen in plaats van als "niet van jou".
 *    De tenantcontrole staat dus in code, en die moet blijven staan.
 */
process.env.BASE_AIRTABLE = 'appZelftest';
process.env.API_AIRTABLE  = 'patZelftest';

const BASE = require('path').join(__dirname, '..') + '/';
const C = require(BASE + 'api/_campagnes.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

const LEADS = 'tbliukTnDAbEDcZmt';

let leadDb, campagneDb, posts, patches, tabelBestaat;

function reset() {
  posts = []; patches = []; tabelBestaat = true;
  C._resetTabelCache();
  leadDb = {
    recLEAD1: { id: 'recLEAD1', fields: { 'Project Code': 'TENANT_A', Name: 'Jan' } },
    recLEAD2: { id: 'recLEAD2', fields: { 'Project Code': 'TENANT_A', Name: 'Els' } },
    recAFGEMELD: { id: 'recAFGEMELD', fields: { 'Project Code': 'TENANT_A', Name: 'Piet', 'Opted Out': true } },
    recVREEMD: { id: 'recVREEMD', fields: { 'Project Code': 'TENANT_B', Name: 'Van een ander kantoor' } },
  };
  campagneDb = {};
}

function nepAirtable() {
  global.fetch = async (u, opts = {}) => {
    const s = String(u);
    const method = (opts.method || 'GET');

    if (s.indexOf(LEADS) !== -1) {
      const filter = decodeURIComponent((s.match(/filterByFormula=([^&]+)/) || [])[1] || '');
      const ids = [...filter.matchAll(/RECORD_ID\(\)="([^"]+)"/g)].map((m) => m[1]);
      const records = ids.map((id) => leadDb[id]).filter(Boolean);
      return { ok: true, status: 200, json: async () => ({ records }), text: async () => '' };
    }

    // campaigns-tabel
    if (!tabelBestaat) {
      return { ok: false, status: 404, json: async () => ({}), text: async () => 'NOT_FOUND' };
    }
    if (method === 'POST') {
      const body = JSON.parse(opts.body || '{}');
      const id = 'recCAMP' + (Object.keys(campagneDb).length + 1);
      campagneDb[id] = { id, fields: body.fields };
      posts.push(body.fields);
      return { ok: true, status: 200, json: async () => campagneDb[id], text: async () => '{}' };
    }
    if (method === 'PATCH') {
      const id = s.split('/').pop();
      const body = JSON.parse(opts.body || '{}');
      patches.push({ id, fields: body.fields });
      if (campagneDb[id]) Object.assign(campagneDb[id].fields, body.fields);
      return { ok: true, status: 200, json: async () => campagneDb[id] || {}, text: async () => '{}' };
    }
    const m = s.match(/campaigns\/(rec[A-Za-z0-9]+)/);
    if (m) {
      const rec = campagneDb[m[1]];
      return rec ? { ok: true, status: 200, json: async () => rec, text: async () => '' }
                 : { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    }
    const filter = decodeURIComponent((s.match(/filterByFormula=([^&]+)/) || [])[1] || '');
    const code = (filter.match(/="([^"]+)"/) || [])[1];
    const records = Object.values(campagneDb).filter((r) => !code || r.fields['Project Code'] === code);
    return { ok: true, status: 200, json: async () => ({ records }), text: async () => '' };
  };
}

(async () => {
  console.log('\n— de selectie —');
  reset(); nepAirtable();
  let sel = await C.selecteerLeads('TENANT_A', ['recLEAD1', 'recLEAD2', 'recAFGEMELD', 'recVREEMD', 'recBESTAATNIET']);
  ck('gewone leads komen erdoor', sel.toegestaan.join(',') === 'recLEAD1,recLEAD2', sel);
  ck('een afgemelde lead gaat eruit', sel.afgemeld.join(',') === 'recAFGEMELD', sel);
  ck('een lead van een ANDER kantoor gaat eruit',
     sel.vreemd.indexOf('recVREEMD') !== -1, sel);
  ck('en een onbekend id ook, met dezelfde uitkomst naar buiten toe',
     sel.vreemd.indexOf('recBESTAATNIET') !== -1, sel);

  sel = await C.selecteerLeads('', ['recLEAD1']);
  ck('zonder projectcode: niets', sel.toegestaan.length === 0, sel);

  console.log('\n— een campagne aanmaken —');
  reset(); nepAirtable();
  const camp = await C.maak({
    projectCode: 'TENANT_A',
    naam: 'Lange Violettestraat',
    pandCode: 'P3',
    kanalen: ['whatsapp'],
    leadIds: ['recLEAD1', 'recLEAD2', 'recAFGEMELD'],
  });
  ck('hij wordt aangemaakt', Boolean(camp.id), camp);
  ck('met twee leads, niet drie', camp.aantalLeads === 2, camp);
  ck('en meldt hoeveel er afvielen', camp.afgemeld === 1, camp);
  ck('de status is "klaar", niet "verstuurd"', camp.status === C.STATUS.KLAAR, camp.status);
  /* Een status die zegt dat er verstuurd is terwijl dat niet kan, is erger dan
     een status die eerlijk zegt dat hij wacht. */
  ck('er bestaat geen status die verzending suggereert zonder verzending',
     posts[0]['Sent Count'] === 0, posts[0]);
  ck('en waarom er leads afvielen staat in de campagne',
     /afgemeld/.test(posts[0].Notes || ''), posts[0].Notes);
  ck('de tenant staat erop', posts[0]['Project Code'] === 'TENANT_A', posts[0]);

  console.log('\n— leads toevoegen —');
  reset(); nepAirtable();
  const c2 = await C.maak({ projectCode: 'TENANT_A', naam: 'Test', leadIds: ['recLEAD1'] });
  const bij = await C.voegLeadsToe({
    projectCode: 'TENANT_A', campagneId: c2.id,
    leadIds: ['recLEAD1', 'recLEAD2', 'recAFGEMELD'],
  });
  ck('alleen de nieuwe telt', bij.toegevoegd === 1, bij);
  ck('de dubbele wordt herkend', bij.alAanwezig === 1, bij);
  ck('de afgemelde blijft eruit', bij.afgemeld === 1, bij);
  ck('en het totaal klopt', bij.totaal === 2, bij);

  console.log('\n— een ander kantoor komt er niet bij —');
  reset(); nepAirtable();
  const eigen = await C.maak({ projectCode: 'TENANT_A', naam: 'Van A', leadIds: ['recLEAD1'] });
  let code = '';
  try { await C.voegLeadsToe({ projectCode: 'TENANT_B', campagneId: eigen.id, leadIds: ['recLEAD1'] }); }
  catch (e) { code = e.code; }
  ck('toevoegen aan andermans campagne wordt geweigerd', code === 'niet_gevonden', code);
  ck('en er is niets gewijzigd', patches.length === 0, patches);

  const vreemd = await C.leesEigen('TENANT_B', eigen.id);
  ck('en lezen ook niet', vreemd === null, vreemd);

  console.log('\n— de lijst is per klant —');
  reset(); nepAirtable();
  await C.maak({ projectCode: 'TENANT_A', naam: 'Van A' });
  await C.maak({ projectCode: 'TENANT_B', naam: 'Van B' });
  const lijstA = await C.lijst('TENANT_A');
  ck('TENANT_A ziet alleen zijn eigen campagne',
     lijstA.length === 1 && lijstA[0].naam === 'Van A', lijstA);

  console.log('\n— zolang de tabel niet bestaat —');
  reset(); nepAirtable();
  tabelBestaat = false;
  C._resetTabelCache();
  code = '';
  try { await C.maak({ projectCode: 'TENANT_A', naam: 'x' }); } catch (e) { code = e.code; }
  ck('aanmaken zegt eerlijk dat het niet aanstaat', code === 'tabel_ontbreekt', code);
  ck('en de lijst is gewoon leeg, geen storing', (await C.lijst('TENANT_A')).length === 0);

  console.log('\n— en de AI-actie erboven —');
  const fs = require('fs');
  const acties = fs.readFileSync(BASE + 'api/_faro/actions.js', 'utf8');
  ck('create_campaign is niet meer "nog niet aangesloten"',
     !/create_campaign\(_payload, _ctx\)/.test(acties));
  ck('en gebruikt de gedeelde module', /campagnes\.maak\(/.test(acties));
  ck('add_leads_to_campaign ook', /campagnes\.voegLeadsToe\(/.test(acties));
  /* De grens moet in het antwoord staan. Een makelaar die "campagne aangemaakt"
     leest en denkt dat er berichten uit zijn gegaan, komt er pas achter als hij
     zich afvraagt waarom niemand reageert. */
  ck('en zegt erbij dat er nog NIETS verstuurd is',
     /Er is nog NIETS verstuurd/.test(acties));
  ck('de tenant komt uit de sessie, niet uit de payload',
     /projectCode: ctx\.projectCode/.test(acties));

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
