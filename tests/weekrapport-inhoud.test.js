/*
 * api/cron-followup.js sendWeeklyClientReports() / sendWeeklyReportEmail() --
 * deliverable "weekly report" (brief §76).
 *
 * ── Wat hier bewezen wordt ───────────────────────────────────────────────────
 * De weekmail bestond al (leads, gekwalificeerd, conversie, top 5, pipeline-
 * schatting) maar miste drie van de cijfers die de brief vraagt: hete leads,
 * afzeggingen en belangrijke mislukkingen. Dit bestand bewijst dat de drie
 * nieuwe cijfers ECHT geteld worden (niet verzonnen), tenant-gescheiden zijn,
 * en dat de mislukkingen-balk alleen verschijnt als er ook echt iets
 * mislukte -- een balk met "0 belangrijke mislukkingen" zou een storing
 * suggereren waar geen is.
 *
 * Mocked fetch (Airtable) + monkey-patched _mailer.sendMail, zelfde conventie
 * als tests/meldingen-daily.test.js.
 */
'use strict';

process.env.API_AIRTABLE  = 'test-airtable-token';
process.env.BASE_AIRTABLE = 'appTEST0000000000';

const CLIENTS_TABLE    = 'tblPidTrwGRzRt4LZ';
const LEADS_TABLE      = 'tbliukTnDAbEDcZmt';
const ACTIVITEIT_TABLE = 'tblzZSLA5wp60WVZm';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`);
  ok ? pass++ : fail++;
};

function jsonRes(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

let clients = [];
let leads = [];
let activiteitRecords = [];

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

global.fetch = async (url) => {
  const u = String(url);
  if (u.includes(CLIENTS_TABLE)) return jsonRes({ records: clients });
  if (u.includes(LEADS_TABLE)) return jsonRes({ records: leads });
  if (u.includes(ACTIVITEIT_TABLE)) {
    if (u.endsWith('pageSize=1')) return jsonRes({ records: [] });
    return jsonRes({ records: filterActiviteit(u) });
  }
  return jsonRes({ records: [] });
};

const _activiteit = require('../api/_activiteit');
const _mailer = require('../api/_mailer');
let mailSent = [];
_mailer.sendMail = async (o) => { mailSent.push(o); return { ok: true, id: 'mail1' }; };

const cron = require('../api/cron-followup.js');
const sendWeeklyClientReports = cron.sendWeeklyClientReports;

const F_PROJECT = 'fldN4dL0bGgfBOXwM';
const F_NAAM    = 'fldAnB848Sr5jl6dq';
const F_EMAIL   = 'fldDBJCN6dVMA8jax';
const F_LANG    = 'fld1iiV9XwSbgAACZ';

function reset() {
  clients = [];
  leads = [];
  activiteitRecords = [];
  mailSent = [];
  _activiteit._resetAvailability();
}

function maakLead({ id, score, qualified = false, booked = false, created }) {
  return {
    id, fields: {
      'Name': 'Lead ' + id, 'Qualified': qualified, 'Appointment Booked': booked,
      'Lead Score': score, 'Created At': created || new Date().toISOString(),
    },
  };
}

(async () => {

ck('sendWeeklyClientReports is geëxporteerd', typeof sendWeeklyClientReports === 'function');

console.log('\n  hete leads: 0-10-schaal, drempel 8 (zelfde als de owner-melding)');
{
  reset();
  clients = [{ id: 'recC1', fields: { [F_PROJECT]: 'WEEK1', [F_NAAM]: 'Test Kantoor', [F_EMAIL]: 'eigenaar@voorbeeld.be', [F_LANG]: 'nl' } }];
  leads = [
    maakLead({ id: 'L1', score: 9, qualified: true }),   // heet
    maakLead({ id: 'L2', score: 8, qualified: true }),   // net heet (grens)
    maakLead({ id: 'L3', score: 7, qualified: true }),   // niet heet
    maakLead({ id: 'L4', score: undefined }),            // geen score -> niet heet, niet crashen
  ];
  const res = await sendWeeklyClientReports('tok', 'app', LEADS_TABLE);
  ck('rapport verstuurd', res && res.sent === 1, res);
  // Het cijfer staat direct in de hete-leads-tegel (dezelfde kleur/stijl als
  // de tegel in de HTML-sjabloon hierboven, #dc2626).
  const html = mailSent[0] && mailSent[0].html;
  ck('precies 2 hete leads geteld (score 8 en 9, niet 7)', html && /color:#dc2626">2<\/div>/.test(html), html);
}

console.log('\n  afzeggingen komen uit het activiteitenlogboek, niet uit de Leads-tabel');
{
  reset();
  clients = [{ id: 'recC2', fields: { [F_PROJECT]: 'WEEK2', [F_NAAM]: 'Kantoor Twee', [F_EMAIL]: 'eig2@voorbeeld.be', [F_LANG]: 'nl' } }];
  leads = [maakLead({ id: 'L5', score: 5, qualified: true })];
  const nu = new Date().toISOString();
  activiteitRecords = [
    { id: 'a1', fields: { 'Project Code': 'WEEK2', 'Type': 'appointment_cancelled', 'Details': '{}', 'Created At': nu } },
    { id: 'a2', fields: { 'Project Code': 'WEEK2', 'Type': 'appointment_cancelled', 'Details': '{}', 'Created At': nu } },
    // andere tenant, mag niet meetellen
    { id: 'a3', fields: { 'Project Code': 'ANDERE', 'Type': 'appointment_cancelled', 'Details': '{}', 'Created At': nu } },
  ];
  await sendWeeklyClientReports('tok', 'app', LEADS_TABLE);
  const html = mailSent[0] && mailSent[0].html;
  ck('2 afzeggingen (niet 3, de andere tenant telt niet mee)', html && /color:#52525b">2<\/div>/.test(html), html);
}

console.log('\n  belangrijke mislukkingen: balk verschijnt alleen als er echt iets mislukte');
{
  reset();
  clients = [{ id: 'recC3', fields: { [F_PROJECT]: 'WEEK3', [F_NAAM]: 'Kantoor Drie', [F_EMAIL]: 'eig3@voorbeeld.be', [F_LANG]: 'nl' } }];
  leads = [];
  const nu = new Date().toISOString();
  activiteitRecords = [
    { id: 'a4', fields: { 'Project Code': 'WEEK3', 'Type': 'crm_sync_failed', 'Details': '{}', 'Created At': nu } },
  ];
  await sendWeeklyClientReports('tok', 'app', LEADS_TABLE);
  const html = mailSent[0] && mailSent[0].html;
  ck('de mislukkingen-balk staat erin met "1"', html && /1\s*—/.test(html), html);

  // Geen mislukkingen deze week -> geen balk (geen "0 mislukkingen" alarm).
  reset();
  clients = [{ id: 'recC4', fields: { [F_PROJECT]: 'WEEK4', [F_NAAM]: 'Kantoor Vier', [F_EMAIL]: 'eig4@voorbeeld.be', [F_LANG]: 'nl' } }];
  leads = [];
  activiteitRecords = [];
  await sendWeeklyClientReports('tok', 'app', LEADS_TABLE);
  const html2 = mailSent[0] && mailSent[0].html;
  ck('geen mislukkingen-balk zonder mislukkingen', html2 && html2.indexOf('#fee2e2') === -1, html2);
}

console.log('\n  taal van de klant, niet Nederlands voor iedereen');
{
  reset();
  clients = [{ id: 'recC5', fields: { [F_PROJECT]: 'WEEK5', [F_NAAM]: 'Client Cinq', [F_EMAIL]: 'client@exemple.fr', [F_LANG]: 'fr' } }];
  leads = [];
  await sendWeeklyClientReports('tok', 'app', LEADS_TABLE);
  ck('onderwerp in het Frans', /Rapport hebdomadaire/.test(mailSent[0] && mailSent[0].subject), mailSent[0]);
  ck('"Prospects chauds" (hete leads, FR) in de mail', /Prospects chauds/.test(mailSent[0] && mailSent[0].html));
  ck('"Annulations" (afzeggingen, FR) in de mail', /Annulations/.test(mailSent[0] && mailSent[0].html));
}

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
})();
