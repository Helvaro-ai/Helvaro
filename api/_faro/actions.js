'use strict';
/*
 * Faro — the confirmed-action executor.
 *
 * The gate, its signing and its validation are real. The three executors that
 * reach a customer are still deliberately unwired — each carries a note saying
 * exactly what it needs.
 *
 * ── This module is the only place an act-tool actually happens ───────────────
 * api/_faro/tools.js act-tools BUILD proposals and stop. This file EXECUTES them,
 * and only when handed a confirmation the user clicked. The separation is the
 * point: the orchestrator has no execute path, so no amount of model output —
 * or prompt injection arriving through a lead's WhatsApp message that ends up
 * in a get_conversation result — can cause a message to be sent, a campaign to
 * be created or an agenda item to appear.
 *
 * ── Why the payload is re-validated after the round trip ─────────────────────
 * The confirmation payload travels to the browser and back. Trusting what comes
 * back would mean a modified payload could act on lead ids the user never saw.
 * So on confirm we re-check: the signature holds, the action is known, it
 * belongs to this tenant AND this user, it has not already run, and it has not
 * expired. The user confirmed an intent, not a blob.
 *
 * ── Proposals are signed, not stored ─────────────────────────────────────────
 * This was an in-memory Map, with a comment admitting it had to move before
 * launch. It could not work on Vercel: staging happens on whichever instance
 * served the chat turn, the confirmation arrives on whichever instance is warm
 * a few seconds later, and any time those differ the user is told "deze actie
 * is verlopen" about an action they are looking at. Not an edge case — the
 * normal case under any concurrency.
 *
 * So the actionId IS the proposal: a base64url body plus an HMAC over it, keyed
 * from SESSION_SECRET. It carries the tenant, the user, the action, its
 * arguments and an expiry. Nothing is stored, so nothing can be lost, and no
 * schema migration is needed to launch.
 *
 * Three properties it has to have, and does:
 *   - Unforgeable. The MAC covers every field, and the compare is timing-safe.
 *     A client that edits the lead ids in the payload invalidates it.
 *   - Bound to who staged it. projectCode AND userId are inside the MAC and are
 *     re-checked against the live session, so a colleague sharing the account
 *     cannot fire someone else's pending send by holding its id.
 *   - Expiring. `exp` is inside the MAC, so a confirmation clicked an hour later
 *     is refused rather than fired against stale data.
 *
 * What it does NOT have is server-side single-use. A stateless token can be
 * replayed inside its 30-minute window by whoever holds it — which is the user
 * who just confirmed it, in their own browser, for their own tenant. The
 * in-process `spent` set catches the ordinary double-click; the honest ceiling
 * is "a user can deliberately re-fire their own action for half an hour", and
 * any executor for which that is not acceptable has to carry its own
 * idempotency key.
 */

const crypto = require('crypto');

const TTL_MS = 30 * 60 * 1000; // 30 minutes

/* The signing key. SESSION_SECRET already authenticates this product's own
   sessions, so a proposal ends up exactly as forgeable as a login is. Absent,
   this module refuses to stage rather than falling back to something
   guessable — an unsigned proposal authorises a real-world side effect. */
function signingKey() {
  const secret = process.env.SESSION_SECRET || '';
  if (!secret) throw new ActionError('Bevestigingen zijn niet geconfigureerd.', 'unconfigured');
  return crypto.createHash('sha256').update('faro-action:' + secret).digest();
}

