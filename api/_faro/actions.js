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
const data = require('./data');       // lead lookup + the 24-hour window check
const waSend = require('../_wa-send'); // the single outbound WhatsApp door
const gcal = require('../_gcal');      // per-client Google Calendar
const credits = require('../_credits'); // creditpoort — zie de video-executor
const writes = require('./writes');   // de enige plek die CRM-rijen wijzigt

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
  /* ── CRM-schrijfacties ─────────────────────────────────────────────────────
     Alle vier delegeren naar api/_faro/writes.js, dat als enige plek de
     eigendom van de rij nog eens tegen de sessie controleert. Ze doen dat
     bewust nog eens hier ook niet: een tweede, iets andere controle op twee
     plekken is precies hoe er eentje achterblijft bij een wijziging.

     De payload is ondertekend, maar draagt alleen IDS -- geen veldnamen, geen
     tabel, geen tenant. Er zit dus niets in wat een schrijfactie ergens anders
     heen kan sturen. */
  async set_lead_status(payload, ctx) {
    const out = await writes.setLeadStatus({
      leadId: payload && payload.leadId,
      status: payload && payload.status,
      lossReason: payload && payload.lossReason,
    }, ctx);
    const labels = { new: 'Nieuw', in_progress: 'In behandeling', completed: 'Gewonnen', verloren: 'Verloren' };
    return {
      summary: `${out.naam || 'De lead'} staat nu op "${labels[out.status] || out.status}".`,
      components: [],
    };
  },

  async add_lead_note(payload, ctx) {
    const out = await writes.appendLeadNote({
      leadId: payload && payload.leadId,
      note:   payload && payload.note,
    }, ctx);
    return { summary: 'Notitie opgeslagen bij de lead.', components: [], data: { leadId: out.leadId } };
  },

  async delete_lead(payload, ctx) {
    const out = await writes.deleteLead({ leadId: payload && payload.leadId }, ctx);
    return { summary: `${out.naam || 'De lead'} is verwijderd.`, components: [] };
  },

  async update_ai_persona(payload, ctx) {
    const out = await writes.updatePersona(payload || {}, ctx);
    return {
      summary: `Aangepast: ${out.changed.join(', ')}. De WhatsApp-AI gebruikt dit vanaf het volgende gesprek.`,
      components: [],
    };
  },

  /* Send the follow-up the user approved.
   *
   * Three things are deliberately re-done here rather than trusted from the
   * payload, even though the payload is signed:
   *
   *   1. Phone numbers are re-resolved from the tenant's own rows. The token
   *      carries lead IDS only, so there is no field in it that could redirect
   *      a message to an arbitrary number.
   *   2. The 24-hour window is re-checked. It was open when the proposal was
   *      built; the user may have confirmed twenty-nine minutes later, and the
   *      window can close in between.
   *   3. Every lead is confirmed to belong to this tenant, because findLead
   *      only ever searches rows already scoped to ctx.projectCode.
   *
   * Sends are sequential, not Promise.all: a partial failure has to be
   * reportable per lead, and firing twenty-five parallel requests at Meta is
   * how an account earns a rate limit. */
  async create_followup(payload, ctx) {
    const message = String((payload && payload.message) || '').trim();
    const ids = Array.isArray(payload && payload.leadIds) ? payload.leadIds.slice(0, 25) : [];
    if (!message || !ids.length) throw new ActionError('Er is niets om te versturen.', 'empty');

    let leads;
    try {
      ({ leads } = await data.leadsFor({ projectCode: ctx.projectCode }));
    } catch (err) {
      throw new ActionError('Je CRM-gegevens zijn nu niet bereikbaar. Er is niets verstuurd.', 'data_unavailable');
    }

    const sent = [];
    const failed = [];
    for (const id of ids) {
      const lead = data.findLead(leads, { leadId: id });
      if (!lead || !lead.telefoon) { failed.push({ id, naam: (lead && lead.naam) || id, reason: 'geen telefoonnummer' }); continue; }

      const win = data.messagingWindow(lead);
      if (!win.open) { failed.push({ id, naam: lead.naam, reason: 'het 24-uursvenster sloot intussen' }); continue; }

      try {
        await waSend.sendFreeform({ to: lead.telefoon, text: message, windowOpen: true });
        sent.push(lead.naam || id);
      } catch (err) {
        failed.push({ id, naam: lead.naam, reason: err.message });
      }
    }

    // Every send failing is an error the user must see as one; a partial
    // success is reported as a success that names what did not go out.
    if (!sent.length) {
      throw new ActionError(
        `Niets verstuurd. ${failed.map((f) => `${f.naam}: ${f.reason}`).join('; ')}`,
        'all_failed',
      );
    }
    return {
      summary: `Verstuurd naar ${sent.join(', ')}.`
        + (failed.length ? ` Niet verstuurd: ${failed.map((f) => `${f.naam} (${f.reason})`).join('; ')}.` : ''),
      components: [],
    };
  },

  /* Create the agenda item the user approved.
   *
   * The connection is re-resolved rather than carried in the payload: an OAuth
   * access token has a lifetime measured in minutes and the proposal's is
   * thirty, so a token minted at proposal time would frequently be dead by the
   * time anyone clicked. Re-checking also means a client who disconnected
   * Calendar in between gets a clean refusal instead of a 401. */
  async schedule_followup(payload, ctx) {
    const startMs = Date.parse(payload && payload.startISO);
    if (!Number.isFinite(startMs)) throw new ActionError('Ongeldig tijdstip.', 'invalid_time');

    const access = await data.gcalAccessFor(ctx);
    if (!access) throw new ActionError('Google Agenda is niet gekoppeld.', 'not_connected');

    const durationMin = Math.max(15, Math.min(480, Number(payload.durationMin) || 60));
    // api/_gcal.js's eventBody() leest { startISO, durationMin } — niet
    // { start, end }. Met de oude sleutels kwam er `new Date(undefined)` uit en
    // gooide toISOString() "Invalid time value", die createEvent's try/catch
    // netjes omzette in { ok: false }. Resultaat: wie deze actie bevestigde
    // kreeg ALTIJD "Het agenda-item kon niet aangemaakt worden" — de actie had
    // nog nooit kunnen slagen. api/leads.js gebruikt dezelfde functie wél met
    // de juiste vorm, wat het verschil onzichtbaar hield.
    const out = await gcal.createEvent(access.token, access.calId, {
      summary: String(payload.title || 'Opvolging').slice(0, 200),
      description: String(payload.note || '').slice(0, 2000),
      startISO: new Date(startMs).toISOString(),
      durationMin,
    });
    if (!out || !out.ok) {
      console.error('[faro/actions] createEvent failed:', out && out.error);
      throw new ActionError('Het agenda-item kon niet aangemaakt worden.', 'calendar_failed');
    }
    return { summary: `Ingepland: ${payload.title || 'Opvolging'}.`, components: [] };
  },

  /* Een bestaand agenda-item verzetten of afzeggen.
     eventId komt uit data.calendarEvents(), dus uit de agenda die aan DEZE
     tenant hangt: gcalAccessFor(ctx) levert het token van deze klant en Google
     weigert een id dat niet in die agenda staat. Er is dus geen pad waarlangs
     dit item van iemand anders kan zijn. */
  async move_appointment(payload, ctx) {
    const startMs = Date.parse(payload && payload.startISO);
    if (!Number.isFinite(startMs)) throw new ActionError('Ongeldig tijdstip.', 'invalid_time');
    const access = await data.gcalAccessFor(ctx);
    if (!access) throw new ActionError('Google Agenda is niet gekoppeld.', 'not_connected');

    const durationMin = Math.max(15, Math.min(480, Number(payload.durationMin) || 60));
    const out = await gcal.updateEvent(access.token, access.calId, payload.eventId, {
      startISO: new Date(startMs).toISOString(),
      durationMin,
    });
    if (!out || !out.ok) {
      console.error('[faro/actions] updateEvent failed:', out && out.error);
      throw new ActionError('Het agenda-item kon niet verzet worden.', 'calendar_failed');
    }
    return { summary: 'Afspraak verzet.', components: [] };
  },

  async cancel_appointment(payload, ctx) {
    const access = await data.gcalAccessFor(ctx);
    if (!access) throw new ActionError('Google Agenda is niet gekoppeld.', 'not_connected');
    const out = await gcal.deleteEvent(access.token, access.calId, payload && payload.eventId);
    if (!out || !out.ok) {
      console.error('[faro/actions] deleteEvent failed:', out && out.error);
      throw new ActionError('De afspraak kon niet afgezegd worden.', 'calendar_failed');
    }
    /* Bewust expliciet: Google zegt niets tegen de lead. Wie denkt dat
       afzeggen ook afmeldt, laat iemand voor een dichte deur staan. */
    return {
      summary: 'Afspraak uit je agenda gehaald. Let op: de lead heeft hier GEEN bericht over gekregen '
             + '- zeg dat erbij en bied aan om hem een bericht te sturen.',
      components: [],
    };
  },

  // WIRE TO: Marketing Posts / campaign records via api/_pgapi.js.
  async create_campaign(_payload, _ctx) {
    throw new ActionError('Campagnes zijn nog niet aangesloten.', 'not_wired');
  },

  async add_leads_to_campaign(_payload, _ctx) {
    throw new ActionError('Campagnes zijn nog niet aangesloten.', 'not_wired');
  },

  /* generate_property_image staat hier BEWUST NIET.
     Beeld loopt niet via de bevestigingspoort: de tool in ./tools.js roept
     api/_images.js binnen dezelfde beurt aan en levert de foto meteen terug.
     Dat mag, want een beeldbewerking gaat nergens naartoe -- er wordt niets
     verstuurd, niets geboekt en niets aangemaakt bij een derde. De poort is er
     voor uitgaande daden.

     Hier stond een executor die 'nog niet aangesloten' riep. Die was
     onbereikbaar (geen enkele tool zet een bevestigingskaart voor deze actie
     klaar) en las als een kapotte functie terwijl de functie gewoon werkt. */

  // WIRE TO: api/_faro/media.js (de videoprovider bestaat nog niet in deze repo).
  //
  // De creditpoort staat hier AL, vóór de not_wired. Dat is bewust: video is
  // verreweg de duurste actie in dit product — één filmpje van acht seconden
  // kost meer dan zeven leadgesprekken — en een poort die pas ná het aansluiten
  // wordt bedacht, wordt vergeten. Wie de provider aansluit, vervangt alleen de
  // laatste regel en heeft de rem dan automatisch al staan.
  //
  // Controleren kost niets en schrijft niets af; afschrijven gebeurt pas NA een
  // geslaagde generatie, met credits.creditsForVideo() voor het echte aantal.
  async generate_property_video(payload, ctx) {
    const kosten = credits.creditsForVideo({
      seconds: payload && payload.seconds,
      size: payload && payload.size,
    });
    const check = await credits.checkCredits(ctx.projectCode, credits.FEATURES.VIDEO_GENERATION);
    if (!check.allowed) {
      throw new ActionError(
        check.message || `Hier is geen ruimte meer voor: een video kost ${kosten} credits.`,
        'credit_limit_reached');
    }
    throw new ActionError('Videogeneratie is nog niet aangesloten.', 'not_wired');
  },
};

module.exports = { stage, execute, openAction, ActionError, EXECUTORS, TTL_MS };
