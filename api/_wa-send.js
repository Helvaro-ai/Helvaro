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

/* Eén versie voor elke uitgaande aanroep. Er stond v19.0 hier en in drie
   andere bestanden, en v23.0 in _wa-templates.js -- vijf plekken, twee
   versies. v19.0 is van januari 2024; Meta trekt een versie ongeveer twee jaar
   na uitgave in. v23.0 is de versie die de templatelijst al tegen deze WABA
   gebruikt en dus bewezen werkt. */
const GRAPH_VERSION = 'v23.0';

class SendError extends Error {
  constructor(message, code, extra) {
    super(message);
    this.name = 'SendError';
    this.code = code || 'send_failed';
    /* metaCode:    het getal uit Meta's antwoord, voor de logs en de tests
       ownerAction: true als de KLANT hier niets aan kan doen en de eigenaar
                    van Helvaro moet ingrijpen (token, nummer, sjabloon) --
                    het dashboard toont dat dan ook zo, in plaats van
                    "probeer het later opnieuw" bij iets dat later ook niet
                    werkt */
    this.metaCode    = (extra && extra.metaCode) || null;
    this.ownerAction = !!(extra && extra.ownerAction);
    this.fbtrace     = (extra && extra.fbtrace) || null;
  }
}

/* ── Wat Meta terugzegt, vertaald naar iets waar iemand iets mee kan ────────
   Alle uitgaande fouten kwamen hier als één generieke 'rejected' naar buiten,
   met de echte reden alleen in de logs. Op 9 september faalde ELKE verzending
   met code 190 (verlopen token) en zag de gebruiker "Versturen van
   goedgekeurde template mislukt" -- dezelfde tekst die hij ook bij een
   verkeerd nummer of een gepauzeerd sjabloon zou zien.

   De codes hieronder zijn die uit Meta's Cloud API-documentatie. Wat er niet
   in staat blijft 'rejected'; liever een generieke melding dan een verzonnen
   specifieke. */
const META_FOUTEN = Object.freeze({
  190:    { code: 'token_invalid',      owner: true,  msg: 'De WhatsApp-koppeling is verlopen. De beheerder moet het toegangstoken vernieuwen.' },
  10:     { code: 'permission_denied',  owner: true,  msg: 'Het WhatsApp-token mist de rechten om te versturen.' },
  200:    { code: 'permission_denied',  owner: true,  msg: 'Het WhatsApp-token mist de rechten om te versturen.' },
  100:    { code: 'bad_request',        owner: true,  msg: 'Meta weigerde het bericht: ongeldige parameters.' },
  133010: { code: 'phone_unregistered', owner: true,  msg: 'Het WhatsApp-nummer is nog niet geregistreerd bij Meta.' },
  133004: { code: 'phone_unregistered', owner: true,  msg: 'Het WhatsApp-nummer is nog niet geregistreerd bij Meta.' },
  132001: { code: 'template_not_found', owner: true,  msg: 'Het sjabloon bestaat niet in deze taal, of is nog niet goedgekeurd.' },
  132015: { code: 'template_paused',    owner: true,  msg: 'Het sjabloon is door Meta gepauzeerd.' },
  132016: { code: 'template_disabled',  owner: true,  msg: 'Het sjabloon is door Meta uitgeschakeld.' },
  132012: { code: 'template_params',    owner: true,  msg: 'Het aantal variabelen klopt niet met het sjabloon.' },
  131047: { code: 'window_closed',      owner: false, msg: 'Het 24-uursvenster is gesloten.' },
  131026: { code: 'recipient_invalid',  owner: false, msg: 'Dit nummer kan geen WhatsApp-berichten ontvangen.' },
  131056: { code: 'pair_rate_limit',    owner: false, msg: 'Te veel berichten naar dit nummer in korte tijd. Probeer het later.' },
  130429: { code: 'rate_limit',         owner: false, msg: 'Te veel berichten tegelijk. Probeer het over een minuut opnieuw.' },
  131048: { code: 'spam_rate_limit',    owner: true,  msg: 'Meta beperkt dit nummer tijdelijk vanwege de kwaliteitsscore.' },
  131031: { code: 'account_locked',     owner: true,  msg: 'Het WhatsApp-account is door Meta vergrendeld.' },
});

function classificeer(metaCode) {
  const bekend = META_FOUTEN[Number(metaCode)];
  return bekend || { code: 'rejected', owner: false, msg: 'Het bericht kon niet verstuurd worden.' };
}

