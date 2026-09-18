/*
 * Admin Control Center: de zes nieuwe data-modi in api/admin.js
 * (cost-overview, cost-margin, system-health, audit-log, alerts,
 * customer-detail), plus de admin-actie-audit die eraan hangt.
 *
 * ── Wat hier bewezen wordt ───────────────────────────────────────────────────
 * 1. Geen enkele modus is bereikbaar zonder een geldige admin-sleutel — zelfde
 *    controle, zelfde patroon als tests/ops-center.test.js.
 * 2. Elke modus levert of ECHTE data (uit de gemockte Airtable-tabellen) of
 *    zegt expliciet beschikbaar:false. Nooit een verzonnen getal.
 * 3. Een credit-mutatie (credit-add-credits) laat een spoor achter in het
 *    activiteitenlog — de admin-actie-audit uit brief §39-40.
 */
'use strict';

process.env.ADMIN_KEY = 'test-admin-sleutel-niet-echt';
process.env.BASE_AIRTABLE = 'appZelftest';
process.env.API_AIRTABLE = 'patZelftest';

const crypto = require('crypto');
const BASE = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`);
  ok ? pass++ : fail++;
};

const ADMIN_TOKEN = crypto
  .createHmac('sha256', process.env.ADMIN_KEY)
  .update('helvaro-admin-v1')
  .digest('hex');

const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';
const ACTIVITEIT_TABLE = 'tblzZSLA5wp60WVZm';

const nu = new Date();
const periode = JSON.stringify({ start: nu.toISOString(), alerted80: false, alerted100: false, alertedRunaway: false });

const KLANTEN = [
  {
    id: 'recAAA',
    fields: {
      'Project Code': 'AAA', 'Client Name': 'Kine Gent',
      'Plan Status': 'active', 'Plan ID': 'growth',
      'Credit Allowance': 5000, 'Credits Used': 4600, 'Credit Period': periode,
      'Credit Usage By Feature': JSON.stringify({ whatsapp_conversation: 4600 }),
    },
  },
  {
    id: 'recBBB',
    fields: {
      'Project Code': 'BBB', 'Client Name': 'Proef Makelaar',
      'Plan Status': 'trial', 'Trial Ends At': new Date(Date.now() + 2 * 86400000).toISOString(),
      'Credit Allowance': 2000, 'Credits Used': 100, 'Credit Period': periode,
      'Credit Usage By Feature': '{}',
    },
  },
];

/* Twee mislukte generaties in de laatste 24u, en één oudere (buiten venster) —
   zodat system-health/alerts een ECHT getal kunnen tonen en de tijdfilter ook
   iets doet. */
const ACTIVITEIT = [
  {
    id: 'act1',
    fields: {
      'Event ID': 'e1', 'Project Code': 'AAA', 'Type': 'image_generation_failed',
      'Details': JSON.stringify({ actionType: 'image_generation_failed', status: 'failed' }),
      'Created At': new Date(Date.now() - 3600 * 1000).toISOString(),
    },
  },
  {
    id: 'act2',
    fields: {
      'Event ID': 'e2', 'Project Code': 'BBB', 'Type': 'video_generation_failed',
      'Details': JSON.stringify({ actionType: 'video_generation_failed', status: 'failed' }),
      'Created At': new Date(Date.now() - 7200 * 1000).toISOString(),
    },
  },
  {
    id: 'act3',
    fields: {
      'Event ID': 'e3', 'Project Code': 'AAA', 'Type': 'image_generation_failed',
      'Details': '{}',
      'Created At': new Date(Date.now() - 10 * 86400000).toISOString(), // 10 dagen oud
    },
  },
];

// Airtable field-ID aliases the real code sometimes filters on instead of the
// human-readable field name (see api/admin.js: fldN4dL0bGgfBOXwM = 'Project
// Code', fldAnB848Sr5jl6dq = 'Client Name'). A mock that ignores
// filterByFormula entirely (as this one used to) can't tell an existing
// projectCode from a made-up one, which is exactly the case customer-detail's
// 404 path needs to prove.
const FIELD_ALIAS = { fldN4dL0bGgfBOXwM: 'Project Code', fldAnB848Sr5jl6dq: 'Client Name' };

// Same convention as tests/afspraken.test.js / btw.test.js / ledger.test.js /
// properties.test.js: parse filterByFormula and actually filter, instead of
// handing every record back regardless of the query. Handles the shapes this
// codebase builds: {field}="value" (ANDed across distinct fields, ORed within
// the same field — that's how api/_activiteit.js lijstAlle() builds its
// soorten-OR), plus IS_AFTER/IS_BEFORE({field}, "iso") for the date window.
function matchesFormula(formula, fields) {
  if (!formula) return true;
  const groups = {};
  let m;
  const eqRe = /\{([^}]+)\}="([^"]*)"/g;
  while ((m = eqRe.exec(formula))) {
    const key = FIELD_ALIAS[m[1]] || m[1];
    (groups[key] = groups[key] || []).push(m[2]);
  }
  for (const [key, values] of Object.entries(groups)) {
    if (values.indexOf(String(fields[key] || '')) === -1) return false;
  }
  const afterM = /IS_AFTER\(\{([^}]+)\},\s*"([^"]*)"\)/.exec(formula);
  if (afterM) {
    const key = FIELD_ALIAS[afterM[1]] || afterM[1];
    if (!(new Date(fields[key]) > new Date(afterM[2]))) return false;
  }
  const beforeM = /IS_BEFORE\(\{([^}]+)\},\s*"([^"]*)"\)/.exec(formula);
  if (beforeM) {
    const key = FIELD_ALIAS[beforeM[1]] || beforeM[1];
    if (!(new Date(fields[key]) < new Date(beforeM[2]))) return false;
  }
  return true;
}

function formulaFromUrl(u) {
  const qs = u.split('?')[1] || '';
  const raw = new URLSearchParams(qs).get('filterByFormula');
  return raw || '';
}

const posted = [];
global.fetch = async (url, opts) => {
  const u = String(url);
  if (opts && opts.method === 'POST' && u.includes(ACTIVITEIT_TABLE)) {
    posted.push(JSON.parse(opts.body));
    return { ok: true, status: 200, json: async () => ({ id: 'recNieuw' }), text: async () => '' };
  }
  if (u.includes(CLIENTS_TABLE)) {
    const formule = formulaFromUrl(u);
    const records = KLANTEN.filter((r) => matchesFormula(formule, r.fields));
    return { ok: true, status: 200, text: async () => '', json: async () => ({ records }) };
  }
  if (u.includes(ACTIVITEIT_TABLE)) {
    // available() does the ONE call with no other query param than pageSize=1
    // -- a substring check ('pageSize=1') would also match 'pageSize=10'/'100'
    // etc, which is exactly the real query this mock must NOT swallow.
    if (u.endsWith('pageSize=1')) {
      return { ok: true, status: 200, json: async () => ({ records: [] }), text: async () => '' };
    }
    const formule = formulaFromUrl(u);
    const records = ACTIVITEIT.filter((r) => matchesFormula(formule, r.fields));
    return { ok: true, status: 200, json: async () => ({ records }), text: async () => '' };
  }
  return { ok: true, status: 200, text: async () => '', json: async () => ({ records: [] }) };
};

const admin = require(BASE + 'api/admin.js');
const _activiteit = require(BASE + 'api/_activiteit.js');
_activiteit._resetAvailability();

// De admin-rate-limiter (20 req/60s per IP, api/admin.js isRateLimited()) is
// scherp genoeg om deze test zelf te raken: hij vuurt ~25 aanroepen af zonder
// pauze. Zelfde oplossing als tests/stripe-portaal.test.js -- elke aanroep
// krijgt een eigen IP, zodat geen enkele emmer de 20 haalt.
let _ipTeller = 0;
function roep(body, token) {
  const ip = '203.0.113.' + (_ipTeller++ % 250);
  return new Promise((klaar) => {
    let code = 0, payload = null;
    const res = {
      setHeader() {}, getHeader() { return null; },
      status(c) { code = c; return this; },
      json(b) { payload = b; klaar({ code, body: payload }); return this; },
      send(b) { payload = b; klaar({ code, body: payload }); return this; },
      end() { klaar({ code, body: payload }); },
    };
    const headers = { 'content-type': 'application/json', 'x-forwarded-for': ip };
    if (token) headers['x-api-key'] = token;
    admin({ method: 'POST', url: '/api/admin', headers, body }, res);
  });
}

(async () => {
  console.log('\nAdmin Control Center — cost/health/audit-modi');

  const MODI = ['cost-overview', 'cost-margin', 'system-health', 'audit-log', 'alerts', 'customer-detail'];

  console.log('\n  geen enkele modus is bereikbaar zonder geldige admin-sleutel');
  for (const mode of MODI) {
    const zonder = await roep({ mode });
    ck(`${mode} zonder sleutel geeft 401`, zonder.code === 401, zonder);
    const fout = await roep({ mode }, 'niet-de-admin-sleutel');
    ck(`${mode} met een verkeerde sleutel geeft 401`, fout.code === 401, fout);
  }

  console.log('\n  cost-overview: structuur, geen trend-per-dag verzonnen');
  {
    const usage = require(BASE + 'api/_ai/usage.js');
    usage._reset();
    await usage.record({ ctx: { projectCode: 'AAA' }, task: 'image_generation', providerId: 'openai', model: 'gpt-image-2', kind: 'image', costUsdOverride: 0.05, status: 'ok' });
    const r = await roep({ mode: 'cost-overview' }, ADMIN_TOKEN);
    ck('200 met de admin-sleutel', r.code === 200, r);
    ck('het totaal telt de zojuist geregistreerde generatie mee', r.body.totaal.aanroepen >= 1, r.body.totaal);
    ck('perSoort splitst image uit text', r.body.perSoort.image && r.body.perSoort.image.requests === 1, r.body.perSoort);
    ck('trend-per-dag is eerlijk niet-beschikbaar, geen lege grafiek die "0" claimt',
      r.body.trendPerDag && r.body.trendPerDag.beschikbaar === false && typeof r.body.trendPerDag.reden === 'string',
      r.body.trendPerDag);
  }

  console.log('\n  cost-margin: marge per klant, uit de echte credit-optelling');
  {
    const r = await roep({ mode: 'cost-margin' }, ADMIN_TOKEN);
    ck('200 met data', r.code === 200 && Array.isArray(r.body.tenants), r);
    const aaa = r.body.tenants.find((t) => t.projectCode === 'AAA');
    ck('AAA staat erin met een geschatte kost > 0', !!aaa && aaa.estimatedCostEur > 0, aaa);
    ck('en heeft een omzet/marge-veld (kan null zijn, maar het veld bestaat)', aaa && 'margeEur' in aaa, aaa);
  }

  console.log('\n  system-health: alleen families met een echte *_failed soort tellen mee');
  {
    const r = await roep({ mode: 'system-health' }, ADMIN_TOKEN);
    ck('200', r.code === 200, r);
    ck('generation is beschikbaar en telt de 2 recente mislukkingen (niet de oude van 10 dagen terug)',
      r.body.families.generation.beschikbaar === true && r.body.families.generation.laatste24u === 2,
      r.body.families.generation);
    ck('booking is beschikbaar (geen data, maar wel meetbaar)', r.body.families.booking.beschikbaar === true, r.body.families.booking);
    ck('webhook heeft geen soort en zegt dat eerlijk', r.body.families.webhook.beschikbaar === false && !!r.body.families.webhook.reden, r.body.families.webhook);
    ck('expirende OAuth is eerlijk niet-beschikbaar', r.body.expirendeOAuth.beschikbaar === false, r.body.expirendeOAuth);
  }

  console.log('\n  audit-log: doorzoekbaar, over tenants heen');
  {
    const r = await roep({ mode: 'audit-log', limiet: 10 }, ADMIN_TOKEN);
    ck('200 met records', r.code === 200 && Array.isArray(r.body.records), r);
    ck('de mock-records komen erin terug', r.body.totaal >= 3, r.body);
    const r2 = await roep({ mode: 'audit-log', projectCode: 'AAA' }, ADMIN_TOKEN);
    ck('filteren op projectCode werkt: alleen AAA-records komen terug',
      r2.code === 200 && r2.body.records.length > 0 && r2.body.records.every((rec) => rec.projectCode === 'AAA'),
      r2.body);
  }

  console.log('\n  alerts: alleen wat echt afgeleid kan worden, de rest eerlijk benoemd');
  {
    const r = await roep({ mode: 'alerts' }, ADMIN_TOKEN);
    ck('200', r.code === 200, r);
    const credAlert = r.body.alerts.find((a) => a.type === 'credit_exhaustion' && a.projectCode === 'AAA');
    ck('AAA (92% verbruikt) triggert credit_exhaustion', !!credAlert, r.body.alerts);
    const trialAlert = r.body.alerts.find((a) => a.type === 'trial_expiring' && a.projectCode === 'BBB');
    ck('BBB (proef, 2 dagen te gaan) triggert trial_expiring', !!trialAlert, r.body.alerts);
    const typesNietBeschikbaar = r.body.nietBeschikbaar.map((x) => x.type);
    for (const t of ['failed_payments', 'expiring_oauth', 'webhook_failures', 'unusual_cost']) {
      ck(`${t} staat eerlijk in nietBeschikbaar`, typesNietBeschikbaar.includes(t), typesNietBeschikbaar);
    }
  }

  console.log('\n  customer-detail: strikt tot één klant beperkt');
  {
    const goed = await roep({ mode: 'customer-detail', projectCode: 'AAA' }, ADMIN_TOKEN);
    ck('200 voor een bestaande klant', goed.code === 200, goed);
    ck('de juiste klant komt terug', goed.body.projectCode === 'AAA', goed.body);
    ck('plan-status komt uit getPlanState, niet uit een gok', goed.body.plan && goed.body.plan.status === 'active', goed.body.plan);

    const onbekend = await roep({ mode: 'customer-detail', projectCode: 'BESTAATNIET' }, ADMIN_TOKEN);
    ck('een onbekende projectCode geeft 404, geen lege 200', onbekend.code === 404, onbekend);

    const zonderCode = await roep({ mode: 'customer-detail' }, ADMIN_TOKEN);
    ck('geen projectCode geeft 400', zonderCode.code === 400, zonderCode);
  }

  console.log('\n  admin-actie-audit: een credit-mutatie laat een spoor achter');
  {
    posted.length = 0;
    const r = await roep({ mode: 'credit-add-credits', projectCode: 'AAA', credits: 500 }, ADMIN_TOKEN);
    ck('de mutatie zelf lukt', r.code === 200 && r.body.ok === true, r);
    // logAdminAction() is fire-and-forget (.catch(() => {})); een tick geven
    // zodat de POST naar het activiteitenlog de kans krijgt te vuren.
    await new Promise((r2) => setTimeout(r2, 20));
    const logRecord = posted.find((p) => p.fields && p.fields['Type'] === 'admin_action_performed');
    ck('er staat een admin_action_performed-record klaar voor Airtable', !!logRecord, posted);
    if (logRecord) {
      const details = JSON.parse(logRecord.fields['Details'] || '{}');
      ck('met de juiste actor en actie', details.actor === 'admin' && details.action === 'credit-add-credits', details);
    }
  }

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
