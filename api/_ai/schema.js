'use strict';
/*
 * Helvaro AI — response component contract.
 *
 * SCAFFOLD: complete and usable. These are plain builders, no I/O, so this
 * file is finished rather than stubbed.
 *
 * ── What this file is for ────────────────────────────────────────────────────
 * Requirement 7: "AI responses should support rich components instead of only
 * text" — "I found 8 leads worth contacting today" followed by actual lead
 * cards with working buttons.
 *
 * The naive way to get that is to have the model emit HTML or markdown tables.
 * That is rejected here for three reasons:
 *   1. Model-authored HTML injected into the dashboard is an XSS hole with a
 *      language model on the wrong side of it.
 *   2. Buttons need to call real dashboard functions (openPanel, navigateTo).
 *      Generated markup cannot be trusted to reference real record ids.
 *   3. Layout would drift every turn; a premium product needs cards that look
 *      identical every time.
 *
 * So: the model never describes the UI. TOOLS emit typed component objects
 * from this file, the client renders each type with fixed, hand-built markup,
 * and every id in a component came from our own database read — not from the
 * model's output. Model text and UI components travel in the same response but
 * never in the same channel.
 *
 * ── Contract ─────────────────────────────────────────────────────────────────
 * Every component is { type, ...fields }. The client switches on `type` and
 * renders an unknown type as nothing (forward compatibility: an older client
 * meeting a newer component degrades silently instead of breaking the turn).
 */

/**
 * A lead card — requirement 7's worked example.
 * Buttons map to existing dashboard behaviour: openPanel(lead), the WhatsApp
 * conversation view, and the lead detail panel.
 */
function leadCard({ id, name, budget, timeframe, channel, status, note }) {
  return {
    type: 'lead_card',
    id,
    name,
    budget,      // formatted server-side, e.g. '€350.000'
    timeframe,   // e.g. 'Aankoop binnen 1–3 maanden'
    channel,     // 'whatsapp' | 'form' | 'phone' | 'email'
    status,      // 'qualified' | 'new' | ...
    note,
    actions: [
      { key: 'open',    label: 'Lead openen'      },
      { key: 'contact', label: 'Contacteren'      },
      { key: 'thread',  label: 'Gesprek bekijken' },
    ],
  };
}

function propertyCard({ id, title, address, price, imageUrl, specs }) {
  return { type: 'property_card', id, title, address, price, imageUrl, specs: specs || [] };
}

/** A row of headline numbers — pipeline totals, period performance. */
function statGroup({ title, stats }) {
  // stats: [{ label, value, delta, tone: 'up'|'down'|'flat' }]
  return { type: 'stat_group', title, stats };
}

/**
 * The confirmation gate for every act-tool.
 * `payload` is echoed back verbatim when the user confirms; the executor
 * re-validates it rather than trusting the round trip.
 */
function confirmation({ action, title, body, confirmLabel, payload }) {
  return {
    type: 'confirmation',
    action,
    title,
    body,
    confirmLabel: confirmLabel || 'Bevestigen',
    cancelLabel: 'Annuleren',
    payload,
  };
}

/** An editable draft — listing copy, a follow-up message. */
function draft({ id, title, body, meta }) {
  return { type: 'draft', id, title, body, meta: meta || {} };
}

/**
 * An async media job. Image and video generation are far too slow for a
 * request/response cycle, so the component renders a placeholder that the
 * client polls until state flips to 'ready'.
 */
function mediaJob({ jobId, kind, state, previewUrl, resultUrl, meta }) {
  return {
    type: 'media_job',
    jobId,
    kind,        // 'image' | 'video'
    state,       // 'queued' | 'running' | 'ready' | 'failed'
    previewUrl: previewUrl || null,
    resultUrl: resultUrl || null,
    meta: meta || {},
    actions: kind === 'video'
      ? [
          { key: 'preview',  label: 'Bekijken'         },
          { key: 'save',     label: 'Bij pand opslaan' },
          { key: 'download', label: 'Downloaden'       },
          { key: 'variation',label: 'Variatie maken'   },
        ]
      : [
          { key: 'save',     label: 'Bij pand opslaan' },
          { key: 'edit',     label: 'Bewerken'         },
          { key: 'variation',label: 'Variatie maken'   },
          { key: 'download', label: 'Downloaden'       },
        ],
  };
}

/** A recoverable failure rendered inline, with Retry (requirement 15). */
function errorCard({ message, retryable, code }) {
  return { type: 'error', message, retryable: Boolean(retryable), code: code || 'error' };
}

module.exports = {
  leadCard,
  propertyCard,
  statGroup,
  confirmation,
  draft,
  mediaJob,
  errorCard,
};
