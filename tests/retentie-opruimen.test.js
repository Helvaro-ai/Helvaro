/*
 * api/cron-followup.js runRetentionPurge() + runMediaRetentionPurge() --
 * "no personal data kept indefinitely because soft-deleted" (brief §78/§79).
 *
 * ── Wat er vóór dit bestand al bestond, en wat de kloof was ─────────────────
 * runRetentionAnonymization() (eigen test elders) scrubt een koude,
 * ongekwalificeerde lead na 6 maanden -- Naam wordt '[verwijderd]', telefoon
 * en gespreksinhoud verdwijnen. Daarna gebeurde er NOOIT meer iets: de lege
 * huls bleef voor altijd in Airtable staan, met elk aggregaat-veld (Lead
 * Score, Ability/Urgency/Fit, Bron, Verwachte Waarde, ...) nog intact. Dat is
 * precies wat de brief bedoelt met "geen persoonsgegevens onbeperkt bewaren
 * omdat iets toch al 'zacht verwijderd' is" -- een huls is nog een rij.
 *
 * Dit bestand bewijst de twee nieuwe functies die dat sluiten:
 *
 *   1. runRetentionPurge()      -- verwijdert de Airtable-RIJ zelf, ECHT
 *      (DELETE, geen PATCH), voor leads die al langer dan de bewaartermijn
 *      geanonimiseerd zijn.
 *   2. runMediaRetentionPurge() -- ruimt Vercel Blob-media op van tenants die
 *      helemaal niet meer bestaan (een vangnet naast api/_wissen.js's eigen,
 *      directe opruiming bij een accountwissing).
 *
 * ── De belangrijkste eigenschap: dry-run is de STANDAARD ────────────────────
 * Beide functies loggen en tellen ALTIJD wat ze zouden wissen. Alleen als
 * RETENTIE_OPRUIMEN=1 staat, wordt er ook echt een DELETE/del() aanroep
 * gedaan. Dat onderscheid is precies wat hier getoetst wordt: dezelfde data,
 * twee keer gedraaid, en de tweede keer (met de vlag) is de enige keer dat er
 * iets echt weg is.
 */
'use strict';

process.env.API_AIRTABLE  = 'test-airtable-token';
process.env.BASE_AIRTABLE = 'appTEST0000000000';
delete process.env.RETENTIE_OPRUIMEN;
delete process.env.RETENTIE_OPRUIM_DAGEN;

const path = require('path');
const BASE = path.join(__dirname, '..');
const cron = require(path.join(BASE, 'api/cron-followup.js'));

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

ck('runRetentionPurge is geëxporteerd', typeof cron.runRetentionPurge === 'function', typeof cron.runRetentionPurge);
ck('runMediaRetentionPurge is geëxporteerd', typeof cron.runMediaRetentionPurge === 'function', typeof cron.runMediaRetentionPurge);

const NOW = new Date('2026-09-19T12:00:00.000Z');
const LEADS_TABLE = 'tbliukTnDAbEDcZmt';
const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';

