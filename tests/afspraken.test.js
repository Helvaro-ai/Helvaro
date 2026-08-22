/*
 * Afzeggen en verzetten.
 *
 * Dit is de test van een ding dat op vier plaatsen tegelijk moet gebeuren: de
 * rij in Appointments, het item in Google, en de twee vlaggen op de lead. Elke
 * keer dat er hier iets misging, ging er precies één van die vier niet mee --
 * en het gevolg was steeds hetzelfde soort schade:
 *
 *   rij blijft 'booked'    -> de lead krijgt 24u van tevoren een herinnering
 *                             voor een afspraak die niet meer bestaat
 *   Google blijft staan    -> de makelaar houdt een uur vrij voor niemand
 *   Appointment Booked aan -> de lead telt door in pipeline en win rate
 *   Booking Link Sent aan  -> de AI kan voor deze lead NOOIT meer een nieuwe
 *                             afspraak boeken. De stilste van de vier.
 *
 * Airtable en Google worden hier nagemaakt. Wat bewezen wordt is dus niet dat
 * Airtable doet wat wij denken, maar dat wij sturen wat we moeten sturen -- en
 * dat is precies waar het hier vier keer op misging.
 */
process.env.BASE_AIRTABLE = 'appZelftest';
process.env.API_AIRTABLE  = 'patZelftest';

const BASE = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

// ── Een nagemaakte Airtable ─────────────────────────────────────────────────
const AFSPRAKEN = 'tblD058vEITs1xYFc';
const LEADS     = 'tbliukTnDAbEDcZmt';

let db, patches, googleWeg, googleVerzet;

function reset() {
  patches = [];
  googleWeg = [];
  googleVerzet = [];
  db = {
    recAAAAAAAAAAAAAA: {
      id: 'recAAAAAAAAAAAAAA',
      fields: {
        'Project Code': 'TENANT_A',
        'Start Time':   new Date(Date.now() + 3 * 864e5).toISOString(),
        'Duration':     30,
        'Status':       'booked',
        'Lead':         ['recLEAD1111111111'],
        'Lead Name':    'Jan Peeters',
        'Lead Phone':   '+32 470 12 34 56',
        'Google Event ID': 'gev_123',
        'Notes':        'Eerste bezichtiging',
      },
    },
    recBBBBBBBBBBBBBB: {
      id: 'recBBBBBBBBBBBBBB',
      fields: {
        'Project Code': 'TENANT_B',           // van een ANDER kantoor
        'Start Time':   new Date(Date.now() + 2 * 864e5).toISOString(),
        'Status':       'booked',
        'Lead':         ['recLEAD2222222222'],
        'Lead Phone':   '+32 470 99 99 99',
        'Google Event ID': 'gev_999',
      },
    },
  };
}

function nepAirtable() {
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = opts.method || 'GET';

    if (method === 'PATCH') {
      const id = u.split('/').pop();
      const body = JSON.parse(opts.body || '{}');
      patches.push({ tabel: u.indexOf(LEADS) !== -1 ? 'leads' : 'afspraken', id, fields: body.fields });
      if (db[id]) Object.assign(db[id].fields, body.fields);
      return { ok: true, status: 200, json: async () => ({ id, fields: body.fields }), text: async () => '{}' };
    }

    // Eén record ophalen
    const m = u.match(new RegExp(`${AFSPRAKEN}/(rec[A-Za-z0-9]+)`));
    if (m) {
      const rec = db[m[1]];
      return rec
        ? { ok: true, status: 200, json: async () => rec, text: async () => '' }
        : { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    }

    // Lijst met filter
    if (u.indexOf(AFSPRAKEN) !== -1) {
      const filter = decodeURIComponent((u.match(/filterByFormula=([^&]+)/) || [])[1] || '');
      let records = Object.values(db);
      const code = (filter.match(/\{Project Code\}="([^"]+)"/) || [])[1];
      if (code) records = records.filter((r) => r.fields['Project Code'] === code);
      if (/\{Status\}="booked"/.test(filter)) records = records.filter((r) => r.fields.Status === 'booked');
      const ev = (filter.match(/\{Google Event ID\}="([^"]+)"/) || [])[1];
      if (ev) records = records.filter((r) => r.fields['Google Event ID'] === ev);
      return { ok: true, status: 200, json: async () => ({ records }), text: async () => '' };
    }

    /* Clients-tabel: hier haalt _afspraken de Google-toegang van de klant op.
       Alleen TENANT_A heeft een agenda gekoppeld, zodat "geen agenda" ook een
       pad heeft om langs te lopen. */
    const cCode = decodeURIComponent((u.match(/filterByFormula=([^&]+)/) || [])[1] || '')
      .match(/"([^"]+)"/);
    const records = cCode && cCode[1] === 'TENANT_A'
      ? [{ id: 'recCLIENT', fields: { fldkYmK3jAabvytCF: 'versleuteld', fldWBxxhGYEZNIMqA: 'primary' } }]
      : [];
    return { ok: true, status: 200, json: async () => ({ records }), text: async () => '' };
  };
}

