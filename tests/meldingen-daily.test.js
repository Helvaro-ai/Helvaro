/*
 * api/cron-followup.js checkDailyIntegrity() -- de dagelijkse integriteits-
 * controle voor deliverable "notifications" (brief §77/§107).
 *
 * ── Wat hier bewezen wordt ───────────────────────────────────────────────────
 *   1. GEEN KANAAL, GEEN MELDING. Een tenant zonder Notify Phone én zonder
 *      Rapport Email wordt overgeslagen -- leeg is de klant die zegt "geen
 *      meldingen", niet een storing (zelfde regel als whatsapp.js, form.js,
 *      _dealer-melding.js).
 *   2. BELANGRIJKE MISLUKKINGEN worden als ÉÉN dagelijkse verzamelmelding
 *      verstuurd, met het echte aantal erin -- nooit één mail per mislukking.
 *   3. DEDUPE: een tweede cron-run dezelfde dag stuurt NIETS opnieuw, voor
 *      zowel de mislukkingen-melding als de integratiemelding -- de kern van
 *      "dedupe by reference within a window (reuse ledger/idempotency refs)
 *      so retries never spam".
 *   4. INTEGRATIE VERBROKEN (Google Agenda): een echt verlopen token
 *      (reauth_required) triggert een melding met de "wat te doen"-tekst
 *      erin; een koppeling die nooit werd aangezet triggert NIETS.
 *
 * Mocked fetch (Airtable) + monkey-patched _gcal/_push/_mailer, zelfde
 * conventie als tests/afspraak-opvolging.test.js en tests/admin-actie-audit-
 * helvaro.test.js: de ECHTE functie draait, alleen de I/O is nep.
 */
'use strict';

process.env.API_AIRTABLE   = 'test-airtable-token';
process.env.BASE_AIRTABLE  = 'appTEST0000000000';
process.env.WHATSAPP_TOKEN = 'test-whatsapp-token';
process.env.PHONE_NUMBER_ID = 'test-phone-number-id';
process.env.GOOGLE_CLIENT_ID     = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.GOOGLE_REDIRECT_URI  = 'https://app.helvaro.pro/api/leads';
delete process.env.NOTIFY_PHONE;