function b64u(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(str) {
  return Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function sign(bodyB64) {
  return b64u(crypto.createHmac('sha256', signingKey()).update(bodyB64).digest());
}

/* Ordinary double-click protection, best-effort by construction (see header).
   Bounded so a long-lived instance cannot grow it without limit. */
const spent = new Map();
function markSpent(id) {
  spent.set(id, Date.now());
  if (spent.size > 500) {
    const cutoff = Date.now() - TTL_MS;
    for (const [k, t] of spent) if (t < cutoff) spent.delete(k);
    while (spent.size > 500) spent.delete(spent.keys().next().value);
  }
}

/** Called by the orchestrator when an act-tool produced a confirmation card. */
function stage({ projectCode, userId, action, payload }) {
  const body = {
    v: 1,
    p: projectCode,
    u: userId,
    a: action,
    d: payload,
    exp: Date.now() + TTL_MS,
    // A nonce, so two identical proposals in one turn are still distinguishable
    // — which is what lets the spent-id check tell a double-click apart from a
    // deliberate second request.
    n: crypto.randomBytes(9).toString('hex'),
  };
  const bodyB64 = b64u(JSON.stringify(body));
  return `act_${bodyB64}.${sign(bodyB64)}`;
}

/** Verify and unpack an actionId. Throws ActionError; never returns junk. */
function openAction(actionId) {
  const raw = String(actionId || '');
  if (raw.indexOf('act_') !== 0) throw new ActionError('Actie niet gevonden.', 'not_found');
  const [bodyB64, mac] = raw.slice(4).split('.');
  if (!bodyB64 || !mac) throw new ActionError('Actie niet gevonden.', 'not_found');

  const a = Buffer.from(mac);
  const b = Buffer.from(sign(bodyB64));
  // Length first: timingSafeEqual THROWS on a length mismatch, and that throw
  // would surface as a 500 instead of a clean refusal.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new ActionError('Actie niet gevonden.', 'not_found');
  }

  let body;
  try { body = JSON.parse(unb64u(bodyB64).toString('utf8')); }
  catch (_) { throw new ActionError('Actie niet gevonden.', 'not_found'); }

  if (!body || body.v !== 1) throw new ActionError('Actie niet gevonden.', 'not_found');
  if (!(Number(body.exp) > Date.now())) {
    throw new ActionError('Deze actie is verlopen. Vraag het opnieuw.', 'expired');
  }
  return body;
}

class ActionError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ActionError';
    this.code = code || 'action_error';
  }
}

/**
 * Execute a user-confirmed action.
 *
 * @param {object} args
 * @param {string} args.actionId    id from the confirmation component
 * @param {object} args.ctx         { projectCode, userId, lang } — from the SESSION
 * @returns {Promise<{ summary:string, components:Array }>}
 */
async function execute({ actionId, ctx }) {
  const rec = openAction(actionId);

  // Identity comes from the live session on both sides: the token says who
  // staged it, ctx says who is confirming, and they must be the same person in
  // the same tenant. A valid signature alone is not authorisation.
  if (rec.p !== ctx.projectCode) throw new ActionError('Actie niet gevonden.', 'not_found');
  if (rec.u !== ctx.userId) throw new ActionError('Actie niet gevonden.', 'not_found');
  if (spent.has(actionId)) throw new ActionError('Deze actie is al uitgevoerd.', 'already_executed');

  const exec = EXECUTORS[rec.a];
  if (!exec) throw new ActionError('Onbekende actie.', 'unknown_action');

  // Marked before running: a double-click must not send two batches of
  // messages. Un-marked on a genuine failure, so a retry is possible.
  markSpent(actionId);
  try {
    return await exec(rec.d, ctx);
  } catch (err) {
    spent.delete(actionId);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Executors. Each one wires to code that ALREADY EXISTS in this repo — none of
// these should grow their own sending/booking/storage logic.
// ─────────────────────────────────────────────────────────────────────────────

const EXECUTORS = {
  // WIRE TO: the WhatsApp send path in api/whatsapp.js.
  // Must respect the same opt-out, quiet-hours and credit checks as any other
  // outbound message — an AI-triggered send is not a privileged send.
  async create_followup(_payload, _ctx) {
    throw new ActionError('Versturen is nog niet geactiveerd.', 'not_wired');
  },

  // WIRE TO: api/_gcal.js event creation.
  async schedule_followup(_payload, _ctx) {
    throw new ActionError('Agenda-integratie is nog niet aangesloten.', 'not_wired');
  },

  // WIRE TO: Marketing Posts / campaign records via api/_pgapi.js.
  async create_campaign(_payload, _ctx) {
    throw new ActionError('Campagnes zijn nog niet aangesloten.', 'not_wired');
  },

  async add_leads_to_campaign(_payload, _ctx) {
    throw new ActionError('Campagnes zijn nog niet aangesloten.', 'not_wired');
  },

  // WIRE TO: api/_images.js generate path (already handles credits + storage).
  async generate_property_image(_payload, _ctx) {
    throw new ActionError('Beeldgeneratie is nog niet aangesloten.', 'not_wired');
  },

  // WIRE TO: api/_faro/media.js (video provider does not exist in this repo yet).
  async generate_property_video(_payload, _ctx) {
    throw new ActionError('Videogeneratie is nog niet aangesloten.', 'not_wired');
  },
};

module.exports = { stage, execute, openAction, ActionError, EXECUTORS, TTL_MS };
