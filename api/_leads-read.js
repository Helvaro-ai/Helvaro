'use strict';
/*
 * Shared read path for leads.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * api/leads.js's GET handler owned the only knowledge of how a lead record is
 * shaped: which Airtable field ID means "lead score", how a single-select
 * collapses to a string, which timestamp is the created date. That was fine
 * while it was the only reader. Faro is a second reader, and duplicating a
 * table of 20 field IDs into a second file is how the two quietly disagree
 * six months from now — one of them keeps showing a column the other stopped
 * populating, and nobody notices because both "work".
 *
 * So the field map, the record mapper and the stats derivation live here, and
 * both callers use them. api/leads.js keeps its caching, its 429 stale-serving
 * and its response shaping; none of that moved.
 *
 * ── Field IDs, not names ─────────────────────────────────────────────────────
 * Airtable field IDs are stable across renames; names are not. Every lookup
 * below tries the ID first and falls back to the human name, which is exactly
 * what leads.js did — the fallback matters for the two fields that have no
 * known ID (Conversation History, Last Message).
 *
 * ── Tenant scoping ───────────────────────────────────────────────────────────
 * fetchLeads() takes a projectCode and refuses to run without one. A blank
 * project code in the filter formula matches every lead whose own code is
 * blank, i.e. one misconfigured account reading other tenants' orphaned
 * records. That is a hard error here, never a default.
 */

const LEADS_TABLE = 'tbliukTnDAbEDcZmt';

/* The created-at field, also the sort key. Named because three call sites use
   it and a bare 'fldR0r13EU4RwrtvH' in a URL is unreadable. */
const FIELD_CREATED = 'fldR0r13EU4RwrtvH';
const FIELD_PROJECT = 'fldSmczuyUJd26HLe';

/** Airtable formula string escaping. Quotes and backslashes only — the same
 *  helper api/leads.js has always used, lifted so both callers share one. */
