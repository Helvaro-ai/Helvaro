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
const schema = require('./schema');   // de kaartjes die de client tekent
const afspraken = require('../_afspraken'); // afzeggen/verzetten: rij + agenda + leadvlaggen
const campagnes = require('../_campagnes');  // campagnes: opslag en selectie

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
  /* Het aanbod uitbreiden. De payload draagt de VERTICAL mee die bij het
     voorstellen is bepaald uit het klantrecord -- niet iets wat het model
     koos. Een makelaar kan hier dus geen voertuig mee aanmaken, ook niet als
     het gesprek daarheen praat. */
  async add_listing(payload, ctx) {
    const uit = await writes.saveAanbod({
      vertical: payload && payload.vertical,
      velden:   payload && payload.velden,
    }, ctx);

    let staart = '';
    /* Meteen kijken wie hierop wachtte. Dit is het verschil tussen een
       functie die bestaat en een functie die gebruikt wordt: een dealer die
       zelf moet bedenken dat hij "wie zocht dit?" kan vragen, vraagt het
       nooit. Het moment waarop het ertoe doet is precies nu -- de auto staat
       er net.

       Best-effort en nooit blokkerend. Het voertuig IS toegevoegd; als het
       zoeken hapert hoort dat de bevestiging niet te bederven. */
    if (uit.soort === 'voertuig') {
      try {
        const wens = require('../_wens');
        const data = require('./data');
        const { leads } = await data.leadsFor(ctx);
        const treffers = wens.matchLeads(leads, uit.record, { minScore: 60, max: 5 });
        if (treffers.length) {
          const namen = treffers.map((t) => (t.naam || 'een lead') + ' (' + t.score + '%)').join(', ');
          staart = ' ' + (treffers.length === 1 ? 'Eén eerdere koper zocht' : treffers.length + ' eerdere kopers zochten')
            + ' precies dit: ' + namen + '. Wil je dat ik ze aanschrijf?';
        }
      } catch (e) {
        console.warn('[add_listing] matches zoeken mislukt:', e && e.message);
      }
    }

    return {
      summary: uit.naam + ' staat nu in je ' + (uit.soort === 'voertuig' ? 'voorraad' : 'aanbod')
        + ' onder referentie ' + uit.code + '.' + staart,
      components: [],
      data: { code: uit.code, soort: uit.soort },
    };
  },

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
  /* ── Verzetten en afzeggen ──────────────────────────────────────────────────
     Deze twee raakten alleen Google aan. Dat leek te werken -- het item was uit
     de agenda -- maar de rij in Appointments bleef op 'booked' staan, en dat is
     precies het veld waar de herinneringscron op filtert. Gevolg: de lead kreeg
     24 uur van tevoren nog netjes een herinnering voor een afspraak die al
     afgezegd was, en stond voor een dichte deur.

     Allebei lopen nu via api/_afspraken.js, dat de rij, het agenda-item én de
     twee vlaggen op de lead in één keer bijwerkt. Faro werkt met het GOOGLE-id
     (dat is wat de makelaar op zijn scherm ziet), dus dat wordt eerst vertaald
     naar onze eigen rij. Vinden we die niet, dan is het een item dat de
     makelaar zelf in zijn agenda zette -- geen Helvaro-afspraak, en dan is
     alleen Google inderdaad alles. */
  async move_appointment(payload, ctx) {
    const startMs = Date.parse(payload && payload.startISO);
    if (!Number.isFinite(startMs)) throw new ActionError('Ongeldig tijdstip.', 'invalid_time');
    const durationMin = Math.max(15, Math.min(480, Number(payload.durationMin) || 60));
    const startISO = new Date(startMs).toISOString();

    const eigen = await afspraken.zoekOpEvent(ctx.projectCode, payload && payload.eventId);
    if (eigen) {
      const uit = await afspraken.verzet({ projectCode: ctx.projectCode, record: eigen, startISO, durationMin });
      if (!uit.ok) {
        console.error('[faro/actions] verzetten mislukt:', uit.reden);
        throw new ActionError('Het agenda-item kon niet verzet worden.', 'calendar_failed');
      }
      return {
        summary: 'Afspraak verzet, ook in de agenda. De lead heeft hier nog GEEN bericht over gekregen '
               + '- de automatische herinnering gaat wel over de nieuwe tijd.',
        components: [],
      };
    }

    const access = await data.gcalAccessFor(ctx);
    if (!access) throw new ActionError('Google Agenda is niet gekoppeld.', 'not_connected');
    const out = await gcal.updateEvent(access.token, access.calId, payload.eventId, { startISO, durationMin });
    if (!out || !out.ok) {
      console.error('[faro/actions] updateEvent failed:', out && out.error);
      throw new ActionError('Het agenda-item kon niet verzet worden.', 'calendar_failed');
    }
    return { summary: 'Agenda-item verzet.', components: [] };
  },

  async cancel_appointment(payload, ctx) {
    const eigen = await afspraken.zoekOpEvent(ctx.projectCode, payload && payload.eventId);
    if (eigen) {
      const uit = await afspraken.annuleer({ projectCode: ctx.projectCode, record: eigen, door: 'makelaar' });
      if (!uit.ok) {
        console.error('[faro/actions] afzeggen mislukt:', uit.reden);
        throw new ActionError('De afspraak kon niet afgezegd worden.', 'calendar_failed');
      }
      /* Bewust expliciet: er gaat niets naar de lead. Wie denkt dat afzeggen
         ook afmeldt, laat iemand voor een dichte deur staan. */
      return {
        summary: 'Afgezegd: uit de agenda, de afspraak staat op geannuleerd en het moment is weer vrij. '
               + 'De lead heeft hier GEEN bericht over gekregen - zeg dat erbij en bied aan om hem er een te sturen.',
        components: [],
      };
    }

    const access = await data.gcalAccessFor(ctx);
    if (!access) throw new ActionError('Google Agenda is niet gekoppeld.', 'not_connected');
    const out = await gcal.deleteEvent(access.token, access.calId, payload && payload.eventId);
    if (!out || !out.ok) {
      console.error('[faro/actions] deleteEvent failed:', out && out.error);
      throw new ActionError('De afspraak kon niet afgezegd worden.', 'calendar_failed');
    }
    return {
      summary: 'Agenda-item weggehaald. Dit was geen Helvaro-afspraak, dus er is geen lead die hierop wacht.',
      components: [],
    };
  },

  /* ── Campagnes ──────────────────────────────────────────────────────────────
     Aanmaken en samenstellen werkt; VERSTUREN nog niet, en dat is geen
     halfheid maar de eerlijke grens: een campagnebericht valt vrijwel altijd
     buiten het 24-uursvenster -- dat is nu juist waarom je een campagne doet --
     en dan staat Meta alleen een goedgekeurde template toe. Die goedkeuring
     ligt niet in deze codebase.

     Wat hier wel gebeurt en meteen waarde heeft: de selectie wordt gemaakt,
     afgemelde leads gaan er automatisch uit, en de campagne staat klaar. Zie
     de kop van api/_campagnes.js. */
  async create_campaign(payload, ctx) {
    const uit = await campagnes.maak({
      projectCode: ctx.projectCode,
      /* De tool stuurt `name` (Engels, zoals de rest van zijn parameters).
         `naam` blijft erbij staan omdat een bevestiging die vóór deze wijziging
         is klaargezet nog in een openstaand gesprek kan hangen -- die payload
         komt straks alsnog binnen en mag zijn naam niet verliezen. */
      naam:       (payload && (payload.name || payload.naam))
                  || (payload && payload.propertyId ? `Campagne ${payload.propertyId}` : ''),
      pandCode:    payload && payload.propertyId,
      kanalen:     payload && payload.channels,
      invalshoek:  payload && payload.angle,
      bericht:     payload && payload.message,
      leadIds:     payload && payload.leadIds,
    }).catch((err) => {
      if (err && err.code === 'tabel_ontbreekt') {
        throw new ActionError(
          'Campagnes staan nog niet aan voor deze omgeving: de tabel "campaigns" moet nog aangemaakt worden in Airtable.',
          'not_wired');
      }
      throw new ActionError((err && err.message) || 'De campagne kon niet aangemaakt worden.', 'campagne_mislukt');
    });

    /* Wat er is weggelaten hoort in het antwoord, niet alleen in een veld dat
       niemand leest. Een makelaar die 50 leads koos en er 47 ziet, hoort te
       weten waarom -- anders lijkt het een fout. */
    const weg = [];
    if (uit.afgemeld)     weg.push(`${uit.afgemeld} afgemeld`);
    if (uit.nietGevonden) weg.push(`${uit.nietGevonden} niet gevonden in dit account`);

    return {
      summary: `Campagne "${uit.naam}" aangemaakt met ${uit.aantalLeads} lead(s)`
        + (weg.length ? ` (${weg.join(', ')} overgeslagen)` : '')
        + '. Er is nog NIETS verstuurd: daarvoor is een goedgekeurde WhatsApp-template nodig.',
      components: [],
      data: { campagneId: uit.id, aantalLeads: uit.aantalLeads },
    };
  },

  async add_leads_to_campaign(payload, ctx) {
    const uit = await campagnes.voegLeadsToe({
      projectCode: ctx.projectCode,
      campagneId:  payload && payload.campaignId,
      leadIds:     payload && payload.leadIds,
    }).catch((err) => {
      if (err && err.code === 'tabel_ontbreekt') {
        throw new ActionError('Campagnes staan nog niet aan voor deze omgeving.', 'not_wired');
      }
      throw new ActionError((err && err.message) || 'De leads konden niet toegevoegd worden.', 'campagne_mislukt');
    });

    const weg = [];
    if (uit.alAanwezig)   weg.push(`${uit.alAanwezig} stond er al in`);
    if (uit.afgemeld)     weg.push(`${uit.afgemeld} afgemeld`);
    if (uit.nietGevonden) weg.push(`${uit.nietGevonden} niet gevonden`);

    return {
      summary: `${uit.toegevoegd} lead(s) toegevoegd`
        + (weg.length ? ` (${weg.join(', ')})` : '')
        + `. De campagne telt nu ${uit.totaal} lead(s).`,
      components: [],
      data: { campagneId: uit.id, totaal: uit.totaal },
    };
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

  /*
   * Video. Verreweg de duurste actie in dit product: één filmpje van acht
   * seconden kost meer dan zeven leadgesprekken.
   *
   * Daarom staat de creditpoort vóór alles, en op TWEE dingen:
   *   - mag deze klant nog iets verbruiken (checkCredits), en
   *   - is er genoeg over voor DIT specifieke filmpje.
   * Alleen het eerste controleren liet een klant met 40 credits een video van
   * 240 starten; die was al besteld voordat iemand het merkte.
   *
   * Afschrijven gebeurt hier NIET. Dat gebeurt in media.getJob(), op de eerste
   * poll die 'ready' ziet -- zodat een video die bij de leverancier mislukt
   * niets kost. Zie de opmerking daar.
   */
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
    /* Infinity komt uit een creditsysteem dat bewust open faalt (geen
       Airtable, of een lookup die hapert). Dan niet blokkeren -- dat is daar
       een weloverwogen keuze -- maar een eindig tekort wél tegenhouden. */
    if (Number.isFinite(check.remaining) && check.remaining < kosten) {
      throw new ActionError(
        `Een video van ${kosten} credits past niet meer: er ${check.remaining === 1 ? 'is' : 'zijn'} er nog ${check.remaining} over. `
        + 'Koop credits bij of kies een kortere video.',
        'credit_limit_reached');
    }

    const media = require('./media');
    let job;
    try {
      job = await media.generateVideo({
        prompt:   payload && payload.prompt,
        imageUrl: (payload && (payload.imageUrl || payload.sourceImageUrl)) || '',
        seconds:  payload && payload.seconds,
        size:     payload && payload.size,
      }, ctx);
    } catch (err) {
      /* Een adapter die niet aangesloten is, is een configuratiefout van ons en
         geen mislukte poging van de klant. Die moet als zodanig lezen -- en er
         is niets afgeschreven, want dat gebeurt pas bij 'ready'. */
      const code = (err && err.code) || '';
      if (code === 'adapter_not_implemented' || code === 'not_configured' || code === 'unknown_adapter') {
        throw new ActionError(
          'Videogeneratie staat nog niet aan voor deze omgeving. Er is niets in rekening gebracht.',
          'not_wired');
      }
      throw new ActionError(
        `De video kon niet gestart worden: ${(err && err.message) || 'onbekende fout'}. Er is niets in rekening gebracht.`,
        'video_submit_failed');
    }

    /* Een media_job-kaart, geen tekst: de client polt hem via faro-media
       op:'job' tot hij op 'ready' staat. Alleen 'Bekijken' en 'Downloaden' --
       opslaan bij een pand en een variatie maken bestaan nog niet, en vier
       knoppen waarvan er twee niets doen is erger dan twee die werken. */
    return {
      summary: `De video wordt gemaakt (${job.seconds} seconden, ${kosten} credits). `
        + 'Dat duurt meestal een paar minuten; er wordt pas afgeschreven als hij klaar is.',
      components: [schema.mediaJob({
        jobId: job.jobId,
        kind: 'video',
        state: job.state || 'queued',
        meta: { seconds: job.seconds, size: job.size, model: job.model, credits: kosten },
        actions: [
          { key: 'preview',  label: 'Bekijken'   },
          { key: 'download', label: 'Downloaden' },
        ],
      })],
      data: { jobId: job.jobId, credits: kosten },
    };
  },
};

module.exports = { stage, execute, openAction, ActionError, EXECUTORS, TTL_MS };
