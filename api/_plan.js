'use strict';
/*
 * Trial / plan-status interpretation for Helvaro's Vercel app (Airtable-backed).
 * Underscore-prefixed filename so Vercel does NOT treat it as a route (same
 * convention as api/_mailer.js, api/_pgapi.js, api/_gcal.js, api/_credits.js)
 * — the route count stays at 11.
 *
 * Design is fully specified in TRIAL-DESIGN.md at the worktree root. This
 * file implements §6-7 of it exactly: do not re-derive the touchpoint
 * schedule or the field contract here, they're already decided.
 *
 * This file is deliberately PURE — no Airtable/network calls. Callers pass
 * in a client record's `fields` (however they fetched it) and get back an
 * interpretation. That keeps it trivially safe to call from the hottest
 * path in the app (api/whatsapp.js, on every inbound message) without
 * adding a second Airtable round-trip on top of the client lookup callers
 * already do.
 *
 * ── THE ONE RULE THAT MATTERS MOST ─────────────────────────────────────────
 * getPlanState() must NEVER be the reason a paying (or blank-status, i.e.
 * pre-trial-rollout) client stops being served. Every branch below that
 * can't confidently determine the client is trial/expired/cancelled/paused
 * falls open to 'active'. See TRIAL-DESIGN.md §7:
 *   - Blank/missing Plan Status -> 'active'. Every client onboarded before
 *     2026-07-30 has this field blank and must be completely unaffected.
 *   - Unrecognized Plan Status value (typo, new option added in Airtable
 *     that this code doesn't know about yet) -> 'active', logged once.
 *   - Plan Status='trial' but Trial Ends At missing/unparseable ->
 *     'active', logged once. Never silently expire a trial client because
 *     of a data problem.
 *
 * ── WHY EXPIRY IS DATE-DERIVED, NOT JUST FIELD-DERIVED ─────────────────────
 * api/cron-followup.js is what physically flips Plan Status trial->expired,
 * once a day. api/whatsapp.js calls getPlanState() on EVERY inbound message
 * and must not depend on that cron having already run today (TRIAL-DESIGN.md
 * §7: "the webhook path reads the current state on every message and must
 * not depend on the cron having run"). So: when rawStatus is 'trial' and
 * Trial Ends At is already in the past, the EFFECTIVE status returned here
 * is 'expired' immediately — even though the Airtable field itself may
 * still literally say 'trial' until the next cron run corrects it.
 */

// ── Field IDs (Client Config / Klanten, tblPidTrwGRzRt4LZ) ─────────────────
// Already live on the base (created 2026-07-30) — see TRIAL-DESIGN.md §6.
// ID || name pattern matches every other field lookup in this codebase
// (whatsapp.js, admin.js, leads.js): immune to renames, name kept as a
// defensive fallback.
const FIELD = {
  STATUS:         'fldIsexYvQUiYMWex', // Plan Status. singleSelect: trial/active/expired/cancelled/paused. Blank = active.
  TRIAL_ENDS_AT:  'fldSmqa44VLPlRI9F', // Trial Ends At. dateTime, Europe/Brussels.
};
const FIELD_NAME = {
  STATUS:        'Plan Status',
  TRIAL_ENDS_AT: 'Trial Ends At',
};

const VALID_STATUSES   = new Set(['trial', 'active', 'expired', 'cancelled', 'paused']);
const STOPPED_STATUSES = new Set(['expired', 'cancelled', 'paused']); // AI must not answer while status is one of these
const TRIAL_LENGTH_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

// Logged at most once per cold start per distinct key, so a fleet of
// blank-status clients (the common case pre-rollout) doesn't spam
// production logs — same idea as _credits.js's own logOnce().
const _loggedOnce = new Set();
function logOnce(key, ...args) {
  if (_loggedOnce.has(key)) return;
  _loggedOnce.add(key);
  console.warn(...args);
}

function readField(fields, idKey, nameKey) {
  return fields[FIELD[idKey]] !== undefined ? fields[FIELD[idKey]] : fields[FIELD_NAME[nameKey]];
}

/*
 * getPlanState(clientFields) -> {
 *   status,           // effective status: 'trial' | 'active' | 'expired' | 'cancelled' | 'paused'
 *   rawStatus,        // exactly what's in Plan Status, normalized/lowercased ('' if blank)
 *   trialEndsAt,      // ISO string or null
 *   isExpired,        // true iff status === 'expired' (includes date-derived, pre-cron)
 *   isServiceStopped, // true iff status is expired/cancelled/paused — AI must not answer
 *   daysLeft,         // integer >=0 while status==='trial'; null otherwise
 * }
 *
 * Never throws for any input shape (including undefined/null `clientFields`).
 */
