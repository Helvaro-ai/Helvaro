/*
 * Server-side lead search (brief §106).
 *
 * ── Wat hier bewezen wordt ───────────────────────────────────────────────────
 * api/leads.js's GET (de hoofdlijst voor het dashboard) haalde altijd de volle
 * tenantlijst op en liet zoeken over aan de browser. Dat werkt tot een tenant
 * duizenden leads heeft; de paginering hierboven (MAX_PAGES=20) kapt die lijst
 * dan al af vóór de browser ooit een zoekterm ziet. `?search=` filtert nu op
 * Airtable zelf, in dezelfde AND()-vorm als de tenantfilter altijd al had.
 *
 * Een server-side filter die tekst uit de query-string in een Airtable-formule
 * plakt is precies de vorm van bug die een formule-injectie mogelijk maakt: een
 * zoekterm met een `"` erin kan, onge-escaped, de SEARCH()-string vroegtijdig
 * sluiten en eigen formule-fragmenten inspuiten (bv. `TRUE()` om de
 * tenant-AND te omzeilen). Dit bestand bewijst twee dingen apart:
 *
 *   1. STRUCTUREEL — de opgegeven formule bevat de zoekterm nog EXACT (na
 *      correcte un-escaping), wat alleen kan als escapeFormula() elke `"` en
 *      `\` erin heeft dichtgeplakt. Was dat niet gebeurd, dan zou de term in
 *      de formule zijn afgekapt bij de eerste ongeescapte aanhalingsteken.
 *   2. FUNCTIONEEL — met die exacte injectiepoging als zoekterm komt er nog
 *      steeds NUL resultaten terug en NOOIT een lead van de andere tenant: de
 *      escaping hield, dus de tenant-AND werd nooit omzeild.
 *
 * Plus de gewone functionele proef: zoeken op naam/telefoon/notities/gesprek
 * geeft alleen de eigen tenant's matches terug, nooit een andere tenant's
 * gelijknamige lead (tenant-scoping en search moeten allebei tegelijk gelden).
 */
'use strict';

const crypto = require('crypto');

process.env.SESSION_SECRET = 'leads-search-test-secret';
process.env.BASE_AIRTABLE = 'appZelftest';
process.env.API_AIRTABLE  = 'patZelftest';
delete process.env.CLERK_ENABLED;
delete process.env.ADMIN_KEY_FOR_TEST;
process.env.ADMIN_KEY = 'leads-search-admin-sleutel';
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

const LEADS_TABLE = 'tbliukTnDAbEDcZmt';
const FIELD_PROJECT = 'fldSmczuyUJd26HLe';

const TENANT_A = 'TENANT_A_SEARCH';
const TENANT_B = 'TENANT_B_SEARCH';

function sessionToken(projectCode) {
  const secret = crypto.createHmac('sha256', process.env.SESSION_SECRET)
    .update('helvaro-session-v1').digest('hex');
  const payload = { projectCode, clientName: 'Test ' + projectCode, calendlyLink: '', exp: Date.now() + 3600000 };
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(p).digest('base64url');
  return `hvs1.${p}.${sig}`;
}

// ── Nagemaakte Airtable ─────────────────────────────────────────────────────
// Ontleedt de ECHTE filterByFormula die api/leads.js verstuurt: de tenant-
// clausule (op veld-id) en, als er gezocht wordt, de eerste LOWER("...")
// needle uit buildLeadSearchFormula(). Beide regex'en respecteren \" en \\,
// dus een niet-geescapte aanhalingsteken in de zoekterm zou de needle hier al
// afkappen vóór hij het record-filter bereikt -- exact het gedrag dat Airtable
// zelf ook zou vertonen.
function unescapeFormula(s) {
  return String(s).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}
function decodeFormula(url) {
  const raw = (String(url).match(/filterByFormula=([^&]+)/) || [])[1] || '';
  return decodeURIComponent(raw);
}
function extractQuoted(formula, fieldPattern) {
  const re = new RegExp(fieldPattern + '="((?:[^"\\\\]|\\\\.)*)"');
  const m = formula.match(re);
  return m ? unescapeFormula(m[1]) : null;
}
function extractNeedle(formula) {
  const m = formula.match(/LOWER\("((?:[^"\\]|\\.)*)"\)/);
  return m ? unescapeFormula(m[1]) : null;
}

