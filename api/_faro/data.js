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
const gcal = require('../_gcal');   // per-client Google Calendar, optional and fail-soft

const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';

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

  // ── Waarom dit ALLE getallen bekijkt en niet het eerste ────────────────────
  // Dit veld is vrije tekst die een makelaar zelf intikt, en die begint lang
  // niet altijd met het bedrag: "3 slaapkamers, 450.000" leverde 3 op, en
  // "2 gevels 300k" leverde 2 op. Die 3 verscheen daarna als € 3 in de
  // pipelinewaarde en zakte bovendien onder elke minBudget-filter door, zodat
  // de lead ook nog eens uit de lijst met dure kansen viel.
  //
  // Dus: elk kandidaat-getal langslopen en alleen accepteren wat er als geld
  // uitziet — een k/M-achtervoegsel, een euroteken ervoor, of gewoon groot
  // genoeg om geen kamertelling te zijn. Levert dat niets op, dan is null het
  // eerlijke antwoord; een verkeerd bedrag is erger dan geen bedrag.
  //   \d[\d.\s,]*\d  het getal moet op een cijfer EINDIGEN, anders knipt een
  //                    spatie "350 000" in tweeen en houd je 350 over.
  //   (?![\w])         zonder deze kijkt "4 kamers" als 4k en dus als 4.000:
  //                    de k van kamers werd als duizendtal gelezen.
  const re = /(€\s*)?(\d[\d.\s,]*\d|\d)\s*(k|K|m|M)?(?![\w])/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const hasEuro = Boolean(m[1]);
    const suffix  = (m[3] || '').toLowerCase();
    const body    = m[2].trim().replace(/[.,\s]+$/, '');
    if (!body) continue;

    // Scheidingstekens betekenen het tegenovergestelde aan weerszijden van een
    // k/M-achtervoegsel, en beide schrijfwijzen komen voor. "450.000" is
    // Vlaams voor vierhonderdvijftigduizend; "1.2M" is Engels voor 1,2 miljoen.
    let n;
    if (suffix) {
      n = Number(body.replace(/\s/g, '').replace(',', '.'));
    } else {
      n = Number(body.replace(/[.\s,]/g, ''));
    }
    if (!Number.isFinite(n) || n <= 0) continue;
    if (suffix === 'k') n *= 1000;
    else if (suffix === 'm') n *= 1000000;

    // 1.000 is de ondergrens waaronder een los getal in dit veld vrijwel altijd
    // iets anders telt: slaapkamers, gevels, een huisnummer.
    if (suffix || hasEuro || n >= 1000) return n;
  }
  return null;
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
   The WhatsApp history is stored on the lead record by api/whatsapp.js as
   JSON.stringify([{ role, content, ts }, …]) — NOT as the "Lead: … / AI: …"
   text blob this originally tried to parse. The text-prefix parser is kept as
   a fallback for any record written before that format settled, but the JSON
   path is the real one, and it is the only one that carries a timestamp.

   That timestamp matters far beyond display: `ts` on the most recent user turn
   is the lead's last inbound message, which is what Meta's 24-hour
   customer-service window is measured from. Without it there is no way to know
   whether a free-form WhatsApp reply is even allowed. */
function parseConversation(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];

  if (text[0] === '[') {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) {
        return arr
          .filter((m) => m && m.content)
          .map((m) => ({
            role: m.role === 'user' ? 'lead' : 'assistant',
            text: String(m.content),
            at: Number(m.ts) || null,
          }));
      }
    } catch (_) { /* fall through to the text parser */ }
  }

  return text
    .split(/\n(?=(?:lead|klant|customer|ai|assistant|helvaro|agent)\s*[:>-])/i)
    .map((chunk) => {
      const m = chunk.match(/^\s*([\wéèëï]+)\s*[:>-]\s*([\s\S]*)$/i);
      if (!m) return { role: 'unknown', text: chunk.trim(), at: null };
      const who = norm(m[1]);
      const role = /^(lead|klant|customer)$/.test(who) ? 'lead' : 'assistant';
      return { role, text: m[2].trim(), at: null };
    })
    .filter((t) => t.text);
}

/* ── The 24-hour window ──────────────────────────────────────────────────────
   Meta only permits a free-form WhatsApp message inside 24 hours of the
   customer's own last message. Outside it, only an approved template may be
   sent, and a free-form attempt is rejected by the API — so this is not a
   politeness check, it is whether the send can work at all.

   Returns { open, lastInboundAt, hoursLeft, reason } and never throws: a lead
   whose history cannot be read is reported as CLOSED, because attempting a
   send we cannot justify is the worse failure. */
