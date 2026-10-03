'use strict';
/*
 * Gmail koppelen: "vinkje niet aangezet" is iets anders dan "API weigert".
 *
 * Tot 2026-10-02 werd elke fout na de toestemming gemeld als "Vink alle
 * gevraagde rechten aan" -- ook als de rechten WEL gegeven waren en de Gmail
 * API zelf weigerde (bv. niet ingeschakeld in het Google Cloud-project).
 * Sindi kreeg die melding en kon er niets mee. Nu:
 *   - ontbreekt een mailrecht in Google's `scope`-antwoord -> scope_geweigerd
 *   - rechten compleet maar de API weigert          -> mailbox_api (+ log)
 * En de agenda-weergave: afspraken mogen geen inline position:relative
 * krijgen (dan belanden ze onder het uurrooster).
 */
const fs = require('fs');
const path = require('path');

process.env.GOOGLE_CLIENT_ID = 'test-client';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
process.env.GOOGLE_REDIRECT_URI = 'https://app.example.test/api/gcal/callback';
process.env.API_AIRTABLE = 'patTest';
process.env.BASE_AIRTABLE = 'appTest';
process.env.GCAL_TOKEN_KEY = process.env.GCAL_TOKEN_KEY || 'a'.repeat(64);

let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 240)}`); ok ? pass++ : fail++; };

const VOL = 'openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send';
let toegekend = VOL, gmailStatus = 200, schrijfacties = 0;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (b, s = 200) => ({ ok: s < 400, status: s, json: async () => b, text: async () => JSON.stringify(b) });
  if (u.includes('oauth2.googleapis.com/token')) return json({ access_token: 'at', refresh_token: 'rt', scope: toegekend });
  if (u.includes('gmail.googleapis.com')) return gmailStatus === 200 ? json({ emailAddress: 'dealer@voorbeeld.be', historyId: '42' }) : json({ error: { status: 'PERMISSION_DENIED', message: 'Gmail API has not been used in project 123' } }, gmailStatus);
  if (u.includes('api.airtable.com')) { if ((opts.method || 'GET') !== 'GET') { schrijfacties++; return json({ id: 'recX' }); } return json({ records: [{ id: 'recX', fields: {} }] }); }
  return json({});
};

const mailbox = require('../api/_email/mailbox.js');
async function koppel() { try { await mailbox.verbind('TEST', 'code-123', 'gmail'); return 'ok'; } catch (e) { return e.code || e.message; } }

(async () => {
  console.log('\nGmail koppelen');
  toegekend = 'openid email https://www.googleapis.com/auth/gmail.send'; gmailStatus = 200; schrijfacties = 0;
  ck('leesrecht niet aangevinkt -> scope_geweigerd', await koppel() === 'scope_geweigerd');
  ck('en er wordt niets opgeslagen', schrijfacties === 0, schrijfacties);

  toegekend = VOL; gmailStatus = 403; schrijfacties = 0;
  ck('alles aangevinkt maar Gmail API weigert -> mailbox_api (niet "vink aan")', await koppel() === 'mailbox_api');
  ck('ook dan niets opgeslagen', schrijfacties === 0, schrijfacties);

  toegekend = VOL; gmailStatus = 200; schrijfacties = 0;
  const r = await koppel();
  ck('alles goed -> geen scope- of api-fout', r !== 'scope_geweigerd' && r !== 'mailbox_api', r);

  const leads = fs.readFileSync(path.join(__dirname, '..', 'api', 'leads.js'), 'utf8');
  ck('de callback stuurt mailbox_api door als ?mail=api', /mailbox_api' \? 'api'/.test(leads));
  const i18n = require('../api/_i18n.js');
  const d = i18n.woordenboek ? i18n.woordenboek('en') : {};
  ck('er is een Engelse melding voor mail.terug.api', !d || typeof d['mail.terug.api'] === 'string' || /mail\.terug\.api/.test(fs.readFileSync(path.join(__dirname, '..', 'api', '_i18n.js'), 'utf8')));

  console.log('\nAgenda-weergave');
  /* Sinds 2026-10-03 in api/_dash/agenda.js (calTekenTijd). */
  const dash = require('../api/_dash/agenda.js').js();
  const blok = dash.slice(dash.indexOf('const gesorteerd = dagEvents'), dash.indexOf("const colClass = "));
  ck('afspraken krijgen geen inline position:relative', blok.length > 500 && !/position:relative/.test(blok), blok.match(/position:[a-z]+/g));
  ck('overlappende afspraken krijgen een eigen baan', /plek\.set\(ev, \{ baan: i/.test(blok) && /p\.van > 1/.test(blok));
  const css = require('../api/_dash/styles.js');
  const cssTekst = typeof css === 'function' ? css() : Object.values(css).map(v => typeof v === 'function' ? v() : v).find(v => typeof v === 'string' && v.length > 10000) || '';
  ck('.cal-event blijft absolute in de stylesheet', /\.cal-event\s*\{\s*position:\s*absolute/.test(cssTekst));

  console.log(`\n  ${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
