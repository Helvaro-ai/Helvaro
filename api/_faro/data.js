'use strict';
/*
 * Faro — the CRM read layer.
 *
 * Everything the read tools actually answer with. Before this file, every read
 * tool was a stub: a customer with 300 leads asked "wie zijn mijn beste leads"
 * and Faro said "geen leads gevonden", confidently. That is worse than no
 * feature, because it reads as an answer.
 *
 * ── One fetch per turn ───────────────────────────────────────────────────────
 * A model turn can call get_leads, then get_pipeline, then get_analytics. Each
 * needs the same rows. Hitting Airtable three times for one question is slow
 * (a spinner the user is watching) and is exactly the pattern that gets a
 * tenant rate-limited. So the tenant's leads are fetched once per turn and
 * cached on the turn's own context object -- not in a module-level Map, which
 * on a shared serverless instance would be one tenant's rows sitting in memory
 * for the next tenant's request to find.
 *
 * ── Filtering happens here, not in Airtable ──────────────────────────────────
 * The obvious design is to build a filterByFormula from the model's arguments.
 * It is the wrong one twice over: the interesting filters (budget parsed out of
 * a free-text "Verwachte Waarde", a keyword across name + summary + notes) are
 * not expressible as Airtable formulas, and every model-supplied string
 * interpolated into a formula is an injection surface pointed at the tenant
 * filter. The tenant filter is the ONLY thing sent to Airtable. Everything the
 * model asked for is applied in this process, to rows already scoped to the
 * caller.
 */

const leadsRead = require('../_leads-read');

/* ── Credentials ─────────────────────────────────────────────────────────────
   Same env names api/leads.js uses. Missing credentials is a real, reportable
   condition -- the tools turn it into "ik kan er nu niet bij", never into
   "geen leads gevonden", which is the lie this whole file exists to stop. */
function creds() {
  const token = process.env.API_AIRTABLE || '';
  const baseId = process.env.BASE_AIRTABLE || '';
  return { token, baseId, ok: Boolean(token && baseId) };
}

class DataUnavailable extends Error {
  constructor(message) {
    super(message);
    this.name = 'DataUnavailable';
    this.code = 'data_unavailable';
  }
}

/**
 * The tenant's leads, fetched at most once per turn.
 * @param {object} ctx  the turn context; used as the cache key AND the cache.
 */
async function leadsFor(ctx) {
  if (ctx._leads) return ctx._leads;
  const { token, baseId, ok } = creds();
  if (!ok) throw new DataUnavailable('Airtable is niet geconfigureerd.');
  try {
    ctx._leads = await leadsRead.fetchLeads(ctx.projectCode, { token, baseId });
  } catch (err) {
    console.error('[faro/data] lead fetch failed:', err.message);
    throw new DataUnavailable('Je CRM-gegevens zijn nu niet bereikbaar.');
  }
  return ctx._leads;
}

/* ── Normalising what the model asks for ─────────────────────────────────────
   The tool schemas speak a small English vocabulary (new/qualified/contacted/
   won/lost, whatsapp/form/phone/email). The CRM speaks Dutch single-selects
   written by humans over two years. These maps are the join, and they match on
   a normalised substring rather than equality so "Gekwalificeerd - wacht op
   bezichtiging" still counts as qualified. */
