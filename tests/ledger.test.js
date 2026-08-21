/*
 * Het creditgrootboek.
 *
 * Credits waren een TELLER: "Credits Used = 1240". Dat werkt tot iemand vraagt
 * waar die 1240 vandaan komen -- en dan is er geen antwoord, want er stond
 * niets bewaard. Vanaf nu is elke beweging een regel.
 *
 * Waar deze test op let, in volgorde van hoeveel het kost als het misgaat:
 *   1. Tenant. Een klant mag de boekingen van een ander nooit zien.
 *   2. Het TEKEN. Een verbruik dat positief geboekt wordt geeft gratis
 *      credits weg, en dat merk je pas bij de jaarrekening.
 *   3. Idempotentie. Tweemaal dezelfde referentie is één boeking -- dat is
 *      wat een herhaalde aanroep na een time-out onschadelijk maakt.
 *   4. Dat een terugbetaling niet dubbel geboekt wordt.
 */
const fs = require('fs');
const path = require('path');
const ledger = require('../api/_ledger');

let pass = 0, fail = 0;
function ck(naam, cond, ctx) {
  console.log(`  ${cond ? 'OK  ' : 'FOUT'}  ${naam}`);
  if (!cond && ctx !== undefined) console.log('        ' + JSON.stringify(ctx).slice(0, 300));
  cond ? pass++ : fail++;
}

process.env.API_AIRTABLE = process.env.API_AIRTABLE || 'test-token';
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'test-base';

/* Een nagemaakte Airtable die de echte queries beantwoordt -- inclusief de
   filterformule, want daar zit de tenant-isolatie in. */
function nepAirtable(records, opties = {}) {
  const geschreven = [];
  global.fetch = async (url, init) => {
    const u = String(url);
    if (opties.status && opties.status !== 200) {
      return { ok: false, status: opties.status, text: async () => '', json: async () => ({}) };
    }
    if (init && init.method === 'POST') {
      const velden = JSON.parse(init.body).fields;
      const rec = { id: 'rec' + records.length, fields: velden };
      records.push(rec); geschreven.push(velden);
      return { ok: true, status: 200, json: async () => rec };
    }
    const m = /filterByFormula=([^&]*)/.exec(u);
    const formule = m ? decodeURIComponent(m[1]) : '';
    const tenant = (/\{Project Code\}="([^"]*)"/.exec(formule) || [])[1];
    const ref    = (/\{Reference\}="([^"]*)"/.exec(formule) || [])[1];
    let uit = records;
    if (tenant) uit = uit.filter((r) => r.fields['Project Code'] === tenant);
    if (ref)    uit = uit.filter((r) => r.fields['Reference'] === ref);
    return { ok: true, status: 200, json: async () => ({ records: uit }) };
  };
  return geschreven;
}

