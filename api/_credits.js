'use strict';
/*
 * Credit / usage accounting for Helvaro's Vercel app (Airtable-backed).
 * Underscore-prefixed filename so Vercel does NOT treat it as a route (same
 * convention as api/_mailer.js, api/_pgapi.js, api/_gcal.js) — the route
 * count stays at 11.
 *
 * Design is fully specified in CREDIT-SYSTEM-DESIGN.md at the worktree root.
 * This file implements it exactly: do not re-derive the weighting or the
 * plan numbers here, they are already decided.
 *
 * ── THE ONE RULE THAT MATTERS MOST ─────────────────────────────────────────
 * Helvaro's promise is "reactie binnen 30 sec, 24/7". A lead conversation
 * (api/whatsapp.js) must NEVER be blocked by this file, no matter how far
 * over budget a client is. checkCredits() below still computes an honest
 * `allowed:false` for an over-limit client on ANY feature (including
 * whatsapp_conversation) — the actual protection is structural: whatsapp.js
 * intentionally never calls checkCredits() at all, only recordUsage() (see
 * its own call site comment). NEVER_BLOCK_FEATURES here is a second,
 * defense-in-depth layer in case a future call site adds a checkCredits()
 * call for a lead-facing feature by mistake.
 *
 * ── FAIL-OPEN vs FAIL-CLOSED (same asymmetry as vps-backend's credits.js
 * and the earlier Airtable proof-of-concept's api/lib/credits.js — read
 * those files' headers for the full rationale if touching this) ───────────
 *   1. A DISCRETIONARY feature (image gen, marketing text, reply
 *      suggestions, founder tools) at/over its limit -> FAIL CLOSED (block).
 *      These are optional; the client can wait for the next period or ask
 *      Sindi for more credits. This is the entire point of the feature.
 *   2. Anything else going wrong — Airtable down, the credit fields not
 *      yet added to the base, a client with no allowance configured,
 *      malformed JSON in one of the envelope fields — -> FAIL OPEN (allow
 *      the call, log once, move on). An accounting hiccup must never
 *      degrade the product itself.
 *
 * ── AIRTABLE HAS NO ATOMIC INCREMENT (read this before touching recordUsage) ──
 * Every recordUsage() call is a plain read-then-write: GET the client's
 * current "Credits Used", add the new credits in JS, PATCH the sum back.
 * Two simultaneous recordUsage() calls for the SAME client (e.g. two leads
 * messaging in the same few hundred ms) can both read the same starting
 * value and both write "old + their own delta", so the second write clobbers
 * the first — the counter ends up under-counted by whichever amount raced.
 * This is a real, acknowledged limitation, not an oversight:
 *   - At Helvaro's current traffic (a handful of concurrent conversations
 *     across the whole platform, not per client) the odds of two calls for
 *     the SAME client landing inside the same read-write window are low.
 *   - It only ever loses counted usage, never invents it — the failure mode
 *     is "client gets slightly more free usage than they should", the same
 *     direction as every other fail-soft decision in this codebase.
 *   - It resolves itself if/when Helvaro moves this billing onto the
 *     VPS/Postgres backend (see vps-backend/server/db/credits.js's own
 *     header — that version wraps the increment in one Postgres statement,
 *     `x = x + $1`, which Postgres's row locking serializes for real).
 * If Helvaro's volume ever grows enough for this to matter, the fix is that
 * migration, not a cleverer Airtable dance.
 *
 * ── STORAGE: NEW Client Config fields, not a new table ──────────────────
 * Owner must add these fields to the Klanten/Client Config table
 * (tblPidTrwGRzRt4LZ) by NAME (this file addresses them by name, never by
 * field ID, because the IDs don't exist yet — same reasoning admin.js's
 * client-creation comment gives for why it uses IDs for fields THAT ALREADY
 * EXIST: field IDs are immune to renames, but you can't know an ID before
 * the field is created). See CREDITS-VERCEL-SUMMARY.md for the exact list.
 * Until the owner adds them, every function in this file degrades to a
 * silent no-op / fail-open — see schemaLooksUnconfigured() below.
 */

const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';

// ── Field names (NOT IDs — see file header) ────────────────────────────────
const FIELD = {
  ALLOWANCE:  'Credit Allowance',          // Number. 0/blank = system inert for this client (fail-open).
  USED:       'Credits Used',              // Number. Running counter, current period.
  PERIOD:     'Credit Period',             // Long text (JSON): {start, alerted80, alerted100, alertedRunaway}
  BY_FEATURE: 'Credit Usage By Feature',   // Long text (JSON): {feature: creditsThisPeriod}
  CEILING:    'Credit Runaway Ceiling',    // Number, optional. Absolute abuse ceiling. Default = allowance * 3.
};