const ACTIVITEIT_TABLE = 'tblzZSLA5wp60WVZm';
const CLIENTS_TABLE    = 'tblPidTrwGRzRt4LZ';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`);
  ok ? pass++ : fail++;
};

// ── Nep-Airtable: het activiteitenlogboek is een lijst records die POST'jes
//    er echt bij zet, zodat alGemeldBinnen() een record van EERDER in
//    dezelfde testrun ook echt terugvindt. ──────────────────────────────────
let activiteitRecords = [];
let clients = [];
let gcalClientRecord = null; // record in CLIENTS_TABLE met een refresh-token, of null

function jsonRes(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

/* lijstAlle() bouwt een echte Airtable-formule (AND/OR/IS_AFTER); die hier
   ontleden is goedkoper en eerlijker dan alle records terugsturen en op
   vertrouwen dat de aanroeper zelf wel filtert -- anders bewijst deze test
   niets over tenant-isolatie of het *_failed-filter. */
function filterActiviteit(url) {
  const m = /filterByFormula=([^&]*)/.exec(url);
  if (!m) return activiteitRecords.slice();
  const formule = decodeURIComponent(m[1]);
  const project = /\{Project Code\}="([^"]*)"/.exec(formule);
  const soorten = Array.from(formule.matchAll(/\{Type\}="([^"]*)"/g)).map((x) => x[1]);
  const vanaf = /IS_AFTER\(\{Created At\}, "([^"]*)"\)/.exec(formule);
  return activiteitRecords.filter((r) => {
    if (project && r.fields['Project Code'] !== project[1]) return false;
    if (soorten.length && soorten.indexOf(r.fields['Type']) === -1) return false;
    if (vanaf && !(r.fields['Created At'] > vanaf[1])) return false;
    return true;
  });
}

global.fetch = async (url, opts) => {
  const u = String(url);
  const method = (opts && opts.method) || 'GET';

  if (u.includes(ACTIVITEIT_TABLE)) {
    if (method === 'POST') {
      const body = JSON.parse(opts.body);
      const rec = { id: 'rec' + (activiteitRecords.length + 1), fields: body.fields };
      activiteitRecords.push(rec);
      return jsonRes({ id: rec.id });
    }
    if (u.endsWith('pageSize=1')) return jsonRes({ records: [] }); // available()-probe: tabel bestaat
    return jsonRes({ records: filterActiviteit(u) });
  }

  if (u.includes(CLIENTS_TABLE)) {
    if (u.includes('maxRecords=1')) {
      // gcalGetClient(): één record op projectcode
      return jsonRes({ records: gcalClientRecord ? [gcalClientRecord] : [] });
    }
    return jsonRes({ records: clients }); // checkDailyIntegrity's eigen {Active}=1 lijst
  }

  return jsonRes({ records: [] });
};

const _activiteit = require('../api/_activiteit');
const _gcal        = require('../api/_gcal');
const _push         = require('../api/_push');
const _mailer       = require('../api/_mailer');

// Monkey-patch de externe kanalen: geen echte OneSignal/SMTP-aanroep, wel de
// echte beslissing IN checkDailyIntegrity of ze aangeroepen worden.
let pushSent = [];
let mailSent = [];
_push.stuurVertaald = async (o) => { pushSent.push(o); return { ok: true, id: 'push1' }; };
_mailer.sendMail = async (o) => { mailSent.push(o); return { ok: true, id: 'mail1' }; };

// Google-token-kant van de gcal-probe: geen echt netwerkverkeer naar Google.
let decryptResult = 'geldig-token';
let accessTokenGedrag = 'ok'; // 'ok' | 'reauth'
_gcal.decryptToken = () => decryptResult;
_gcal.getAccessToken = async () => {
  if (accessTokenGedrag === 'reauth') {
    const e = new Error('invalid_grant');
    e.code = 'reauth_required';
    throw e;
  }
  return 'access-token';
};

const cron = require('../api/cron-followup.js');
const checkDailyIntegrity = cron.checkDailyIntegrity;

const F_PROJECT = 'fldN4dL0bGgfBOXwM';
const F_NOTIFY  = 'fldZEApe0gfse07AU';
const F_EMAIL   = 'fldDBJCN6dVMA8jax';
const F_LANG    = 'fld1iiV9XwSbgAACZ';
const F_REFRESH = 'fldkYmK3jAabvytCF';
const F_GEMAIL  = 'fldXF7qdyHYnSjnGf';

function reset() {
  activiteitRecords = [];
  clients = [];
  gcalClientRecord = null;
  pushSent = [];
  mailSent = [];
  decryptResult = 'geldig-token';
  accessTokenGedrag = 'ok';
  _activiteit._resetAvailability();
}

(async () => {

ck('checkDailyIntegrity is geëxporteerd', typeof checkDailyIntegrity === 'function', typeof checkDailyIntegrity);

console.log('\n  geen kanaal, geen melding');
{
  reset();
  clients = [{ id: 'recC1', fields: { [F_PROJECT]: 'GEENKANAAL' } }]; // geen Notify Phone, geen Rapport Email
  const res = await checkDailyIntegrity('tok', 'app');
  ck('gecontroleerd blijft 0 voor deze tenant', res.gecontroleerd === 0, res);
  ck('geen push verstuurd', pushSent.length === 0, pushSent);
  ck('geen mail verstuurd', mailSent.length === 0, mailSent);
}

console.log('\n  belangrijke mislukkingen vandaag -> één melding met het echte aantal');
{
  reset();
  clients = [{ id: 'recC2', fields: { [F_PROJECT]: 'MISLUKT1', [F_EMAIL]: 'eigenaar@voorbeeld.be', [F_LANG]: 'nl' } }];
  const nu = new Date().toISOString();
  activiteitRecords = [
    { id: 'recA1', fields: { 'Project Code': 'MISLUKT1', 'Type': 'appointment_creation_failed', 'Details': '{}', 'Created At': nu } },
    { id: 'recA2', fields: { 'Project Code': 'MISLUKT1', 'Type': 'crm_sync_failed', 'Details': '{}', 'Created At': nu } },
    { id: 'recA3', fields: { 'Project Code': 'MISLUKT1', 'Type': 'crm_sync_failed', 'Details': '{}', 'Created At': nu } },
    // een ANDERE tenant se mislukking mag niet meetellen
    { id: 'recA4', fields: { 'Project Code': 'ANDERETENANT', 'Type': 'crm_sync_failed', 'Details': '{}', 'Created At': nu } },
  ];
  const res = await checkDailyIntegrity('tok', 'app');
  ck('gecontroleerd', res.gecontroleerd === 1, res);
  ck('één mail verstuurd', mailSent.length === 1, mailSent.length);
  ck('het echte aantal (3) staat in de mail, niet 4 (van de andere tenant)',
     mailSent[0] && /3/.test(mailSent[0].html) && !/\b4\b/.test(mailSent[0].html.replace(/recA4/g, '')),
     mailSent[0] && mailSent[0].html);
  ck('mislukkingenGemeld == 1', res.mislukkingenGemeld === 1, res);
  const logged = activiteitRecords.find((r) => r.fields.Type === 'important_failure_digest_sent');
  ck('een important_failure_digest_sent-record staat klaar', !!logged, activiteitRecords);
  if (logged) {
    const details = JSON.parse(logged.fields.Details);
    ck('met idempotencyKey per dag', /^mislukkingen:\d{4}-\d{2}-\d{2}$/.test(details.idempotencyKey), details);
  }
}

console.log('\n  dedupe: al gemeld vandaag -> geen tweede mail');
{
  reset();
  clients = [{ id: 'recC3', fields: { [F_PROJECT]: 'MISLUKT2', [F_EMAIL]: 'eigenaar2@voorbeeld.be', [F_LANG]: 'nl' } }];
  const nu = new Date().toISOString();
  const dagSleutel = new Date().toISOString().slice(0, 10);
  activiteitRecords = [
    { id: 'recA5', fields: { 'Project Code': 'MISLUKT2', 'Type': 'crm_sync_failed', 'Details': '{}', 'Created At': nu } },
    // Al eerder vandaag gemeld -- exact dezelfde referentie die checkDailyIntegrity zelf zou bouwen.
    { id: 'recA6', fields: {
      'Project Code': 'MISLUKT2', 'Type': 'important_failure_digest_sent',
      'Details': JSON.stringify({ idempotencyKey: `mislukkingen:${dagSleutel}` }), 'Created At': nu,
    } },
  ];
  const res = await checkDailyIntegrity('tok', 'app');
  ck('geen nieuwe mail (al gemeld vandaag)', mailSent.length === 0, mailSent);
  ck('mislukkingenGemeld blijft 0', res.mislukkingenGemeld === 0, res);
}

console.log('\n  integratie: Google Agenda niet gekoppeld -> geen melding (geen storing)');
{
  reset();
  clients = [{ id: 'recC4', fields: { [F_PROJECT]: 'GEENGCAL', [F_NOTIFY]: '32470123456', [F_LANG]: 'nl' } }];
  gcalClientRecord = null; // geen refresh-token opgeslagen
  const res = await checkDailyIntegrity('tok', 'app');
  ck('geen push verstuurd', pushSent.length === 0, pushSent);
  ck('integratiesGemeld blijft 0', res.integratiesGemeld === 0, res);
}

console.log('\n  integratie: Google Agenda-token verlopen -> melding met "wat te doen"');
{
  reset();
  clients = [{ id: 'recC5', fields: { [F_PROJECT]: 'GCALVERLOPEN', [F_NOTIFY]: '32470123456', [F_LANG]: 'nl' } }];
  gcalClientRecord = { id: 'recGcal1', fields: { [F_REFRESH]: 'versleuteld-token-blob', [F_GEMAIL]: 'kantoor@voorbeeld.be' } };
  accessTokenGedrag = 'reauth';
  const res = await checkDailyIntegrity('tok', 'app');
  ck('één pushmelding verstuurd', pushSent.length === 1, pushSent);
  ck('met de integratie-titel-sleutel', pushSent[0] && pushSent[0].titelSleutel === 'meld.integratie.titel', pushSent[0]);
  ck('integratiesGemeld == 1', res.integratiesGemeld === 1, res);
  const logged = activiteitRecords.find((r) => r.fields.Type === 'integration_disconnected_notified');
  ck('een integration_disconnected_notified-record staat klaar', !!logged, activiteitRecords);
}

console.log('\n  dedupe: integratiemelding al gestuurd binnen 24u -> geen tweede push');
{
  reset();
  clients = [{ id: 'recC6', fields: { [F_PROJECT]: 'GCALDEDUP', [F_NOTIFY]: '32470123456', [F_LANG]: 'nl' } }];
  gcalClientRecord = { id: 'recGcal2', fields: { [F_REFRESH]: 'versleuteld-token-blob', [F_GEMAIL]: 'kantoor2@voorbeeld.be' } };
  accessTokenGedrag = 'reauth';
  activiteitRecords = [
    { id: 'recA7', fields: {
      'Project Code': 'GCALDEDUP', 'Type': 'integration_disconnected_notified',
      'Details': JSON.stringify({ idempotencyKey: 'gcal:expired' }), 'Created At': new Date().toISOString(),
    } },
  ];
  const res = await checkDailyIntegrity('tok', 'app');
  ck('geen nieuwe push (al gemeld)', pushSent.length === 0, pushSent);
  ck('integratiesGemeld blijft 0', res.integratiesGemeld === 0, res);
}

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
})();