const DB = [
  { id: 'recAAAAAAAAAAAAA1', fields: { 'Project Code': TENANT_A, 'Name': 'Jan Peeters', 'Phone': '+32 470 12 34 56', 'Notities': '', 'Conversation History': '', 'Created At': '2026-09-01T10:00:00.000Z' } },
  { id: 'recAAAAAAAAAAAAA2', fields: { 'Project Code': TENANT_A, 'Name': 'Marie Dubois', 'Phone': '+32 499 00 00 00', 'Notities': '{"property":"P7"}', 'Conversation History': 'Over de garage aan het Kerkplein gesproken', 'Created At': '2026-09-02T10:00:00.000Z' } },
  // Zelfde naam als de eerste, maar van een ANDERE tenant — de test op
  // tenant-scoping-plus-search hangt hieraan.
  { id: 'recBBBBBBBBBBBBB1', fields: { 'Project Code': TENANT_B, 'Name': 'Jan Peeters', 'Phone': '+32 470 99 99 99', 'Notities': '', 'Conversation History': '', 'Created At': '2026-09-01T11:00:00.000Z' } },
];

let lastRequestedFormula = '';

global.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = (opts && opts.method) || 'GET';
  if (method === 'GET' && u.includes(LEADS_TABLE)) {
    const formula = decodeFormula(u);
    lastRequestedFormula = formula;
    const tenant = extractQuoted(formula, '\\{' + FIELD_PROJECT + '\\}');
    let records = DB.filter((r) => r.fields['Project Code'] === tenant);
    if (formula.includes('SEARCH(')) {
      const needle = (extractNeedle(formula) || '').toLowerCase();
      records = records.filter((r) => {
        const f = r.fields;
        const hay = [f.Name, f.Phone, f.Notities, f['Conversation History'], r.id]
          .join(' ').toLowerCase();
        return needle !== '' && hay.includes(needle);
      });
    }
    return { ok: true, status: 200, json: async () => ({ records }), text: async () => '' };
  }
  // Alles anders (bv. _revocation.js's Users-lookup) -- niets gevonden, en
  // isRevoked() faalt open op die lege payload, precies zoals bedoeld.
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

async function roepGet(qs, token) {
  delete require.cache[require.resolve('../api/leads.js')];
  const leads = require('../api/leads.js');
  const req = {
    method: 'GET',
    url: '/api/leads' + (qs ? '?' + qs : ''),
    headers: { 'x-api-key': token },
    query: {},
    socket: { remoteAddress: '10.9.9.' + Math.floor(Math.random() * 250) }, // eigen rate-limit-emmer per call
  };
  const res = maakRes();
  await leads(req, res);
  return res;
}