// ── Credit weights. See CREDIT-SYSTEM-DESIGN.md §2 for the exact numbers
// and the reasoning behind each. Do not change these without updating that
// doc — the plan allowances (2.000 / 5.000 / 20.000) are calibrated against
// them. ──────────────────────────────────────────────────────────────────
const FEATURES = {
  WHATSAPP_CONVERSATION:   'whatsapp_conversation',   // 20  — billed ONCE per lead, at the first AI turn (see whatsapp.js call site)
  IMAGE_GENERATION:        'image_generation',        // 50
  MARKETING_CONTENT:       'marketing_content',       // 5
  REPLY_SUGGESTION:        'reply_suggestion',        // 2
  // Not in the original 4-row design-doc table (that table only covers
  // client-facing features). Both mapped onto the closest cost analog and
  // documented here rather than silently invented:
  WEEKLY_LEARNING:         'weekly_learning',         // 5  — one Haiku text-gen call per client/week, same cost profile as marketing_content
  FOUNDER_AI_CHAT:         'founder_ai_chat',         // 5  — Sindi's own tools, see FOUNDER note below
  FOUNDER_AI_ADVICE:       'founder_ai_advice',       // 5
  FOUNDER_PERSONALIZED_DM: 'founder_personalized_dm', // 5
  FOUNDER_CONTENT_POST:    'founder_content_post',    // 5  — Herald's social-engine text generation
  FOUNDER_GENERATE_IMAGE:  'founder_generate_image',  // 50 — Herald's social-engine image generation
};

const WEIGHTS = {
  [FEATURES.WHATSAPP_CONVERSATION]:   20,
  [FEATURES.IMAGE_GENERATION]:        50,
  [FEATURES.MARKETING_CONTENT]:       5,
  [FEATURES.REPLY_SUGGESTION]:        2,
  [FEATURES.WEEKLY_LEARNING]:         5,
  [FEATURES.FOUNDER_AI_CHAT]:         5,
  [FEATURES.FOUNDER_AI_ADVICE]:       5,
  [FEATURES.FOUNDER_PERSONALIZED_DM]: 5,
  [FEATURES.FOUNDER_CONTENT_POST]:    5,
  [FEATURES.FOUNDER_GENERATE_IMAGE]:  50,
};

// Rough real-cost-per-credit by feature, EUR, derived from
// CREDIT-SYSTEM-DESIGN.md §1-2 (lead conv ~€0.30/20cr, image ~€0.095 avg/50cr,
// marketing text ~€0.01/5cr, reply suggestion ~€0.003/2cr). Used ONLY for the
// admin cost-visibility estimate (getAllUsageSummaries) — never for billing
// or blocking logic. Founder features reuse the ratio of their closest
// client-facing analog (text-gen vs image-gen).
const COST_PER_CREDIT_EUR = {
  [FEATURES.WHATSAPP_CONVERSATION]:   0.30 / 20,
  [FEATURES.IMAGE_GENERATION]:        0.095 / 50,
  [FEATURES.MARKETING_CONTENT]:       0.01 / 5,
  [FEATURES.REPLY_SUGGESTION]:        0.003 / 2,
  [FEATURES.WEEKLY_LEARNING]:         0.01 / 5,
  [FEATURES.FOUNDER_AI_CHAT]:         0.01 / 5,
  [FEATURES.FOUNDER_AI_ADVICE]:       0.01 / 5,
  [FEATURES.FOUNDER_PERSONALIZED_DM]: 0.01 / 5,
  [FEATURES.FOUNDER_CONTENT_POST]:    0.01 / 5,
  [FEATURES.FOUNDER_GENERATE_IMAGE]:  0.095 / 50,
};

// Features that must NEVER be blocked by checkCredits(), regardless of
// balance. Defense-in-depth — see file header. whatsapp.js never actually
// calls checkCredits() for this feature; this is the backstop if it ever did.
const NEVER_BLOCK_FEATURES = new Set([FEATURES.WHATSAPP_CONVERSATION]);

// Founder-internal pseudo-client. See ai-advice/ai-chat/personalized-dm/
// generate-image/content-post call sites in api/admin.js: these are
// ADMIN_KEY-gated tools Sindi uses herself (business coaching, cold-outreach
// drafting, Herald's autonomous social-media engine) — there is no paying
// client to attribute the spend to. Decision (mirrors vps-backend/server/db/
// credits.js's identical call): bill them to a shared '_internal' pseudo
// project code. Since no Client Config record with Project Code=_internal
// will exist unless Sindi explicitly creates one, every one of these gates
// fails OPEN by default — zero behaviour change to Herald's live posting
// engine or Sindi's own tools today. If she ever wants to cap her own
// internal AI spend, she creates a Client Config row with Project
// Code=_internal and a Credit Allowance, exactly like any real client.
const INTERNAL_PROJECT_CODE = '_internal';

