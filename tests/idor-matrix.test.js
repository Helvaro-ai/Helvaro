/*
 * Security-aanvalspas (Fase 10) — IDOR-matrix over api/leads.js's modes.
 *
 * ── Wat dit bestand doet, en wat niet ───────────────────────────────────────
 * Voor ELKE mode in api/leads.js die een Airtable-record-id (of een code die
 * naar een record wijst) in de body accepteert, hoort er een controle te
 * bestaan: het record moet van DE INGELOGDE tenant zijn, anders 403/404 en
 * geen data terug en geen schrijf. Dit bestand doet twee dingen:
 *
 *   1. Voert dat aanvalsscenario ECHT uit tegen een handvol modes die nog
 *      GEEN eigen cross-tenant-test hadden (appointment-update,
 *      appointment-create met een geleende leadId, en de admin-erasure-modi
 *      lead-delete/lead-export) — met tenant B's sessie/opgegeven projectCode
 *      tegen tenant A's record.
 *   2. Documenteert, als tabel, wat er met de REST van de mode-lijst is: al
 *      met een eigen test bewezen elders (met bestandsnaam), geverifieerd
 *      door codelezing tijdens deze aanvalspas (met precies wat er gelezen
 *      is), of NIET uit te voeren met de mocks die hier voorhanden zijn (met
 *      de reden).
 *
 * Zie SECURITY.md voor de samenvatting en het rapport van deze aanvalspas
 * voor de volledige matrix incl. ernst-inschatting.
 */
'use strict';

const crypto = require('crypto');

process.env.SESSION_SECRET = 'idor-matrix-test-secret';
process.env.BASE_AIRTABLE  = 'appZelftest';
process.env.API_AIRTABLE   = 'patZelftest';
delete process.env.CLERK_ENABLED;
delete process.env.ADMIN_KEY_FOR_TEST;
process.env.ADMIN_KEY = 'idor-matrix-admin-sleutel';
delete process.env.GOOGLE_CLIENT_ID;      // gcal blijft "niet geconfigureerd" -> geen extra Airtable-rondjes
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

const LEADS_TABLE        = 'tbliukTnDAbEDcZmt';
const APPOINTMENTS_TABLE = 'tblD058vEITs1xYFc';

const TENANT_A = 'TENANT_A_IDOR';
const TENANT_B = 'TENANT_B_IDOR';

function sessionToken(projectCode) {
  const secret = crypto.createHmac('sha256', process.env.SESSION_SECRET)
    .update('helvaro-session-v1').digest('hex');
  const payload = { projectCode, clientName: 'Test ' + projectCode, calendlyLink: '', exp: Date.now() + 3600000 };
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(p).digest('base64url');
  return `hvs1.${p}.${sig}`;
}

function adminToken() {
  return crypto.createHmac('sha256', process.env.ADMIN_KEY).update('helvaro-admin-v1').digest('hex');
}

// ── Data: één afspraak en één lead, allebei van TENANT_A ───────────────────
// Precies 'rec' + 14 alfanumerieke tekens — leads.js valideert dat exacte
// formaat vóór elke ownership-check; een korter/langer id wordt al bij de
// vorm-check geweigerd en zou deze aanval per ongeluk laten lijken alsof hij
// nooit de echte controle bereikt (en dus altijd "veilig" test).
const AFSPRAAK_VAN_A = {
  id: 'recAAAAAAAAAAAAAA',
  fields: { 'Project Code': TENANT_A, 'Start Time': '2026-10-01T10:00:00.000Z', 'Duration': 30, 'Status': 'booked' },
};
const LEAD_VAN_A = {
  id: 'recBBBBBBBBBBBBBB',
  fields: { 'fldSmczuyUJd26HLe': TENANT_A, 'Name': 'Klant van A' },
};