// Google wordt hier vervangen ná het laden, zodat _afspraken de echte module
// binnenhaalt en wij alleen de twee aanroepen onderscheppen die geld kosten.
const _gcal = require(BASE + 'api/_gcal.js');
_gcal.isConfigured = () => true;
_gcal.decryptToken = () => 'refresh_zelftest';
_gcal.getAccessToken = async () => 'token_zelftest';
_gcal.deleteEvent = async (_t, _c, id) => { googleWeg.push(id); return { ok: true }; };
_gcal.updateEvent = async (_t, _c, id, ev) => { googleVerzet.push({ id, ev }); return { ok: true }; };

/* Bewust NIET A.gcalVoor overschrijven: die functie leest de klantrij en
   ontsleutelt het token, en dat is precies het stuk dat bepaalt of de agenda
   van de JUISTE klant geraakt wordt. De nep-Airtable hierboven serveert die rij
   dus echt, en alleen de twee Google-aanroepen die geld of gevolgen hebben
   worden onderschept. */
const A = require(BASE + 'api/_afspraken.js');

(async () => {
  console.log('\n— de afspraak van deze lead vinden —');
  reset(); nepAirtable();

  let a = await A.komendeVoorLead('TENANT_A', { leadId: 'recLEAD1111111111' });
  ck('op lead-id', a && a.id === 'recAAAAAAAAAAAAAA', a && a.id);

  a = await A.komendeVoorLead('TENANT_A', { telefoon: '32470123456' });
  ck('en op telefoonnummer, andere opmaak', a && a.id === 'recAAAAAAAAAAAAAA', a && a.id);

  a = await A.komendeVoorLead('TENANT_A', { leadId: 'recLEAD2222222222' });
  ck('de lead van een ANDER kantoor levert niets', a === null, a && a.id);

  a = await A.komendeVoorLead('', { leadId: 'recLEAD1111111111' });
  ck('zonder projectcode: niets, nooit "toon alles"', a === null, a && a.id);

  console.log('\n— afzeggen raakt alle vier de plaatsen —');
  reset(); nepAirtable();
  const uit = await A.annuleer({
    projectCode: 'TENANT_A', id: 'recAAAAAAAAAAAAAA',
    reden: 'ziek geworden', door: 'lead',
  });
  ck('het lukt', uit.ok === true, uit);

  const apptPatch = patches.find((p) => p.tabel === 'afspraken');
  ck('1. de rij staat op cancelled', apptPatch && apptPatch.fields.Status === 'cancelled', apptPatch);
  ck('   met de reden erbij in de notities',
     apptPatch && /ziek geworden/.test(apptPatch.fields.Notes || ''), apptPatch && apptPatch.fields.Notes);
  ck('   en de oude notitie blijft staan',
     apptPatch && /Eerste bezichtiging/.test(apptPatch.fields.Notes || ''), apptPatch && apptPatch.fields.Notes);
  ck('2. het Google-item is weg', googleWeg.indexOf('gev_123') !== -1, googleWeg);

  const leadPatch = patches.find((p) => p.tabel === 'leads');
  ck('3. Appointment Booked staat uit',
     leadPatch && leadPatch.fields.fldyIGNetqcSEkoaK === false, leadPatch);
  ck('4. Booking Link Sent staat uit — anders kan deze lead nooit meer boeken',
     leadPatch && leadPatch.fields.fldLeEqwNefdglLis === false, leadPatch);
  ck('   en het is de juiste lead', leadPatch && leadPatch.id === 'recLEAD1111111111', leadPatch && leadPatch.id);

  console.log('\n— een ander kantoor kan hem niet afzeggen —');
  reset(); nepAirtable();
  const vreemd = await A.annuleer({ projectCode: 'TENANT_B', id: 'recAAAAAAAAAAAAAA' });
  ck('geweigerd', vreemd.ok === false, vreemd);
  ck('en er is niets geschreven', patches.length === 0, patches);
  ck('en niets uit Google gehaald', googleWeg.length === 0, googleWeg);

  console.log('\n— twee keer afzeggen is geen storing —');
  reset(); nepAirtable();
  await A.annuleer({ projectCode: 'TENANT_A', id: 'recAAAAAAAAAAAAAA', door: 'lead' });
  const nogmaals = await A.annuleer({ projectCode: 'TENANT_A', id: 'recAAAAAAAAAAAAAA', door: 'lead' });
  ck('de tweede keer meldt gewoon ok', nogmaals.ok === true, nogmaals);
  ck('en zegt dat het al gebeurd was', nogmaals.alAfgezegd === true, nogmaals);

  console.log('\n— Google plat mag een afzegging niet tegenhouden —');
  reset(); nepAirtable();
  const stuk = _gcal.deleteEvent;
  _gcal.deleteEvent = async () => { throw new Error('Google is stuk'); };
  const tochAf = await A.annuleer({ projectCode: 'TENANT_A', id: 'recAAAAAAAAAAAAAA', door: 'lead' });
  _gcal.deleteEvent = stuk;
  ck('de afzegging telt', tochAf.ok === true, tochAf);
  ck('en de rij staat op cancelled', db.recAAAAAAAAAAAAAA.fields.Status === 'cancelled', db.recAAAAAAAAAAAAAA.fields);
  ck('maar het liegt niet over Google', tochAf.googleWeg === false, tochAf);

  console.log('\n— verzetten —');
  reset(); nepAirtable();
  const nieuw = new Date(Date.now() + 5 * 864e5).toISOString();
  const v = await A.verzet({ projectCode: 'TENANT_A', id: 'recAAAAAAAAAAAAAA', startISO: nieuw, durationMin: 45 });
  ck('het lukt', v.ok === true, v);
  const vPatch = patches.find((p) => p.tabel === 'afspraken');
  ck('de nieuwe tijd staat erin', vPatch && vPatch.fields['Start Time'] === nieuw, vPatch);
  ck('de duur ook', vPatch && vPatch.fields.Duration === 45, vPatch);
  ck('hij blijft geboekt', vPatch && vPatch.fields.Status === 'booked', vPatch);
  /* Zonder dit hoort de lead NOOIT iets over de nieuwe tijd: de
     herinneringscron slaat alles over waar deze vlag al aan staat. */
  ck('Reminder Sent gaat uit, anders mist de lead de nieuwe tijd',
     vPatch && vPatch.fields['Reminder Sent'] === false, vPatch);
  ck('en het Google-item is meeverzet', googleVerzet.length === 1 && googleVerzet[0].id === 'gev_123', googleVerzet);
  ck('de leadvlaggen blijven staan — er is nog steeds een afspraak',
     !patches.some((p) => p.tabel === 'leads'), patches);

  const kapot = await A.verzet({ projectCode: 'TENANT_A', id: 'recAAAAAAAAAAAAAA', startISO: 'volgende week' });
  ck('een onleesbare tijd wordt geweigerd', kapot.ok === false && kapot.reden === 'ongeldige_tijd', kapot);

  console.log('\n— Faro werkt met het Google-id —');
  reset(); nepAirtable();
  const viaEvent = await A.zoekOpEvent('TENANT_A', 'gev_123');
  ck('dat vindt onze eigen rij', viaEvent && viaEvent.id === 'recAAAAAAAAAAAAAA', viaEvent && viaEvent.id);
  const vreemdEvent = await A.zoekOpEvent('TENANT_A', 'gev_999');
  ck('maar niet die van een ander kantoor', vreemdEvent === null, vreemdEvent && vreemdEvent.id);
  const tandarts = await A.zoekOpEvent('TENANT_A', 'gev_tandarts');
  ck('en een eigen agenda-item van de makelaar is gewoon null', tandarts === null, tandarts);

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