function escapeFormula(val) {
  return String(val == null ? '' : val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/* Notities doubles as a small JSON blob for per-lead flags. Non-JSON content
   is the normal case (an agent typed a note), so a parse failure is not an
   error — it just means the flag is not set. */
function readNotitiesFlag(raw, key) {
  const text = String(raw || '').trim();
  if (text[0] !== '{') return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && parsed[key] ? parsed[key] : null;
  } catch (_) {
    return null;
  }
}

function str(v) {
  if (!v) return '';
  if (typeof v === 'object' && v.name) return v.name;   // single-select
  return String(v);
}
function bool(v) { return v === true || v === 1; }
function num(v) { return typeof v === 'number' ? v : parseFloat(v) || 0; }

/**
 * One Airtable record → the lead shape the whole product speaks.
 * Byte-identical to what api/leads.js's GET produced before this move; the
 * dashboard's client code reads these exact keys.
 */
function mapLead(r) {
  const f = r.fields || {};
  return {
    id:                    r.id,
    naam:                  f.fldbk0LVNckOU0bqA      || f.Name                 || '',
    telefoon:              f.fld6YaitW0lMqHUrd      || f.Phone                || '',
    status:                str(f.fld8mkrEWcyq7mUip  || f['Conversation State']),
    qualified:             bool(f.fld0hAZJ5wgaXrNTn || f.Qualified),
    reden:                 f.fld3NhSENma0okbT7      || f.Reason               || '',
    samenvatting:          f.fldqerIiw5qyQjXHr      || f['AI Summary']        || '',
    capaciteit:            str(f.fldrfbTopJvZEYSKP  || f.Ability),
    urgentie:              str(f.fldlyLH1DKrWyG3Tr  || f.Urgency),
    fit:                   str(f.fldqNxsPshvZEBeLr  || f.Fit),
    bron:                  str(f.fldGoerozqdea4BfU  || f.Bron),
    boekingslinkVerstuurd: bool(f.fldLeEqwNefdglLis || f['Booking Link Sent']),
    afspraakGeboekt:       bool(f.fldyIGNetqcSEkoaK || f['Appointment Booked']),
    notities:              f.fldoLRI5W12ThTls7      || f.Notities             || '',
    // The AI can be paused per lead from the dashboard (api/leads.js's
    // ai-pause mode), which is stored as JSON inside Notities rather than in a
    // field of its own. It matters well beyond that panel: a paused lead is
    // one where the AI has stopped answering and a human has to, which is the
    // single most urgent state a lead can be in.
    aiPaused:              Boolean(readNotitiesFlag(f.fldoLRI5W12ThTls7 || f.Notities, 'aiPaused')),
    /* Over welk pand deze lead het heeft. Komt uit /start/TELJO/P3 en zit in
       dezelfde JSON-blob als aiPaused -- zie api/form.js voor waarom er geen
       aparte kolom is. Leeg = onbekend, en dat is een geldig antwoord: iemand
       die rechtstreeks naar het WhatsApp-nummer schrijft heeft nooit een
       pandlink aangeraakt. */
    property:              String(readNotitiesFlag(f.fldoLRI5W12ThTls7 || f.Notities, 'property') || '').toUpperCase(),
    gesprek:               f['Conversation History'] || '',
    leadScore:             num(f.fldpzQgMuWJLjogiD  || f['Lead Score']),
    opgepikt:              bool(f.fld86JQHB6dbuutA7 || f.Opgepikt),
    verwachteWaarde:       f.fldv7qOYvCN1xJfiR      || f['Verwachte Waarde']  || '',
    reactietijd:           num(f.fldUJJ8oSmAMQ9wB3  || f['Response Time (sec)']),
    datum:                 f[FIELD_CREATED]         || f['Created At']        || r.createdTime || '',
  };
}

/** The dashboard's stat block. Same arithmetic, same rounding, same keys. */
function computeStats(leads) {
  const now = new Date();
  const total = leads.length;
  const qualified = leads.filter((l) => l.qualified).length;
  const booked = leads.filter((l) => l.afspraakGeboekt).length;
  const conversionRate = total > 0 ? Math.round((booked / total) * 1000) / 10 : 0;
  const thisMonth = leads.filter((l) => {
    const d = new Date(l.datum);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const times = leads.map((l) => l.reactietijd).filter((v) => v > 0);
  const avgResponseTime = times.length > 0
    ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10
    : 0;
  const avgLeadScore = leads.length > 0
    ? Math.round(leads.reduce((a, l) => a + (l.leadScore || 0), 0) / leads.length)
    : 0;
  return { total, qualified, booked, conversionRate, thisMonth, avgResponseTime, avgLeadScore };
}

/**
 * Every lead for one tenant, newest first, already mapped.
 *
 * Deliberately NOT sharing api/leads.js's response cache: that cache exists to
 * keep the dashboard alive through an Airtable 429 and is keyed to a request
 * that also shapes a response. This is a plain read with its own small ceiling.
 *
 * @param {string} projectCode
 * @param {object} deps  { token, baseId, maxPages? }
 * @returns {Promise<{leads: Array, truncated: boolean}>}
 */
async function fetchLeads(projectCode, { token, baseId, maxPages = 6 } = {}) {
  const code = String(projectCode || '').trim();
  if (!code) throw new Error('fetchLeads: projectCode is required');
  if (!token || !baseId) throw new Error('fetchLeads: Airtable credentials missing');

  const formula = encodeURIComponent(`{${FIELD_PROJECT}}="${escapeFormula(code)}"`);
  const records = [];
  let offset = '';
  let pages = 0;
  let truncated = false;

  do {
    // returnFieldsByFieldId is deliberately OFF: two fields (Conversation
    // History, Last Message) have no known field ID and would vanish from the
    // response. Filter and sort still address fields by ID, which is what
    // actually needs to survive a rename.
    const url = `https://api.airtable.com/v0/${baseId}/${LEADS_TABLE}`
      + `?filterByFormula=${formula}`
      + `&sort[0][field]=${FIELD_CREATED}&sort[0][direction]=desc`
      + `&pageSize=100${offset ? '&offset=' + offset : ''}`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429) {
      // No retry, by the same reasoning as leads.js: retrying a 429 from
      // several concurrent sessions is what keeps Airtable limited. Return
      // what we have and let the caller say so.
      console.warn('[leads-read] 429 — returning partial result');
      truncated = true;
      break;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      throw new Error(`Airtable ${res.status}`);
    }
    records.push(...(data.records || []));
    offset = data.offset || '';
    // Six pages, not leads.js's twenty. This runs inside a model turn with a
    // user watching a spinner, and 600 of the newest leads is far past what any
    // question in a chat actually reasons over.
    if (offset && ++pages >= maxPages) {
      truncated = true;
      break;
    }
  } while (offset);

  return { leads: records.map(mapLead), truncated };
}

module.exports = {
  LEADS_TABLE,
  FIELD_CREATED,
  FIELD_PROJECT,
  escapeFormula,
  mapLead,
  computeStats,
  fetchLeads,
};