// Rolling period length. 30 days chosen over "calendar month" to avoid
// month-length edge cases (28-31 days) — simpler and deterministic. Not
// specified either way by CREDIT-SYSTEM-DESIGN.md, so documented here as an
// explicit implementation decision.
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

// Default runaway ceiling multiplier when Credit Runaway Ceiling is
// blank/0 for a client. See CREDIT-SYSTEM-DESIGN.md §4 "Hard ceiling".
const DEFAULT_RUNAWAY_MULTIPLIER = 3;

function escapeFormula(val) {
  return String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Single-shot fetch, no retries — same rationale as leads.js's atFetch
// (compounding 429 retries across many callers is what caused the original
// Airtable rate-limit spiral). Credit calls are low-frequency relative to
// getLead()/getCachedClient() hot paths.
// Zie de uitleg bij atFetch in api/leads.js. Hier extra van belang: de
// creditcheck zit VOOR elke AI-call, dus een hangende Airtable blokkeert
// anders het hele WhatsApp-antwoord.
const AT_TIMEOUT_MS = 10_000;
async function atFetch(url, opts) {
  return fetch(url, { ...opts, signal: (opts && opts.signal) || AbortSignal.timeout(AT_TIMEOUT_MS) });
}

function envConfigured() {
  return !!(process.env.API_AIRTABLE && process.env.BASE_AIRTABLE);
}

// Logged at most once per cold start (module-scoped Set) so an
// unconfigured/inert credit system doesn't spam production logs on every
// WhatsApp message — same "log once, not every call" idea as the reference
// implementations' _warnedThisPeriod / _alertedThisPeriod sets.
const _loggedOnce = new Set();
function logOnce(key, ...args) {
  if (_loggedOnce.has(key)) return;
  _loggedOnce.add(key);
  console.warn(...args);
}

async function getClientRecord(projectCode) {
  const BASE_ID = process.env.BASE_AIRTABLE;
  const TOKEN   = process.env.API_AIRTABLE;
  const formula = encodeURIComponent(`{Project Code}="${escapeFormula(projectCode)}"`);
  const url     = `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`;
  const r = await atFetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`getClientRecord(${projectCode}): HTTP ${r.status}`);
  const d = await r.json();
  return (d.records || [])[0] || null;
}

function parseJsonField(raw, fallback) {
  if (!raw) return fallback;
  try {
    const p = JSON.parse(raw);
    return (p && typeof p === 'object' && !Array.isArray(p)) ? p : fallback;
  } catch {
    return fallback;
  }
}

// True when the owner has not (yet) added ANY of the credit fields to the
// Client Config schema — Airtable simply omits absent-schema fields from
// record.fields entirely, so "none of the 3 core keys are present" is the
// only observable signal for "field doesn't exist" (vs. "exists but blank
// for this client", which reads identically for a single field but is
// already handled correctly by the allowance<=0 check below either way).
function schemaLooksUnconfigured(fields) {
  return !(FIELD.ALLOWANCE in fields) && !(FIELD.USED in fields) && !(FIELD.PERIOD in fields);
}

// Reads the client's period state and returns EFFECTIVE (rollover-aware)
// numbers without writing anything — checkCredits() must stay read-only so a
// stale period near its boundary never wrongly blocks a call that a
// subsequent recordUsage() would have rolled over anyway.
//
// `rawPeriod` (added for the trial feature, see TRIAL-DESIGN.md §7 / the
// once-only-email marker in api/cron-followup.js's runTrialLifecycle()) is
// the FULL parsed Period JSON object, untouched and NEVER reset on
// rollover — unlike start/used/byFeature/alerted*, which are credit-cycle
// state. This lets a second, unrelated subsystem (the trial cron) store its
// own namespaced key (`trial: {...}`) inside the SAME Credit Period field
// without this file's own writers (recordUsage/maybeAlertThresholds/
// addCredits/resetPeriod below) silently dropping it: every write site now
// spreads `rawPeriod` first, then overrides only the 4 credit-specific keys
// it actually owns. Symmetric contract: the trial cron does the same in
// reverse when it writes its own `trial` key. Neither side needs to know
// the other's schema, both need to know not to reconstruct the field from
// scratch.
function effectivePeriodState(fields) {
  const allowance = Number(fields[FIELD.ALLOWANCE]) || 0;
  const periodRaw = fields[FIELD.PERIOD];
  const period = parseJsonField(periodRaw, null);
  const rawPeriod = (period && typeof period === 'object') ? period : {};
  const now = Date.now();
  const startMs = period && period.start ? Date.parse(period.start) : NaN;
  const stale = !period || !isFinite(startMs) || (now - startMs >= PERIOD_MS);

  const used = stale ? 0 : (Number(fields[FIELD.USED]) || 0);
  const byFeature = stale ? {} : parseJsonField(fields[FIELD.BY_FEATURE], {});
  const alerted = stale
    ? { alerted80: false, alerted100: false, alertedRunaway: false }
    : {
        alerted80:      !!(period && period.alerted80),
        alerted100:     !!(period && period.alerted100),
        alertedRunaway: !!(period && period.alertedRunaway),
      };
  const start = stale ? new Date(now).toISOString() : period.start;

  const ceilingRaw = Number(fields[FIELD.CEILING]) || 0;
  const ceiling = ceilingRaw > 0 ? ceilingRaw : allowance * DEFAULT_RUNAWAY_MULTIPLIER;

  return { allowance, used, byFeature, start, stale, ceiling, rawPeriod, ...alerted };
}

