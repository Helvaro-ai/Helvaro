'use strict';
/*
 * Het leadformulier: WhatsApp-nummer OF e-mailadres (2026-09-26).
 *
 * Een koper op de website van een garage laat niet altijd zijn nummer achter.
 * Tot nu weigerde het formulier hem dan (phone_required) en was hij weg. Nu mag
 * e-mail in de plaats van het nummer:
 *   - de lead wordt aangemaakt, met het adres in de Notities-blob;
 *   - er gaat GEEN WhatsApp-begroeting uit (er is geen nummer) en de lead
 *     krijgt ook geen "Niet bereikbaar"-vlag -- hij koos zelf voor e-mail;
 *   - de eigenaar krijgt zijn melding, met het adres erin;
 *   - het dashboard toont het adres waar anders het nummer staat.
 * Met een nummer verandert er niets.
 *
 * Airtable, Meta en de mailer zijn een nep-fetch; er gaat niets over het net.
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';
process.env.INTRO_VERTRAGING_MS = '1';   // '0' leest als 'niet gezet' en wordt 5 s
process.env.INTRO_TEMPLATE_NAME = 'intro_test';
process.env.WHATSAPP_TOKEN = 'wa-test';
process.env.PHONE_NUMBER_ID = '100000000000000';
process.env.NOTIFY_EMAIL = 'eigenaar@voorbeeld.be';
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`);
  ok ? pass++ : fail++;
};

let oproepen = [];
global.fetch = async (url, opts) => {
  const u = String(url);
  const body = opts && opts.body ? String(opts.body) : '';
  oproepen.push({ url: u, method: (opts && opts.method) || 'GET', body });
  const json = (d, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => d, text: async () => JSON.stringify(d) });
  if (u.includes('tblPidTrwGRzRt4LZ')) return json({ records: [{ id: 'recC', fields: { 'Client Name': 'Garage Test', 'Plan Status': 'active' } }] });
  if (u.includes('tbliukTnDAbEDcZmt') && (opts && opts.method) === 'POST') return json({ id: 'recLEAD1', fields: {} });
  if (u.includes('graph.facebook.com')) return json({ messages: [{ id: 'wamid.X' }] });
  return json({ records: [], id: 'x' });
};

const form = require(BASE + 'api/form.js');
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let ipTeller = 0;

async function stuur(body) {
  oproepen = [];
  let status = 200, uit = null;
  const res = {
    setHeader() {}, status(c) { status = c; return this; },
    json(d) { uit = d; return this; }, end() { return this; }, send(d) { uit = d; return this; },
  };
  await form({ method: 'POST', url: '/api/form/GARAGE', query: {}, headers: { 'x-forwarded-for': '10.9.0.' + (++ipTeller) }, body }, res);
  await wacht(250);  // de uitgestelde WhatsApp-send (1 ms) en de mail
  const create = oproepen.find((o) => o.url.includes('tbliukTnDAbEDcZmt') && o.method === 'POST');
  return {
    status, uit,
    velden: create ? JSON.parse(create.body).fields : null,
    whatsapp: oproepen.filter((o) => o.url.includes('graph.facebook.com')),
    patches: oproepen.filter((o) => o.url.includes('tbliukTnDAbEDcZmt/') && o.method === 'PATCH'),
    mail: oproepen.filter((o) => /resend|mail/i.test(o.url)),
  };
}

(async () => {
  console.log('\nalleen e-mail');
  {
    const r = await stuur({ name: 'An Peeters', email: 'An.Peeters@Voorbeeld.be', consent: true, property: 'V3' });
    ck('de lead wordt aangemaakt', r.status === 200 && r.uit && r.uit.success === true, r);
    ck('zonder telefoonveld (niet leeg ingevuld)', r.velden && !('fld6YaitW0lMqHUrd' in r.velden), r.velden);
    const blob = r.velden ? JSON.parse(r.velden.fldoLRI5W12ThTls7) : {};
    ck('het adres staat in de Notities-blob, in kleine letters', blob.email === 'an.peeters@voorbeeld.be', blob);
    ck('de auto van de pagina gaat ook mee', blob.property === 'V3', blob);
    ck('de toestemming staat er nog', blob.consent && blob.consent.given === true);
    ck('GEEN WhatsApp-begroeting', r.whatsapp.length === 0, r.whatsapp.map((w) => w.url));
    const vlag = r.patches.find((p) => /Niet bereikbaar|waFailed|wa_failed/i.test(p.body));
    ck('en geen "Niet bereikbaar"-vlag', !vlag, vlag && vlag.body);
  }

  console.log('\nde foutgevallen');
  {
    const a = await stuur({ name: 'An', consent: true });
    ck('niets ingevuld: contact_required', a.status === 400 && a.uit.code === 'contact_required', a.uit);
    const b = await stuur({ name: 'An', email: 'geen-adres', consent: true });
    ck('onzin-adres zonder nummer: bad_email', b.status === 400 && b.uit.code === 'bad_email', b.uit);
    const c = await stuur({ name: 'An', email: 'an@voorbeeld.be' });
    ck('e-mail zonder toestemming: nog steeds geweigerd', c.status === 400 && c.uit.code === 'consent_required', c.uit);
    ck('en er wordt dan niets aangemaakt', c.velden === null);
  }

  console.log('\nmet een nummer: niets veranderd');
  {
    const r = await stuur({ name: 'Bart', phone: '0478 12 34 56', consent: true });
    ck('de lead wordt aangemaakt met het genormaliseerde nummer', r.velden && r.velden.fld6YaitW0lMqHUrd === '32478123456', r.velden);
    const blob = r.velden ? JSON.parse(r.velden.fldoLRI5W12ThTls7) : {};
    ck('zonder e-mailsleutel in de blob', !('email' in blob), blob);
    ck('de WhatsApp-begroeting gaat uit', r.whatsapp.length === 1, r.whatsapp.length);
    const d = await stuur({ name: 'Bart', phone: '12', consent: true });
    ck('een kapot nummer blijft bad_phone', d.status === 400 && d.uit.code === 'bad_phone', d.uit);
    const e = await stuur({ name: 'Bart', phone: '0478 12 34 56', email: 'onzin', consent: true });
    ck('nummer goed + adres onzin: het nummer volstaat, het adres gaat niet mee',
      e.status === 200 && !('email' in JSON.parse(e.velden.fldoLRI5W12ThTls7)), e.uit);
  }

  console.log('\nde eigenaar en het dashboard');
  {
    const src = fs.readFileSync(BASE + 'api/form.js', 'utf8');
    ck('de melding aan de eigenaar krijgt het adres mee', /sendEmailNotification\(\{ name, phone, email,/.test(src) && /E-mail<\/td>/.test(src));
    ck('de WhatsApp-ping aan de eigenaar zet het adres in de plaats van het nummer', /phone \|\| sanitize\(email\)/.test(src));
    const read = require(BASE + 'api/_leads-read.js');
    const l = read.mapLead({ id: 'r1', fields: { Name: 'An', Notities: JSON.stringify({ email: 'an@voorbeeld.be' }) } });
    ck('_leads-read geeft het adres door', l.email === 'an@voorbeeld.be' && l.telefoon === '', l);
    const gewoon = read.mapLead({ id: 'r2', fields: { Name: 'Bart', Phone: '32478123456' } });
    ck('en een lege string zonder adres', gewoon.email === '');
    const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
    ck('het paneel toont het adres waar anders het nummer staat', dash.includes("textContent = lead.telefoon || lead.email || '—';"));
    ck('de kopieerknop kopieert wat er staat', dash.includes("const contact = lead.telefoon || lead.email || '';"));
    const i18n = require(BASE + 'api/_i18n.js');
    ck('tst.mailGekopieerd in vier talen', ['nl', 'fr', 'en', 'de'].every((t) => i18n.t(t, 'tst.mailGekopieerd') !== 'tst.mailGekopieerd'));
  }

  console.log('\nde formulierpagina');
  {
    delete require.cache[require.resolve(BASE + 'api/form-page.js')];
    const page = require(BASE + 'api/form-page.js');
    for (const [taal, woord] of [['nl', 'Liever geen WhatsApp'], ['fr', 'Pas de WhatsApp'], ['en', 'No WhatsApp']]) {
      let html = '';
      await page({ method: 'GET', url: '/start/GARAGE?lang=' + taal, query: { lang: taal }, headers: {} },
        { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, end(b) { if (b) html = String(b); }, json() {} });
      const eigen = html.includes(woord);
      ck(taal + ': de uitwijk staat er', eigen || taal !== 'nl', (html.match(/class="alt-mail"[^>]*>[^<]*/) || [''])[0]);
      if (taal === 'nl') {
        ck('het e-mailveld is verborgen tot je kiest', /<div id="mail-wrap" hidden>/.test(html));
        ck('WhatsApp blijft de standaard: het nummerveld is verplicht', /<input id="tel"[^>]*required>/.test(html));
        ck('de e-mailcontrole overleeft de template-literal (\\s, niet s)', html.includes('/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(email)'));
        ck('het adres gaat mee met de aanvraag', /JSON\.stringify\(\{ name: name, phone: phone, email: email,/.test(html));
        ck('de bedankpagina belooft geen WhatsApp bij alleen e-mail', /if \(!phone && email\) \{\s*document\.getElementById\('ok-text'\)\.textContent = I18N\.successMail;/.test(html));
        ck('de toestemming noemt e-mail zodra je voor e-mail kiest', /mid\.textContent = I18N\.consentMidMail/.test(html));
      }
    }
  }

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