(async () => {
  console.log('\n— zonder projectcode wordt er niets geboekt —');
  ledger._resetAvailability(); nepAirtable([]);
  ck('record() weigert', (await ledger.record({ type: ledger.TYPE.VERBRUIK, credits: 10 })) === null);
  let wierp = false;
  try { await ledger.list(''); } catch (e) { wierp = e.code === 'no_tenant'; }
  ck('list() werpt no_tenant', wierp);

  console.log('\n— een klant ziet alleen zijn eigen boekingen —');
  ledger._resetAvailability();
  nepAirtable([
    { id: 'a', fields: { 'Project Code': 'TELJO',  Type: 'usage', Credits: -20, 'Created At': '2026-08-20T10:00:00Z' } },
    { id: 'b', fields: { 'Project Code': 'ANDERE', Type: 'usage', Credits: -99, 'Created At': '2026-08-20T11:00:00Z' } },
    { id: 'c', fields: { 'Project Code': 'TELJO',  Type: 'usage', Credits: -3,  'Created At': '2026-08-20T12:00:00Z' } },
  ]);
  const mijn = await ledger.list('TELJO');
  ck('twee regels, allebei van TELJO', mijn.length === 2 && mijn.every((t) => t.projectCode === 'TELJO'),
     mijn.map((t) => t.projectCode));
  ck('de -99 van de ander zit er niet bij', !mijn.some((t) => t.credits === -99));

  console.log('\n— het teken hoort bij de soort, niet bij de aanroeper —');
  ledger._resetAvailability();
  let geschreven = nepAirtable([]);
  await ledger.record({ projectCode: 'T', type: ledger.TYPE.VERBRUIK, credits: 20, feature: 'faro_chat' });
  ck('verbruik wordt negatief geboekt', geschreven[0].Credits === -20, geschreven[0].Credits);
  /* Ook als de aanroeper per ongeluk een negatief getal meegeeft: dan zou een
     dubbel minteken van een afschrijving een bijstorting maken. */
  await ledger.record({ projectCode: 'T', type: ledger.TYPE.VERBRUIK, credits: -20 });
  ck('een meegegeven minteken maakt er geen bijstorting van', geschreven[1].Credits === -20, geschreven[1].Credits);
  await ledger.record({ projectCode: 'T', type: ledger.TYPE.TOEWIJZING, credits: 2000 });
  ck('toewijzing is positief', geschreven[2].Credits === 2000, geschreven[2].Credits);
  await ledger.record({ projectCode: 'T', type: ledger.TYPE.TERUGBETALING, credits: 50 });
  ck('terugbetaling is positief', geschreven[3].Credits === 50, geschreven[3].Credits);

  console.log('\n— dezelfde referentie is één boeking —');
  ledger._resetAvailability();
  const rijen = [];
  geschreven = nepAirtable(rijen);
  const een = await ledger.record({ projectCode: 'T', type: ledger.TYPE.VERBRUIK, credits: 50,
                                    feature: 'image_generation', reference: 'beeld-abc123' });
  const twee = await ledger.record({ projectCode: 'T', type: ledger.TYPE.VERBRUIK, credits: 50,
                                     feature: 'image_generation', reference: 'beeld-abc123' });
  ck('er staat maar één regel in het grootboek', geschreven.length === 1, geschreven.length);
  ck('en de tweede aanroep geeft de bestaande terug', !!twee && twee.referentie === 'beeld-abc123');
  ck('de eerste is ook echt geboekt', !!een && een.credits === -50);
  /* Een referentie van een ANDERE klant mag niet als duplicaat gelden. */
  await ledger.record({ projectCode: 'ANDERE', type: ledger.TYPE.VERBRUIK, credits: 50, reference: 'beeld-abc123' });
  ck('dezelfde referentie bij een andere klant is een nieuwe boeking', geschreven.length === 2, geschreven.length);

  console.log('\n— onzin wordt niet geboekt —');
  ledger._resetAvailability(); geschreven = nepAirtable([]);
  ck('onbekend type', (await ledger.record({ projectCode: 'T', type: 'gratis', credits: 10 })) === null);
  ck('nul credits', (await ledger.record({ projectCode: 'T', type: ledger.TYPE.VERBRUIK, credits: 0 })) === null);
  ck('niet-getal', (await ledger.record({ projectCode: 'T', type: ledger.TYPE.VERBRUIK, credits: 'veel' })) === null);
  ck('er is niets weggeschreven', geschreven.length === 0, geschreven.length);

  console.log('\n— een terugbetaling zonder reden wordt geweigerd —');
  /* Een terugbetaling zonder uitleg is niet na te vertellen als een klant
     ernaar vraagt, en dat is precies wanneer je hem nodig hebt. */
  ledger._resetAvailability(); geschreven = nepAirtable([]);
  ck('zonder reden geen boeking', (await ledger.refund({ projectCode: 'T', credits: 50, reason: '  ' })) === null);
  const terug = await ledger.refund({ projectCode: 'T', credits: 50, reason: 'Beeld kon niet opgeslagen worden' });
  ck('met reden wel', !!terug && terug.credits === 50);
  ck('de reden staat in de regel', geschreven[0].Note.indexOf('niet opgeslagen') !== -1, geschreven[0].Note);

  console.log('\n— optellen —');
  ledger._resetAvailability();
  nepAirtable([
    { id: '1', fields: { 'Project Code': 'T', Type: 'allocation', Credits: 2000, 'Created At': '2026-08-01T00:00:00Z' } },
    { id: '2', fields: { 'Project Code': 'T', Type: 'usage',      Credits: -20, Feature: 'whatsapp_conversation', 'Created At': '2026-08-05T00:00:00Z' } },
    { id: '3', fields: { 'Project Code': 'T', Type: 'usage',      Credits: -50, Feature: 'image_generation',      'Created At': '2026-08-06T00:00:00Z' } },
    { id: '4', fields: { 'Project Code': 'T', Type: 'refund',     Credits: 50,  Feature: 'image_generation',      'Created At': '2026-08-06T00:00:00Z' } },
    { id: '5', fields: { 'Project Code': 'T', Type: 'usage',      Credits: -20, Feature: 'whatsapp_conversation', 'Created At': '2026-08-07T00:00:00Z' } },
  ]);
  const t = await ledger.totals('T');
  ck('toegewezen', t.toegewezen === 2000, t.toegewezen);
  ck('verbruikt telt absoluut', t.verbruikt === 90, t.verbruikt);
  ck('terugbetaald', t.terugbetaald === 50, t.terugbetaald);
  ck('saldo klopt met de som', t.saldo === 2000 - 90 + 50, t.saldo);
  ck('per onderdeel: whatsapp 40', t.perFeature.whatsapp_conversation === 40, t.perFeature);
  ck('per onderdeel: beeld 50 (de terugbetaling telt niet als verbruik)',
     t.perFeature.image_generation === 50, t.perFeature);

  console.log('\n— de tabel bestaat nog niet —');
  ledger._resetAvailability(); nepAirtable([], { status: 404 });
  ck('available() is onwaar', (await ledger.available()) === false);
  ck('boeken doet niets in plaats van te ontploffen',
     (await ledger.record({ projectCode: 'T', type: ledger.TYPE.VERBRUIK, credits: 10 })) === null);
  ck('lijst is leeg', (await ledger.list('T')).length === 0);

  console.log('\n— de aansluiting op de creditstroom —');
  const lees = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const cred = lees('api/_credits.js');
  ck('recordUsage boekt in het grootboek', cred.indexOf("_ledger.TYPE.VERBRUIK") !== -1);
  /* Pas NA een geslaagde PATCH: een regel voor een afschrijving die niet
     doorging maakt de geschiedenis onbetrouwbaar. */
  const iClear = cred.indexOf('clearUnrecorded(code);');
  const iBoek  = cred.indexOf("_ledger.TYPE.VERBRUIK");
  ck('en pas na de geslaagde afschrijving', iClear !== -1 && iBoek > iClear, { iClear, iBoek });
  ck('er is een terugbetaalfunctie', cred.indexOf('async function refundCredits') !== -1);
  ck('terugbetalen eist een reden', /terugbetaling zonder reden geweigerd/.test(cred));
  /* Zonder skip-ledger boekt addCredits ook een correctie, en dan staan er
     twee regels voor één terugbetaling. */
  ck('een terugbetaling levert maar één grootboekregel op',
     cred.indexOf("opts.type === 'skip-ledger'") !== -1);
  ck('refundCredits is geëxporteerd', /module\.exports = \{\s*\n\s*refundCredits/.test(cred));

  const leads = lees('api/leads.js');
  ck('leads.js kent billing-overview', leads.indexOf("body.mode === 'billing-overview'") !== -1);
  const iMode = leads.indexOf("body.mode === 'billing-overview'");
  ck('en controleert de client context',
     leads.slice(iMode, iMode + 220).indexOf('if (!projectCode)') !== -1);

  const dash = lees('api/dashboard.js');
  ck('het dashboard heeft een facturatiepagina', dash.indexOf('id="page-facturatie"') !== -1);
  ck('en een navigatieknop', dash.indexOf('data-page="facturatie"') !== -1);
  ck('en laadt hem bij navigeren', dash.indexOf("if (page === 'facturatie')") !== -1);
  /* Geen verzonnen verdeling als het grootboek er niet is. */
  ck('zonder grootboek zegt de pagina dat, in plaats van een verdeling te tonen',
     dash.indexOf('De geschiedenis staat nog niet aan') !== -1);

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
