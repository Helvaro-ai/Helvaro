/*
 * Fase 3 pass 2, brief §134-136 -- "leane" actie-records.
 *
 * ── Wat dit bewijst ────────────────────────────────────────────────────────
 * Geen nieuwe opslag: dezelfde tabel als altijd (api/_activiteit.js), maar
 * elk `details`-object op de plekken die er al loggen krijgt er nu een vaste
 * vorm bij -- {actionType, status, idempotencyKey, resource, error?} --
 * bovenop wat er al in stond. Dit bestand bewijst die vorm op de twee paden
 * die de brief met naam noemt en waar dit al eerder gelogd werd:
 *
 *   - booking:               api/_dealer-boeking.js (create), api/_afspraken.js (cancel)
 *   - employee notification: api/_dealer-melding.js
 *
 * Elke sectie monkeypatcht _activiteit.log() (zelfde patroon als
 * tests/dealer-boeking.test.js en tests/dealer-melding.test.js) en leest de
 * gevangen `details`-blob terug.
 */
'use strict';

process.env.API_AIRTABLE   = 'test-nooit-echt';
process.env.BASE_AIRTABLE  = 'apptest00000000';
process.env.WHATSAPP_TOKEN = 'geheim-token-nooit-echt-XYZ987';
process.env.PHONE_NUMBER_ID = '100000000000000';

const _activiteit = require('../api/_activiteit');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 400));
  ok ? pass++ : fail++;
};

const origLog = _activiteit.log;
function vangLogs() {
  const logs = [];
  _activiteit.log = async (projectCode, soort, opts) => {
    logs.push({ projectCode, soort, opts });
    return true;
  };
  return logs;
}
function herstelLog() { _activiteit.log = origLog; }

/* Elk actie-record heeft precies de vaste velden, met de juiste soorten waarden. */
function ckActieRecord(naam, details, verwacht) {
  ck(`${naam}: actionType = ${verwacht.actionType}`, details && details.actionType === verwacht.actionType, details);
  ck(`${naam}: status = ${verwacht.status}`, details && details.status === verwacht.status, details);
  ck(`${naam}: heeft een idempotencyKey`, details && typeof details.idempotencyKey === 'string' && details.idempotencyKey.length > 0, details);
  ck(`${naam}: resource = ${verwacht.resource}`, details && details.resource === verwacht.resource, details);
  if (verwacht.error !== undefined) {
    ck(`${naam}: heeft een .error`, details && typeof details.error === 'string' && details.error.length > 0, details);
  }
  ck(`${naam}: status is een geldige waarde uit ACTIE_STATUSSEN`, _activiteit.ACTIE_STATUSSEN.indexOf(details && details.status) !== -1, details);
}