function creds(phoneNumberId, tokenOverride) {
  const token = tokenOverride || process.env.WHATSAPP_TOKEN || '';
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

/* Meta antwoordt normaal in een halve seconde. Deze klok staat er niet voor het
   normale geval maar voor het geval dat er nooit een antwoord komt.

   Waarom dat hier zwaarder weegt dan elders: dit is de ENIGE deur naar
   WhatsApp, en hij wordt afgewacht vóórdat de lead zijn antwoord krijgt. Zonder
   klok bleef een hangende verbinding staan tot Vercel de functie na 120
   seconden afkapt -- en dan heeft de lead niets gekregen, is er geen
   foutmelding, en is de gespreksgeschiedenis niet weggeschreven.

   De kop van deze module belooft dat sendWA() nooit gooit maar `false`
   teruggeeft bij een storing. Een HANG is geen storing in die zin: hij geeft
   helemaal niets terug. Deze time-out maakt van een hang alsnog een nette
   `false`, en daarmee klopt die belofte pas echt. */
const POST_TIMEOUT_MS = Math.max(3000, Number(process.env.WHATSAPP_TIMEOUT_MS || 15000));

async function post(pnid, token, payload) {
  let res;
  try {
    res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pnid}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    });
  } catch (err) {
    /* Een time-out is een eigen geval: bij een netwerkfout weet je dat het
       bericht NIET aankwam, bij een time-out weet je dat niet. Meta kan hem
       alsnog verwerkt hebben. Dat verschil hoort in de logs, want het is het
       verschil tussen "opnieuw sturen" en "misschien dubbel sturen". */
    const traag = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    console.error('[wa-send] ' + (traag ? `geen antwoord binnen ${POST_TIMEOUT_MS}ms — onbekend of Meta het bericht kreeg` : 'network error: ' + err.message));
    throw new SendError(
      traag ? 'WhatsApp reageerde niet op tijd.' : 'WhatsApp was niet bereikbaar. Probeer het opnieuw.',
      traag ? 'timeout' : 'network',
    );
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || (body && body.error)) {
    const err      = (body && body.error) || {};
    const metaCode = Number(err.code) || null;
    const klasse   = classificeer(metaCode);
    /* Veilig loggen: endpoint, HTTP-status, Meta-code, -type en -bericht en
       het fbtrace_id (Meta's eigen correlatie-id, handig bij support). Nooit
       het token. Het ontvangernummer alleen afgekort, want dit is de
       enige regel die bij elke mislukte verzending in de logs komt. */
    console.error(
      `[wa-send] ${klasse.code} (Meta ${metaCode || '-'}/${err.type || '-'}, HTTP ${res.status})`
      + ` naar ...${String(payload.to || '').slice(-4)}`
      + (payload.template ? ` template=${payload.template.name}/${payload.template.language && payload.template.language.code}` : ' type=text')
      + `: ${String(err.message || `HTTP ${res.status}`).slice(0, 200)}`
      + (err.fbtrace_id ? ` fbtrace=${err.fbtrace_id}` : '')
    );
    throw new SendError(klasse.msg, klasse.code, {
      metaCode, ownerAction: klasse.owner, fbtrace: err.fbtrace_id || null,
    });
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

async function sendFreeform({ to, text, windowOpen, phoneNumberId, optedOut, token: tokenOverride }) {
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

  const { token, pnid } = creds(phoneNumberId, tokenOverride);
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
async function sendTemplate({ to, template, lang = 'nl', params = [], phoneNumberId, optedOut, token: tokenOverride }) {
  weigerBijAfmelding(optedOut, 'template');
  if (!template) throw new SendError('Geen template opgegeven.', 'no_template');
  const { token, pnid } = creds(phoneNumberId, tokenOverride);
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

/* ── Dezelfde deur, zonder gooien ──────────────────────────────────────────
   api/form.js, api/cron-followup.js en api/leads.js hadden elk een EIGEN kopie
   van "stuur een sjabloon", die bij elke fout `false` teruggaf en de reden
   alleen logde. Drie kopieen, drie verschillende logvoorvoegsels, geen
   time-out, geen nummer-normalisatie, en de aanroeper kon een verlopen token
   niet onderscheiden van een gepauzeerd sjabloon.

   Deze twee geven nooit een uitzondering: { ok: true, messageId } of
   { ok: false, code, metaCode, ownerAction, reason }. Wie alleen een booleaan
   wil leest .ok; wie de gebruiker iets nuttigs wil vertellen leest .reason. */
async function sendTemplateSafe(args) {
  try {
    const r = await sendTemplate(args);
    return { ok: true, messageId: r.messageId };
  } catch (err) {
    return veiligeFout(err);
  }
}
async function sendFreeformSafe(args) {
  try {
    const r = await sendFreeform(args);
    return { ok: true, messageId: r.messageId };
  } catch (err) {
    return veiligeFout(err);
  }
}
function veiligeFout(err) {
  const e = err instanceof SendError ? err : new SendError(String(err && err.message || err), 'send_failed');
  return { ok: false, code: e.code, metaCode: e.metaCode, ownerAction: e.ownerAction,
           fbtrace: e.fbtrace, reason: e.message };
}

module.exports = {
  sendFreeform, sendTemplate, sendTemplateSafe, sendFreeformSafe,
  normalizePhone, SendError, GRAPH_VERSION, weigerBijAfmelding, classificeer, META_FOUTEN,
};