function norm(s) {
  return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

const STATUS_MATCH = {
  new:       ['nieuw', 'new', 'open'],
  qualified: ['gekwalificeerd', 'qualified'],
  contacted: ['contact', 'gesproken', 'benaderd', 'opgevolgd'],
  won:       ['gewonnen', 'won', 'klant', 'verkocht'],
  lost:      ['verloren', 'lost', 'afgehaakt', 'geen interesse'],
};

const CHANNEL_MATCH = {
  whatsapp: ['whatsapp', 'wa'],
  form:     ['formulier', 'form', 'website'],
  phone:    ['telefoon', 'phone', 'bellen'],
  email:    ['email', 'mail'],
};

function matchesStatus(lead, wanted) {
  if (!wanted) return true;
  // `qualified` is a real boolean on the record; trust it over the free-text
  // state, which is what an agent typed rather than what the AI decided.
  if (wanted === 'qualified' && lead.qualified) return true;
  if (wanted === 'won' && lead.afspraakGeboekt) return true;
  const needles = STATUS_MATCH[wanted] || [wanted];
  const hay = norm(lead.status);
  return needles.some((n) => hay.indexOf(n) !== -1);
}

function matchesChannel(lead, wanted) {
  if (!wanted) return true;
  const needles = CHANNEL_MATCH[wanted] || [wanted];
  const hay = norm(lead.bron);
  return needles.some((n) => hay.indexOf(n) !== -1);
}

/* "Verwachte Waarde" is free text an agent typed: "€450.000", "400k-500k",
   "rond de 350 000", "onbekend". Parse the first number that looks like money
   and treat k/K as thousands. Returns null when there is nothing to compare,
   so a budget filter EXCLUDES unknowns rather than silently treating them as 0
   and matching every minBudget query. */
function parseBudget(raw) {
  const s = String(raw == null ? '' : raw);
  const m = s.match(/(\d[\d.\s,]*)\s*(k|K|m|M)?/);
  if (!m) return null;
  const suffix = (m[2] || '').toLowerCase();
  const body = m[1].trim();

  // Separators mean opposite things either side of a k/M suffix, and both
  // spellings are in this data. "450.000" is Flemish for four hundred and
  // fifty thousand; "1.2M" is English for one point two million. Stripping
  // separators unconditionally turned the second into twelve million.
  let n;
  if (suffix) {
    n = Number(body.replace(/\s/g, '').replace(',', '.'));
  } else {
    n = Number(body.replace(/[.\s,]/g, ''));
  }
  if (!Number.isFinite(n) || n <= 0) return null;
  if (suffix === 'k') n *= 1000;
  else if (suffix === 'm') n *= 1000000;
  return n;
}

/* Urgency is the CRM's stand-in for "when do they want to buy". Same
   substring approach; unknown urgency does not match a timeframe filter. */
const TIMEFRAME_MATCH = {
  '0-1m':  ['direct', 'meteen', 'asap', 'deze maand', 'zeer urgent', 'hoog'],
  '1-3m':  ['1-3', '1 tot 3', 'enkele maanden', 'binnen 3', 'urgent', 'middel'],
  '3-6m':  ['3-6', '3 tot 6', 'half jaar', 'binnen 6'],
  '6m+':   ['later', 'geen haast', 'orienter', 'lang', 'laag', '6+', 'volgend jaar'],
};

function matchesTimeframe(lead, wanted) {
  if (!wanted) return true;
  const needles = TIMEFRAME_MATCH[wanted] || [wanted];
  const hay = norm(lead.urgentie) + ' ' + norm(lead.samenvatting);
  return needles.some((n) => hay.indexOf(n) !== -1);
}

/** Free-text search across every field a human would expect it to search. */
function matchesQuery(lead, q) {
  if (!q) return true;
  const needle = norm(q);
  if (!needle) return true;
  const hay = norm([
    lead.naam, lead.telefoon, lead.samenvatting, lead.notities,
    lead.reden, lead.bron, lead.status, lead.verwachteWaarde,
  ].join(' '));
  // Every word must appear, so "knokke villa" does not match a lead that only
  // mentions Knokke. Cheap, and much closer to what people expect than OR.
  return needle.split(/\s+/).every((w) => hay.indexOf(w) !== -1);
}

/**
 * The one filter used by both get_leads and search_leads.
 * @returns {{matches: Array, total: number}} total = before the limit
 */
function filterLeads(all, args = {}) {
  const {
    status, channel, timeframe, query,
    minBudget, maxBudget, minScore, qualifiedOnly,
    limit = 10, sort = 'score',
  } = args;

  let out = all.filter((l) =>
    matchesStatus(l, status) &&
    matchesChannel(l, channel) &&
    matchesTimeframe(l, timeframe) &&
    matchesQuery(l, query) &&
    (!qualifiedOnly || l.qualified) &&
    (minScore == null || (l.leadScore || 0) >= minScore));

  if (minBudget != null || maxBudget != null) {
    out = out.filter((l) => {
      const b = parseBudget(l.verwachteWaarde);
      if (b == null) return false;         // unknown budget is not a match
      if (minBudget != null && b < minBudget) return false;
      if (maxBudget != null && b > maxBudget) return false;
      return true;
    });
  }

  const total = out.length;

  if (sort === 'recent') {
    out = out.slice().sort((a, b) => new Date(b.datum) - new Date(a.datum));
  } else {
    // "Best leads" means score first, then a booked appointment, then recency —
    // the order an agent would actually work the list in.
    out = out.slice().sort((a, b) =>
      (b.leadScore || 0) - (a.leadScore || 0) ||
      (b.afspraakGeboekt ? 1 : 0) - (a.afspraakGeboekt ? 1 : 0) ||
      new Date(b.datum) - new Date(a.datum));
  }

  return { matches: out.slice(0, Math.max(1, Math.min(50, limit))), total };
}

/** One lead by record id, or by name when the model only has a name. */
function findLead(all, { leadId, name }) {
  if (leadId) {
    const byId = all.find((l) => l.id === leadId);
    if (byId) return byId;
  }
  if (name) {
    const n = norm(name);
    return all.find((l) => norm(l.naam) === n)
        || all.find((l) => norm(l.naam).indexOf(n) !== -1)
        || null;
  }
  return null;
}

/* ── Pipeline ────────────────────────────────────────────────────────────────
   Derived from the same rows rather than read from a second source, so the
   pipeline Faro describes and the pipeline the Pipeline page draws can never
   disagree. Stages are the CRM's own funnel, in order. */
const STAGES = [
  { key: 'new',        label: 'Nieuw',          test: (l) => !l.qualified && !l.afspraakGeboekt && !l.opgepikt },
  { key: 'contacted',  label: 'Opgepikt',       test: (l) => l.opgepikt && !l.qualified && !l.afspraakGeboekt },
  { key: 'qualified',  label: 'Gekwalificeerd', test: (l) => l.qualified && !l.afspraakGeboekt },
  { key: 'booked',     label: 'Afspraak',       test: (l) => l.afspraakGeboekt },
];

function pipeline(all) {
  const assigned = new Set();
  const stages = STAGES.map((s) => {
    const leads = all.filter((l) => !assigned.has(l.id) && s.test(l));
    leads.forEach((l) => assigned.add(l.id));
    const value = leads.reduce((sum, l) => sum + (parseBudget(l.verwachteWaarde) || 0), 0);
    return { key: s.key, label: s.label, count: leads.length, value, leads };
  });
  return stages;
}

/* ── Analytics ───────────────────────────────────────────────────────────────
   The dashboard's stats plus the two breakdowns a chat question actually asks
   for ("waar komen mijn beste leads vandaan", "hoe doet deze maand het"). */
function analytics(all) {
  const base = leadsRead.computeStats(all);

  const bySource = {};
  all.forEach((l) => {
    const key = l.bron || 'Onbekend';
    const s = bySource[key] || (bySource[key] = { source: key, total: 0, qualified: 0, booked: 0, scoreSum: 0 });
    s.total += 1;
    if (l.qualified) s.qualified += 1;
    if (l.afspraakGeboekt) s.booked += 1;
    s.scoreSum += l.leadScore || 0;
  });
  const sources = Object.values(bySource)
    .map((s) => ({
      source: s.source, total: s.total, qualified: s.qualified, booked: s.booked,
      avgScore: s.total ? Math.round((s.scoreSum / s.total) * 10) / 10 : 0,
      conversion: s.total ? Math.round((s.booked / s.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Last eight weeks, oldest first — the same window the dashboard charts.
  const weeks = [];
  const now = Date.now();
  for (let i = 7; i >= 0; i--) {
    const end = now - i * 7 * 86400000;
    const start = end - 7 * 86400000;
    weeks.push({
      week: `W${8 - i}`,
      count: all.filter((l) => {
        const t = Date.parse(l.datum);
        return Number.isFinite(t) && t >= start && t < end;
      }).length,
    });
  }

  const pipelineValue = all.reduce((sum, l) => sum + (parseBudget(l.verwachteWaarde) || 0), 0);

  return { ...base, sources, weeks, pipelineValue };
}

/* ── Conversations ───────────────────────────────────────────────────────────
   The WhatsApp history lives on the lead record as one text blob written by
   api/whatsapp.js. Splitting it into turns is presentation, and belongs here
   rather than in a prompt asking the model to parse it. */
function parseConversation(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];
  return text
    .split(/\n(?=(?:lead|klant|customer|ai|assistant|helvaro|agent)\s*[:>-])/i)
    .map((chunk) => {
      const m = chunk.match(/^\s*([\wéèëï]+)\s*[:>-]\s*([\s\S]*)$/i);
      if (!m) return { role: 'unknown', text: chunk.trim() };
      const who = norm(m[1]);
      const role = /^(lead|klant|customer)$/.test(who) ? 'lead' : 'assistant';
      return { role, text: m[2].trim() };
    })
    .filter((t) => t.text);
}

function searchConversations(all, { query, needsFollowUp, limit = 10 }) {
  let out = all.filter((l) => l.gesprek);
  if (needsFollowUp) {
    // A real, checkable condition rather than a vibe: the AI qualified them and
    // there is still no appointment. Deliberately NOT also requiring !opgepikt
    // -- an agent ticking "picked up" means they looked at it, not that the
    // lead was followed up, and excluding those hid the exact leads most worth
    // chasing (qualified, seen, still not booked).
    out = out.filter((l) => l.qualified && !l.afspraakGeboekt);
  }
  if (query) out = out.filter((l) => matchesQuery(l, query) || norm(l.gesprek).indexOf(norm(query)) !== -1);
  out = out.slice().sort((a, b) => new Date(b.datum) - new Date(a.datum));
  return out.slice(0, Math.max(1, Math.min(50, limit)));
}

/* ── Calendar ────────────────────────────────────────────────────────────────
   Reported from the CRM's own booking flag, not from Google Calendar. The
   gcal integration is per-client and optional (api/_gcal.js), and a tool that
   silently returns nothing for every client who has not connected it would be
   the "geen leads gevonden" bug again in a different costume. What this can
   honestly say is which leads have an appointment booked. */
function bookedAppointments(all, { limit = 20 } = {}) {
  return all
    .filter((l) => l.afspraakGeboekt)
    .slice()
    .sort((a, b) => new Date(b.datum) - new Date(a.datum))
    .slice(0, limit);
}

module.exports = {
  DataUnavailable,
  leadsFor,
  filterLeads,
  findLead,
  parseBudget,
  pipeline,
  analytics,
  parseConversation,
  searchConversations,
  bookedAppointments,
  STAGES,
};