function summarize(state) {
  const { allowance, used } = state;
  const remaining   = allowance > 0 ? Math.max(0, allowance - used) : Infinity;
  const percentUsed = allowance > 0 ? Math.round((used / allowance) * 100) : 0;
  return { remaining, percentUsed };
}

/*
 * checkCredits(projectCode, feature) -> Promise<{ allowed, remaining,
 *   percentUsed, message? }>
 * Gate BEFORE a discretionary AI call. Fails OPEN on any infra/config
 * problem. NEVER call this for FEATURES.WHATSAPP_CONVERSATION — see file
 * header; whatsapp.js records usage without checking.
 */
async function checkCredits(projectCode, feature) {
  const code = String(projectCode || '').trim();
  if (!code) return { allowed: true, remaining: Infinity, percentUsed: 0 };
  if (NEVER_BLOCK_FEATURES.has(feature)) return { allowed: true, remaining: Infinity, percentUsed: 0 };

  if (!envConfigured()) {
    logOnce('env', '[Credits] API_AIRTABLE/BASE_AIRTABLE not configured — credit system inert, failing OPEN.');
    return { allowed: true, remaining: Infinity, percentUsed: 0 };
  }

  let record;
  try {
    record = await getClientRecord(code);
  } catch (err) {
    console.warn(`[Credits] checkCredits(${code}, ${feature}) lookup failed, failing OPEN:`, err.message);
    return { allowed: true, remaining: Infinity, percentUsed: 0 };
  }
  if (!record) {
    // Client not found under this project code. Not this file's job to
    // decide that's an error (callers already validate the client exists
    // elsewhere) — fail open, nothing to gate.
    return { allowed: true, remaining: Infinity, percentUsed: 0 };
  }

  const fields = record.fields || {};
  if (schemaLooksUnconfigured(fields)) {
    logOnce('schema', '[Credits] Credit fields not found on Client Config — credit system inert (see CREDITS-VERCEL-SUMMARY.md to enable).');
    return { allowed: true, remaining: Infinity, percentUsed: 0 };
  }

  const state = effectivePeriodState(fields);
  if (state.allowance <= 0) {
    // No allowance configured for THIS client yet — inert for them
    // specifically, even though the fields exist globally. Expected/common
    // state for any client Sindi hasn't onboarded onto credits yet.
    return { allowed: true, remaining: Infinity, percentUsed: 0 };
  }

  const { remaining, percentUsed } = summarize(state);
  const overLimit = state.used >= state.allowance;
  if (overLimit) {
    console.warn(`[Credits] ${code} is at/over its limit (${state.used}/${state.allowance}) — blocking discretionary feature=${feature}.`);
    return {
      allowed: false,
      remaining: 0,
      percentUsed,
      message: 'Je hebt de AI-credits voor deze periode bereikt. Deze actie is tijdelijk niet beschikbaar — neem contact op met Helvaro om je limiet te verhogen, of wacht tot de volgende periode.',
    };
  }

  return { allowed: true, remaining, percentUsed };
}

/*
 * recordUsage(projectCode, feature, { credits, tokens, estimatedCostUsd, meta })
 * Fire-and-forget-safe: NEVER throws. Read-modify-write against Airtable —
 * see file header for the documented race. Call this for EVERY feature,
 * including whatsapp_conversation (whatsapp.js never gates on checkCredits,
 * but it must still record usage so the dashboard/admin numbers are real).
 */
