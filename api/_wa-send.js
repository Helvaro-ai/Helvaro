'use strict';
/*
 * Outbound WhatsApp — the one place a message leaves this codebase.
 *
 * api/whatsapp.js has always had its own private sendWA(); this module is the
 * same call, reachable by other code, plus the two checks that decide whether a
 * send is even permitted. It exists because Faro can now send a follow-up a
 * user approved, and an AI-triggered send must go through exactly the same door
 * as any other — with the door made explicit rather than implied.
 *
 * ── The 24-hour window is not a courtesy ─────────────────────────────────────
 * Meta permits a free-form message only within 24 hours of the customer's own
 * last message. Outside it the API rejects the send, and only an approved
 * template may be used. So "is the window open" is not a policy question laid
 * over a working feature — it decides whether the feature works at all. The
 * caller must check it (api/_faro/data.js messagingWindow()) and this module
 * refuses to guess: sendFreeform() takes an explicit `windowOpen` and throws if
 * it is not true.
 *
 * ── Per-client sender number ─────────────────────────────────────────────────
 * A client who completed WhatsApp Embedded Signup sends from their own number;
 * everyone else falls back to the shared PHONE_NUMBER_ID. Same fallback
 * api/whatsapp.js uses, so a message from Faro comes from the same number the
 * lead has been talking to all along.
 */

const _waOpmaak = require('./_wa-opmaak');

const GRAPH_VERSION = 'v19.0';

class SendError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SendError';
    this.code = code || 'send_failed';
  }
}

function creds(phoneNumberId) {
  const token = process.env.WHATSAPP_TOKEN || '';
  const pnid = phoneNumberId || process.env.PHONE_NUMBER_ID || '';
  if (!token || !pnid) throw new SendError('WhatsApp is niet geconfigureerd.', 'unconfigured');
  return { token, pnid };
}

/**
 * Normalise a phone number to what the Graph API expects: digits only, no
 * plus, no spaces, no parentheses. A number that does not survive this is
 * refused rather than sent to Meta to be rejected with a less useful error.
 */
function normalizePhone(raw) {
  const digits = String(raw == null ? '' : raw).replace(/[^0-9]/g, '');
  if (digits.length < 8 || digits.length > 15) {
    throw new SendError('Ongeldig telefoonnummer.', 'invalid_phone');
  }
  return digits;
}

async function post(pnid, token, payload) {
  let res;
  try {
    res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pnid}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[wa-send] network error:', err.message);
    throw new SendError('WhatsApp was niet bereikbaar. Probeer het opnieuw.', 'network');
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || (body && body.error)) {
    const detail = (body && body.error && (body.error.message || body.error.type)) || `HTTP ${res.status}`;
    // Loud in the logs, generic to the user: the upstream message can echo
    // request content and names the internal number.
    console.error('[wa-send] rejected:', res.status, String(detail).slice(0, 300));
    // 131047 is Meta's "message outside the 24-hour window". Worth its own code
    // because it means the caller's window check and Meta's disagree, which is
    // a real bug rather than a transient failure.
    const metaCode = body && body.error && body.error.code;
    if (metaCode === 131047) throw new SendError('Het 24-uursvenster is gesloten.', 'window_closed');
    throw new SendError('Het bericht kon niet verstuurd worden.', 'rejected');
  }

  const id = body && body.messages && body.messages[0] && body.messages[0].id;
  return { ok: true, messageId: id || null };
}

/**
 * A free-form text message. ONLY valid inside the 24-hour window.
 *
 * @param {object} args
 * @param {string} args.to             recipient phone
 * @param {string} args.text           message body
 * @param {boolean} args.windowOpen    caller's window check — must be true
 * @param {string} [args.phoneNumberId] per-client sender
 */
/* ── De afmeldrem ────────────────────────────────────────────────────────────
 * Zelfde contract als `windowOpen` hierboven, en om dezelfde reden expliciet:
 * deze module haalt geen leadrecords op, dus de aanroeper geeft mee of deze
 * lead afgemeld is. Het verschil is dat dit veld NIET verplicht is -- laat je
 * hem weg, dan gedraagt alles zich als vroeger. Dat is bewust, want anders
 * breekt elke bestaande aanroeper in één keer.
 *
 * Wie hem wél meegeeft en `true` zet, krijgt een weigering in plaats van een
 * verzending. Dat is de enige plek waar het echt telt: hier gaat het bericht
 * de deur uit. */
function weigerBijAfmelding(optedOut, soort) {
  if (optedOut === true) {
    throw new SendError(
      `Deze lead heeft zich afgemeld; er wordt geen ${soort} meer verstuurd.`,
      'opted_out',
    );
  }
}

async function sendFreeform({ to, text, windowOpen, phoneNumberId, optedOut }) {
  weigerBijAfmelding(optedOut, 'bericht');
  // Deliberately not defaulted and not inferred. A caller that forgets to check
  // gets a refusal here rather than an accidental send attempt — and the check
  // needs the lead's history, which this module has no business fetching.
  if (windowOpen !== true) {
    throw new SendError(
      'Buiten het 24-uursvenster mag alleen een goedgekeurde template verstuurd worden.',
      'window_closed',
    );
  }
  /* Zelfde opmaakregels als de gewone AI-antwoorden: een lead hoort niet te
     kunnen zien welke route een bericht genomen heeft. Alleen de OPMAAK wordt
     gedeeld, niet het afkappen -- zie de lengtecontrole hieronder, die hier
     bewust weigert in plaats van stilletjes in te korten. */
  const body = _waOpmaak.naarWhatsAppOpmaak(text).trim();
  if (!body) throw new SendError('Leeg bericht.', 'empty');
  // WhatsApp's own body limit is 4096; truncating silently would send a message
  // ending mid-sentence to a customer, so this refuses instead.
  if (body.length > 4096) throw new SendError('Bericht te lang (max 4096 tekens).', 'too_long');

  const { token, pnid } = creds(phoneNumberId);
  return post(pnid, token, {
    messaging_product: 'whatsapp',
    to: normalizePhone(to),
    type: 'text',
    text: { body },
  });
}

/**
 * An approved template. The only thing permitted outside the window.
 * Kept here so a future "send anyway, as a template" path has somewhere to
 * live that is already the single outbound door.
 */
async function sendTemplate({ to, template, lang = 'nl', params = [], phoneNumberId, optedOut }) {
  weigerBijAfmelding(optedOut, 'template');
  if (!template) throw new SendError('Geen template opgegeven.', 'no_template');
  const { token, pnid } = creds(phoneNumberId);
  const components = params.length
    ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p) })) }]
    : [];
  return post(pnid, token, {
    messaging_product: 'whatsapp',
    to: normalizePhone(to),
    type: 'template',
    template: { name: template, language: { code: lang }, components },
  });
}

module.exports = { sendFreeform, sendTemplate, normalizePhone, SendError, GRAPH_VERSION, weigerBijAfmelding };