function jsonRes(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function iso(daysAgo) { return new Date(NOW.getTime() - daysAgo * 86400000).toISOString(); }

/* ── anonymizedAtMs(): eerst de losse unit, want de rest van dit bestand
   vertrouwt volledig op deze functie om "oud genoeg" te bepalen. ─────────── */
console.log('\n— anonymizedAtMs(): anonymizedAt uit Notities, met Created At als terugval —');
{
  const metJson = cron.anonymizedAtMs({ Notities: JSON.stringify({ anonymizedAt: iso(100) }) });
  ck('leest anonymizedAt uit geldige JSON', Math.abs(metJson - (NOW.getTime() - 100 * 86400000)) < 5000, metJson);

  const kapotteJson = cron.anonymizedAtMs({ Notities: '{niet geldige json', 'Created At': iso(200) });
  ck('valt terug op Created At bij kapotte JSON', Math.abs(kapotteJson - (NOW.getTime() - 200 * 86400000)) < 5000, kapotteJson);

  const legacyLeeg = cron.anonymizedAtMs({ Notities: '', 'Created At': iso(50) });
  ck('valt terug op Created At bij lege Notities (leads van vóór deze wijziging)',
     Math.abs(legacyLeeg - (NOW.getTime() - 50 * 86400000)) < 5000, legacyLeeg);

  const niets = cron.anonymizedAtMs({});
  ck('NaN zonder enig bruikbaar tijdstip', Number.isNaN(niets), niets);
}

/* ── runRetentionPurge ───────────────────────────────────────────────────── */
function maakLeadHuls({ id, anonymizedAt, createdAt, projectCode = 'TENANT_A' }) {
  const notities = anonymizedAt ? JSON.stringify({ anonymizedAt }) : '';
  return {
    id,
    fields: {
      fldbk0LVNckOU0bqA: '[verwijderd]',
      'Notities': notities,
      'Created At': createdAt,
      'fldSmczuyUJd26HLe': projectCode,
    },
  };
}

const HULS_OUD         = maakLeadHuls({ id: 'recHULSOUD00000001', anonymizedAt: iso(120), createdAt: iso(400) }); // 120 dagen geleden geanonimiseerd -> voorbij de 90-dagen default
const HULS_RECENT      = maakLeadHuls({ id: 'recHULSRECENT000001', anonymizedAt: iso(10), createdAt: iso(400) }); // pas 10 dagen geleden -> nog niet
const HULS_LEGACY_OUD  = maakLeadHuls({ id: 'recHULSLEGACY000001', anonymizedAt: null, createdAt: iso(200) });    // geen anonymizedAt (van vóór deze wijziging), maar oude Created At -> terugval maakt hem in aanmerking

function nepAirtableVoorLeads(deleteLog) {
  return async (url, opts = {}) => {
    const u = String(url);
    const methode = (opts && opts.method) || 'GET';
    if (methode === 'DELETE') {
      const id = u.split('/').pop();
      deleteLog.push(id);
      return jsonRes({ id, deleted: true });
    }
    if (u.includes(LEADS_TABLE)) {
      return jsonRes({ records: [HULS_OUD, HULS_RECENT, HULS_LEGACY_OUD] });
    }
    return jsonRes({ records: [] });
  };
}

/* ── runMediaRetentionPurge ──────────────────────────────────────────────── */
const GELDIGE_TENANT   = 'TENANTLIVE01';
const VERWEESDE_TENANT = 'TENANTWEG0001';

function nepAirtableVoorMedia() {
  return async (url) => {
    const u = String(url);
    if (u.includes(CLIENTS_TABLE)) {
      return jsonRes({ records: [{ id: 'recClient1', fields: { 'Project Code': GELDIGE_TENANT } }] });
    }
    return jsonRes({ records: [] });
  };
}

function nepBlobLib({ listResult, delLog }) {
  return {
    list: async (opts) => { listResult.opts.push(opts); return listResult.value; },
    del: async (urls, opts) => { delLog.push({ urls, opts }); },
  };
}

(async () => {
  console.log('\n— dry-run (standaard, geen RETENTIE_OPRUIMEN): telt en logt, wist NIETS —');
  {
    delete process.env.RETENTIE_OPRUIMEN;
    const deleteLog = [];
    global.fetch = nepAirtableVoorLeads(deleteLog);
    const res = await cron.runRetentionPurge('token', 'appX', LEADS_TABLE, NOW);
    ck('3 kandidaten bekeken', res.checked === 3, res);
    ck('2 komen in aanmerking (OUD en LEGACY_OUD, niet RECENT)', res.eligible === 2, res);
    ck('dryRun staat op true', res.dryRun === true, res);
    ck('en er is ECHT geen enkele DELETE verstuurd', deleteLog.length === 0, deleteLog);
  }

  console.log('\n— RETENTIE_OPRUIMEN=1: dezelfde data, nu wordt er ECHT gewist —');
  {
    process.env.RETENTIE_OPRUIMEN = '1';
    const deleteLog = [];
    global.fetch = nepAirtableVoorLeads(deleteLog);
    const res = await cron.runRetentionPurge('token', 'appX', LEADS_TABLE, NOW);
    ck('nog steeds 3 bekeken, 2 in aanmerking', res.checked === 3 && res.eligible === 2, res);
    ck('dryRun staat nu op false', res.dryRun === false, res);
    ck('2 verwijderd', res.deleted === 2, res);
    ck('precies de OUDE en de LEGACY-huls werden verwijderd, niet de RECENTE',
       deleteLog.indexOf(HULS_OUD.id) !== -1 && deleteLog.indexOf(HULS_LEGACY_OUD.id) !== -1
       && deleteLog.indexOf(HULS_RECENT.id) === -1,
       deleteLog);
    delete process.env.RETENTIE_OPRUIMEN;
  }

  console.log('\n— RETENTIE_OPRUIM_DAGEN overschrijft de default van 90 dagen —');
  {
    process.env.RETENTIE_OPRUIM_DAGEN = '15'; // strenger: alles ouder dan 15 dagen mag weg
    delete process.env.RETENTIE_OPRUIMEN;      // nog steeds dry-run, we tellen alleen
    const deleteLog = [];
    global.fetch = nepAirtableVoorLeads(deleteLog);
    const res = await cron.runRetentionPurge('token', 'appX', LEADS_TABLE, NOW);
    // Met 15 dagen als grens: RECENT is 10 dagen oud (< 15, dus nog NIET in
    // aanmerking); OUD (120d) en LEGACY_OUD (200d) zijn allebei ouder dan 15
    // dagen.
    ck('nog steeds 2 in aanmerking bij een 15-dagen-grens', res.eligible === 2, res);
    ck('retentionDays in het antwoord is 15', res.retentionDays === 15, res.retentionDays);
    delete process.env.RETENTIE_OPRUIM_DAGEN;
  }

  console.log('\n— media dry-run: wees (verweesde tenant, oud) telt mee, live tenant en te-recente wees niet —');
  {
    delete process.env.RETENTIE_OPRUIMEN;
    process.env.BLOB_READ_WRITE_TOKEN = 'test-blob-token';
    global.fetch = nepAirtableVoorMedia();

    const listResult = {
      opts: [],
      value: {
        hasMore: false,
        blobs: [
          { url: `https://blob.test/property/${VERWEESDE_TENANT}/result-oud.png`, pathname: `property/${VERWEESDE_TENANT}/result-oud.png`, uploadedAt: new Date(iso(120)) },
          { url: `https://blob.test/property/${VERWEESDE_TENANT}/result-recent.png`, pathname: `property/${VERWEESDE_TENANT}/result-recent.png`, uploadedAt: new Date(iso(5)) },
          { url: `https://blob.test/property/${GELDIGE_TENANT}/result-oud.png`, pathname: `property/${GELDIGE_TENANT}/result-oud.png`, uploadedAt: new Date(iso(120)) },
        ],
      },
    };
    const delLog = [];
    const blobPad = path.join(BASE, 'node_modules/@vercel/blob');
    delete require.cache[require.resolve(blobPad)];
    require.cache[require.resolve(blobPad)] = { id: blobPad, filename: blobPad, loaded: true, exports: nepBlobLib({ listResult, delLog }) };

    const res = await cron.runMediaRetentionPurge(NOW);
    ck('list() kreeg het property/-prefix mee', listResult.opts[0] && listResult.opts[0].prefix === 'property/', listResult.opts);
    ck('precies 1 wees gevonden (verweesde tenant + oud genoeg)', res.orphans === 1, res);
    ck('dry-run: geen del() aanroep', delLog.length === 0, delLog);
    ck('dryRun-vlag staat op true', res.dryRun === true, res);

    delete require.cache[require.resolve(blobPad)];
    delete process.env.BLOB_READ_WRITE_TOKEN;
  }

  console.log('\n— media met RETENTIE_OPRUIMEN=1: de wees wordt ECHT verwijderd, de live tenant nooit —');
  {
    process.env.RETENTIE_OPRUIMEN = '1';
    process.env.BLOB_READ_WRITE_TOKEN = 'test-blob-token';
    global.fetch = nepAirtableVoorMedia();

    const listResult = {
      opts: [],
      value: {
        hasMore: false,
        blobs: [
          { url: `https://blob.test/property/${VERWEESDE_TENANT}/result-oud.png`, pathname: `property/${VERWEESDE_TENANT}/result-oud.png`, uploadedAt: new Date(iso(120)) },
          { url: `https://blob.test/property/${GELDIGE_TENANT}/result-oud.png`, pathname: `property/${GELDIGE_TENANT}/result-oud.png`, uploadedAt: new Date(iso(120)) },
        ],
      },
    };
    const delLog = [];
    const blobPad = path.join(BASE, 'node_modules/@vercel/blob');
    delete require.cache[require.resolve(blobPad)];
    require.cache[require.resolve(blobPad)] = { id: blobPad, filename: blobPad, loaded: true, exports: nepBlobLib({ listResult, delLog }) };

    const res = await cron.runMediaRetentionPurge(NOW);
    ck('1 wees, 1 verwijderd', res.orphans === 1 && res.deleted === 1, res);
    ck('del() kreeg precies de wees-URL, niet de live tenant se URL',
       delLog.length === 1
       && delLog[0].urls.length === 1
       && delLog[0].urls[0].includes(VERWEESDE_TENANT)
       && !delLog[0].urls[0].includes(GELDIGE_TENANT),
       delLog);

    delete require.cache[require.resolve(blobPad)];
    delete process.env.RETENTIE_OPRUIMEN;
    delete process.env.BLOB_READ_WRITE_TOKEN;
  }

  console.log('\n— media zonder blob-configuratie: nette no-op, geen fout —');
  {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
    delete process.env.VERCEL_OIDC_TOKEN;
    const res = await cron.runMediaRetentionPurge(NOW);
    ck('skipped: geen_blob_config', res.skipped === 'geen_blob_config', res);
  }

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('  STUK:', e && e.stack); process.exit(1); });
