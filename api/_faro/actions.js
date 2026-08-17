'use strict';
/*
 * Faro — the confirmed-action executor.
 *
 * SCAFFOLD: the gate and its validation are real; the executors are stubs.
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
 * So on confirm we re-check: the action is known, the pending record exists,
 * it belongs to this tenant, it has not already run, and the ids in it still
 * resolve within this tenant. The user confirmed an intent, not a blob.
 *
 * ── Pending records ──────────────────────────────────────────────────────────
 * A proposal is stored server-side under an actionId; the client only ever
 * echoes that id plus the payload it was shown. Stored proposals expire —
 * a confirmation clicked an hour later should not fire against stale data.
 */

const TTL_MS = 30 * 60 * 1000; // 30 minutes

// In-memory pending store. NOTE: Vercel functions are stateless across cold
// starts, so this must move to the VPS (an `ai_pending_actions` table) before
// launch — a confirmation that lands on a different instance would otherwise
// fail with "unknown action". Kept in-memory here only to keep the scaffold
// runnable without a schema migration.
const pending = new Map();

function newActionId() {
  return `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Called by the orchestrator when an act-tool produced a confirmation card. */
function stage({ projectCode, userId, action, payload }) {
  const id = newActionId();
  pending.set(id, { id, projectCode, userId, action, payload, createdAt: Date.now(), executed: false });
  return id;
}

function reap() {
  const now = Date.now();
  for (const [id, rec] of pending) if (now - rec.createdAt > TTL_MS) pending.delete(id);
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
  reap();

  const rec = pending.get(actionId);
  if (!rec)                              throw new ActionError('Deze actie is verlopen. Vraag het opnieuw.', 'expired');
  if (rec.projectCode !== ctx.projectCode) throw new ActionError('Actie niet gevonden.', 'not_found');
  if (rec.executed)                      throw new ActionError('Deze actie is al uitgevoerd.', 'already_executed');

  const exec = EXECUTORS[rec.action];
  if (!exec) throw new ActionError('Onbekende actie.', 'unknown_action');

  // Mark before running: a double-click must not send two batches of messages.
  rec.executed = true;
  try {
    return await exec(rec.payload, ctx);
  } catch (err) {
    rec.executed = false; // a genuine failure should be retryable
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

module.exports = { stage, execute, ActionError, EXECUTORS, TTL_MS };