const posted = [];   // elke POST/PATCH die de route probeerde te doen
global.fetch = async (url, opts) => {
  const u = String(url);
  const method = (opts && opts.method) || 'GET';

  if (method !== 'GET') posted.push({ url: u, method, body: opts && opts.body });

  // ── Eén record ophalen op id (de ownership-check zelf) ──────────────────
  if (u.includes(`${APPOINTMENTS_TABLE}/${AFSPRAAK_VAN_A.id}`)) {
    return { ok: true, status: 200, json: async () => AFSPRAAK_VAN_A, text: async () => '' };
  }
  if (u.includes(`${LEADS_TABLE}/${LEAD_VAN_A.id}`)) {
    return { ok: true, status: 200, json: async () => LEAD_VAN_A, text: async () => '' };
  }

  // ── Dubbelcheck-lijst (appointment-create's conflictquery) — leeg, geen botsing ──
  if (method === 'GET' && u.includes(APPOINTMENTS_TABLE)) {
    return { ok: true, status: 200, json: async () => ({ records: [] }), text: async () => '' };
  }

  // Schrijven mag hier nooit aankomen in de aanval-tests hieronder — maar als
  // het toch gebeurt, geef een duidelijk record terug in plaats van een
  // undefined die een tweede fout verbergt.
  if (method === 'POST' || method === 'PATCH') {
    return { ok: true, status: 200, json: async () => ({ id: 'recOnverwacht', fields: {} }), text: async () => '' };
  }

  return { ok: true, status: 200, json: async () => ({ records: [] }), text: async () => '' };
};

function maakRes() {
  return {
    _code: 200, _json: null, _h: {},
    setHeader(k, v) { this._h[k] = v; return this; },
    getHeader(k)    { return this._h[k]; },
    status(c)       { this._code = c; return this; },
    json(o)         { this._json = o; return this; },
    send(b)         { this._json = b; return this; },
    end()           { return this; },
  };
}

async function roep(body, opts) {
  delete require.cache[require.resolve('../api/leads.js')];
  const leads = require('../api/leads.js');
  const headers = { 'content-type': 'application/json' };
  if (opts && opts.token) headers['x-api-key'] = opts.token;
  const req = {
    method: 'POST',
    url: '/api/leads',
    headers,
    query: {},
    body,
    socket: { remoteAddress: '10.7.7.7' },
  };
  const res = maakRes();
  await leads(req, res);
  return res;
}

