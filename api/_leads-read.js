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
/* Deze twee stonden hier lang als "geen bekend veld-id", op drie plekken in de
   codebase. Dat klopte niet: ze zijn op 2026-09-03 opgezocht in de echte base
   (Lead Qualification System) en hebben allebei gewoon een id. De bewering was
   dus jaren oud en niemand had hem nagetrokken.
   Ze staan hier nu bij, zodat ook deze twee lezingen een hernoeming overleven. */
const FIELD_GESPREK = 'fldwDOLZKlAhfigbh';   // Conversation History
const FIELD_LAATSTE = 'fldV8PbcsDzvKRiks';   // Last Message

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
    gesprek:               f[FIELD_GESPREK]          || f['Conversation History'] || '',
    leadScore:             num(f.fldpzQgMuWJLjogiD  || f['Lead Score']),
    opgepikt:              bool(f.fld86JQHB6dbuutA7 || f.Opgepikt),
    verwachteWaarde:       f.fldv7qOYvCN1xJfiR      || f['Verwachte Waarde']  || '',
    reactietijd:           num(f.fldUJJ8oSmAMQ9wB3  || f['Response Time (sec)']),
    datum:                 f[FIELD_CREATED]         || f['Created At']        || r.createdTime || '',
    /* De tenant waar dit record aan hangt. Toegevoegd voor api/_crm/: die duwt
       een lead naar een systeem BUITEN Helvaro, en dan is "de aanroeper zal het
       wel goed doen" geen acceptabele controle meer. Elke bestaande lezer krijgt
       er een sleutel bij en verandert verder niet. */
    projectCode:           f[FIELD_PROJECT]         || f['Project Code']      || '',
  };
}

/* ── In welke maand valt dit? ───────────────────────────────────────────────
 * Deze code draait op Vercel, en daar staat de klok op UTC. De makelaar zit in
 * Belgie, twee uur verderop in de zomer. `d.getMonth()` gaf dus de maand in
 * UTC, en een lead die om 01:30 's nachts op 1 september binnenkwam telde mee
 * in AUGUSTUS -- 31 augustus 23:30 UTC. Elke maandgrens verschoof zo een paar
 * uur aan leads naar de verkeerde kant.
 *
 * Erger: het dashboard rekent "deze maand" OOK zelf uit, in de browser, dus in
 * de tijdzone van de laptop. Server en scherm gaven daardoor rond elke
 * maandwisseling een ander getal voor hetzelfde woord. Dezelfde soort fout als
 * bij de bedragen: twee plekken die hetzelfde denken te berekenen.
 *
 * Intl doet het tijdzonewerk, inclusief zomertijd. Valt de zone weg (oude
 * runtime, onbekende naam), dan vallen we terug op UTC: dan is het getal weer
 * zoals het was, en niet stuk.
 */
const STANDAARD_ZONE = 'Europe/Brussels';

function maandSleutel(d, zone) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return null;
  try {
    const delen = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit',
    }).formatToParts(d);
    const jaar  = delen.find((p) => p.type === 'year');
    const maand = delen.find((p) => p.type === 'month');
    if (!jaar || !maand) throw new Error('geen jaar/maand');
    return jaar.value + '-' + maand.value;
  } catch (e) {
    /* Onbekende zone of een runtime zonder volledige ICU. Liever UTC dan geen
       getal: de telling klopt dan op alle dagen behalve de maandgrens. */
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }
}

/** The dashboard's stat block. Same arithmetic, same rounding, same keys. */
function computeStats(leads, opties) {
  const zone = (opties && opties.zone) || STANDAARD_ZONE;
  /* `nu` is injecteerbaar om dezelfde reden als in _faro/rapport.js: zonder
     die naad kan een test de maandgrens niet aanwijzen, en dan is een test die
     "deze maand" heet groen op 2 september en bewijst hij niets. */
  const nuSleutel = maandSleutel((opties && opties.nu) || new Date(), zone);
  const total = leads.length;
  const qualified = leads.filter((l) => l.qualified).length;
  const booked = leads.filter((l) => l.afspraakGeboekt).length;
  const conversionRate = total > 0 ? Math.round((booked / total) * 1000) / 10 : 0;
  const thisMonth = leads.filter((l) => {
    const s = maandSleutel(new Date(l.datum), zone);
    return s !== null && s === nuSleutel;
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
    // returnFieldsByFieldId staat UIT, maar niet meer om de reden die hier
    // stond. De oude tekst zei dat Conversation History en Last Message geen
    // veld-id hadden; die zijn er wel (zie FIELD_GESPREK/FIELD_LAATSTE
    // hierboven, opgezocht in de echte base).
    //
    // Hij blijft uit omdat AANZETTEN een andere wijziging is: dan komen ALLE
    // sleutels als veld-id terug, en elke lezer hier leest nog
    // `f[ID] || f['Naam']`. Dat werkt, maar het is een verandering die je
    // bewust doet en apart nakijkt -- niet en passant bij het rechtzetten van
    // een opmerking. Filter en sortering gebruiken al id's, en dat is het deel
    // dat een hernoeming echt moet overleven.
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
  maandSleutel,
  STANDAARD_ZONE,
  LEADS_TABLE,
  FIELD_CREATED,
  FIELD_PROJECT,
  FIELD_GESPREK,
  FIELD_LAATSTE,
  escapeFormula,
  mapLead,
  computeStats,
  fetchLeads,
};