function getPlanState(clientFields) {
  const fields = clientFields || {};

  let rawStatusValue = readField(fields, 'STATUS', 'STATUS');
  // Defensive unwrap: some Airtable SDKs/return-shapes represent a
  // singleSelect as {id, name, color} rather than a plain string.
  if (rawStatusValue && typeof rawStatusValue === 'object') rawStatusValue = rawStatusValue.name;
  const rawStatus = String(rawStatusValue || '').trim().toLowerCase();

  const trialEndsRaw = readField(fields, 'TRIAL_ENDS_AT', 'TRIAL_ENDS_AT');
  const trialEndsMs  = trialEndsRaw ? Date.parse(trialEndsRaw) : NaN;
  const trialEndsAt  = isFinite(trialEndsMs) ? new Date(trialEndsMs).toISOString() : null;

  // Blank -> active (fail open, the entire point of this field's rollout)
  if (!rawStatus) {
    return { status: 'active', rawStatus: '', trialEndsAt, isExpired: false, isServiceStopped: false, daysLeft: null };
  }

  if (!VALID_STATUSES.has(rawStatus)) {
    logOnce(`badstatus:${rawStatus}`, `[Plan] Onbekende Plan Status "${rawStatus}" — fail-open naar 'active'. Controleer het Client Config record.`);
    return { status: 'active', rawStatus, trialEndsAt, isExpired: false, isServiceStopped: false, daysLeft: null };
  }

  if (rawStatus === 'trial') {
    if (!trialEndsAt) {
      logOnce('notrialend', '[Plan] Plan Status=trial maar Trial Ends At ontbreekt/is onparseerbaar — fail-open naar active.');
      return { status: 'active', rawStatus, trialEndsAt: null, isExpired: false, isServiceStopped: false, daysLeft: null };
    }
    const now = Date.now();
    if (now >= trialEndsMs) {
      // Date-derived expiry — effective immediately, even before the daily
      // cron flips the field. See file header.
      return { status: 'expired', rawStatus, trialEndsAt, isExpired: true, isServiceStopped: true, daysLeft: 0 };
    }
    const daysLeft = Math.max(0, Math.ceil((trialEndsMs - now) / DAY_MS));
    return { status: 'trial', rawStatus, trialEndsAt, isExpired: false, isServiceStopped: false, daysLeft };
  }

  // active / expired / cancelled / paused — trust the field as-is.
  return {
    status: rawStatus,
    rawStatus,
    trialEndsAt,
    isExpired: rawStatus === 'expired',
    isServiceStopped: STOPPED_STATUSES.has(rawStatus),
    daysLeft: null,
  };
}

// Onboarding helper: 14 days from `fromDate` (default now), as an ISO
// string. Epoch-math, timezone-agnostic — Airtable stores a true UTC
// instant and renders it in the field's configured display timezone
// (Europe/Brussels per TRIAL-DESIGN.md §6).
function computeTrialEndsAt(fromDate) {
  const from = fromDate instanceof Date && !isNaN(fromDate.getTime()) ? fromDate : new Date();
  return new Date(from.getTime() + TRIAL_LENGTH_DAYS * DAY_MS).toISOString();
}

// Trial start, derived from Trial Ends At. There's no separate "Trial
// Started At" field (TRIAL-DESIGN.md §6 only lists Trial Ends At) — the
// trial length is fixed at 14 days, so start = end - 14d. Used by
// api/cron-followup.js's day-7/day-11 touchpoints to compute elapsed days
// and by the cumulative "In N dagen: ..." report emails. Returns null if
// trialEndsAtIso is missing/invalid.
function computeTrialStartMs(trialEndsAtIso) {
  const endMs = trialEndsAtIso ? Date.parse(trialEndsAtIso) : NaN;
  if (!isFinite(endMs)) return null;
  return endMs - TRIAL_LENGTH_DAYS * DAY_MS;
}

module.exports = {
  FIELD,
  FIELD_NAME,
  VALID_STATUSES,
  STOPPED_STATUSES,
  TRIAL_LENGTH_DAYS,
  DAY_MS,
  getPlanState,
  computeTrialEndsAt,
  computeTrialStartMs,
};