async function recordUsage(projectCode, feature, opts = {}) {
  const code = String(projectCode || '').trim();
  if (!code) return;
  const creditsInt = Math.max(0, Math.round(Number(opts.credits) || 0));
  if (creditsInt <= 0) return;

  if (!envConfigured()) return; // logged once already by checkCredits/other callers if relevant

  let record;
  try {
    record = await getClientRecord(code);
  } catch (err) {
    console.error(`[Credits] recordUsage(${code}, ${feature}) lookup failed — usage NOT recorded, caller flow continues:`, err.message);
    return;
  }
  if (!record) return;

  const fields = record.fields || {};
  if (schemaLooksUnconfigured(fields)) return; // inert — nothing to record

  const state = effectivePeriodState(fields);
  const newUsed = state.used + creditsInt;
  const newByFeature = { ...state.byFeature, [feature]: (state.byFeature[feature] || 0) + creditsInt };
  // Spread rawPeriod FIRST so any unrelated namespaced key another subsystem
  // stores in this same field (e.g. the trial cron's `trial: {...}` marker,
  // see effectivePeriodState()'s doc comment) survives this write untouched.
  const newPeriod = {
    ...state.rawPeriod,
    start: state.start,
    alerted80: state.alerted80,
    alerted100: state.alerted100,
    alertedRunaway: state.alertedRunaway,
  };

  try {
    const BASE_ID = process.env.BASE_AIRTABLE;
    const TOKEN   = process.env.API_AIRTABLE;
    const r = await atFetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${record.id}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            [FIELD.USED]:       newUsed,
            [FIELD.PERIOD]:     JSON.stringify(newPeriod),
            [FIELD.BY_FEATURE]: JSON.stringify(newByFeature),
          },
        }),
      }
    );
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error(`[Credits] recordUsage(${code}, ${feature}) PATCH failed (HTTP ${r.status}) — usage NOT recorded:`, t.slice(0, 200));
      return;
    }
  } catch (err) {
    console.error(`[Credits] recordUsage(${code}, ${feature}) PATCH threw — usage NOT recorded:`, err.message);
    return;
  }

  // Threshold alerts (80% / 100% / runaway ceiling), each fires at most once
  // per period. Fire-and-forget — must never affect the caller's flow.
  maybeAlertThresholds(code, { ...state, used: newUsed }, feature).catch(() => {});
}