(async () => {
  console.log('\n— api/_activiteit.js actieVelden(): de bouwsteen zelf —');
  {
    const v = _activiteit.actieVelden('appointment_created', 'ok', { idempotencyKey: 'ZZ-1', resource: 'appointment' });
    ck('actionType klopt', v.actionType === 'appointment_created', v);
    ck('status klopt', v.status === 'ok', v);
    ck('idempotencyKey klopt', v.idempotencyKey === 'ZZ-1', v);
    ck('resource klopt', v.resource === 'appointment', v);
    ck('geen .error zonder dat er een reden werd meegegeven', v.error === undefined, v);

    const f = _activiteit.actieVelden('appointment_creation_failed', 'failed', { idempotencyKey: 'ZZ-2', resource: 'appointment', error: 'voertuig_bezet' });
    ck('failed record heeft .error', f.error === 'voertuig_bezet', f);

    const onbekend = _activiteit.actieVelden('x', 'iets_geks', {});
    ck('een onbekende status valt terug op ok (nooit gooien)', onbekend.status === 'ok', onbekend);

    const extra = _activiteit.actieVelden('x', 'ok', { details: { via: 'vrij', ontvanger: '1234' } });
    ck('extra details worden samengevoegd, niet genest', extra.via === 'vrij' && extra.ontvanger === '1234', extra);
  }

  console.log('\n— booking (create): api/_dealer-boeking.js —');
  {
    const _voertuigslot = require('../api/_voertuigslot');
    const dealerBoeking = require('../api/_dealer-boeking');
    const orig = {
      actieveAfspraken: _voertuigslot.actieveAfspraken,
      bevestigClaim:    _voertuigslot.bevestigClaim,
    };
    _voertuigslot.actieveAfspraken = async () => [];
    _voertuigslot.bevestigClaim    = async () => ({ ok: true, geverifieerd: true });

    const logs = vangLogs();
    const r = await dealerBoeking.naAanmaak({
      projectCode: 'DEMO', voertuig: { code: 'V1' }, recordId: 'recNIEUW', apptId: 'ZZ-2609191400-abcd', leadId: 'recLEAD1',
    });
    ck('boeking lukt', r.ok === true, r);
    const created = logs.find((l) => l.soort === 'appointment_created');
    ckActieRecord('appointment_created (booking)', created && created.opts.details, {
      actionType: 'appointment_created', status: 'ok', resource: 'appointment',
    });
    ck('idempotencyKey is het apptId', created && created.opts.details.idempotencyKey === 'ZZ-2609191400-abcd', created);

    // Verlies van de race op het voertuig -> failed record, met een reden.
    _voertuigslot.bevestigClaim = async () => ({ ok: false, reden: 'voertuig_bezet' });
    const logs2 = vangLogs();
    const r2 = await dealerBoeking.naAanmaak({
      projectCode: 'DEMO', voertuig: { code: 'V1' }, recordId: 'recNIEUW2', apptId: 'ZZ-2609191500-efgh', leadId: 'recLEAD1',
    });
    ck('boeking mislukt (voertuig bezet)', r2.ok === false, r2);
    const mislukt = logs2.find((l) => l.soort === 'appointment_creation_failed');
    ckActieRecord('appointment_creation_failed (booking)', mislukt && mislukt.opts.details, {
      actionType: 'appointment_creation_failed', status: 'failed', resource: 'appointment', error: 'voertuig_bezet',
    });

    _voertuigslot.actieveAfspraken = orig.actieveAfspraken;
    _voertuigslot.bevestigClaim    = orig.bevestigClaim;
    herstelLog();
  }

  console.log('\n— booking (cancel): api/_afspraken.js —');
  {
    // Nagemaakte Airtable, zelfde stijl als tests/afspraken.test.js.
    const AFSPRAKEN = 'tblD058vEITs1xYFc';
    const db = {
      recCANCEL00000001: {
        id: 'recCANCEL00000001',
        fields: {
          'Project Code': 'DEMO', 'Start Time': new Date(Date.now() + 3 * 864e5).toISOString(),
          'Status': 'booked', 'Lead': ['recLEAD9'], 'Notes': '',
        },
      },
    };
    const origFetch = global.fetch;
    global.fetch = async (url, opts = {}) => {
      const u = String(url);
      const method = (opts && opts.method) || 'GET';
      if (method === 'PATCH') {
        const id = u.split('/').pop();
        const body = JSON.parse(opts.body || '{}');
        if (db[id]) Object.assign(db[id].fields, body.fields);
        return { ok: true, status: 200, json: async () => ({ id, fields: body.fields }), text: async () => '{}' };
      }
      const m = u.match(new RegExp(`${AFSPRAKEN}/(rec[A-Za-z0-9]+)`));
      if (m) {
        const rec = db[m[1]];
        return rec
          ? { ok: true, status: 200, json: async () => rec, text: async () => '' }
          : { ok: false, status: 404, json: async () => ({}), text: async () => '' };
      }
      // Elke andere aanroep (activiteitenlog, leads-tabel, clients-tabel): een
      // onschadelijke lege lijst, zodat _activiteit.log() gewoon zijn eigen
      // pad volgt (available() -> ok, POST -> ok) zonder deze nep-db te raken.
      return { ok: true, status: 200, json: async () => ({ records: [] }), text: async () => '' };
    };

    delete require.cache[require.resolve('../api/_afspraken.js')];
    const A = require('../api/_afspraken.js');
    const logs = vangLogs();
    const uit = await A.annuleer({ projectCode: 'DEMO', id: 'recCANCEL00000001', reden: 'test', door: 'lead' });
    ck('afzegging lukt', uit.ok === true, uit);
    const cancelled = logs.find((l) => l.soort === 'appointment_cancelled');
    ckActieRecord('appointment_cancelled', cancelled && cancelled.opts.details, {
      actionType: 'appointment_cancelled', status: 'ok', resource: 'appointment',
    });
    ck('idempotencyKey is het Airtable record-id', cancelled && cancelled.opts.details.idempotencyKey === 'recCANCEL00000001', cancelled);

    // Mislukking: PATCH faalt.
    global.fetch = async (url, opts = {}) => {
      const u = String(url);
      const method = (opts && opts.method) || 'GET';
      if (method === 'PATCH') return { ok: false, status: 500, text: async () => 'boom' };
      const m = u.match(new RegExp(`${AFSPRAKEN}/(rec[A-Za-z0-9]+)`));
      if (m) {
        const rec = db[m[1]];
        return rec ? { ok: true, status: 200, json: async () => rec, text: async () => '' } : { ok: false, status: 404, json: async () => ({}), text: async () => '' };
      }
      return { ok: true, status: 200, json: async () => ({ records: [] }), text: async () => '' };
    };
    db.recCANCEL00000002 = { id: 'recCANCEL00000002', fields: { 'Project Code': 'DEMO', 'Status': 'booked', 'Lead': ['recLEAD9'], 'Notes': '' } };
    const logs2 = vangLogs();
    const stuk = await A.annuleer({ projectCode: 'DEMO', id: 'recCANCEL00000002', door: 'lead' });
    ck('afzegging mislukt (Airtable-fout)', stuk.ok === false, stuk);
    const failed = logs2.find((l) => l.soort === 'appointment_cancel_failed');
    ckActieRecord('appointment_cancel_failed', failed && failed.opts.details, {
      actionType: 'appointment_cancel_failed', status: 'failed', resource: 'appointment', error: 'x',
    });

    global.fetch = origFetch;
    herstelLog();
  }

  console.log('\n— employee notification: api/_dealer-melding.js —');
  {
    const _waSend = require('../api/_wa-send');
    const melding = require('../api/_dealer-melding');
    const origFree = _waSend.sendFreeformSafe;
    const origTpl  = _waSend.sendTemplateSafe;
    const F_NOTIFY = 'fldZEApe0gfse07AU';
    const basis = { projectCode: 'DEMO', phoneNumberId: '100000000000000', token: process.env.WHATSAPP_TOKEN, lang: 'nl', tekst: 'test', terugval: { naam: 'Jan', telefoon: '+32470000000' } };
    const eenOntvanger = { [F_NOTIFY]: '+32 470 12 34 56' };

    // Gelukt, geen herkansing nodig -> status ok.
    _waSend.sendFreeformSafe = async () => ({ ok: true, messageId: 'wamid.1' });
    _waSend.sendTemplateSafe = async () => ({ ok: true });
    let logs = vangLogs();
    await melding.stuurAfspraakMelding(Object.assign({ clientFields: eenOntvanger }, basis));
    const sent = logs.find((l) => l.soort === 'employee_notification_sent');
    ckActieRecord('employee_notification_sent (geen herkansing)', sent && sent.opts.details, {
      actionType: 'employee_notification_sent', status: 'ok', resource: 'employee_notification',
    });

    // Rate limit -> één herkansing, dan gelukt -> status retried.
    let n = 0;
    _waSend.sendFreeformSafe = async () => (n++ === 0 ? { ok: false, code: 'rate_limit', metaCode: 130429 } : { ok: true });
    logs = vangLogs();
    await melding.stuurAfspraakMelding(Object.assign({ clientFields: eenOntvanger }, basis));
    const retried = logs.find((l) => l.soort === 'employee_notification_sent');
    ckActieRecord('employee_notification_sent (na herkansing)', retried && retried.opts.details, {
      actionType: 'employee_notification_sent', status: 'retried', resource: 'employee_notification',
    });

    // Mislukt, ook na herkansing -> status failed (niet 'retried' -- de
    // uitkomst is en blijft een mislukking), met .error.
    _waSend.sendFreeformSafe = async () => ({ ok: false, code: 'window_closed', metaCode: 131047 });
    _waSend.sendTemplateSafe = async () => ({ ok: false, code: 'template_not_found', metaCode: 132001 });
    logs = vangLogs();
    await melding.stuurAfspraakMelding(Object.assign({ clientFields: eenOntvanger }, basis));
    const failed = logs.find((l) => l.soort === 'employee_notification_failed');
    ckActieRecord('employee_notification_failed', failed && failed.opts.details, {
      actionType: 'employee_notification_failed', status: 'failed', resource: 'employee_notification', error: 'template_not_found',
    });

    _waSend.sendFreeformSafe = origFree;
    _waSend.sendTemplateSafe = origTpl;
    herstelLog();
  }

  console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
