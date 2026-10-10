'use strict';
/*
 * Lead-formulier: de verifieerde gebreken uit de lead-audit (L-01, L-04, L-07,
 * L-09, L-10/11, L-15, L-16, L-17, L-18).
 *
 * Elke controle hieronder is geschreven tegen het GEDRAG vóór de fix en
 * faalde toen; zie de commitboodschap voor de uitkomst van die run.
 *
 *  L-01  flagWaFailed overschreef het hele Notities-veld: toestemmingsbewijs,
 *        voertuigcode en e-mailadres weg. Nu een merge. Een ontbrekende
 *        INTRO_TEMPLATE_NAME is een configuratietoestand, geen "lead
 *        onbereikbaar".
 *  L-04  Een goedgevormde maar onbekende projectcode maakte toch een lead.
 *  L-07  Het antwoord zegt nu waar de bezoeker aan toe is (kanaal/status).
 *  L-09  De eigenaarsmelding noemt het gevraagde voertuig.
 *  L-10  De code van een gearchiveerd voertuig blijft op de lead staan.
 *  L-11  Een tweede wagen op een open lead gaat niet verloren.
 *  L-15  Twee gelijktijdige inzendingen = één lead.
 *  L-16  Mail en push hangen aan waitUntil.
 *  L-17  Duitse formulierpagina; statusmelding in de taal van de pagina.
 *  L-18  Honeypot: stil weggooien, niets aanmaken of versturen.
 */
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';
process.env.INTRO_VERTRAGING_MS = '1';
process.env.INTRO_TEMPLATE_NAME = 'intro_test';
process.env.WHATSAPP_TOKEN = 'wa-test';
process.env.PHONE_NUMBER_ID = '100000000000000';
process.env.NOTIFY_EMAIL = 'eigenaar@voorbeeld.be';
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 400)}`);
  ok ? pass++ : fail++;
};

/* waitUntil opvangen: zo zien we WAT er aan het platform is aangemeld. */
const geregistreerd = [];
const vf = require.resolve('@vercel/functions');
require.cache[vf] = { id: vf, filename: vf, loaded: true, exports: { waitUntil: (p) => { geregistreerd.push(p); } } };

const LEADS = 'tbliukTnDAbEDcZmt';
const NOT = 'fldoLRI5W12ThTls7';
let oproepen = [];
let klantRecords;          // wat de klantenopzoeking teruggeeft
let klantStatus;           // HTTP-status van die opzoeking
let waGeweigerd = false;
let bestaande = [];        // wat de open-lead-opzoeking teruggeeft (als niets aangemaakt)
const rijen = {};          // aangemaakte leads: id -> fields
let teller = 0;
let aangemaakt = [];

const klantRij = (extra) => ({ id: 'recC', fields: Object.assign({ 'Client Name': 'Garage Test', 'Plan Status': 'active' }, extra || {}) });
function reset() {
  oproepen = []; klantRecords = [klantRij()]; klantStatus = 200; waGeweigerd = false; bestaande = [];
  for (const k of Object.keys(rijen)) delete rijen[k];
  aangemaakt = [];
}

global.fetch = async (url, opts) => {
  const u = String(url);
  const method = (opts && opts.method) || 'GET';
  const body = opts && opts.body ? String(opts.body) : '';
  oproepen.push({ url: u, method, body });
  const json = (d, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => d, text: async () => JSON.stringify(d) });
  if (u.includes('tblPidTrwGRzRt4LZ')) return klantStatus >= 400 ? json({}, klantStatus) : json({ records: klantRecords });
  if (u.includes(LEADS) && method === 'GET' && u.includes('filterByFormula')) {
    const gevonden = Object.keys(rijen).filter((id) => {
      const t = decodeURIComponent(u);
      const f = rijen[id];
      return f.fld6YaitW0lMqHUrd && t.includes(f.fld6YaitW0lMqHUrd);
    }).map((id) => ({ id, fields: Object.assign({ fldSmczuyUJd26HLe: 'GARAGE', fld8mkrEWcyq7mUip: 'new' }, rijen[id]) }));
    return json({ records: gevonden.length ? gevonden : bestaande });
  }
  if (u.includes(LEADS) && method === 'POST') {
    const id = 'recNIEUW' + (++teller);
    rijen[id] = JSON.parse(body).fields;
    aangemaakt.push(id);
    return json({ id, fields: rijen[id] });
  }
  const m = u.match(new RegExp(LEADS + '/(rec[A-Za-z0-9]+)'));
  if (m && method === 'GET') return json({ id: m[1], fields: rijen[m[1]] || {} });
  if (m && method === 'PATCH') {
    if (rijen[m[1]]) Object.assign(rijen[m[1]], JSON.parse(body).fields);
    return json({ id: m[1], fields: {} });
  }
  if (u.includes('graph.facebook.com')) return waGeweigerd ? json({ error: { message: 'template rejected', code: 132001 } }, 400) : json({ messages: [{ id: 'wamid.X' }] });
  return json({ records: [], id: 'x' });
};

/* Mail, push en voertuig-opzoeking vervangen door opnemers. form.js leest ze
   pas bij gebruik, dus vervangen na het laden volstaat. */
const mails = [], pushes = [];
let mailVertraging = 0, mailKlaar = false;
const _mailer = require(BASE + 'api/_mailer.js');
_mailer.sendMail = async (m) => { if (mailVertraging) await new Promise((r) => setTimeout(r, mailVertraging)); mails.push(m); mailKlaar = true; return { ok: true }; };
const _push = require(BASE + 'api/_push.js');
_push.stuurNaarKantoor = async (p) => { pushes.push(p); return { ok: true }; };
_push.stuurVertaald = async (p) => { pushes.push(Object.assign({ vertaald: true }, p)); return { ok: true }; };
const _vehicles = require(BASE + 'api/_vehicles.js');
let voertuigen = {};
_vehicles.leesVers = async (project, code) => ({ gelezen: true, voertuig: voertuigen[code] || null });

const form = require(BASE + 'api/form.js');
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let ip = 0;

async function stuur(body, projectUrl) {
  oproepen = []; mails.length = 0; pushes.length = 0; geregistreerd.length = 0;
  let status = 200, uit = null;
  const res = { setHeader() {}, status(c) { status = c; return this; }, json(d) { uit = d; return this; }, end() { return this; }, send(d) { uit = d; return this; } };
  await form({ method: 'POST', url: projectUrl || '/api/form/GARAGE', query: {}, headers: { 'x-forwarded-for': '10.7.0.' + (++ip) }, body }, res);
  await wacht(250);
  return {
    status, uit,
    posts: oproepen.filter((o) => o.url.includes(LEADS) && o.method === 'POST'),
    wa: oproepen.filter((o) => o.url.includes('graph.facebook.com')),
  };
}
const blobVan = (id) => JSON.parse(rijen[id][NOT]);

(async () => {
  console.log('\nL-01  waFailed wist niets meer');
  {
    reset(); waGeweigerd = true;
    const r = await stuur({ name: 'An Peeters', phone: '0478 12 34 56', email: 'An@Voorbeeld.be', consent: true, property: 'V12' });
    const id = r.uit && r.uit.id;
    const b = id && rijen[id] ? blobVan(id) : {};
    ck('Meta weigert het sjabloon: de lead krijgt waFailed', b.waFailed === true, b);
    ck('het toestemmingsbewijs staat er nog', b.consent && b.consent.given === true && !!b.consent.ts, b);
    ck('de voertuigcode staat er nog', b.property === 'V12', b);
    ck('het e-mailadres staat er nog', b.email === 'an@voorbeeld.be', b);

    reset();
    delete process.env.INTRO_TEMPLATE_NAME;
    const z = await stuur({ name: 'Bart', phone: '0478 99 88 77', consent: true, property: 'V3' });
    process.env.INTRO_TEMPLATE_NAME = 'intro_test';
    const zid = z.uit && z.uit.id;
    const zb = zid && rijen[zid] ? blobVan(zid) : {};
    ck('INTRO_TEMPLATE_NAME ontbreekt: de lead wordt NIET als onbereikbaar gevlagd', zb.waFailed !== true, zb);
    ck('... en consent/property blijven ongemoeid', zb.consent && zb.property === 'V3', zb);
    ck('... en het antwoord noemt het een configuratietoestand', z.uit && z.uit.status === 'niet_verzonden' && z.uit.reden === 'niet_geconfigureerd', z.uit);
  }

  console.log('\nL-04  onbekende projectcode');
  {
    reset(); klantRecords = [];
    const r = await stuur({ name: 'An', phone: '0478 12 34 56', consent: true }, '/api/form/TELJ0');
    ck('404 met een eigen code', r.status === 404 && r.uit && r.uit.code === 'unknown_project', { s: r.status, u: r.uit });
    ck('er wordt niets aangemaakt', r.posts.length === 0 && aangemaakt.length === 0, r.posts.length);
    ck('en er gaat geen WhatsApp uit', r.wa.length === 0, r.wa.length);

    reset(); klantStatus = 500;
    const o = await stuur({ name: 'An', phone: '0478 12 34 56', consent: true });
    ck('opzoeking zelf faalt (500): faalt open, lead wordt toch aangemaakt', o.status === 200 && o.posts.length === 1, { s: o.status });
  }

  console.log('\nL-07  het antwoord zegt wat er gebeurt');
  {
    reset();
    let r = await stuur({ name: 'An', phone: '0478 12 34 56', consent: true });
    ck('gewone lead: whatsapp / verzonden, oude velden intact', r.uit.success === true && !!r.uit.id && r.uit.kanaal === 'whatsapp' && r.uit.status === 'verzonden' && !('bestaand' in r.uit), r.uit);
    r = await stuur({ name: 'Cas', email: 'cas@voorbeeld.be', consent: true });
    ck('alleen e-mail: email / niet_verzonden', r.uit.kanaal === 'email' && r.uit.status === 'niet_verzonden' && r.uit.reden === 'alleen_email', r.uit);
    r = await stuur({ name: 'An', phone: '0478 12 34 56', consent: true });
    ck('zelfde nummer nogmaals: bestaand + geen tweede begroeting beloofd', r.uit.bestaand === true && r.uit.kanaal === 'whatsapp' && r.uit.status === 'niet_verzonden' && r.uit.reden === 'bestaande_lead', r.uit);
  }

  console.log('\nL-09  melding aan de eigenaar noemt het voertuig');
  {
    reset(); voertuigen = { V12: { merk: 'Audi', model: 'A3', uitvoering: 'Sportback', prijs: 21500 } };
    const r = await stuur({ name: 'An', phone: '0478 12 34 56', consent: true, property: 'V12' });
    const html = (mails[0] && mails[0].html) || '';
    ck('de mail noemt code en naam', /V12/.test(html) && /Audi A3 Sportback/.test(html), html.slice(0, 300));
    ck('en de prijs', /21\.?500/.test(html), html.slice(0, 300));
    ck('de push draagt het voertuig', pushes.length === 1 && /Audi A3 Sportback/.test(pushes[0].tekst || ''), pushes);
    const z = await stuur({ name: 'Bo', phone: '0478 22 33 44', consent: true });
    ck('zonder voertuig: geen voertuigregel, push zoals voorheen', mails[0] && !/Gevraagd voertuig/.test(mails[0].html) && pushes[0] && pushes[0].vertaald === true, pushes);
    voertuigen = {};
  }

  console.log('\nL-10 / L-11  voertuigcode blijft behouden');
  {
    reset();
    const r = await stuur({ name: 'An', phone: '0478 12 34 56', consent: true, property: 'V7', property_unavailable: true });
    const b = blobVan(r.uit.id);
    ck('code van een niet-meer-zichtbaar voertuig staat op de lead, gemarkeerd', b.property === 'V7' && b.propertyUnavailable === true, b);
    const z = await stuur({ name: 'Bo', phone: '0478 22 33 44', consent: true, property: 'V8' });
    ck('zonder de vlag geen markering', blobVan(z.uit.id).propertyUnavailable === undefined, blobVan(z.uit.id));

    reset();
    const e = await stuur({ name: 'An', phone: '0478 12 34 56', consent: true, property: 'V3' });
    const e2 = await stuur({ name: 'An', phone: '0478 12 34 56', consent: true, property: 'V9' });
    const bb = blobVan(e.uit.id);
    ck('tweede wagen op een open lead: de eerste blijft de property', e2.uit.bestaand === true && bb.property === 'V3', bb);
    ck('... en de tweede staat erbij in properties[]', Array.isArray(bb.properties) && bb.properties.indexOf('V3') > -1 && bb.properties.indexOf('V9') > -1, bb);
  }

  console.log('\nL-15  twee gelijktijdige inzendingen');
  {
    reset();
    /* Een in-process stand-in voor het Redis-slot: serialiseert per sleutel. */
    const _lock = require(BASE + 'api/_lock.js');
    const keten = new Map();
    const echt = _lock.metSlot;
    _lock.metSlot = async (sleutel, ttl, fn) => {
      const vorige = keten.get(sleutel) || Promise.resolve();
      let los; const volgende = new Promise((r) => { los = r; });
      keten.set(sleutel, vorige.then(() => volgende));
      await vorige;
      try { return { bezet: false, resultaat: await fn() }; } finally { los(); }
    };
    oproepen = [];
    const mk = () => {
      let uit = null;
      const res = { setHeader() {}, status() { return this; }, json(d) { uit = d; return this; }, end() { return this; }, send() { return this; } };
      return form({ method: 'POST', url: '/api/form/GARAGE', query: {}, headers: { 'x-forwarded-for': '10.6.0.' + (++ip) }, body: { name: 'An', phone: '0478 55 44 33', consent: true } }, res).then(() => uit);
    };
    const [a, b] = await Promise.all([mk(), mk()]);
    await wacht(250);
    const intro = oproepen.filter((o) => o.url.includes('graph.facebook.com'));
    ck('precies één lead aangemaakt', aangemaakt.length === 1, aangemaakt);
    ck('de tweede hergebruikt de eerste', (a.bestaand === true) !== (b.bestaand === true) && a.id === b.id, [a, b]);
    ck('en er gaat één begroeting uit', intro.length === 1, intro.length);
    _lock.metSlot = echt;
  }

  console.log('\nL-16  mail en push hangen aan waitUntil');
  {
    reset(); mailKlaar = false; mailVertraging = 120;
    let uit = null;
    const res = { setHeader() {}, status() { return this; }, json(d) { uit = d; return this; }, end() { return this; }, send() { return this; } };
    geregistreerd.length = 0;
    await form({ method: 'POST', url: '/api/form/GARAGE', query: {}, headers: { 'x-forwarded-for': '10.5.0.' + (++ip) }, body: { name: 'An', phone: '0478 12 34 56', consent: true } }, res);
    ck('de mail is bij het antwoord nog niet klaar', mailKlaar === false);
    await Promise.all(geregistreerd);
    ck('maar alles wat bij waitUntil hangt, bevat de mail', mailKlaar === true);
    mailVertraging = 0;
  }

  console.log('\nL-18  honeypot');
  {
    reset();
    const r = await stuur({ name: 'Bot', phone: '0478 12 34 56', email: 'bot@spam.nl', consent: true, website_url: 'http://spam.example' });
    ck('stil succes voor de bot', r.status === 200 && r.uit && r.uit.success === true, r.uit);
    ck('geen lead, geen WhatsApp, geen mail, geen push', r.posts.length === 0 && r.wa.length === 0 && mails.length === 0 && pushes.length === 0, { p: r.posts.length, w: r.wa.length, m: mails.length });
    const echt = await stuur({ name: 'An', phone: '0478 12 34 56', consent: true, website_url: '' });
    ck('leeg honeypot-veld = gewone inzending', echt.posts.length === 1, echt.posts.length);
  }

  console.log('\nL-17 / L-10  de formulierpagina');
  {
    delete require.cache[require.resolve(BASE + 'api/form-page.js')];
    const page = require(BASE + 'api/form-page.js');
    const render = async (url) => {
      let html = '';
      await page({ method: 'GET', url, query: {}, headers: {} },
        { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, end(b) { if (b) html = String(b); }, json() {} });
      return html;
    };
    reset();
    klantRecords = [klantRij({ Language: 'de', Vertical: 'dealership' })];
    const de = await render('/start/GARAGE');
    ck('Duits ingesteld: de pagina is Duits', /<html lang="de">/.test(de) && /Ihre WhatsApp-Nummer/.test(de) && !/Je WhatsApp nummer/.test(de), (de.match(/<html lang="[^"]*"/) || [''])[0]);
    ck('de honeypot staat in het formulier', /id="hp-url"[^>]*name="hv_veld_leeg"/.test(de));
    ck('en de foutcode unknown_project is vertaald', /"unknown_project":/.test(de));
    ck('de bedankpagina kent een neutrale tekst', /s3t_neutraal/.test(de) && /id="ok-s2t"/.test(de));

    for (const [taal, woord] of [['nl', 'Dit voertuig is verkocht'], ['fr', 'Ce véhicule est vendu'], ['en', 'This vehicle is sold'], ['de', 'Dieses Fahrzeug ist verkauft']]) {
      klantRecords = [klantRij({ Language: taal, Vertical: 'dealership' })];
      /* getByCode vervangen: een verkocht maar nog publiek voertuig. */
      const echt = _vehicles.getByCode;
      _vehicles.getByCode = async () => ({ code: 'V9', publiek: true, gearchiveerd: false, status: 'verkocht', fotos: [], merk: 'Audi', model: 'A3', prijs: 1000 });
      const html = await render('/start/GARAGE/V9');
      _vehicles.getByCode = echt;
      ck(taal + ': "verkocht" staat in de taal van de pagina', html.includes(woord), (html.match(/pand-card-weg">[^<]*/) || [''])[0]);
    }

    klantRecords = [klantRij({ Language: 'en', Vertical: 'dealership' })];
    const echt = _vehicles.getByCode;
    _vehicles.getByCode = async () => ({ code: 'V5', publiek: true, gearchiveerd: true, status: 'beschikbaar', fotos: [] });
    const arch = await render('/start/GARAGE/V5');
    _vehicles.getByCode = echt;
    ck('gearchiveerd voertuig: de code reist toch mee', /var PAND     = 'V5'/.test(arch), (arch.match(/var PAND[^\n]*/) || [''])[0]);
    ck('... en de bezoeker krijgt een neutrale melding', /no longer available/.test(arch), '');
    ck('... en de pagina meldt het door (property_unavailable)', /var PAND_WEG = true/.test(arch) && /property_unavailable/.test(arch));
  }

  console.log(`\n  ${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