const WINDOW_MS = 24 * 60 * 60 * 1000;

function lastInboundAt(lead) {
  const turns = parseConversation(lead && lead.gesprek);
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === 'lead' && turns[i].at) return turns[i].at;
  }
  return null;
}

function messagingWindow(lead) {
  const at = lastInboundAt(lead);
  if (!at) {
    return {
      open: false, lastInboundAt: null, hoursLeft: 0,
      reason: 'no_inbound_timestamp',
    };
  }
  const elapsed = Date.now() - at;
  if (elapsed >= WINDOW_MS) {
    return {
      open: false, lastInboundAt: at, hoursLeft: 0,
      reason: 'window_closed',
    };
  }
  return {
    open: true,
    lastInboundAt: at,
    hoursLeft: Math.max(0, Math.round(((WINDOW_MS - elapsed) / 3600000) * 10) / 10),
    reason: 'open',
  };
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
   Two sources, in that order of preference.

   Google Calendar is the real answer when the client has connected it: actual
   events with actual times, which is what someone asking "what's on tomorrow"
   means. It is per-client and optional (api/_gcal.js), so it is not always
   there — and a tool that silently returned nothing for every client who has
   not connected it would be the "geen leads gevonden" bug in a different
   costume.

   So when Calendar is unavailable this falls back to the CRM's own booking
   flag and SAYS which source it used. A caller must never present the fallback
   as if it were the calendar; the `source` field is what makes that possible. */
async function calendarEvents(ctx, { days = 7 } = {}) {
  const { token, baseId, ok } = creds();
  if (!ok) return { source: 'none', events: [], reason: 'not_configured' };

  let access;
  try {
    access = await gcalAccessForProject(ctx.projectCode, token, baseId);
  } catch (err) {
    console.error('[faro/data] gcal access failed:', err.message);
    access = null;
  }
  if (!access || !access.token) return { source: 'none', events: [], reason: 'not_connected' };

  const from = new Date();
  const to = new Date(Date.now() + Math.max(1, Math.min(30, days)) * 86400000);
  try {
    const events = await gcal.listEvents(access.token, access.calId, from.toISOString(), to.toISOString(), 100);
    return { source: 'google', events: events || [], reason: 'ok' };
  } catch (err) {
    console.error('[faro/data] gcal listEvents failed:', err.message);
    return { source: 'none', events: [], reason: 'unreachable' };
  }
}

/* Resolve one client's Google access. Mirrors api/leads.js's
   gcalAccessForProject: same field IDs, same fail-soft contract — an
   unconnected or broken integration returns no token rather than throwing, so
   the calendar tool degrades instead of failing the whole turn. */
async function gcalAccessForProject(projectCode, airtableToken, baseId) {
  if (!gcal.isConfigured() || !projectCode) return null;
  const formula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${leadsRead.escapeFormula(projectCode)}"`);
  const res = await fetch(
    `https://api.airtable.com/v0/${baseId}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
    { headers: { Authorization: `Bearer ${airtableToken}` } },
  );
  if (!res.ok) return null;
  const rec = ((await res.json()).records || [])[0];
  const enc = rec && rec.fields && (rec.fields.fldkYmK3jAabvytCF || rec.fields['Google Refresh Token']);
  if (!enc) return null;
  const refresh = gcal.decryptToken(enc);
  if (!refresh) return null;
  const access = await gcal.getAccessToken(refresh);
  if (!access) return null;
  return { token: access, calId: rec.fields.fldWBxxhGYEZNIMqA || rec.fields['Google Calendar ID'] || 'primary' };
}

/* The CRM fallback: which leads have an appointment ticked. Not times, and
   never described as times. */
function bookedAppointments(all, { limit = 20 } = {}) {
  return all
    .filter((l) => l.afspraakGeboekt)
    .slice()
    .sort((a, b) => new Date(b.datum) - new Date(a.datum))
    .slice(0, limit);
}

/* The connection itself, for callers that need to WRITE to the calendar
   rather than read it. Same fail-soft contract: null when unavailable. */
async function gcalAccessFor(ctx) {
  const { token, baseId, ok } = creds();
  if (!ok) return null;
  try {
    return await gcalAccessForProject(ctx.projectCode, token, baseId);
  } catch (err) {
    console.error('[faro/data] gcal access failed:', err.message);
    return null;
  }
}

module.exports = {
  DataUnavailable,
  calendarEvents,
  gcalAccessFor,
  lastInboundAt,
  messagingWindow,
  WINDOW_MS,
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