(async () => {
  const tokenA = sessionToken(TENANT_A);
  const tokenB = sessionToken(TENANT_B);

  console.log('\n— zonder search: bestaand gedrag blijft de volle tenantlijst —');
  {
    const res = await roepGet('', tokenA);
    ck('200', res._code === 200, res._code);
    ck('beide A-leads, geen search-echo', res._json.leads.length === 2 && res._json.search === undefined, res._json);
  }

  console.log('\n— search op naam: alleen de eigen tenant se match, niet de gelijknamige lead van tenant B —');
  {
    const res = await roepGet('search=Peeters', tokenA);
    ck('200', res._code === 200, res._code);
    ck('precies 1 resultaat', res._json.leads.length === 1, res._json.leads);
    ck('het is de A-lead, niet de B-lead', res._json.leads[0] && res._json.leads[0].id === 'recAAAAAAAAAAAAA1', res._json.leads);
    ck('search-term wordt teruggegeven', res._json.search === 'Peeters', res._json.search);
  }

  console.log('\n— search op telefoon (deel van het nummer) —');
  {
    const res = await roepGet('search=' + encodeURIComponent('499 00'), tokenA);
    ck('200', res._code === 200, res._code);
    ck('de Dubois-lead, via telefoon gevonden', res._json.leads.length === 1 && res._json.leads[0].id === 'recAAAAAAAAAAAAA2', res._json.leads);
  }

  console.log('\n— search op notities (draagt ook de pandcode) —');
  {
    const res = await roepGet('search=' + encodeURIComponent('P7'), tokenA);
    ck('200', res._code === 200, res._code);
    ck('gevonden via Notities', res._json.leads.length === 1 && res._json.leads[0].id === 'recAAAAAAAAAAAAA2', res._json.leads);
  }

  console.log('\n— search op gesprekshistorie —');
  {
    const res = await roepGet('search=' + encodeURIComponent('Kerkplein'), tokenA);
    ck('200', res._code === 200, res._code);
    ck('gevonden via Conversation History', res._json.leads.length === 1 && res._json.leads[0].id === 'recAAAAAAAAAAAAA2', res._json.leads);
  }

  console.log('\n— search op record-id (lead ID) —');
  {
    const res = await roepGet('search=recAAAAAAAAAAAAA1', tokenA);
    ck('200', res._code === 200, res._code);
    ck('gevonden via RECORD_ID()', res._json.leads.length === 1 && res._json.leads[0].id === 'recAAAAAAAAAAAAA1', res._json.leads);
  }

  console.log('\n— tenant B ziet zijn EIGEN "Peeters", nooit die van tenant A —');
  {
    const res = await roepGet('search=Peeters', tokenB);
    ck('200', res._code === 200, res._code);
    ck('precies 1 resultaat, van tenant B', res._json.leads.length === 1 && res._json.leads[0].id === 'recBBBBBBBBBBBBB1', res._json.leads);
  }

  console.log('\n— formule-injectiepoging: structureel — de term staat na un-escapen nog EXACT in de formule —');
  {
    // "){TRUE()}=BLANK(),SEARCH(LOWER(" -- bevat aanhalingstekens, haakjes en
    // een komma: precies de tekens die een SEARCH()-string zouden afbreken en
    // eigen formule-fragmenten zouden inspuiten als escapeFormula() ze niet
    // had dichtgeplakt.
    const injectie = '") , TRUE(), SEARCH(LOWER("x';
    const res = await roepGet('search=' + encodeURIComponent(injectie), tokenA);
    ck('200, geen 500 door een kapotte formule', res._code === 200, res._code);
    const needleInFormule = extractNeedle(lastRequestedFormula);
    ck('de needle in de opgestuurde formule is, na un-escapen, EXACT de ruwe injectiepoging',
       needleInFormule === injectie, { needleInFormule, injectie, formule: lastRequestedFormula });
    ck('de tenant-clausule staat nog intact in de formule (niet overschreven door de injectie)',
       lastRequestedFormula.includes(`{${FIELD_PROJECT}}="${TENANT_A}"`), lastRequestedFormula);
  }

  console.log('\n— formule-injectiepoging: functioneel — nul resultaten, en NOOIT een lead van tenant B —');
  {
    const injectie = '") , TRUE(), SEARCH(LOWER("x';
    const res = await roepGet('search=' + encodeURIComponent(injectie), tokenA);
    ck('200', res._code === 200, res._code);
    ck('nul resultaten (de garbage-term matcht niets echt)', Array.isArray(res._json.leads) && res._json.leads.length === 0, res._json.leads);
    ck('en zeker geen lead van tenant B',
       !(res._json.leads || []).some((l) => l.id === 'recBBBBBBBBBBBBB1'), res._json.leads);
  }

  console.log('\n— lege / whitespace-only search gedraagt zich als "geen search" —');
  {
    const res = await roepGet('search=' + encodeURIComponent('   '), tokenA);
    ck('200', res._code === 200, res._code);
    ck('volle tenantlijst, geen search-echo', res._json.leads.length === 2 && res._json.search === undefined, res._json);
  }

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail > 0 ? 1 : 0);
})();