async function maybeAlertThresholds(projectCode, state, feature) {
  const { allowance, used, ceiling } = state;
  if (allowance <= 0) return;
  const percentUsed = Math.round((used / allowance) * 100);

  const crossed80  = percentUsed >= 80  && !state.alerted80;
  const crossed100 = percentUsed >= 100 && !state.alerted100;
  const crossedRunaway = ceiling > 0 && used >= ceiling && !state.alertedRunaway;

  if (!crossed80 && !crossed100 && !crossedRunaway) return;

  // Re-fetch the record so we PATCH the alerted-flags on top of whatever
  // recordUsage() just wrote, not a stale in-memory copy — a second
  // recordUsage() call could have landed between the PATCH above and this
  // read. Same read-modify-write caveat as everywhere else in this file;
  // worst case here is one extra duplicate alert email, never a missed one
  // in a way that matters (alerts are informational, not enforcement).
  let record;
  try {
    record = await getClientRecord(projectCode);
  } catch (err) {
    console.warn(`[Credits] threshold-alert re-fetch failed for ${projectCode}:`, err.message);
    return;
  }
  if (!record) return;
  const fields = record.fields || {};
  const fresh = effectivePeriodState(fields);
  // Recompute against the fresh row in case usage moved further since our caller's write.
  const freshPercent = fresh.allowance > 0 ? Math.round((fresh.used / fresh.allowance) * 100) : 0;
  const do80  = freshPercent >= 80  && !fresh.alerted80;
  const do100 = freshPercent >= 100 && !fresh.alerted100;
  const doRunaway = fresh.ceiling > 0 && fresh.used >= fresh.ceiling && !fresh.alertedRunaway;
  if (!do80 && !do100 && !doRunaway) return;

  const newPeriod = {
    ...fresh.rawPeriod,
    start: fresh.start,
    alerted80:      fresh.alerted80  || do80,
    alerted100:     fresh.alerted100 || do100,
    alertedRunaway: fresh.alertedRunaway || doRunaway,
  };

  try {
    const BASE_ID = process.env.BASE_AIRTABLE;
    const TOKEN   = process.env.API_AIRTABLE;
    await atFetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${record.id}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { [FIELD.PERIOD]: JSON.stringify(newPeriod) } }),
      }
    );
  } catch (err) {
    console.warn(`[Credits] threshold-alert flag write failed for ${projectCode} (email still attempted):`, err.message);
  }

  const clientName = fields['Client Name'] || fields['fldAnB848Sr5jl6dq'] || projectCode;
  const clientEmail = fields['Rapport Email'] || fields['fldDBJCN6dVMA8jax'] || '';
  const { sendMail } = require('./_mailer');

  if (do80) {
    console.warn(`[Credits] ${projectCode} crossed 80% (${fresh.used}/${fresh.allowance}).`);
    const to = clientEmail || process.env.NOTIFY_EMAIL;
    if (to) {
      sendMail({
        to,
        subject: `[Helvaro] Je zit op 80% van je maandelijkse AI-credits`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:auto;padding:20px;color:#111">
          <h2 style="color:#d97706;margin:0 0 12px">Bijna aan je kredietlimiet</h2>
          <p><strong>${clientName}</strong> heeft <strong>${fresh.used}/${fresh.allowance}</strong> AI-credits gebruikt deze periode.</p>
          <p style="color:#666">Leadgesprekken blijven altijd gewoon doorlopen. Vanaf 100% pauzeert enkel optionele AI (bv. beeldgeneratie) tijdelijk.</p>
        </div>`,
      }).catch(() => {});
    }
  }
  if (do100) {
    console.error(`[Credits] ${projectCode} crossed 100% (${fresh.used}/${fresh.allowance}).`);
    const to = clientEmail || process.env.NOTIFY_EMAIL;
    if (to) {
      sendMail({
        to,
        subject: `[Helvaro] Kredietlimiet bereikt deze periode`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:auto;padding:20px;color:#111">
          <h2 style="color:#e11d48;margin:0 0 12px">Kredietlimiet bereikt</h2>
          <p><strong>${clientName}</strong> heeft <strong>${fresh.used}/${fresh.allowance}</strong> AI-credits gebruikt.</p>
          <p style="color:#666">Leadgesprekken blijven gewoon doorlopen, dat verandert nooit. Optionele AI (beeldgeneratie, extra suggesties) is tijdelijk gepauzeerd tot de volgende periode of een upgrade.</p>
        </div>`,
      }).catch(() => {});
    }
  }
  if (doRunaway) {
    console.error(`[Credits] RUNAWAY: ${projectCode} passed its abuse ceiling (${fresh.used}/${fresh.ceiling}).`);
    const to = process.env.NOTIFY_EMAIL;
    if (to) {
      sendMail({
        to,
        subject: `[Helvaro] Runaway-alert: ${clientName} boven abuse-ceiling`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:auto;padding:20px;color:#111">
          <h2 style="color:#e11d48;margin:0 0 12px">Runaway credit-gebruik</h2>
          <p><strong>${clientName}</strong> (${projectCode}) zit op <strong>${fresh.used}</strong> credits, boven de ceiling van <strong>${fresh.ceiling}</strong> (${DEFAULT_RUNAWAY_MULTIPLIER}x allowance tenzij handmatig overschreven).</p>
          <p style="color:#666">Dit is puur een misbruik-signaal, geen automatische blokkering. Bekijk het account.</p>
        </div>`,
      }).catch(() => {});
    }
  }
}

// getUsageSummary(projectCode) -> client-dashboard shape, or { active:false }
// when inert/unconfigured (schema absent OR this client has no allowance
// set). Never throws.
async function getUsageSummary(projectCode) {
  const code = String(projectCode || '').trim();
  if (!code || !envConfigured()) return { active: false };
  try {
    const record = await getClientRecord(code);
    if (!record) return { active: false };
    const fields = record.fields || {};
    if (schemaLooksUnconfigured(fields)) return { active: false };
    const state = effectivePeriodState(fields);
    if (state.allowance <= 0) return { active: false };

    const { remaining, percentUsed } = summarize(state);
    const daysElapsed = Math.floor((Date.now() - Date.parse(state.start)) / 86400000);
    const daysLeft = Math.max(0, Math.ceil(PERIOD_MS / 86400000) - daysElapsed);
    const leadsRemaining = Math.floor(remaining / WEIGHTS[FEATURES.WHATSAPP_CONVERSATION]);

    return {
      active: true,
      allowance: state.allowance,
      used: state.used,
      remaining,
      percentUsed,
      periodStart: state.start,
      daysLeft,
      leadsRemaining,
      byFeature: state.byFeature,
      overLimit: state.used >= state.allowance,
    };
  } catch (err) {
    console.warn(`[Credits] getUsageSummary(${code}) failed, hiding widget:`, err.message);
    return { active: false };
  }
}

// getAllUsageSummaries() -> [{ projectCode, clientName, ...summary,
//   estimatedCostEur }] for every Client Config record, once the credit
// fields are confirmed to exist SOMEWHERE on the base (see the schemaExists
// check below) — including clients with no allowance set yet (admin needs to
// see "not onboarded onto credits" clients too, unlike the client-facing
// getUsageSummary which hides them). Bounded by client count (Helvaro-scale:
// low dozens) — same "admin is low-frequency" tradeoff as the rest of
// api/admin.js.
async function getAllUsageSummaries() {
  if (!envConfigured()) return [];
  const BASE_ID = process.env.BASE_AIRTABLE;
  const TOKEN   = process.env.API_AIRTABLE;
  try {
    const r = await atFetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?pageSize=100`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const records = d.records || [];

    // Airtable omits a BLANK field from record.fields even when the column
    // exists in the schema — schemaLooksUnconfigured() is per-record and
    // can't distinguish "this client has no allowance yet" from "the owner
    // never added the columns at all". For THIS function (unlike
    // checkCredits/getUsageSummary, which only ever need a per-client
    // answer) we need the global answer, so it's derived once across every
    // fetched record: if ANY client has ANY of the 3 core keys, the schema
    // exists and every client should be listed (blank ones included, as
    // "no allowance configured yet"). If truly none do, the fields almost
    // certainly haven't been added yet — return [] rather than a list of
    // all-zero rows that would look like real data.
    const schemaExists = records.some(rec => !schemaLooksUnconfigured(rec.fields || {}));
    if (!schemaExists) return [];

    const out = [];
    for (const rec of records) {
      const fields = rec.fields || {};
      const projectCode = fields['Project Code'] || fields['fldN4dL0bGgfBOXwM'] || '';
      const clientName  = fields['Client Name']  || fields['fldAnB848Sr5jl6dq']  || projectCode;
      if (!projectCode) continue;

      const state = effectivePeriodState(fields);
      const { remaining, percentUsed } = summarize(state);
      let estimatedCostEur = 0;
      for (const [feature, credits] of Object.entries(state.byFeature)) {
        estimatedCostEur += (Number(credits) || 0) * (COST_PER_CREDIT_EUR[feature] || 0);
      }
      out.push({
        projectCode,
        clientName,
        allowance: state.allowance,
        used: state.used,
        remaining,
        percentUsed,
        periodStart: state.start,
        byFeature: state.byFeature,
        estimatedCostEur: Math.round(estimatedCostEur * 100) / 100,
        configured: state.allowance > 0,
      });
    }
    return out;
  } catch (err) {
    console.error('[Credits] getAllUsageSummaries failed:', err.message);
    return [];
  }
}

// ── Admin write helpers. These are the ONLY functions in this file that can
// surface an error to the caller (an admin action, not a lead-facing flow) —
// if the credit fields aren't on the schema yet, Airtable's PATCH itself
// will reject the unknown field name and this bubbles up as a clear error
// for the admin UI to show, rather than being swallowed. ───────────────────

async function _patchClientCreditFields(projectCode, fields) {
  const code = String(projectCode || '').trim();
  if (!code) throw new Error('projectCode is verplicht');
  if (!envConfigured()) throw new Error('API_AIRTABLE/BASE_AIRTABLE niet geconfigureerd');
  const record = await getClientRecord(code);
  if (!record) throw new Error(`Geen klant gevonden met Project Code "${code}"`);
  const BASE_ID = process.env.BASE_AIRTABLE;
  const TOKEN   = process.env.API_AIRTABLE;
  const r = await atFetch(
    `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${record.id}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }
  );
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Airtable PATCH ${r.status}: ${t.slice(0, 300)}`);
  }
  return r.json();
}

async function setAllowance(projectCode, allowance) {
  const n = Math.max(0, Math.round(Number(allowance) || 0));
  return _patchClientCreditFields(projectCode, { [FIELD.ALLOWANCE]: n });
}

// "Add credits" = extra headroom this period = reduce Credits Used (floored
// at 0), same semantics as both reference implementations — a top-up, not a
// permanent allowance change.
async function addCredits(projectCode, n) {
  const code = String(projectCode || '').trim();
  const record = await getClientRecord(code);
  if (!record) throw new Error(`Geen klant gevonden met Project Code "${code}"`);
  const fields = record.fields || {};
  const state = effectivePeriodState(fields);
  const newUsed = Math.max(0, state.used - Math.max(0, Math.round(Number(n) || 0)));
  // Spread rawPeriod first — see effectivePeriodState()'s doc comment: an
  // admin top-up must never wipe an unrelated namespaced key (e.g. the
  // trial cron's once-only-email marker) that happens to live in this same field.
  return _patchClientCreditFields(projectCode, {
    [FIELD.USED]: newUsed,
    [FIELD.PERIOD]: JSON.stringify({ ...state.rawPeriod, start: state.start, alerted80: state.alerted80, alerted100: state.alerted100, alertedRunaway: state.alertedRunaway }),
  });
}

// Admin-triggered CREDIT period reset. Still reads the current record first
// (rather than blind-overwriting) so an unrelated namespaced key stored in
// the same Credit Period field — e.g. the trial cron's once-only-email
// marker (see effectivePeriodState()'s doc comment) — survives an admin
// resetting a client's credit counters. Only the 4 credit-owned keys are
// actually reset; everything else in the envelope passes through untouched.
async function resetPeriod(projectCode) {
  const code = String(projectCode || '').trim();
  let rawPeriod = {};
  try {
    const record = await getClientRecord(code);
    if (record) rawPeriod = effectivePeriodState(record.fields || {}).rawPeriod;
  } catch (err) {
    console.warn(`[Credits] resetPeriod(${code}) pre-read failed, resetting without preserving extra keys:`, err.message);
  }
  return _patchClientCreditFields(projectCode, {
    [FIELD.USED]:       0,
    [FIELD.PERIOD]:     JSON.stringify({ ...rawPeriod, start: new Date().toISOString(), alerted80: false, alerted100: false, alertedRunaway: false }),
    [FIELD.BY_FEATURE]: JSON.stringify({}),
  });
}

// ── Trial-lifecycle marker (once-only email/alert tracking) ────────────────
// Piggybacks on the SAME Credit Period field this file already owns, rather
// than a new Airtable field — see TRIAL-DESIGN.md §7 and
// CREDITS-VERCEL-SUMMARY.md's "do NOT add Airtable fields" instruction for
// the trial feature. Stored as a `trial: {day7Sent, day11Sent, expiredSent}`
// sub-object inside the same JSON envelope this file's own alerted80/100/
// runaway flags live in. Only api/cron-followup.js's runTrialLifecycle()
// calls these two — kept here rather than duplicated there, because this
// file already owns every read/write of Credit Period and effectivePeriodState()'s
// rawPeriod-spreading (see its doc comment) is what keeps this safe from a
// concurrent recordUsage() call clobbering it, and vice versa.
//
// Deliberately does NOT gate on schemaLooksUnconfigured() the way the
// credit-specific functions above do: that check answers "have the credit
// fields been added to the Client Config schema at all", which for THIS
// feature is a given (Credit Period already exists — see TRIAL-DESIGN.md
// §6.5, it's one of the fields the credit system rollout already added).
// If it somehow doesn't, the PATCH below fails naturally and the caller's
// try/catch handles it exactly like any other Airtable error.
async function getTrialMarkers(projectCode) {
  const code = String(projectCode || '').trim();
  if (!code || !envConfigured()) return {};
  try {
    const record = await getClientRecord(code);
    if (!record) return {};
    const state = effectivePeriodState(record.fields || {});
    return (state.rawPeriod && typeof state.rawPeriod.trial === 'object') ? state.rawPeriod.trial : {};
  } catch (err) {
    console.warn(`[Credits] getTrialMarkers(${code}) failed, treating as "nothing sent yet":`, err.message);
    return {};
  }
}

// Merges `patch` into the existing `trial` sub-object. Re-reads the record
// fresh immediately before writing (same pattern as maybeAlertThresholds()
// above) so this doesn't clobber a concurrent credit write, and vice versa.
// Throws on genuine failure (network/Airtable error) — callers in
// cron-followup.js wrap this in try/catch and treat a failure as "email
// sent, marker not persisted" (logged, not fatal): the bounded downside is
// a possible duplicate email on the NEXT cron run, never a service-state
// change, matching this file's own documented Airtable-race risk appetite.
async function setTrialMarker(projectCode, patch) {
  const code = String(projectCode || '').trim();
  if (!code) return false;
  if (!envConfigured()) return false;
  const record = await getClientRecord(code);
  if (!record) return false;
  const fields = record.fields || {};
  const state = effectivePeriodState(fields);
  const currentTrial = (state.rawPeriod && typeof state.rawPeriod.trial === 'object') ? state.rawPeriod.trial : {};
  const newPeriod = {
    ...state.rawPeriod,
    start: state.start,
    alerted80: state.alerted80,
    alerted100: state.alerted100,
    alertedRunaway: state.alertedRunaway,
    trial: { ...currentTrial, ...patch },
  };
  const BASE_ID = process.env.BASE_AIRTABLE;
  const TOKEN   = process.env.API_AIRTABLE;
  const r = await atFetch(
    `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${record.id}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { [FIELD.PERIOD]: JSON.stringify(newPeriod) } }),
    }
  );
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Airtable PATCH ${r.status}: ${t.slice(0, 200)}`);
  }
  return true;
}

module.exports = {
  FEATURES,
  WEIGHTS,
  FIELD,
  INTERNAL_PROJECT_CODE,
  checkCredits,
  recordUsage,
  getUsageSummary,
  getAllUsageSummaries,
  setAllowance,
  addCredits,
  resetPeriod,
  getTrialMarkers,
  setTrialMarker,
};