(async () => {
  const tokenB = sessionToken(TENANT_B);

  console.log('\n— appointment-update: tenant B tegen de afspraak van tenant A —');
  {
    posted.length = 0;
    const res = await roep(
      { mode: 'appointment-update', id: AFSPRAAK_VAN_A.id, status: 'cancelled' },
      { token: tokenB }
    );
    ck('403, geen 200/404-lek', res._code === 403, res._code);
    ck('de foutmelding noemt geen interne details', JSON.stringify(res._json).length < 200, res._json);
    ck('en er is NIETS geschreven (geen PATCH uitgevoerd)',
       posted.filter((p) => p.method === 'PATCH' && p.url.includes(AFSPRAAK_VAN_A.id)).length === 0,
       posted);
  }

  console.log('\n— appointment-create: tenant B linkt een afspraak aan de LEAD van tenant A —');
  {
    posted.length = 0;
    const res = await roep(
      {
        mode: 'appointment-create',
        startTime: '2026-10-02T10:00:00.000Z',
        leadId: LEAD_VAN_A.id,
        leadName: 'Gekaapt',
      },
      { token: tokenB }
    );
    ck('403, geen toegang tot andermans lead', res._code === 403, res._code);
    ck('geen nieuwe afspraak aangemaakt (geen POST naar Appointments)',
       posted.filter((p) => p.method === 'POST' && p.url.includes(APPOINTMENTS_TABLE)).length === 0,
       posted);
  }

  console.log('\n— conversation-delete: tenant B wist het gesprek van de lead van tenant A —');
  {
    posted.length = 0;
    const res = await roep({ mode: 'conversation-delete', leadId: LEAD_VAN_A.id }, { token: tokenB });
    ck('403, geen toegang tot andermans lead', res._code === 403, res._code);
    ck('en er is NIETS gewist (geen PATCH op het record)',
       posted.filter((p) => p.method === 'PATCH' && p.url.includes(LEAD_VAN_A.id)).length === 0,
       posted);
    const eigen = await roep({ mode: 'conversation-delete', leadId: LEAD_VAN_A.id }, { token: sessionToken(TENANT_A) });
    ck('de eigenaar zelf mag wel (200) en wist alleen geschiedenis + laatste bericht',
       eigen._code === 200 && posted.some((p) => p.method === 'PATCH' && p.url.includes(LEAD_VAN_A.id)
         && /Conversation History/.test(String(p.body)) && /Last Message/.test(String(p.body)) && !/Opted Out/.test(String(p.body))),
       { code: eigen._code, posted: posted.map((p) => p.method + ' ' + p.url.slice(-30)) });
  }

  console.log('\n— lead-delete (admin-erasure): projectCode in de body moet ECHT overeenkomen —');
  {
    posted.length = 0;
    const res = await roep(
      { mode: 'lead-delete', id: LEAD_VAN_A.id, projectCode: TENANT_B, method: 'hard-delete' },
      { token: adminToken() }
    );
    ck('403: opgegeven projectCode hoort niet bij dit record', res._code === 403, res._code);
    ck('en er is niets verwijderd of aangepast',
       posted.filter((p) => p.url.includes(`${LEADS_TABLE}/${LEAD_VAN_A.id}`)).length === 0,
       posted);
  }

  console.log('\n— lead-export (admin-erasure): zelfde controle voor lezen, niet alleen schrijven —');
  {
    const res = await roep(
      { mode: 'lead-export', id: LEAD_VAN_A.id, projectCode: TENANT_B },
      { token: adminToken() }
    );
    ck('403: geen export van andermans lead onder een verkeerde projectCode', res._code === 403, res._code);
    ck('de leaddata zit niet in het antwoord',
       !res._json || !res._json.data, res._json);
  }

  console.log('\n— lead-delete/lead-export: een GEWONE (niet-admin) sessie komt er nooit in —');
  {
    for (const mode of ['lead-delete', 'lead-export']) {
      const res = await roep({ mode, id: LEAD_VAN_A.id, projectCode: TENANT_A }, { token: sessionToken(TENANT_A) });
      ck(`${mode}: eigen tenant, eigen lead, GEEN admin-token -> nog steeds 403`, res._code === 403, res._code);
    }
  }

  console.log('\n— en de controle werkt nog gewoon voor de EIGEN tenant —');
  {
    posted.length = 0;
    const res = await roep(
      { mode: 'appointment-update', id: AFSPRAAK_VAN_A.id, status: 'cancelled' },
      { token: sessionToken(TENANT_A) }
    );
    ck('eigen afspraak van eigen tenant: geen 403', res._code !== 403, res._code);
  }

  console.log(`\n${pass} ok, ${fail} fout`);

  // ─────────────────────────────────────────────────────────────────────────
  // De rest van de matrix (brief §7-12, 91-92, 97-98): per familie, wat
  // bewaakt is en waar. Dit logt alleen — het draagt niet bij aan pass/fail
  // hierboven, maar is hier neergezet zodat `node tests/idor-matrix.test.js`
  // zelf het overzicht toont, niet alleen het rapport van deze aanvalspas.
  // ─────────────────────────────────────────────────────────────────────────
  const MATRIX = [
    // [ familie, mode(s), status, waar/waarom ]
    ['leads', 'lead-delete / lead-export', 'HIER getest + code: ownership-check vóór elke mutatie/lees (api/leads.js:1352-1450)'],
    ['leads', 'csv-export', 'code: filtert altijd op de sessie-projectCode, geen id in body (api/leads.js ~1469); UI-lek getest in tests/scherm-eerlijkheid.test.js'],
    ['conversaties/berichten', 'test-message, suggest-replies', 'code: werkt op de sessie-projectCode, geen vreemd record-id te geven'],
    ['afspraken', 'appointment-update', 'HIER getest (was nog niet cross-tenant getest — afspraak-acties.test.js/dubbelboeking.test.js toetsen de dubbelcheck, niet IDOR)'],
    ['afspraken', 'appointment-create (leadId)', 'HIER getest (zelfde reden)'],
    ['afspraken', 'appointments-list', 'code: filterByFormula met sessie-projectCode, from/to zijn geen ids (api/leads.js:1661)'],
    ['voertuigen', 'vehicle-save / vehicle-archive / vehicle-list', 'code gelezen: _vehicles.save/archive/list scopen altijd via getByCode(tenant, code) binnen list(tenant,...) — cross-tenant code botst niet, hij maakt hoogstens een NIEUW eigen record. Zie tests/voertuig-boekbaar.test.js, tests/dealership.test.js voor de tenant-scoping van de onderliggende module'],
    ['_voertuigslot', 'claim/bevestig bij boeken', 'code gelezen (api/_voertuigslot.js, aangeroepen via _dealerBoeking) + tests/voertuigslot.test.js dekt de race/claim-logica'],
    ['panden', 'listing-save / listing-archive / listing-list', 'reeds volledig getest, incl. "projectCode nooit uit de body", in tests/properties.test.js'],
    ['formulieren/campagnes', "(geen mode neemt een vreemd record-id — zie api/form.js, publiek en zonder sessie)", 'code gelezen'],
    ['exports', 'lead-export (admin), csv-export (klant)', 'zie hierboven'],
    ['media/beelden', 'image/video generatie + jobId', 'HERGEBRUIK, geen ownership-by-id in leads.js zelf — jobs zijn keyed op projectCode+lead; dedupe/race zit in tests/image-job-idempotency.test.js en tests/video-job-idempotency.test.js. GEEN cross-tenant jobId-leestest hier: vereist _images/_video interne opslag te mocken, niet in deze pas gedaan'],
    ['integraties', 'crm-connect/disconnect/status', 'code gelezen: altijd projectCode uit sessie, credentials nooit teruggestuurd (api/leads.js:3113-3240)'],
    ['integraties', 'crm-sync (leadId)', 'code gelezen: dezelfde ownership-check als appointment-create (api/leads.js ~3245) — NIET hier uitgevoerd: vereist _crmConfig.lees() en een gemockte koppeling, buiten de tijd van deze pas. Zie "niet uitgevoerd" hieronder'],
    ['integraties', 'gcal connect/status/disconnect', 'code gelezen: projectCode altijd uit sessie/Clerk, state-token HMAC-ondertekend (api/leads.js ~3990)'],
    ['analytics/resultaten', 'report-summary, credit-usage, billing-overview', 'code gelezen: alle drie lezen uitsluitend via de sessie-projectCode, geen id-parameter'],
    ['billing/credits', 'plan-checkout, credit-checkout, billing-portal', 'code gelezen: bedrag/plan wordt SERVER-ZIJDIG herberekend (api/_plans.js, credits.topupOfferte), nooit overgenomen van de client'],
    ['settings', 'config-get / config-save', 'code gelezen: whitelist per veld, projectCode uit sessie, geen ander tenant-record te raken'],
    ['activiteitenlog', 'activity-list', 'code gelezen: filtert op sessie-projectCode (api/leads.js:2184)'],
    ['admin (api/admin.js)', 'credit-set-allowance/add-credits/reset-period, customer-detail', 'code gelezen: alle admin-modi vereisen isValidAdminToken() (timing-safe), customer-detail scoping expliciet "fixed" laut CLAUDE.md/opdracht — niet opnieuw stukgemaakt in deze pas'],
    ['faro (api/_faro/*)', 'tool-calls (afspraak, notities, pand)', 'code gelezen: elke tool loopt via de HMAC-poort in api/_faro/actions.js, projectCode zit in de sessie van het gesprek, niet in tool-argumenten'],
  ];
  console.log('\n— overzicht van de rest van de matrix (log-only, telt niet mee in pass/fail) —');
  for (const [familie, mode, uitleg] of MATRIX) {
    console.log(`  [${familie}] ${mode}\n      ${uitleg}`);
  }

  console.log('\n— modes NIET uit te voeren met de mocks in dit bestand —');
  for (const reden of [
    'crm-sync (leadId): vereist een werkende _crmConfig.lees()-mock met een echte koppeling voordat de leadId-check zelfs bereikt wordt.',
    'vehicle-import / listing-import: doen een echte pagina-fetch (fetchPage) door de link-URL; SSRF-bewaking zit al in api/_lib/fetch-website.js en is niet opnieuw getest hier.',
    'image/video job cross-tenant leestest: jobstatus zit in _images.js/_video.js eigen opslag (niet Airtable via global.fetch), vereist een eigen mock-laag die deze pas niet gebouwd heeft.',
    'gcal/drive OAuth callback (GET ?action=callback): vereist een geldige, getekende state-token EN een gemockte Google-tokenwissel; state-CSRF is code-gelezen maar niet end-to-end uitgevoerd.',
  ]) console.log('  - ' + reden);

  process.exit(fail ? 1 : 0);
})();
