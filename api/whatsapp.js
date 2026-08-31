const crypto = require('crypto');
// waitUntil() registers a promise with the platform's request context so it
// keeps running for the lifetime of that promise (bounded by maxDuration),
// even though our HTTP response was already flushed back to Meta. Without
// this, Vercel gives no documented guarantee that a container survives a
// long in-process delay (our 25-55s "human" wait) once the response is sent.
// Safe to call in any environment: it's a no-op (getContext().waitUntil?.())
// when the platform doesn't provide a request context (e.g. local dev).
const { waitUntil } = require('@vercel/functions');
// SSRF-protected website fetcher, shared with api/cron-followup.js's
// runOutreach() — see api/_lib/fetch-website.js for why this lives outside
// this file.
const { fetchWebsite } = require('./_lib/fetch-website');
const _gcal = require('./_gcal');   // per-client Google Calendar (optional, fail-soft)
const _afspraken = require('./_afspraken'); // afzeggen en verzetten: één plek
const _regio = require('./_regio');       // land, tijdzone, munt en telefoon per klant
const _optout = require('./_optout');
const _waOpmaak = require('./_wa-opmaak');     // wie STOP zegt, krijgt niets meer
const _transcriptie = require('./_transcriptie'); // spraakberichten uitschrijven (standaard uit)
// Credit/usage accounting. See its file header for the full contract — the
// short version: this file NEVER calls checkCredits() and NEVER blocks a
// reply, only records usage after the fact. Helvaro's "reactie binnen 30
// sec, 24/7" promise depends on that.
const credits = require('./_credits');
// Trial/plan-status interpretation. Pure, no I/O — see its file header.
const { getPlanState } = require('./_plan');
// Language registry (40 languages: directive generation, formality,
// locale/date formatting, template-approval fallback). See its file header.
const _lang = require('./_lang');
const _ai = require('./_ai');
const _properties = require('./_properties'); // welk pand deze lead bedoelt

// Move tokens to env vars. Never hardcode secrets in source code
const VERIFY_TOKEN  = process.env.WA_VERIFY_TOKEN;
const APP_SECRET    = process.env.WA_APP_SECRET;   // Meta App Secret for signature verification

const AIRTABLE_TOKEN  = process.env.API_AIRTABLE;
const AIRTABLE_BASE   = process.env.BASE_AIRTABLE;
const WHATSAPP_TOKEN  = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const NOTIFY_PHONE    = process.env.NOTIFY_PHONE;

const LEADS_TABLE     = 'tbliukTnDAbEDcZmt';
const CLIENTS_TABLE   = 'tblPidTrwGRzRt4LZ';
const NOTITIES_FIELD  = 'fldoLRI5W12ThTls7';   // Notities. Also used by api/form.js's flagWaFailed

// ── Multitenancy prep (per-client WhatsApp number, deferred Tech Provider build) ──
// Both fields live on Client Config (CLIENTS_TABLE) and are BLANK on every
// existing client today. Blank must behave EXACTLY like the old single
// shared-number setup — every reader of F_WA_PHONE_NUMBER_ID falls back to
// the PHONE_NUMBER_ID env var when the field is empty. See getClientByPhoneNumberId()
// and the webhook handler below for how this makes cross-client lead
// collisions structurally impossible once a client is migrated to their own
// number. F_WA_WABA_ID is read into client config now but not otherwise used
// yet — Meta Tech Provider enrolment / Embedded Signup is a deferred build.
const F_WA_PHONE_NUMBER_ID = 'fldbrhlSrsmlJwcYr';   // Client Config: WhatsApp Phone Number ID
const F_WA_WABA_ID         = 'fldCEqMp5zs1Wos3T';   // Client Config: WhatsApp WABA ID
// Sane page cap for getLead()'s candidate fetch — a phone realistically never
// collides across more than a handful of clients, but this is a hard stop to
// keep a pathological/abusive case from paginating forever.
const MAX_LEAD_CANDIDATES = 50;

// ─── WEBHOOK HANDLER ────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  // ── Website-demo ────────────────────────────────────────────────────────────
  // /api/ai-demo komt hier binnen via een rewrite (zie vercel.json). Helemaal
  // bovenaan afgetakt, want alles hieronder gaat uit van een Meta-webhook:
  // handtekening, rauwe body, telefoonnummers. De demo heeft daar niets mee te
  // maken en zou er alleen op stuklopen.
  //
  // Waarom hier en niet in een eigen bestand: Vercel Hobby staat 12 functies
  // toe en we zitten op 11. Een rewrite naar een bestaande functie kost er nul,
  // net zoals /api/gcal op leads.js meelift. De logica zelf staat wél apart in
  // _demo-chat.js; die krijgt de drie dingen mee die hij uit dit bestand nodig
  // heeft, zodat runAI niet losgebroken hoeft te worden.
  if (req.query && req.query.__demo === '1') {
    const _demo = require('./_demo-chat');
    return _demo.handleDemoChat(req, res, { runAI, getClientByCode, atFetch });
  }

  // Webhook verification (Meta sends a GET to verify the endpoint)
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (VERIFY_TOKEN && mode === 'subscribe' && safeEqual(token, VERIFY_TOKEN)) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // ── Read the raw body ourselves, BEFORE anything touches req.body ───────────
  // Vercel's Node.js runtime auto-parses application/json bodies into req.body
  // via a lazy getter (only computed on first access). Once that getter runs,
  // the exact bytes Meta sent are gone — JSON.stringify(req.body) essentially
  // never byte-matches the original payload (key order, whitespace), which is
  // exactly why signature verification used to silently block nothing: the
  // blocking path only ran when req.body happened to still be a raw string,
  // which never actually happens on Vercel's Node.js runtime.
  //
  // Fix: read req as the plain Node.js IncomingMessage stream it still is
  // (confirmed via Vercel's docs — req.body is a getter, not eagerly computed,
  // so nothing has consumed the stream yet) and never reference req.body
  // anywhere in this file. That gives the literal bytes Meta signed for HMAC
  // verification, and we JSON.parse those same bytes ourselves to build the
  // object the rest of the handler needs. No vercel.json change, no env var,
  // no impact on any other /api route.
  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    console.error('[WhatsApp] Kon request body niet lezen:', err.message);
    return res.status(400).send('Bad Request');
  }

  // ── Verify Meta webhook signature ────────────────────────────────────────────
  // Blocks on mismatch. rawBody is the exact bytes Meta sent, so this now
  // actually verifies (see above — the old "warn only" fallback is gone
  // because we no longer depend on req.body ever being a raw string).
  // FAILS CLOSED. This used to skip verification entirely when APP_SECRET was
  // unset, which meant one missing environment variable silently turned the
  // webhook into an open endpoint: anyone could POST a forged Meta payload and
  // drive AI replies, bookings and outbound WhatsApp sends for any tenant whose
  // lead phone number they could guess. A misconfiguration should take the
  // webhook offline loudly, not quietly disarm the only thing authenticating
  // it. api/cron-followup.js already fails closed on its own secret; this now
  // matches that.
  if (!APP_SECRET) {
    console.error('[WhatsApp] WA_APP_SECRET ontbreekt — webhook geweigerd. Zonder dit secret is elk binnenkomend bericht onverifieerbaar.');
    return res.status(503).send('Webhook not configured');
  }
  {
    const sig      = req.headers['x-hub-signature-256'] || '';
    const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
    if (!safeEqual(sig, expected)) {
      console.warn('[WhatsApp] Handtekening ongeldig. Verzoek geblokkeerd');
      return res.status(403).send('Forbidden');
    }
  }

  // Parse the verified raw bytes ourselves. Meta always sends application/json,
  // so this produces the same shape req.body would have — without ever
  // touching the req.body getter.
  let body;
  try {
    body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {};
  } catch (err) {
    console.error('[WhatsApp] Ongeldige JSON body:', err.message);
    return res.status(400).send('Bad Request');
  }

  // Always reply 200 immediately. Meta will retry if we don't
  res.status(200).send('OK');

  try {
    const entry   = body?.entry?.[0];
    const change  = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    // ── Status callbacks + other WABA event types ────────────────────────
    // Handled for EVERY change in this entry (not just the first), fully
    // independent of the inbound-message path below. Started here — before
    // the message existence check — so it runs CONCURRENTLY with message
    // handling, never sequentially before it: a real prospect's reply must
    // never wait on bookkeeping. See processWebhookChange()'s own header for
    // exactly what's covered. Promise.allSettled + its own internal
    // try/catch means this can never throw into this handler.
    const eventWork = Promise.allSettled(
      (Array.isArray(entry?.changes) ? entry.changes : []).map(processWebhookChange)
    );
    waitUntil(eventWork);

    if (!message) { await eventWork; return; }

    /* Een spraakbericht, een foto, een sticker: hier stond `return` en verder
     * niets. Geen antwoord, geen regel in de geschiedenis, en op het dashboard
     * geen enkel spoor dat iemand iets gestuurd had. Vanuit de lead gezien is
     * het bedrijf gewoon gestopt met antwoorden -- en spraakberichten zijn op
     * WhatsApp eerder regel dan uitzondering.
     *
     * Wat er nu gebeurt: het bericht wordt omgezet naar een korte beschrijving
     * en langs de gewone weg gestuurd. Dat kost één AI-beurt, maar levert wel
     * een antwoord in de taal van de lead, een regel in de geschiedenis die de
     * makelaar ziet, en een AI die zijn context houdt. De beschrijving zegt er
     * expliciet bij dat de inhoud NIET gelezen kan worden, zodat het model niet
     * gaat raden wat er op de foto stond.
     *
     * Bewust niet: audio transcriberen of beeld analyseren. Dat kan, het kost
     * geld per bericht, en het is een productbeslissing die hier niet gemaakt
     * kan worden. */
    const SOORTEN = {
      audio:    'een spraakbericht',
      voice:    'een spraakbericht',
      image:    'een foto',
      video:    'een video',
      document: 'een document',
      sticker:  'een sticker',
      location: 'zijn locatie',
      contacts: 'een contactkaart',
    };
    let nietTekst = '';
    if (message.type !== 'text') {
      const soort = SOORTEN[message.type];
      if (!soort) {
        // Iets wat we niet kennen (een reactie-emoji, een systeembericht).
        // Daar hoort geen antwoord op; stil overslaan is hier juist correct.
        console.log(`[WhatsApp] berichttype "${message.type}" overgeslagen`);
        await eventWork;
        return;
      }
      nietTekst = `[De lead stuurde ${soort}. Je kunt de inhoud hiervan NIET zien of beluisteren. `
        + `Zeg dat vriendelijk, vraag of hij het wil typen, en ga verder met het gesprek.]`;

      /* Is uitschrijven aangezet, dan proberen we het alsnog te LEZEN. Staat
         standaard uit omdat het geld kost per bericht -- zie api/_transcriptie.js.

         Lukt het, dan gaat de echte tekst het gesprek in en merkt de lead
         helemaal niets van het onderscheid. Lukt het niet, dan blijft de
         beschrijving hierboven staan en gebeurt er precies wat er nu gebeurt.
         Er is dus geen pad waarin dit iets stukmaakt. */
      if ((message.type === 'audio' || message.type === 'voice') && _transcriptie.aan()) {
        const bron = message[message.type] || {};
        const uitgeschreven = await _transcriptie.schrijfUit({
          mediaId:  bron.id,
          seconden: bron.duration,
        }).catch(() => '');
        if (uitgeschreven) {
          console.log(`[WhatsApp] spraakbericht uitgeschreven (${uitgeschreven.length} tekens)`);
          /* Met een markering ervoor, zodat het model weet dat dit gesproken
             is en niet getypt. Dat scheelt: gesproken taal loopt anders, en
             "eh" of een halve zin is geen onduidelijkheid maar spraak. */
          nietTekst = `[Ingesproken bericht, automatisch uitgeschreven] ${uitgeschreven}`;
        }
      }
    }

    // Webhook deduplication. Meta sends duplicate webhooks when our reply is
    // slow or times out. Each WhatsApp message has a unique id; we track seen
    // ids in a module-scoped Map (see _dedupSeen below — entries are GC'd once
    // the cache exceeds 500 entries, evicting anything older than 5 minutes).
    // Without dedup the AI would reply twice to the same lead message.
    if (message.id && _dedupSeen(message.id)) {
      console.log(`[WhatsApp] Duplicate webhook voor message ${message.id}. overgeslagen`);
      await eventWork;
      return;
    }

    const phone = message.from;           // e.g. "32478123456"
    /* Bij een spraakbericht of foto is er geen message.text -- dan gaat de
       beschrijving mee die hierboven is opgesteld. Zonder deze regel gooit
       `message.text.body` en verdwijnt het bericht alsnog in de catch. */
    const text  = nietTekst || sanitize(message.text.body).trim();

    // Gemaskeerd nummer, geen berichtinhoud. Dit vuurt op ELK inkomend bericht,
    // dus stond hier het volledige nummer plus de letterlijke tekst van de lead
    // in de Vercel-logs — een tweede plek waar persoonsgegevens van klanten van
    // klanten staan, buiten Airtable om, zonder dat de AVG-documentatie die
    // kent. De lengte is genoeg om te zien dat er iets binnenkwam; de inhoud
    // staat waar hij hoort, in Conversation History.
    console.log(`[WhatsApp] Bericht van ${maskPhone(phone)} (${String(text || '').length} tekens)`);

    // ── Multitenancy webhook routing ─────────────────────────────────────
    // Meta stamps every inbound message with the Business phone_number_id
    // that RECEIVED it. When that number belongs to exactly one client (i.e.
    // they've been migrated off the shared number — F_WA_PHONE_NUMBER_ID is
    // set), we can scope the lead lookup to (phone, that client) directly:
    // no candidate list, no heuristic, a cross-client collision becomes
    // structurally impossible for that lead. On today's default setup every
    // client's F_WA_PHONE_NUMBER_ID is blank, so the inbound number always
    // equals the shared PHONE_NUMBER_ID env var, this lookup is skipped
    // entirely, and behaviour is unchanged.
    const inboundPhoneNumberId = change?.metadata?.phone_number_id || '';
    let scopedProjectCode = null;
    if (inboundPhoneNumberId && inboundPhoneNumberId !== PHONE_NUMBER_ID) {
      try {
        const ownerClient = await getClientByPhoneNumberId(inboundPhoneNumberId);
        if (ownerClient) {
          scopedProjectCode = ownerClient.fields['fldN4dL0bGgfBOXwM'] || ownerClient.fields['Project Code'] || null;
        }
      } catch (err) {
        // Never let a routing lookup failure drop the message — fall back to
        // the Task 1 phone-only heuristic exactly like an unrecognized number would.
        console.error('[Multi-tenant] webhook routing lookup mislukt, val terug op heuristiek:', err.message);
      }
    }

    // Register the deferred work (AI reply + human-feeling delay + Airtable +
    // actual send) with the platform via waitUntil() so it isn't dropped if
    // the container gets frozen/recycled after our 200 OK already went out.
    // We still `await` it locally too: that preserves today's behaviour on
    // any runtime where waitUntil() is a no-op (see require comment above).
    const work = opDeRij(phone, scopedProjectCode, () => processMessage(phone, text, scopedProjectCode));
    waitUntil(work);
    await Promise.all([work, eventWork]);

  } catch (err) {
    console.error('[WhatsApp] Fout in handler:', err.message);
  }
};

/* ── Eén gesprek tegelijk ────────────────────────────────────────────────────
 *
 * Twee berichten van dezelfde lead, een paar seconden na elkaar. Dat is geen
 * randgeval; zo typen mensen op WhatsApp. Zonder deze rij gebeurde dit:
 *
 *   1. "hey" komt binnen. De historie wordt gelezen (leeg), de AI antwoordt, en
 *      dan wacht de code 25 tot 55 seconden voordat hij verstuurt -- dat is de
 *      menselijke vertraging.
 *   2. Vijf seconden later: "over dat huis in de Lange Violettestraat". Die
 *      beurt leest DEZELFDE historie, want beurt 1 heeft nog niets weggeschreven.
 *   3. Allebei antwoorden. De lead krijgt twee antwoorden op een gesprek dat
 *      geen van beide heel gezien heeft.
 *   4. Allebei schrijven de historie weg. De laatste wint; de andere beurt is
 *      voorgoed weg, ook uit elke volgende beurt.
 *
 * Dezelfde race maakte van "Booking Link Sent" een momentopname die twee keer
 * `false` las -- twee afspraken, twee agenda-items, voor één lead.
 *
 * Dit is geen volledige oplossing: tussen twee Vercel-instanties blijft het
 * venster bestaan, en dat sluit pas met een vergrendeling in de database zelf.
 * Maar de berichten van één gesprek landen vrijwel altijd op dezelfde warme
 * instantie, dus dit haalt het leeuwendeel weg. Zelfde afweging en zelfde
 * patroon als de wachtrij per klant in api/_credits.js.
 *
 * De sleutel is telefoon + tenant: dat IS de identiteit van een gesprek, en het
 * lead-id is op dit punt nog niet bekend.
 *
 * Let op de volgorde met het 200 OK: dat is hierboven al verstuurd voordat er
 * iets verwerkt wordt. Wachten kost Meta dus niets -- het houdt alleen deze
 * functie langer open, en dat is de juiste ruil tegen een zoekgeraakte beurt. */
const _gesprekRijen = new Map();   // "tenant:telefoon" -> Promise-ketting

function opDeRij(phone, scopedProjectCode, taak) {
  const sleutel = `${scopedProjectCode || '?'}:${phone}`;
  const vorige = _gesprekRijen.get(sleutel) || Promise.resolve();

  const volgende = vorige.then(async () => {
    /* De vorige beurt heeft net geschreven; de foto in de leadcache is dus
       oud. Weggooien, anders leest deze beurt alsnog de historie van vóór het
       vorige antwoord -- precies de fout die de rij moet voorkomen. */
    _leadCache.delete(leadCacheKey(phone, scopedProjectCode));
    _leadCache.delete(leadCacheKey(phone, ''));
    return taak();
  }, async () => {
    // Ook doorgaan als de vorige beurt stukliep: één fout gesprek mag de
    // volgende berichten van deze lead niet blokkeren.
    _leadCache.delete(leadCacheKey(phone, scopedProjectCode));
    _leadCache.delete(leadCacheKey(phone, ''));
    return taak();
  });

  /* De ketting bewaren als een variant die niet omvalt, en hem opruimen zodra
     deze beurt de laatste in de rij is. Zonder dat opruimen groeit de Map met
     elke lead die ooit iets gestuurd heeft. */
  const stil = volgende.catch(() => {});
  _gesprekRijen.set(sleutel, stil);
  stil.then(() => { if (_gesprekRijen.get(sleutel) === stil) _gesprekRijen.delete(sleutel); });

  return volgende;
}

// Module-scoped dedup cache. Survives warm function invocations on Vercel.
// Cleared on cold start (acceptable: Meta retries within seconds, not minutes).
const _dedupCache = new Map();   // messageId -> timestamp
function _dedupSeen(id) {
  const now = Date.now();
  // GC entries older than 5 minutes
  if (_dedupCache.size > 500) {
    for (const [k, t] of _dedupCache) if (now - t > 300_000) _dedupCache.delete(k);
  }
  if (_dedupCache.has(id)) return true;
  _dedupCache.set(id, now);
  return false;
}

// ─── STATUS CALLBACKS & OTHER WEBHOOK EVENTS ────────────────────────────────
// Meta's 'messages' field delivers TWO payload shapes: inbound customer
// messages (value.messages, handled by the handler above and processMessage()
// below) and delivery-status callbacks (value.statuses: sent/delivered/read/
// failed). Until this section existed every status callback was silently
// discarded — including 'failed' ones, which is how the web-form-lead-
// outside-24h-window bug went undetected for as long as it did: Meta told us
// every single send failed, and nothing ever read it.
//
// Also handles (code-only — these fields are NOT yet subscribed on the Meta
// app; enable them only once this ships, see this PR's report):
// message_template_status_update, message_template_quality_update,
// phone_number_quality_update, template_category_update, account_alerts,
// account_update.
//
// Contract for every branch below: NEVER throw, NEVER block/delay the
// inbound-message path (the handler above starts this concurrently with,
// never before, message handling), return fast. An unrecognised field or
// malformed value must degrade to a log line, not a crash — Meta disables
// webhooks that fail persistently, and a real prospect waiting on a reply
// outranks bookkeeping.
async function processWebhookChange(change) {
  try {
    const field = change?.field;
    const value = change?.value;
    if (!value || typeof value !== 'object') return;

    if (field === 'messages') {
      // The inbound-message half of this payload shape is handled directly
      // by the caller (untouched by this section) — this branch only ever
      // has work to do when it's the OTHER half: delivery-status callbacks.
      if (!Array.isArray(value.statuses) || !value.statuses.length) return;

      // Same webhook-routing resolution as the inbound-message path in the
      // handler above (own copy — this runs independently, per change, and
      // must not depend on that call's local variables): map the receiving
      // number to a single client when it's been migrated off the shared
      // number, so getLead() below can go straight to the collision-safe
      // scoped lookup instead of the phone-only heuristic.
      const inboundPhoneNumberId = value?.metadata?.phone_number_id || '';
      let scopedProjectCode = null;
      if (inboundPhoneNumberId && inboundPhoneNumberId !== PHONE_NUMBER_ID) {
        try {
          const ownerClient = await getClientByPhoneNumberId(inboundPhoneNumberId);
          if (ownerClient) {
            scopedProjectCode = ownerClient.fields['fldN4dL0bGgfBOXwM'] || ownerClient.fields['Project Code'] || null;
          }
        } catch (err) {
          console.error('[Multi-tenant] status routing lookup mislukt, val terug op heuristiek:', err.message);
        }
      }

      for (const status of value.statuses) {
        // Handled independently and fail-soft — one malformed entry in a
        // batch must never sink the others.
        await handleStatusCallback(status, scopedProjectCode).catch(err =>
          console.error('[WhatsApp] status-callback verwerking mislukt (genegeerd):', err && err.message));
      }
      return;
    }

    // ── Extra WABA-level event types (code-only, see header above). Not yet
    // subscribed — must be recognised the moment Sindi enables the field in
    // Meta's app config rather than landing here as 'onbekend'.
    switch (field) {
      case 'message_template_status_update':
        // A template was approved/rejected by Meta. Informational — visible
        // in Meta's own template manager too and doesn't affect anything
        // already running — but must stay traceable in our own logs.
        console.log('[WhatsApp][template-status]', JSON.stringify(value).slice(0, 1000));
        break;

      case 'message_template_quality_update':
        // A template's quality dropped — Meta can pause it. Raised log
        // level so ops notices in server logs; phone_number_quality_update
        // below is the one that actually threatens the shared number and
        // gets the full email alert.
        console.warn('[WhatsApp][template-quality]', JSON.stringify(value).slice(0, 1000));
        break;

      case 'phone_number_quality_update':
        // THE early warning before Meta throttles or bans the shared number
        // every client sends through. Loud on purpose: reuses the same
        // Sindi-facing ops alert cron-followup.js's quality-rating poller
        // already sends (see alertPhoneQualityChange()'s own comment) rather
        // than inventing a second alerting mechanism.
        console.error('[WhatsApp][phone-quality] nummer-kwaliteit gewijzigd:', JSON.stringify(value));
        await alertPhoneQualityChange(value).catch(err =>
          console.error('[WhatsApp] phone-quality alert mislukt:', err && err.message));
        break;

      case 'template_category_update':
        // Category change = price change (utility templates bill at roughly
        // half of marketing templates). Worth alerting so a cost swing never
        // arrives as a surprise on the invoice.
        console.warn('[WhatsApp][template-category] categorie (en dus prijs) gewijzigd:', JSON.stringify(value));
        await alertTemplateCategoryChange(value).catch(err =>
          console.error('[WhatsApp] template-category alert mislukt:', err && err.message));
        break;

      case 'account_alerts':
      case 'account_update':
        // WABA-level warning. Logged loudly; no dedicated email template
        // exists yet for this one (unlike the two above, which have one
        // clear, specific action) — an error-level server log is the honest
        // "we don't yet know what to do with this" response for now.
        console.error(`[WhatsApp][${field}] WABA-niveau waarschuwing:`, JSON.stringify(value));
        break;

      default:
        // Genuinely unknown field (Meta added something new, or a shape we
        // haven't seen). Log and move on — never throw.
        if (field) console.log(`[WhatsApp] onbekend webhook-veld '${field}' genegeerd:`, JSON.stringify(value).slice(0, 500));
    }
  } catch (err) {
    // Last-resort guard: this function must never throw back into the
    // handler regardless of payload shape.
    console.error('[WhatsApp] processWebhookChange onverwachte fout (genegeerd):', err && err.message);
  }
}

// Handles one WhatsApp delivery-status object: { id, status, recipient_id,
// timestamp, errors? }. `status` is one of sent/delivered/read/failed.
//
// Volume + cost note: Meta fires one of these per outbound message per state
// it passes through (so up to 3 for a single reply: sent, delivered, read).
// Airtable has a 5 req/s limit shared across this whole app, so this is
// deliberately NOT a 1:1 mirror of every status into an Airtable write:
//   - 'sent'      → no lookup, no write. Lowest-value signal — sendWA()'s
//                   own return value already tells processMessage() whether
//                   the send was accepted.
//   - 'delivered' → logged only, no write. 'read' (below) is a strict
//                   superset of the information "delivered but not read"
//                   would add, so writing both would double the Airtable
//                   load per message for zero extra insight.
//   - 'read'      → ONE lightweight write, merged into the same Notities
//                   JSON envelope AI-pause/waFailed already ride in (no
//                   schema change). Highest-value of the two "it worked"
//                   signals.
//   - 'failed'    → ALWAYS written + logged at error level with Meta's own
//                   error code/title, because that's the one that matters:
//                   it's what caught the web-form-outside-24h-window bug,
//                   and the code is what tells that apart from an invalid
//                   number or an unapproved template.
async function handleStatusCallback(status, scopedProjectCode) {
  const state          = status?.status;
  const recipientPhone = status?.recipient_id || '';
  if (!state || !recipientPhone) return;

  if (state === 'sent') return;

  // Resolve the lead the SAME collision-safe way processMessage() does for
  // inbound messages (see getLead()'s own header for the full contract) —
  // NOT a fresh phone-only lookup. Statuses carry recipient_id (a phone
  // number), never a lead id, and this app is multi-tenant on one shared
  // WhatsApp number: a phone can belong to leads of DIFFERENT clients. Using
  // anything other than this exact resolver here would reopen, specifically
  // for status callbacks, the cross-client mix-up class of bug that was just
  // fixed in getLead() itself.
  const lead = await getLead(recipientPhone, scopedProjectCode);
  if (!lead) return; // nothing to attach this status to — not an error

  if (state === 'failed') {
    const err = Array.isArray(status.errors) && status.errors[0] ? status.errors[0] : null;
    const projectCodeForLog = lead.fields['fldSmczuyUJd26HLe'] || lead.fields['Project Code'] || '?';
    console.error(
      `[WhatsApp][status:failed] lead=${lead.id} project=${projectCodeForLog} recipient=${maskPhone(recipientPhone)} ` +
      `code=${err?.code ?? '?'} title=${err?.title ?? '?'} detail=${(err?.message || (err?.error_data && err.error_data.details) || '').toString().slice(0, 200)}`
    );
    const merged = mergeWaFailedFlag(
      lead.fields[NOTITIES_FIELD] || lead.fields['Notities'],
      { code: err?.code, title: err?.title }
    );
    await updateLead(lead.id, { [NOTITIES_FIELD]: merged }, recipientPhone, scopedProjectCode);
    return;
  }

  if (state === 'read') {
    const merged = mergeWaReadFlag(lead.fields[NOTITIES_FIELD] || lead.fields['Notities']);
    await updateLead(lead.id, { [NOTITIES_FIELD]: merged }, recipientPhone, scopedProjectCode);
    return;
  }

  // 'delivered' (or any future status value Meta adds) — log only.
  console.log(`[WhatsApp][status:${state}] lead=${lead.id} recipient=${maskPhone(recipientPhone)} (geen Airtable-write)`);
}

// Sindi-facing ops alert: reuses cron-followup.js's existing quality-rating
// email path (checkQualityRating()'s email helper, exported as
// `sendOpsAlert` — see that file's export line at the bottom) instead of
// inventing a second alerting mechanism. Lazy require: this event is rare
// (and not yet even subscribed on the Meta app), so there's no reason to pay
// the require cost on every cold start.
async function alertPhoneQualityChange(value) {
  const { sendOpsAlert } = require('./cron-followup');
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const display = value?.display_phone_number || value?.phone_number || PHONE_NUMBER_ID || '(onbekend)';
  await sendOpsAlert({
    subject: `[KRITIEK] WhatsApp nummer-kwaliteit gewijzigd — ${display}`,
    html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:20px">
      <h2 style="color:#dc2626;margin:0 0 12px">Phone number quality gewijzigd</h2>
      <p>Meta meldt een verandering in de kwaliteitsstatus van het GEDEELDE WhatsApp-nummer waar alle klanten doorheen sturen. Dit is de vroegste waarschuwing voordat Meta gaat throttlen of het nummer bant.</p>
      <p style="background:#fef2f2;padding:12px;border-radius:8px;color:#b91c1c"><strong>Actie:</strong> open <a href="https://business.facebook.com/wa/manage/phone-numbers">WhatsApp Manager</a> en check de quality rating meteen.</p>
      <pre style="background:#f3f4f6;padding:12px;border-radius:8px;font-size:11px;overflow:auto;white-space:pre-wrap">${esc(JSON.stringify(value, null, 2))}</pre>
    </div>`
  });
}

// Same reuse pattern as alertPhoneQualityChange() above. A category change
// changes the per-message PRICE (utility templates bill at roughly half of
// marketing templates), so this is a cost alert, not just an ops one.
async function alertTemplateCategoryChange(value) {
  const { sendOpsAlert } = require('./cron-followup');
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const templateName = value?.message_template_name || value?.template_name || '(onbekend template)';
  await sendOpsAlert({
    subject: `[Kosten] Template-categorie gewijzigd — ${templateName}`,
    html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:20px">
      <h2 style="color:#d97706;margin:0 0 12px">Template-categorie gewijzigd</h2>
      <p>Meta heeft een template geherclassificeerd. Categorie bepaalt de PRIJS per bericht (utility ≈ halve prijs van marketing) — dit kan de kostprijs per klant-gesprek veranderen zonder dat er verder iets veranderde.</p>
      <pre style="background:#f3f4f6;padding:12px;border-radius:8px;font-size:11px;overflow:auto;white-space:pre-wrap">${esc(JSON.stringify(value, null, 2))}</pre>
    </div>`
  });
}

// ─── MAIN LOGIC ─────────────────────────────────────────────────────────────

async function processMessage(phone, text, scopedProjectCode) {
  // 1. Find lead by phone. When scopedProjectCode is set (the inbound webhook
  // arrived on a client's OWN WhatsApp number — see the handler above), the
  // lookup is scoped to (phone, that client) directly and the Task 1
  // cross-client heuristic never runs for this message. Otherwise this is
  // the shared-number path: getLead() may see multiple clients' leads for
  // this phone and has to resolve the collision itself.
  let lead = await getLead(phone, scopedProjectCode);

  /* ── Iemand appt uit zichzelf, zonder ooit een formulier te hebben ingevuld ──
     Dit is de weg die een advertentie met een klik-naar-WhatsApp of een
     QR-code oplevert, en tot nu eindigde hij doodlopend: de beller kreeg
     "vul eerst het formulier in" en werd nooit een lead.

     Dat kon ook niet anders, want op een GEDEELD nummer is niet te weten voor
     welk kantoor die onbekende beller belt. Behalve in precies één geval: als
     er maar ÉÉN actieve klant in de base staat. Dan is er niets om verkeerd
     te raden -- de vraag "van wie is deze lead" heeft dan maar één mogelijk
     antwoord.

     Daarom is dit strikt gebonden aan die telling. Komt er een tweede klant
     bij, dan valt dit vanzelf terug op het formulierbericht hieronder; er is
     geen vlag om te vergeten en geen instelling die kan verouderen. Zo blijft
     de regel uit CLAUDE.md overeind: tenant-identiteit komt nooit uit iets dat
     de afzender kan beïnvloeden. */
  if (!lead && !scopedProjectCode) {
    const enige = await enigeActieveKlant();
    if (enige) {
      lead = await maakLeadUitBinnenkomend(phone, text, enige);
      if (lead) {
        console.log(`[WhatsApp] koude inbound van ${maskPhone(phone)} → nieuwe lead voor ${enige.projectCode}`);
      }
    }
  }

  if (!lead) {
    // Pre-form fallback. Try to honour client's saved language if we can find the project from phone (best-effort)
    await sendWA(phone, 'Hi, please fill in the contact form first so we can help you. / Bonjour, remplissez d’abord le formulaire de contact pour que nous puissions vous aider. / Dag, stuur eerst het contactformulier in zodat we je verder kunnen helpen.');
    return;
  }

  // 2. Load client config
  // fldSmczuyUJd26HLe = Project Code field ID; field name fallback for safety
  const projectCode = lead.fields['fldSmczuyUJd26HLe'] || lead.fields['Project Code'];
  if (!projectCode) {
    console.error('[WhatsApp] Lead heeft geen projectcode:', lead.id);
    return;
  }

  const client = await getClientByCode(projectCode);
  if (!client) {
    console.error('[WhatsApp] Geen client gevonden voor:', projectCode);
    return;
  }

  // 2b. Per-client WhatsApp sender number (multitenancy prep). Blank field
  // (every client today) falls back to undefined here, and sendWA() itself
  // falls back to the shared PHONE_NUMBER_ID env var — see sendWA()'s own
  // comment. This is what keeps "all fields blank" behaving EXACTLY like
  // before: the fallback chain bottoms out at the same env var every send
  // already used.
  const clientPhoneNumberId = (client.fields[F_WA_PHONE_NUMBER_ID] || client.fields['WhatsApp Phone Number ID'] || '').toString().trim() || undefined;
  // WABA ID: read into the client-config surface now so it's available once
  // the deferred Tech Provider build needs it. Not otherwise used yet.
  // eslint-disable-next-line no-unused-vars
  const clientWabaId = (client.fields[F_WA_WABA_ID] || client.fields['WhatsApp WABA ID'] || '').toString().trim() || '';

  // 3. Check if conversation already finished
  // fld8mkrEWcyq7mUip = Conversation State (ID); field name as fallback
  const rawState = lead.fields['fld8mkrEWcyq7mUip'] || lead.fields['Conversation State'];
  const state    = (typeof rawState === 'object' ? rawState?.name : rawState) || '';
  if (state === 'completed') {
    // Client's DEFAULT language only — this branch returns before any AI
    // turn runs, so there's no live message to detect a lead's language
    // from even when Match Lead Language is enabled for this client (see
    // ctx.matchLeadLanguage below). Same registry-driven fallback everywhere
    // else in this file uses for a blank/unknown Language field: 'nl'.
    const earlyLang = _lang.normalizeLanguageCode(
      client && client.fields && (client.fields['fld1iiV9XwSbgAACZ'] || client.fields['Language'])
    );
    await sendWA(phone, _lang.buildCompletedMessage(earlyLang), clientPhoneNumberId);
    return;
  }

  // 3b. AI-PAUSE CHECK (human takeover). A staff member can pause the AI for
  // this lead from the dashboard (api/leads.js's 'ai-pause' mode) when they've
  // decided to drive the conversation themselves. The flag lives inside the
  // existing Notities JSON envelope (fldoLRI5W12ThTls7) — same mechanism
  // flagWaFailed/mergeWaFailedFlag already use for waFailed — rather than a
  // new Airtable field. While paused we must still record the inbound
  // message (nothing may be lost) and still update Last Message, but we must
  // NEVER call runAI() or send an AI reply: a human is driving now, and the
  // AI replying over them is exactly the collision this feature prevents.
  /* ── Afmelden ──────────────────────────────────────────────────────────────
   * VÓÓR de AI-pauze en vóór alles wat geld kost. Een lead die STOP typt hoort
   * geen AI-antwoord te krijgen op zijn afmelding, en al helemaal geen
   * creditafschrijving voor het gesprek.
   *
   * Er was hier niets: STOP kreeg een vriendelijk antwoord over het pand, en de
   * opvolgcron stuurde de dag erna weer een bericht. Zie api/_optout.js voor
   * waarom dat drie problemen tegelijk is.
   *
   * De bevestiging gaat WEL nog uit -- precies één zin. Zonder dat lijkt de
   * afmelding niet aangekomen en typt iemand het nog drie keer. */
  if (_optout.isAfmelding(text)) {
    console.log(`[WhatsApp] ${maskPhone(phone)} meldt zich af (${projectCode || '?'})`);

    const opgeslagen = await _optout.markeer(
      (id, velden) => updateLead(id, velden, phone, scopedProjectCode),
      lead.id,
    );

    // De afmelding blijft ook in de geschiedenis staan, zodat de makelaar ziet
    // wanneer en hoe het gebeurd is.
    let afmeldHistorie = [];
    const opgeslagenHist = lead.fields['Conversation History'];
    if (opgeslagenHist) { try { afmeldHistorie = JSON.parse(opgeslagenHist); } catch { afmeldHistorie = []; } }
    afmeldHistorie.push({ role: 'user', content: text, ts: Date.now() });
    if (afmeldHistorie.length > 20) afmeldHistorie = afmeldHistorie.slice(-20);
    await updateLead(lead.id, {
      'Last Message': text,
      'Conversation History': JSON.stringify(afmeldHistorie),
    }, phone, scopedProjectCode).catch(() => {});

    await sendWA(phone, _optout.bevestiging(lang), clientPhoneNumberId).catch(() => {});

    /* Eigen lokale kopie, net als het pauzeblok hieronder: `ownerPhone` en
       `leadName` worden pas tweehonderd regels verderop gedeclareerd en staan
       hier nog in hun dode zone. Ze hier gebruiken geeft een ReferenceError bij
       de eerste afmelding -- precies het soort fout dat pas bij een echte klant
       opvalt. */
    const ownerPhoneA = (client.fields['fldZEApe0gfse07AU'] || client.fields['Notify Phone'] || '').toString().trim() || NOTIFY_PHONE;
    const leadNaamA   = lead.fields['fldbk0LVNckOU0bqA'] || lead.fields['Name'] || '';

    /* De makelaar hoort dit te weten: dit is een lead die hij niet meer mag
       appen, en als de vlag NIET opgeslagen kon worden moet hij het handmatig
       doen -- anders blijft de opvolgcron gewoon sturen. */
    if (ownerPhoneA) {
      await sendWA(ownerPhoneA,
        `[Afgemeld] ${leadNaamA || maskPhone(phone)} wil geen berichten meer\n\n` +
        `Tel: ${phone}\n` +
        `Project: ${projectCode}\n\n` +
        (opgeslagen
          ? 'Hij is gemarkeerd; er gaat automatisch niets meer naar hem toe. Bellen mag nog wel.'
          : 'LET OP: de markering kon NIET opgeslagen worden. Zet hem met de hand op afgemeld, '
            + 'anders blijft de opvolging berichten sturen.'),
        clientPhoneNumberId).catch(() => {});
    }
    return;
  }

  /* Al eerder afgemeld? Dan komt er niets meer terug. Geen AI, geen credits,
     geen tweede bevestiging -- die kreeg hij de eerste keer al. Het bericht
     wordt wel bewaard, want de makelaar mag zien dat hij nog schrijft. */
  if (_optout.isAfgemeld(lead.fields)) {
    console.log(`[WhatsApp] ${maskPhone(phone)} is afgemeld — bericht bewaard, geen antwoord`);
    let hist = [];
    const opgesl = lead.fields['Conversation History'];
    if (opgesl) { try { hist = JSON.parse(opgesl); } catch { hist = []; } }
    hist.push({ role: 'user', content: text, ts: Date.now() });
    if (hist.length > 20) hist = hist.slice(-20);
    await updateLead(lead.id, {
      'Last Message': text,
      'Conversation History': JSON.stringify(hist),
    }, phone, scopedProjectCode).catch(() => {});
    return;
  }

  const pauseInfo = getAiPauseInfo(lead.fields[NOTITIES_FIELD] || lead.fields['Notities']);
  if (pauseInfo) {
    console.log(`[WhatsApp] Lead ${phone} is AI-paused sinds ${pauseInfo.at || '?'} (door ${pauseInfo.by || 'onbekend'}). Bericht opgeslagen, GEEN AI-antwoord verstuurd.`);

    let pausedHistory = [];
    const pausedStored = lead.fields['Conversation History'];
    if (pausedStored) { try { pausedHistory = JSON.parse(pausedStored); } catch { pausedHistory = []; } }
    pausedHistory.push({ role: 'user', content: text, ts: Date.now() });
    if (pausedHistory.length > 20) pausedHistory = pausedHistory.slice(-20);
    await updateLead(lead.id, { 'Last Message': text, 'Conversation History': JSON.stringify(pausedHistory) }, phone, scopedProjectCode);

    // Best-effort nudge to the owner that a paused lead just wrote. Fail-soft:
    // a notify failure must never look like a message-handling failure —
    // same contract as the escalation/qualified notifications below.
    const ownerPhoneP = (client.fields['fldZEApe0gfse07AU'] || client.fields['Notify Phone'] || '').toString().trim() || NOTIFY_PHONE;
    if (ownerPhoneP) {
      const leadNameP = lead.fields['fldbk0LVNckOU0bqA'] || lead.fields['Name'] || '';
      const nudge =
        `[Gepauzeerd] ${leadNameP || phone} schreef net terwijl jij het gesprek overnam\n\n` +
        `"${text.slice(0, 280)}"\n\n` +
        `Open de lead: https://app.helvaro.pro/dashboard`;
      const nudgeSent = await sendWA(ownerPhoneP, nudge, clientPhoneNumberId);
      if (!nudgeSent) console.error(`[whatsapp] paused-lead melding naar owner (${ownerPhoneP}) is niet aangekomen`);
    }
    return;
  }

  // 3c. PLAN STATUS CHECK — trial/expired/cancelled/paused clients. See
  // TRIAL-DESIGN.md §3-7 and api/_plan.js's header for the full contract.
  // getPlanState() fails OPEN on anything ambiguous (blank Plan Status,
  // unparseable Trial Ends At, unrecognized value) — this branch only ever
  // triggers for a client whose status is genuinely expired/cancelled/paused.
  const planState = getPlanState(client.fields);
  if (planState.isServiceStopped) {
    // Was the AI already mid-dialogue with this person? If Conversation
    // History already has prior turns, NEVER cut a real human off
    // mid-conversation — let it finish exactly as if the plan were active.
    // Only intercept BRAND NEW conversations (no prior turns yet). Parsed
    // locally (not reusing the `history` variable, which isn't declared
    // until step 4) — same per-branch duplication the pause-check above
    // already uses for its own `pausedHistory`.
    let priorHistory = [];
    const priorStored = lead.fields['Conversation History'];
    if (priorStored) { try { priorHistory = JSON.parse(priorStored); } catch { priorHistory = []; } }
    const hasPriorTurns = Array.isArray(priorHistory) && priorHistory.length > 0;

    if (!hasPriorTurns) {
      console.log(`[WhatsApp] Lead ${phone} (project ${projectCode}) — Plan Status '${planState.status}', geen eerdere beurten. Bericht opgeslagen, GEEN AI-antwoord verstuurd.`);

      priorHistory.push({ role: 'user', content: text, ts: Date.now() });
      if (priorHistory.length > 20) priorHistory = priorHistory.slice(-20);
      await updateLead(lead.id, { 'Last Message': text, 'Conversation History': JSON.stringify(priorHistory) }, phone, scopedProjectCode);

      // Notify the client (fail-soft): a lead came in they need to handle
      // themselves now that automation has stopped. Same contract as every
      // other owner-notify call in this file: never let a notify failure
      // read as a message-handling failure.
      const ownerPhoneExp = (client.fields['fldZEApe0gfse07AU'] || client.fields['Notify Phone']  || '').toString().trim() || NOTIFY_PHONE;
      const ownerEmailExp = (client.fields['fldDBJCN6dVMA8jax'] || client.fields['Rapport Email'] || '').toString().trim();
      const leadNameExp   = lead.fields['fldbk0LVNckOU0bqA'] || lead.fields['Name'] || '';
      const clientNameExp = client.fields['fldAnB848Sr5jl6dq'] || client.fields['Client Name'] || '';
      const statusLabels  = { expired: 'verlopen', cancelled: 'opgezegd', paused: 'gepauzeerd' };
      const statusLabel   = statusLabels[planState.status] || planState.status;

      if (ownerPhoneExp) {
        const nudge =
          `[Actie nodig] Nieuwe lead. AI staat stil (${statusLabel})\n\n` +
          `${leadNameExp || phone} schreef net. Je account is ${statusLabel}, dus de AI antwoordt niet automatisch. Het bericht is wel opgeslagen.\n\n` +
          `"${text.slice(0, 280)}"\n\n` +
          `Open de lead: https://app.helvaro.pro/dashboard`;
        const nudgeSentExp = await sendWA(ownerPhoneExp, nudge, clientPhoneNumberId);
        if (!nudgeSentExp) console.error(`[whatsapp] plan-status melding naar owner (${ownerPhoneExp}) is niet aangekomen`);
      }
      if (ownerEmailExp) {
        sendOwnerEmail({
          to: ownerEmailExp,
          subject: `[Actie nodig] Nieuwe lead. AI staat stil (${statusLabel})`,
          heading: `Nieuwe lead — automatische AI-opvolging staat stil`,
          leadName: leadNameExp, phone, projectCode, clientName: clientNameExp,
          body:
            `<p>Je accountstatus is <strong>${escEmail(statusLabel)}</strong>, dus de AI beantwoordt deze lead niet automatisch. Het bericht is wel opgeslagen en zichtbaar in je dashboard.</p>` +
            `<p style="background:#fef3c7;padding:12px;border-radius:8px">"${escEmail(text.slice(0, 280))}"</p>`
        }).catch(() => {});
      }
      return;
    }
    // else: conversation already in flight — fall through to the normal
    // flow below exactly as if the plan were active. Cutting a real human
    // off mid-conversation reads as a broken product, not a paywall.
  }

  // 4. Load conversation history
  let history = [];
  const stored = lead.fields['Conversation History'];
  if (stored) {
    try { history = JSON.parse(stored); } catch { history = []; }
  }
  // `ts` stamps every inbound message going forward. api/leads.js's manual-
  // reply endpoint uses it to enforce Meta's 24h customer-service window —
  // see its own doc comment for why conversations that predate this change
  // (no ts on their user-role entries) fail closed rather than assume the
  // window is still open.
  history.push({ role: 'user', content: text, ts: Date.now() });

  // 5. Fetch client website on first user message
  let websiteContent = null;
  if (history.length <= 2) {
    // 'Website' is the field name; no field ID is mapped for this field
    const website = client.fields['fldWebsiteUrl'] || client.fields['Website'];
    if (website) websiteContent = await fetchWebsite(website, { tag: '[WhatsApp]' });
  }

  // 6. Determine AI identity and client config
  // Field IDs take priority (immune to renames); field-name fallback for safety.
  // "AI Name" (fldRvoe1JMPOtPWC7) is the persona that signs every WhatsApp reply —
  // clients pick an employee name so leads feel they're chatting with a human.
  const customAiName = client.fields['fldRvoe1JMPOtPWC7'] || client.fields['AI Name'] || '';
  const aiName     = (customAiName && String(customAiName).trim()) ? String(customAiName).trim().slice(0, 60) : 'Mathis Willems';
  const clientName = client.fields['fldAnB848Sr5jl6dq']    || client.fields['Client Name'] || 'Helvaro';
  const leadName   = lead.fields['fldbk0LVNckOU0bqA']      || lead.fields['Name']          || '';
  const address    = client.fields['fldTvMSdTZOyNgWod']    || client.fields['Adres'] || client.fields['Address'] || '';
  // Language for the conversation: registry-driven (40 languages, see
  // api/_lang.js), default 'nl'. Unknown/blank Language field safely falls
  // back to 'nl' — same contract the old hardcoded nl/fr/en-only logic had.
  const lang = _lang.normalizeLanguageCode(client.fields['fld1iiV9XwSbgAACZ'] || client.fields['Language']);
  // OPT-IN: reply in whatever language the LEAD is actually writing in this
  // turn, instead of always forcing `lang` above. Off by default — the
  // forced-language behaviour is a deliberate brand choice (see runAI's
  // langDirective) and must never change silently for an existing client.
  // Field does NOT exist on the Airtable schema yet — Sindi needs to add it
  // (name: "Match Lead Language", type: Checkbox — see this branch's PR
  // report for the exact spec). An absent field reads as undefined here,
  // so `=== true` is false and every client behaves exactly as today until
  // the field exists AND is explicitly checked on — same "absent field =
  // unchanged behaviour" contract api/_credits.js's schema fields use.
  const matchLeadLanguage = client.fields['Match Lead Language'] === true;

  // Working Hours. NIET gebruikt om de AI te blokkeren (AI is 24/7 het hele
  // verkooppunt). Wel als CONTEXT voor de AI's system prompt zodat ze
  // realistische afspraak-tijden voorstelt ('morgen om 10u' ipv 'over een
  // uur' als het 22u is en de zaak 9-18 open is).
  /* Waar staat dit kantoor? Bepaalt de klok, de munt en het landnummer.
     Ontbreken de velden in Airtable, dan komt hier België uit en verandert er
     voor bestaande klanten niets. Zie api/_regio.js. */
  const regio = _regio.lees(client.fields);

  const workingHours = (client.fields['fldq5oIqw5MG8fKhc'] || client.fields['Working Hours'] || '').toString().trim();
  /* De klok van de KLANT, niet die van Brussel. Dit stond hardgecodeerd op
     Europe/Brussels: een Londens kantoor was volgens ons open van 08:00 tot
     16:00 hun tijd, en in Dubai liep het drie uur uit de pas. De AI vertelde
     leads dan dat het bureau gesloten was terwijl er iemand zat. */
  const outsideHours = workingHours && !_regio.binnenWerkuren(workingHours, regio);

  // Booking method: 'in_chat' (AI vraagt + boekt direct) of 'callback' (collega belt terug)
  // 'calendly' is deprecated — bestaande klanten met 'calendly' krijgen automatisch 'in_chat' gedrag.
  const rawBooking = (client.fields['fldUI9BYO0TplgYlm'] || client.fields['Booking Method'] || 'in_chat').toString().toLowerCase();
  const bookingMethod = rawBooking === 'callback' ? 'callback' : 'in_chat';
  const callbackWindow = (client.fields['fldKvMVBalSBRQE7H'] || client.fields['Callback Window'] || '').toString().trim() || 'binnen 30 minuten';
  // Werkuren parsen voor in-chat booking availability checking
  const appointmentDuration = parseInt(client.fields['Appointment Duration']) || 30;

  // Per-client owner contacts (with env-var fallback for backwards-compat).
  // The phone gets WhatsApp pings; the email gets a richer summary.
  const ownerPhone = (client.fields['fldZEApe0gfse07AU'] || client.fields['Notify Phone']  || '').toString().trim() || NOTIFY_PHONE;
  const ownerEmail = (client.fields['fldDBJCN6dVMA8jax'] || client.fields['Rapport Email'] || '').toString().trim();

  // 7. Run AI
  const aiInstructions = client.fields['fldAiInstructions'] || client.fields['AI Instructions'] || '';
  // Geleerde patronen — wekelijks bijgewerkt door cron-followup, geeft de AI
  // accumulatieve kennis over wat werkt voor deze specifieke klant.
  const learnedPatterns = (client.fields['fldnbM5YKh274ISAl'] || client.fields['AI Learned Patterns'] || '').toString().trim();
  // Voor in-chat booking: haal bestaande afspraken voor deze klant op zodat
  // AI dubbele boekingen kan vermijden. Range = vandaag + 14 dagen.
  let existingAppointments = [];
  if (bookingMethod === 'in_chat') {
    existingAppointments = await getUpcomingAppointments(projectCode).catch(() => []);
    // Merge the client's Google Calendar busy times so the AI never proposes a
    // slot they're already busy on. Best-effort: Google problems never block chat.
    try {
      const { token, calId } = await gcalAccess(client);
      if (token) {
        const busy = await _gcal.freeBusy(token, calId,
          new Date().toISOString(),
          new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString());
        const dOpt = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' };
        const tOpt = { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' };
        for (const b of busy) {
          const s = new Date(b.start), e = new Date(b.end);
          existingAppointments.push(`${s.toLocaleString('nl-BE', dOpt)}–${e.toLocaleString('nl-BE', tOpt)} (Google agenda, bezet)`);
        }
      }
    } catch (e) { /* best-effort, never block the AI turn */ }
  }

  /* Heeft DEZE lead zelf een afspraak staan?
     Los van de bezette-slots-lijst hierboven, en om een andere reden: die lijst
     zegt wanneer er GEEN plek is, dit zegt of er iets af te zeggen valt. Alleen
     als er echt iets staat krijgt de AI het afzeggen aangeboden -- anders praat
     hij over een afspraak die niet bestaat zodra een lead "ik kan niet" zegt.

     Ook voor callback-klanten: een afspraak kan ook vanuit het dashboard
     ingepland zijn, en de lead die afzegt weet dat onderscheid niet. */
  let eigenAfspraak = null;
  try {
    eigenAfspraak = await _afspraken.komendeVoorLead(projectCode, { leadId: lead.id, telefoon: phone });
  } catch (e) {
    console.warn('[whatsapp] eigen afspraak ophalen overgeslagen:', e && e.message);
  }

  /* ── Over welk pand gaat dit? ───────────────────────────────────────────────
     Drie mogelijkheden, in deze volgorde:

       1. De lead kwam via /start/TELJO/P3. Dan staat de code op zijn record en
          weten we het gewoon.
       2. Hij schreef rechtstreeks naar het nummer, maar noemt een straat of
          een referentie. Dan zoeken we die op in de panden van DEZE makelaar.
       3. We weten het niet. Dan krijgt de AI de lijst en de opdracht om het te
          VRAGEN -- niet om te gokken.

     Best-effort: bestaat de pandentabel nog niet of hapert Airtable, dan is
     pandSectie leeg en gedraagt de AI zich precies zoals hiervoor. Een lead
     zonder antwoord laten is erger dan een lead zonder pandfiche. */
  let pandSectie = '';
  let herkendPand = null;
  try {
    if (await _properties.available()) {
      const opLead = _properties.normCode(
        (function () {
          try {
            const blob = JSON.parse(lead.fields['fldoLRI5W12ThTls7'] || lead.fields['Notities'] || '{}');
            return blob && blob.property ? blob.property : '';
          } catch (_) { return ''; }
        })()
      );

      if (opLead) herkendPand = await _properties.getByCode(projectCode, opLead);

      if (!herkendPand) {
        /* Zoeken op wat de lead schrijft. Alleen de berichten VAN de lead:
           wat de AI zelf eerder zei is geen bewijs van wat de lead bedoelt --
           anders bevestigt hij zijn eigen gok van drie beurten geleden. */
        const leadTekst = history
          .filter((m) => m && m.role === 'user')
          .map((m) => String(m.content || ''))
          .join(' ');
        const kandidaten = await _properties.list(projectCode, { alleenPubliek: true });
        const match = _properties.matchUitTekst(kandidaten, leadTekst);
        if (match.pand) herkendPand = match.pand;
        else if (kandidaten.length) pandSectie = _ai.prompts.panden.index(kandidaten);
      }

      if (herkendPand) pandSectie = _ai.prompts.panden.fiche(herkendPand);
    }
  } catch (e) {
    console.warn('[WhatsApp] pandcontext overgeslagen:', e && e.message);
  }

  const aiResponse = await runAI(history, aiInstructions, leadName, aiName, clientName, websiteContent, address, lang, {
    workingHours, outsideHours, bookingMethod, callbackWindow, learnedPatterns,
    appointmentDuration, existingAppointments, matchLeadLanguage,
    // De AI-router boekt verbruik per tenant; zonder projectcode weigert hij.
    projectCode,
    pandSectie,
    /* Een verkocht pand mag geen bezichtiging opleveren. De prompt zegt het al,
       maar een prompt is een verzoek en dit is een regel -- zie waar
       BOOK verwerkt wordt. */
    pandBezichtigbaar: herkendPand ? _properties.kanBezichtigen(herkendPand.status) : true,
    pandCode: herkendPand ? herkendPand.code : '',
    /* Alleen het MOMENT gaat mee, niet het record-id. De AI hoeft niet te weten
       welke rij het is -- hij zegt "de afspraak" af en deze code zoekt hem er
       zelf bij. Een id in een prompt is een id dat een model kan verzinnen. */
    eigenAfspraak: eigenAfspraak
      /* `lang` en niet effectiveLang: die wordt pas NA de AI-aanroep bepaald
         (hij hangt af van de taal waarin de AI antwoordde) en staat hier nog in
         zijn dode zone. Voor een datum in een systeemprompt is de ingestelde
         taal van de klant sowieso de juiste. */
      ? formatApptDateTime(eigenAfspraak.fields[_afspraken.F.START], lang)
      : '',
  });

  // 7b. Credit accounting. Billed ONCE per lead — at the first AI turn
  // (history.length === 1 means step 4 just pushed this lead's very first
  // inbound message, before any assistant reply has been appended) — not
  // once per message turn. CREDIT-SYSTEM-DESIGN.md anchors "1 lead
  // conversation = 20 credits" against the full lifecycle of a conversation
  // (2000 credits / 100 gesprekken); billing every turn would blow that math
  // up to 100-160 credits for a normal 5-8 turn conversation. Fire-and-forget
  // (never awaited, never blocks delivery below) and NEVER gated by
  // checkCredits — see this file's top-of-file comment and _credits.js's
  // header for why a lead conversation must never be blocked.
  if (history.length === 1) {
    const creditWork = credits.recordUsage(projectCode, credits.FEATURES.WHATSAPP_CONVERSATION, {
      credits: credits.WEIGHTS[credits.FEATURES.WHATSAPP_CONVERSATION],
      /* Eén gesprek, één afschrijving, voor altijd -- ook al komt deze beurt
         tien keer langs. Dat gebeurde echt: de historie wordt alleen bewaard
         als het antwoord AANKWAM, dus tijdens een storing begon elke volgende
         beurt weer bij "één bericht" en werd er opnieuw twintig credits
         geboekt. Voor een lead die nooit iets terugkreeg. Dezelfde referentie
         vangt ook een webhook die Meta opnieuw aanbiedt op een andere
         Vercel-instantie, waar de geheugen-ontdubbeling niets van weet. */
      reference: `wa:${lead.id}`,
      meta: { leadId: lead.id },
    }).catch(() => {}); // recordUsage() itself never throws; belt-and-braces
    // Not awaited (must never add latency before the reply goes out below),
    // but still registered with waitUntil() so it survives if the container
    // gets recycled during the 25-55s human-feeling delay a few lines down —
    // same pattern the handler above uses for processMessage() itself.
    waitUntil(creditWork);
  }

  // 8. Trim the AI reply. We deliberately do NOT push it into `history` or
  //    touch Airtable yet. Whether the conversation "actually advanced" is
  //    only known once we've tried to deliver it (step 10) — persisting
  //    optimistically here is exactly the bug this fix closes.
  const replyText    = aiResponse.message.trim();
  const isEscalation = aiResponse.escalate === true;

  // Effective language for anything sent AFTER this AI turn (booking
  // confirmation, callback message below). In forced mode (default) this is
  // always the client's configured `lang`, unchanged. In match mode it's
  // whatever language the AI actually replied in THIS turn — self-reported
  // in the DECISION JSON as replyLang (see _lang.buildMatchDirective()) —
  // falling back to `lang` if the AI didn't report one (e.g. a non-final
  // turn, or an unrecognized code).
  const effectiveLang = matchLeadLanguage
    ? _lang.normalizeLanguageCode(aiResponse.replyLang, lang)
    : lang;

  // 9. Wait a randomized, human-feeling delay before sending. Real people
  // don't reply on exact 30-sec intervals. Range 25-55 sec keeps it natural
  // while still feeling "they saw it pretty quickly".
  const humanDelay = 25_000 + Math.floor(Math.random() * 30_000);
  await new Promise(resolve => setTimeout(resolve, humanDelay));

  // 10. Attempt delivery FIRST, then persist an outcome that matches what
  // actually happened. All fields use field IDs where known. Immune to
  // Airtable field renames. 'Conversation History' and 'Last Message' have
  // no known field ID; kept by name.
  const sendOk = await sendWA(phone, replyText, clientPhoneNumberId);
  const updateFields = { 'Last Message': text };
  if (sendOk) {
    // `ts` stamps outbound turns too (not just inbound, see step 4's push
    // above) — getLead()'s cross-client collision resolver uses "most
    // recent outbound message" as its primary signal, and that only works
    // if assistant turns carry a timestamp same as user turns already do.
    history.push({ role: 'assistant', content: replyText, ts: Date.now() });
    if (history.length > 20) history = history.slice(-20);
    updateFields['Conversation History'] = JSON.stringify(history);
    // If AI escalated, we treat the state as 'in_progress' (awaiting human),
    // never as 'completed'. even if the AI also set done:true.
    updateFields.fld8mkrEWcyq7mUip = (aiResponse.done && !isEscalation) ? 'completed' : 'in_progress';
    // ALWAYS update AI Summary if the AI provided one. Even mid-conversation.
    // This way the dashboard's lead-panel always shows the latest understanding
    // of what the lead wants, instead of having to wait until 'done:true'.
    if (aiResponse.summary) {
      updateFields.fldqerIiw5qyQjXHr = String(aiResponse.summary).slice(0, 600);
    }
    if (aiResponse.done && !isEscalation) {
      Object.assign(updateFields, {
        fld0hAZJ5wgaXrNTn: aiResponse.qualified,         // Qualified
        fld3NhSENma0okbT7: aiResponse.reason    || '',   // Reason
        // summary already set above (every turn), don't overwrite
        // Alle vier gaan door een validatie, want Airtable weigert bij één
        // ongeldige waarde de HELE update — zie updateLead() hieronder.
        fldrfbTopJvZEYSKP: oneOf(aiResponse.ability, ABILITY_CHOICES),  // Ability
        fldlyLH1DKrWyG3Tr: oneOf(aiResponse.urgency, URGENCY_CHOICES),  // Urgency
        fldqNxsPshvZEBeLr: oneOf(aiResponse.fit,     FIT_CHOICES),      // Fit
        fldpzQgMuWJLjogiD: clampScore(aiResponse.leadScore),            // Lead Score
      });
    }
  } else {
    // Delivery failed. Leave Conversation History/State exactly as they were
    // (the lead never saw this reply, so nothing about the conversation
    // actually moved forward) and flag the lead the same way api/form.js's
    // flagWaFailed does, so it surfaces in the dashboard's "Niet bereikbaar"
    // view and cron-followup's stuck-lead sweep instead of silently looking
    // like a healthy, in-progress conversation.
    console.error(`[WhatsApp] Verzenden naar ${phone} mislukt. Conversation History/State blijven ongewijzigd`);
    updateFields[NOTITIES_FIELD] = mergeWaFailedFlag(lead.fields[NOTITIES_FIELD] || lead.fields['Notities']);
  }
  await updateLead(lead.id, updateFields, phone, scopedProjectCode);

  // 10b. ESCALATION. When the AI explicitly says "I don't know, let me check",
  // ping the owner immediately so they can take over within the 30 min the AI
  // promised the lead.
  if (isEscalation) {
    const lastUserMsg = (text || '').slice(0, 280);
    const escalateNotice =
      `[Actie nodig] Lead heeft een vraag die de AI niet kan beantwoorden\n\n` +
      `Naam: ${leadName || '(onbekend)'}\n` +
      `Tel: ${phone}\n` +
      `Project: ${projectCode}\n\n` +
      `Hun vraag:\n"${lastUserMsg}"\n\n` +
      `De AI heeft beloofd dat iemand binnen 30 min terugkomt. Open de lead:\n` +
      `https://app.helvaro.pro/dashboard`;
    if (ownerPhone) {
      // sendWA() never throws (see its own doc comment) — it resolves to
      // `false` on delivery/network failure and already logs the raw reason
      // itself. Check the result and log call-site context on top, so an
      // escalation-ping failure specifically is traceable in server logs
      // rather than indistinguishable from any other WhatsApp send failure.
      const escalateSent = await sendWA(ownerPhone, escalateNotice, clientPhoneNumberId);
      if (!escalateSent) console.error(`[whatsapp] escalatie-melding naar owner (${ownerPhone}) is niet aangekomen`);
    }
    if (ownerEmail) sendOwnerEmail({
      to: ownerEmail,
      // subjectSafe(), niet de rauwe naam: die komt uit het publieke
      // leadformulier en mag geen CR/LF in een mailheader zetten.
      subject: `[Actie nodig] AI heeft hulp nodig. ${subjectSafe(leadName || phone)}`,
      heading: `Lead-vraag die de AI niet kan beantwoorden`,
      leadName, phone, projectCode, clientName,
      body: `<p style="background:#fef3c7;padding:12px;border-radius:8px"><strong>Hun vraag:</strong><br>"${escEmail(lastUserMsg)}"</p><p>De AI heeft beloofd dat iemand binnen 30 min terugkomt.</p>`
    }).catch(() => {});

    // Persist an 'escalated' marker in Notities (merged, never overwritten —
    // same mergeWaFailedFlag pattern) so the dashboard's takeover widget can
    // surface this lead even after the WhatsApp/email ping has scrolled out
    // of view. If sendOk was false this turn, `updateFields[NOTITIES_FIELD]`
    // already holds the freshly merged waFailed JSON from step 10 above —
    // use that as the baseline instead of the stale `lead.fields` snapshot
    // so we don't clobber it; otherwise Notities wasn't touched this turn
    // and the original snapshot is still accurate.
    try {
      const notitiesBaseline = updateFields[NOTITIES_FIELD] !== undefined
        ? updateFields[NOTITIES_FIELD]
        : (lead.fields[NOTITIES_FIELD] || lead.fields['Notities']);
      const mergedNotities = mergeEscalatedFlag(notitiesBaseline, lastUserMsg);
      await updateLead(lead.id, { [NOTITIES_FIELD]: mergedNotities }, phone, scopedProjectCode);
    } catch (err) {
      console.error('[whatsapp] escalated-vlag opslaan mislukt (melding is al verstuurd):', err.message);
    }
  } else {
    // Opportunistic cleanup: a PRIOR turn may have escalated, and this turn
    // the AI handled things normally (no new escalation) — e.g. the lead
    // moved on before anyone manually replied, which is the only other place
    // (api/leads.js's manual-reply mode) that currently clears this flag.
    // Without this, a resolved-by-itself conversation could keep showing up
    // in the dashboard's takeover widget forever. Same stale-baseline guard
    // as above: prefer this turn's freshly merged Notities if step 10 above
    // already touched it (sendOk===false), else the original snapshot.
    try {
      const notitiesBaseline = updateFields[NOTITIES_FIELD] !== undefined
        ? updateFields[NOTITIES_FIELD]
        : (lead.fields[NOTITIES_FIELD] || lead.fields['Notities']);
      const cleared = clearEscalatedFlag(notitiesBaseline);
      if (cleared !== null) await updateLead(lead.id, { [NOTITIES_FIELD]: cleared }, phone, scopedProjectCode);
    } catch (err) {
      console.error('[whatsapp] escalated-vlag opruimen mislukt:', err.message);
    }
  }

  // 11. CALLBACK booking flow — alleen als klant 'callback' kiest. In-chat
  //     booking wordt afgehandeld via BOOK:{...} block dat de AI uitstuurt
  //     (zie sectie 10b hieronder). Skip bij escalatie. Skip ook als de
  //     hoofdreply (replyText) niet aankwam — anders bevestigen we een
  //     terugbel-afspraak op een gesprek dat de lead nooit zag.
  if (sendOk && aiResponse.done && aiResponse.qualified && !isEscalation && bookingMethod === 'callback') {
    const bookingSent = lead.fields['fldLeEqwNefdglLis'] || lead.fields['Booking Link Sent'];
    if (!bookingSent) {
      await sendWA(phone, _lang.buildCallbackMessage(effectiveLang, callbackWindow), clientPhoneNumberId);
      await updateLead(lead.id, { fldLeEqwNefdglLis: true }, phone, scopedProjectCode);
    }
  }

  /* 11a-bis. AFZEGGEN -- de lead heeft laten weten dat hij niet komt.
   *
   * Staat VOOR de boeking hieronder, en dat is geen smaak: zegt een lead af en
   * noemt hij in dezelfde beurt een nieuw moment, dan moet de oude eerst weg.
   * Andersom zou de nieuwe boeking overgeslagen worden door de rem die de oude
   * afspraak nog zette.
   *
   * Waarom dit hier hoort en niet in het dashboard: de makelaar leest zijn
   * dashboard misschien morgen. Een lead die vanavond afzegt, hoort vanavond
   * uit de agenda -- anders houdt de makelaar een uur vrij voor iemand die niet
   * komt, en dat is precies het uur dat hij aan een andere lead had kunnen
   * geven.
   *
   * `sendOk` is bewust GEEN voorwaarde, anders dan bij boeken. Een boeking
   * bevestigen op een bericht dat de lead nooit zag is misleidend; een afspraak
   * uit de agenda halen omdat iemand zei dat hij niet komt is gewoon waar, ook
   * als ons antwoord onderweg strandde.
   */
  let afspraakAfgezegd = false;
  if (aiResponse.cancel && !isEscalation) {
    if (!eigenAfspraak) {
      // De AI zag in de prompt dat er een afspraak stond, maar die is er nu
      // niet meer (dashboard, of een eerdere beurt). Niets doen en niets
      // beloven -- wel loggen, want als dit vaak gebeurt klopt de prompt niet.
      console.warn(`[whatsapp] CANCEL zonder afspraak voor ${phone} (${projectCode}) — genegeerd`);
    } else {
      const uit = await _afspraken.annuleer({
        projectCode,
        record: eigenAfspraak,
        reden: aiResponse.cancel.reason,
        door: 'lead',
      }).catch((err) => {
        console.error('[whatsapp] afzeggen exception:', err && err.message);
        return { ok: false, reden: 'exception' };
      });

      if (!uit.ok) {
        console.error(`[whatsapp] afzeggen mislukt voor ${phone} (${projectCode}): ${uit.reden}`);
        // Niets tegen de lead zeggen dat niet waar is. Wel de makelaar
        // waarschuwen: iemand komt niet opdagen en de agenda weet dat niet.
        if (ownerPhone) {
          await sendWA(ownerPhone,
            `[Actie nodig] Afzegging NIET verwerkt\n\n` +
            `Naam: ${leadName || '(onbekend)'}\n` +
            `Tel: ${phone}\n` +
            `Project: ${projectCode}\n\n` +
            `De lead liet weten dat hij niet komt, maar de afspraak kon niet afgezegd worden (${uit.reden}). ` +
            `Zet hem met de hand op geannuleerd, anders blijft het moment bezet.\n\n` +
            `Dashboard: https://app.helvaro.pro/dashboard`,
            clientPhoneNumberId).catch(() => {});
        }
      } else {
        afspraakAfgezegd = true;
        const wanneer = formatApptDateTime(eigenAfspraak.fields[_afspraken.F.START], effectiveLang);

        /* De AI schreef zelf al iets ("jammer, wanneer komt het je wel uit?").
           Dit bericht komt daar NIET nog eens overheen -- twee berichten over
           dezelfde afzegging leest als een bot die zichzelf herhaalt. Alleen
           als ons antwoord niet aankwam, is dit het enige wat de lead hoort. */
        if (!sendOk) {
          await sendWA(phone, _lang.buildCancelledMessage(effectiveLang), clientPhoneNumberId).catch(() => {});
        }

        // De makelaar, meteen. Dit is de kern van wat afzeggen bruikbaar maakt.
        if (ownerPhone) {
          const melding =
            `[Afgezegd] ${leadName || 'Lead'} komt niet\n\n` +
            `Was gepland: ${wanneer}\n` +
            `Tel: ${phone}\n` +
            `Project: ${projectCode}\n` +
            (aiResponse.cancel.reason ? `\nReden: "${aiResponse.cancel.reason}"\n` : '') +
            `\nHet moment staat weer vrij${uit.googleWeg ? ' en is uit je Google-agenda gehaald' : ''}. ` +
            `De AI heeft al gevraagd wanneer het wel past.\n\n` +
            `Dashboard: https://app.helvaro.pro/dashboard`;
          const gestuurd = await sendWA(ownerPhone, melding, clientPhoneNumberId);
          if (!gestuurd) console.error(`[whatsapp] afzeg-melding naar owner (${ownerPhone}) is niet aangekomen`);
        }
        if (ownerEmail) {
          sendOwnerEmail({
            to: ownerEmail,
            subject: `[Afgezegd] ${subjectSafe(leadName || phone)} komt niet op ${wanneer}`,
            heading: 'Afspraak afgezegd door de lead',
            leadName, phone, projectCode, clientName,
            body: `<p>Was gepland: <strong>${escEmail(wanneer)}</strong>.</p>`
                + (aiResponse.cancel.reason ? `<p style="background:#fef3c7;padding:12px;border-radius:8px"><strong>Reden:</strong><br>"${escEmail(aiResponse.cancel.reason)}"</p>` : '')
                + `<p>Het moment staat weer vrij${uit.googleWeg ? ' en is uit de Google-agenda gehaald' : ''}. De AI heeft al gevraagd wanneer het wel past.</p>`,
          }).catch(() => {});
        }
      }
    }
  }

  /* Wat er moet gebeuren als een boeking stukloopt nadat de AI hem al bevestigd
     heeft. Apart, omdat er twee wegen naartoe lopen (een geweigerde schrijf en
     een uitzondering) en ze allebei hetzelfde moeten doen. */
  async function meldMislukteBoeking(reden) {
    console.error(`[whatsapp] afspraak NIET aangemaakt voor ${phone} (${projectCode}): ${reden}`);
    try {
      await sendWA(phone, _lang.buildSlotConflictMessage(effectiveLang), clientPhoneNumberId);
    } catch (e) {
      console.error('[whatsapp] correctie na mislukte boeking niet verstuurd:', e && e.message);
    }
    if (ownerPhone) {
      await sendWA(ownerPhone,
        `[Actie nodig] Afspraak NIET aangemaakt\n\n` +
        `Naam: ${leadName || '(onbekend)'}\n` +
        `Tel: ${phone}\n` +
        `Project: ${projectCode}\n\n` +
        `De AI bevestigde een afspraak aan de lead, maar het opslaan mislukte (${String(reden).slice(0, 160)}). ` +
        `Er staat NIETS in de agenda. De lead is gevraagd een ander moment te kiezen, maar bel hem gerust zelf.\n\n` +
        `Dashboard: https://app.helvaro.pro/dashboard`,
        clientPhoneNumberId).catch(() => {});
    }
    if (ownerEmail) {
      sendOwnerEmail({
        to: ownerEmail,
        subject: `[Actie nodig] Afspraak niet aangemaakt. ${subjectSafe(leadName || phone)}`,
        heading: 'Een bevestigde afspraak is niet opgeslagen',
        leadName, phone, projectCode, clientName,
        body: `<p style="background:#fee2e2;padding:12px;border-radius:8px">De AI bevestigde een afspraak aan de lead, `
            + `maar het opslaan mislukte:<br><strong>${escEmail(String(reden).slice(0, 200))}</strong></p>`
            + `<p>Er staat niets in de agenda. De lead is gevraagd een ander moment te kiezen.</p>`,
      }).catch(() => {});
    }
  }

  // 11b. IN-CHAT booking — AI heeft BOOK:{...} block uitgegeven in z'n antwoord.
  //      Verwerk de booking: maak Appointment record + bevestig naar lead +
  //      notify owner. AI handelt de natuurlijke conversatie zelf af (parseert
  //      lead's tijdvoorstel + stelt slot voor + wacht op bevestiging).
  //      Skip als replyText niet aankwam — zie 11 hierboven.
  if (sendOk && aiResponse.appointment && bookingMethod === 'in_chat' && !isEscalation) {
    const appt = aiResponse.appointment;
    /* Begrenzen, niet vertrouwen. Een duur van 100000 uit een modelantwoord zet
       tien weken agenda vast; nul minuten maakt een afspraak die niemand ziet
       staan. Vijf minuten tot vier uur is het bereik waarin een bezichtiging
       bestaat. */
    if (appt && appt.duration !== undefined) {
      appt.duration = Math.min(240, Math.max(5, Math.round(Number(appt.duration) || appointmentDuration)));
    }
    /* Na een afzegging in DEZELFDE beurt is de vlag hierboven al gewist in
       Airtable, maar `lead.fields` is een foto van het begin van deze beurt en
       zegt nog "ja, al geboekt". Zonder dit zou een lead die afzegt en meteen
       een nieuw moment bevestigt geen nieuwe afspraak krijgen -- de stilste
       manier om iemand kwijt te raken. */
    const bookingSent = !afspraakAfgezegd
      && (lead.fields['fldLeEqwNefdglLis'] || lead.fields['Booking Link Sent']);
    /* De enige poort was tot hier `appt.start` truthy. Een gehallucineerd
       tijdstip ("morgen om 14u") is truthy, en dan gaat het hele stuk eronder
       door met een Invalid Date:
         - isSlotFree() rekent met NaN, elke overlapvergelijking is false, dus
           de dubbelboekingscontrole laat het ONGEMERKT door;
         - het afspraak-id wordt "TELJO-aNNaNNaN";
         - formatApptDateTime() valt netjes terug op de ruwe tekst, dus de lead
           krijgt keurig "bevestigd voor morgen om 14u" te lezen.
       Een datum in het verleden is even erg: een bezichtiging vorige week.
       De duur was ook onbegrensd -- 100000 minuten blokkeert tien weken agenda. */
    const startMs = Date.parse(appt.start);
    const startGeldig = Number.isFinite(startMs) && startMs > Date.now() - 60000;
    if (!bookingSent && appt.start && !startGeldig) {
      console.warn(`[whatsapp] BOOK geweigerd: onbruikbaar tijdstip "${appt.start}" voor ${phone} (${projectCode})`);
      await meldMislukteBoeking(`het model gaf een onbruikbaar tijdstip: "${String(appt.start).slice(0, 60)}"`);
    } else if (!bookingSent && appt.start) {
      // Fetch Google Calendar access ONCE for this booking — reused below for
      // both the pre-write availability check and the post-write mirror,
      // instead of refreshing the OAuth access token twice.
      let gToken = '', gCalId = 'primary';

      // Final availability check, immediately before writing anything. The
      // busy-list the AI saw (step 6 above) was snapshotted at the START of
      // this turn, before the human-feeling delay (step 9) and before the
      // lead actually confirmed — something else (another lead booking
      // concurrently, or the client adding something to their own Google
      // Calendar) can fill the slot in that window. isSlotFree() fails OPEN
      // on any Google/network error (see api/_gcal.js's own doc comment) —
      // that is deliberate and must be preserved: `slotTaken` only becomes
      // true on a genuine, confirmed overlap, never on Google being slow or
      // down. No token (client never connected Google) means there is
      // nothing to check against, so behaviour is exactly what it was before
      // this fix for every client who hasn't connected Google Calendar.
      let slotTaken = false;
      try {
        const gAccess = await gcalAccess(client);
        gToken = gAccess.token; gCalId = gAccess.calId;
        if (gToken) slotTaken = !(await _gcal.isSlotFree(gToken, gCalId, appt.start, appt.duration || appointmentDuration));
      } catch (e) {
        // gcalAccess()/isSlotFree() already fail closed/open internally and
        // should never throw — this is belt-and-braces. Any unexpected error
        // here must be treated like "no Google" (fail open), never like a
        // booking failure.
        console.error('[gcal] availability check exception (treating as no-Google):', e && e.message);
        gToken = ''; slotTaken = false;
      }

      if (slotTaken) {
        // The AI's reply THIS turn (already sent above in step 10 — e.g.
        // "Ingepland. Tot dan.") told the lead the slot was confirmed BEFORE
        // we ever get a chance to check Google; the AI drafts that line as
        // part of the same response that carries the BOOK:{...} block, so
        // there is no way to check first. We can't unsend it, so we do the
        // next best thing:
        //  1. Do NOT create the Airtable appointment — there is then nothing
        //     that looks "confirmed" to silently double-book the client's
        //     calendar or show up on their dashboard as a real appointment.
        //  2. Immediately correct the lead with a real WhatsApp message
        //     rather than leaving them believing they have a slot that does
        //     not exist.
        //  3. Ping the owner so a human is aware and can close the loop if
        //     the lead doesn't respond again.
        // fldLeEqwNefdglLis/"Appointment Booked" are deliberately left
        // unset, so a later turn (lead proposes another time) or the owner
        // can still book successfully once a real slot is agreed.
        try {
          const conflictSent = await sendWA(phone, _lang.buildSlotConflictMessage(effectiveLang), clientPhoneNumberId);
          if (!conflictSent) console.error(`[whatsapp] slot-conflict correctie naar ${phone} niet aangekomen`);
        } catch (err) {
          console.error('[whatsapp] slot-conflict correctie exception:', err.message);
        }
        if (ownerPhone) {
          const conflictNotice =
            `[Actie nodig] Dubbele boeking voorkomen\n\n` +
            `Naam: ${leadName || '(onbekend)'}\n` +
            `Tel: ${phone}\n` +
            `Project: ${projectCode}\n\n` +
            `De AI bevestigde ${formatApptDateTime(appt.start, effectiveLang)} aan de lead, maar dat moment bleek net bezet in de Google agenda. ` +
            `Er is GEEN afspraak aangemaakt en de lead is gevraagd een ander moment te kiezen — volg op als dat nog niet gebeurd is.\n\n` +
            `Dashboard: https://app.helvaro.pro/dashboard`;
          const conflictNotifySent = await sendWA(ownerPhone, conflictNotice, clientPhoneNumberId);
          if (!conflictNotifySent) console.error(`[whatsapp] conflict-melding naar owner (${ownerPhone}) is niet aangekomen`);
        }
      } else {
        try {
          const apptResult = await createAppointment({
            startTime:     appt.start,
            duration:      appt.duration || appointmentDuration,
            projectCode,
            leadId:        lead.id,
            leadName,
            leadPhone:     phone,
            notes:         aiResponse.summary || ''
          });
          if (apptResult.ok) {
            await updateLead(lead.id, {
              fldLeEqwNefdglLis: true,
              fldyIGNetqcSEkoaK: true  // Appointment Booked checkbox
            }, phone, scopedProjectCode);

            // ── Booking confirmation (fail-soft) ───────────────────────────
            // We're mid-conversation right now — the lead just messaged us,
            // so Meta's 24h customer-service window is definitely open, and
            // a freeform message is safe here. Contrast with the dashboard-
            // created path in api/leads.js's appointment-create mode, which
            // has no such guarantee (the lead may not have messaged in days)
            // and therefore MUST go through an approved template instead —
            // see sendAppointmentConfirmation() there.
            // Own try/catch: a failure here must never read as "appointment
            // creation failed" (it already exists at this point) — log it
            // distinctly instead.
            try {
              const when = formatApptDateTime(appt.start, effectiveLang);
              const confirmSent = await sendWA(phone, _lang.buildConfirmMessage(effectiveLang, clientName, when, address), clientPhoneNumberId);
              if (!confirmSent) console.error(`[whatsapp] booking confirmation naar ${phone} niet aangekomen (afspraak zelf blijft geldig)`);
            } catch (err) {
              console.error('[whatsapp] booking confirmation exception (afspraak zelf blijft geldig):', err.message);
            }

            // Mirror the booking into the client's Google Calendar
            // (best-effort). Own try/catch, same contract as the
            // confirmation above: the appointment already exists — a Google
            // failure must never look like a booking failure. Reuses the
            // gToken/gCalId fetched above for the availability check instead
            // of fetching again.
            try {
              if (gToken) {
                const ev = await _gcal.createEvent(gToken, gCalId, {
                  summary:     `Afspraak: ${leadName || 'lead'} (Helvaro)`,
                  description: `Telefoon: ${phone}\nProject: ${projectCode}\n${aiResponse.summary || ''}`,
                  startISO:    appt.start,
                  durationMin: appt.duration || appointmentDuration,
                });
                if (ev.ok && ev.eventId) await setApptGoogleEvent(apptResult.id, ev.eventId);
                else if (!ev.ok) console.error('[gcal] booking mirror failed:', ev.error);
              }
            } catch (e) { console.error('[gcal] booking mirror exception:', e && e.message); }
          } else {
            /* De afspraak is NIET aangemaakt, en de AI heeft de lead hierboven
               al "ingepland, tot dan" geschreven. Dat bericht is niet terug te
               halen. Hier stond niets -- geen else, alleen een console.error in
               de catch -- en dat betekende: de lead denkt dat hij een
               bezichtiging heeft, de agenda is leeg, en niemand weet het. De
               makelaar hoorde er pas van als er iemand voor een dichte deur
               stond, of nooit.

               Het slot-conflict twee blokken hierboven doet dit al goed en is
               hier het voorbeeld: de lead rechtzetten, de makelaar waarschuwen,
               en de boekingsvlag NIET zetten zodat een volgende beurt het
               alsnog kan boeken. */
            await meldMislukteBoeking(apptResult.error || 'onbekende fout');
          }
        } catch (err) {
          console.error('[whatsapp] appointment creation failed:', err.message);
          await meldMislukteBoeking(err && err.message);
        }
      }
    }
  }

  // 11c. Owner notificaties bij qualified (zowel in_chat als callback). Skip bij escalatie.
  // Intentioneel NIET gegated op sendOk: de kwalificatie is gebaseerd op wat de
  // LEAD al zei, niet op onze reply. De owner mag dit altijd weten, ook als
  // ons laatste bericht niet aankwam (kan zelf manueel opvolgen).
  if (aiResponse.done && aiResponse.qualified && !isEscalation) {

    // Notify owner when a lead is qualified. WhatsApp + Email parallel
    const score = aiResponse.leadScore ? ` Score: ${aiResponse.leadScore}/10` : '';
    if (ownerPhone) {
      const notifyMsg =
        `Gekwalificeerde lead\n\n` +
        `Naam: ${leadName}\n` +
        `Tel: ${phone}\n` +
        `Project: ${projectCode}${score}\n` +
        `${aiResponse.summary || ''}\n\n` +
        `Dashboard: https://app.helvaro.pro/dashboard`;
      // See the escalatie-melding comment above: sendWA() never throws, so
      // check the resolved boolean rather than relying on an unreachable .catch().
      const qualifiedNotifySent = await sendWA(ownerPhone, notifyMsg, clientPhoneNumberId);
      if (!qualifiedNotifySent) console.error(`[whatsapp] gekwalificeerde-lead-melding naar owner (${ownerPhone}) is niet aangekomen`);
    }
    if (ownerEmail) {
      sendOwnerEmail({
        to: ownerEmail,
        subject: `Nieuwe gekwalificeerde lead. ${subjectSafe(leadName)}`,
        heading: `Gekwalificeerde lead`,
        leadName, phone, projectCode, clientName,
        body:
          `${aiResponse.leadScore ? `<p><strong>Lead score:</strong> ${aiResponse.leadScore}/10</p>` : ''}` +
          `${aiResponse.summary ? `<p style="background:#ecfdf5;padding:12px;border-radius:8px"><strong>Samenvatting:</strong><br>${escEmail(aiResponse.summary)}</p>` : ''}` +
          `${aiResponse.reason  ? `<p><strong>Waarom gekwalificeerd:</strong> ${escEmail(aiResponse.reason)}</p>` : ''}`
      }).catch(() => {});
    }
  }
}

// ─── EMAIL NOTIFICATIONS (owner alerts) ──────────────────────────────────────
// Centraal helper voor klant-facing e-mails wanneer de AI iets meldwaardigs doet
// (escalatie, gekwalificeerde lead). Stuurt naar het Rapport Email veld van de
// klant. Faalt stil. E-mail mag de WhatsApp-flow nooit blokkeren.

function escEmail(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendOwnerEmail({ to, subject, heading, leadName, phone, projectCode, clientName, body }) {
  if (!to) return;
  const { sendMail } = require('./_mailer');
  const html = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:auto;padding:24px;color:#111">
            <h2 style="color:#1e6fd9;margin:0 0 16px">${escEmail(heading)}</h2>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
              <tr><td style="padding:8px 0;color:#666;width:90px">Naam</td><td style="padding:8px 0;font-weight:600">${escEmail(leadName || '—')}</td></tr>
              <tr><td style="padding:8px 0;color:#666">Telefoon</td><td style="padding:8px 0;font-weight:600">${escEmail(phone)}</td></tr>
              <tr><td style="padding:8px 0;color:#666">Project</td><td style="padding:8px 0">${escEmail(projectCode)}</td></tr>
              <tr><td style="padding:8px 0;color:#666">Klant</td><td style="padding:8px 0">${escEmail(clientName || '')}</td></tr>
            </table>
            ${body || ''}
            <a href="https://app.helvaro.pro/dashboard" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#1e6fd9;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open Dashboard</a>
            <p style="margin-top:32px;font-size:12px;color:#999;border-top:1px solid #eee;padding-top:16px">Helvaro · AI-gestuurde lead-kwalificatie via WhatsApp</p>
          </div>`;
  await sendMail({ to, subject, html }).catch(err => console.error('[owner mail]', err && err.message));
}

// ─── AI ─────────────────────────────────────────────────────────────────────

async function runAI(history, instructions, leadName, aiName, clientName, websiteContent, address, lang, ctx) {
  const firstName = leadName ? leadName.split(' ')[0] : '';
  lang = _lang.normalizeLanguageCode(lang);
  ctx = ctx || {};
  const matchLeadLanguage = ctx.matchLeadLanguage === true;

  // Language-specific block injected near the top of the system prompt.
  // Default (matchLeadLanguage off): forces Claude to ALWAYS reply in the
  // client's configured language regardless of what the lead writes — the
  // strongest possible language lock, since Claude sometimes mirrors the
  // user's language without an explicit override. nl/fr/en get their exact
  // original hand-written directive text (zero behaviour change); every
  // other language is generated from the registry (api/_lang.js).
  // Opt-in (matchLeadLanguage on): instructs Claude to detect and match the
  // LEAD's language turn-by-turn instead, falling back to `lang` when
  // unclear — see _lang.buildMatchDirective()'s own doc comment.
  const langDirective = matchLeadLanguage ? _lang.buildMatchDirective(lang) : _lang.buildDirective(lang);

  const websiteSection = websiteContent
    ? `\nWEBSITE-INHOUD VAN DE KLANT (gebruik dit om vragen te beantwoorden):\n${websiteContent}\n`
    : '';
  const addressSection = address ? `\nOns adres: ${address}\n` : '';

  // Working-hours: informational context only. AI is ALWAYS available.
  // Helps it suggest realistic meeting times instead of "now" at 23:00.
  const hoursSection = ctx.workingHours
    ? `\nKANTOORUREN VAN HET BEDRIJF: ${ctx.workingHours}${ctx.outsideHours ? '. we zijn momenteel BUITEN kantooruren, dus stel afspraken voor de eerstvolgende werkdag voor in plaats van vandaag.' : ''}\n`
    : '';

  // Reason field language directive. The qualified/reason JSON should also be
  // in the chosen language so the dashboard summary reads naturally. In
  // match mode there's no single fixed language, so this becomes a mode note
  // instead (see _lang.MATCH_REASON_NOTE).
  const reasonLangNote = matchLeadLanguage ? _lang.MATCH_REASON_NOTE : _lang.buildReasonLangNote(lang);

  // Escalation-phrase instruction the AI follows verbatim when it doesn't
  // know an answer. Forced mode: the exact per-language phrase (legacy
  // nl/fr/en strings unchanged, registry-generated for everything else).
  // Match mode: no single fixed phrase applies, so Claude is instead told to
  // translate the client's default-language phrase live into whatever
  // language it's replying in this turn — see buildMatchEscalateInstruction().
  const escalateInstruction = matchLeadLanguage
    ? _lang.buildMatchEscalateInstruction(lang)
    : `Antwoord exact zo: "${_lang.buildEscalatePhrase(lang)}"`;

  /* De prompttekst staat in api/_ai/prompts.js. Hier blijft alleen het
     SAMENSTELLEN van de onderdelen: taalregels, agendavensters en
     klantinstellingen. Zo is een zin in de prompt veranderen een wijziging in
     een bestand van tweehonderd regels, en niet in dit bestand -- dat ook de
     webhook en het opslaan van leads draagt. */
  const systemPrompt = _ai.prompts.whatsappGesprek.system({
    langDirective, aiName, clientName, firstName, instructions,
    pandSectie: ctx.pandSectie || '',
    websiteSection, addressSection, hoursSection,
    reasonLangNote, escalateInstruction, matchLeadLanguage, ctx,
  });

  /* Via de AI-router in plaats van rechtstreeks naar Anthropic.
     Wat dat oplevert op de drukste plek van Helvaro: het model komt uit de
     configuratie in plaats van uit deze regel, een provider die omvalt leidt
     tot uitwijken in plaats van tot een lead zonder antwoord, en het verbruik
     wordt per tenant geboekt zodat je weet wat WhatsApp je kost.

     Het antwoord zelf is onveranderd: hieronder wordt dezelfde `raw` string
     gelezen en op dezelfde manier ontleed (SUMMARY / BOOK / DECISION). */
  let raw = '';
  try {
    const uit = await _ai.converse({
      ctx: { projectCode: ctx.projectCode, userId: 'whatsapp' },
      system: systemPrompt,
      messages: history,
      maxTokens: 350,
    });
    raw = uit.text || '';
  } catch (err) {
    /* Precies het gedrag van hiervoor: een storing mag nooit stilte worden.
       Een lead die niets terugkrijgt is erger dan een lead die hoort dat het
       even niet lukt. */
    console.error('[WhatsApp] AI-router fout:', err && err.code, err && err.message);
    return { done: false, message: _lang.buildOutageMessage(lang) };
  }
  if (!raw.trim()) {
    console.error('[WhatsApp] AI-router gaf een leeg antwoord');
    return { done: false, message: _lang.buildOutageMessage(lang) };
  }

  // 1. Pull out the running SUMMARY:{...} line (present on every turn).
  //    Stored in Airtable so the dashboard always shows fresh context.
  let runningSummary = '';
  let cleaned = raw;
  const sumMatch = cleaned.match(/SUMMARY:\s*\{([\s\S]*?)\}\s*$/m);
  if (sumMatch) {
    runningSummary = sumMatch[1].trim();
    cleaned = cleaned.replace(sumMatch[0], '').trim();
  }

  // 2. Pull out BOOK:{...} block (in-chat appointment booking)
  //    AI outputs this when lead has CONFIRMED a specific time slot.
  let appointment = null;
  const bookMatch = cleaned.match(/BOOK:\s*(\{[\s\S]*?\})/);
  if (bookMatch) {
    try {
      const bookData = JSON.parse(bookMatch[1]);
      if (bookData.confirmed && bookData.start) {
        /* Een verkocht pand levert GEEN afspraak op. De prompt zegt het al,
           maar een prompt is een verzoek: het model kan het negeren, en dan
           rijdt er een koper naar een huis dat weg is. Dit is de rem, en die
           zit hier omdat elke boeking hier langskomt.

           Wat de lead te lezen krijgt verandert niet -- de tekst van het model
           blijft staan -- maar er wordt niets in de agenda gezet. De volgende
           beurt kan de AI het rechtzetten; een lege agenda is te herstellen,
           een lead die voor een dichte deur staat niet. */
        if (ctx.pandBezichtigbaar === false) {
          console.warn('[WhatsApp] BOOK geweigerd: pand ' + (ctx.pandCode || '?') + ' is niet bezichtigbaar');
        } else {
          appointment = { start: bookData.start, duration: bookData.duration || 30 };
        }
      }
      cleaned = cleaned.replace(/BOOK:\s*\{[\s\S]*?\}/, '').trim();
    } catch (e) {
      console.error('[WhatsApp] BOOK parse fout:', e.message, bookMatch[1]);
    }
  }

  /* 2b. CANCEL:{...} -- de lead kan niet komen.

     Twee dingen die hier bewust anders zijn dan bij BOOK. Ten eerste hoeft er
     geen tijdstip in: welke afspraak het is zoekt de server zelf op, want dat
     is het enige wat een model niet kan verzinnen. Ten tweede telt `confirmed`
     hier niet als een extra drempel maar als een expliciete bevestiging dat de
     lead het echt gezegd heeft -- de prompt zegt met zoveel woorden dat er bij
     twijfel NIETS gestuurd wordt.

     Het blok wordt hoe dan ook uit de tekst geknipt, ook als het onbruikbaar
     is: een lead hoort nooit `CANCEL:{...}` in zijn WhatsApp te zien staan. */
  let cancel = null;
  const cancelMatch = cleaned.match(/CANCEL:\s*(\{[\s\S]*?\})/);
  if (cancelMatch) {
    try {
      const c = JSON.parse(cancelMatch[1]);
      if (c.confirmed) cancel = { reason: String(c.reason || '').slice(0, 300) };
    } catch (e) {
      console.error('[WhatsApp] CANCEL parse fout:', e.message, cancelMatch[1]);
    }
    cleaned = cleaned.replace(/CANCEL:\s*\{[\s\S]*?\}/, '').trim();
  }
  /* En dan nog een veegregel, want de regex hierboven heeft een sluitende accolade
     nodig. Schrijft het model `CANCEL:{ziek` zonder afsluiter, dan matcht hij niet,
     wordt er niets geknipt, en leest de lead die regel gewoon in zijn WhatsApp.
     Dat is de ene fout die hier echt niet mag: alles op deze plek mag misgaan
     zolang de lead maar niet ziet dat hij met een machine praat. */
  /* En dan de vangnetregel voor ALLE vier de stuurblokken.
   *
   * Elk blok wordt hierboven netjes geknipt zodra het parseert. Parseert het
   * niet -- en dat gebeurt: het model schrijft `"reason":"hij zei "ja""` met een
   * niet-ontsnapt aanhalingsteken, of vergeet een accolade -- dan gooit
   * JSON.parse, en bij BOOK en DECISION staat de knipregel BINNEN die try. Er
   * werd dan niets geknipt en de lead las letterlijk
   * `DECISION:{"qualified":true,...}` in zijn WhatsApp.
   *
   * Dit is de enige fout in dit bestand die de illusie meteen kapotmaakt. Eén
   * regel, buiten elke try, na alle parsers: wat er ook misgaat, een regel die
   * met een stuurwoord begint gaat er hoe dan ook uit.
   *
   * /gm en niet /m: het model kan er twee uitsturen. */
  cleaned = cleaned.replace(/^[ \t]*(?:CANCEL|BOOK|DECISION|SUMMARY):.*$/gm, '').trim();

  // 3. Parse DECISION block if present (only on final turn / escalation)
  const match = cleaned.match(/DECISION:\s*(\{[\s\S]*?\})/);
  if (match) {
    try {
      const decision = JSON.parse(match[1]);
      const message  = cleaned.replace(/DECISION:\s*\{[\s\S]*?\}/, '').trim();
      // DECISION.summary (full 1-2 zinnen) wint van runningSummary op finale beurt
      return { done: true, message: message || '...', appointment, cancel, ...decision, summary: decision.summary || runningSummary };
    } catch (e) {
      console.error('[WhatsApp] DECISION parse fout:', e.message, match[1]);
    }
  }

  return { done: false, message: cleaned, summary: runningSummary, appointment, cancel };
}

// ─── AIRTABLE ────────────────────────────────────────────────────────────────

// Client config cache by project code. 5 min TTL
const _clientCache = new Map();
const CLIENT_TTL   = 5 * 60 * 1000;
function getCachedClient(code) {
  const e = _clientCache.get(code);
  if (!e) return null;
  if (Date.now() - e.ts > CLIENT_TTL) { _clientCache.delete(code); return null; }
  return e.record;
}
function setCachedClient(code, record) { _clientCache.set(code, { record, ts: Date.now() }); }

// Lead cache by phone (or phone+projectCode when scoped — see leadCacheKey()).
// 3 min TTL. getLead() is called on EVERY incoming message with no caching,
// making it the single biggest Airtable drain (one GET per message,
// uncached). Conversations involve multiple messages from the same phone so
// the cache hit rate is high. After updateLead() we merge the new fields
// into the cached record so the next message sees the latest conversation
// state without a fresh Airtable call.
//
// Collision safety: a cross-client collision (see getLead() below) is NEVER
// cached — see the comment at that call site for why. Only the unambiguous
// cases (single candidate, or scoped-by-own-number lookup) are cached here,
// so a cache hit can never hand back a lead that a fresh resolution would
// not have picked.
const _leadCache = new Map();
const LEAD_TTL   = 3 * 60 * 1000;
// Composite cache key so scoped (phone, projectCode) lookups and unscoped
// (phone-only) lookups never collide with each other in the same Map — they
// can legitimately resolve to different records for the same phone.
function leadCacheKey(phone, scopedProjectCode) {
  return scopedProjectCode ? `${phone}::${scopedProjectCode}` : phone;
}
function getCachedLead(cacheKey) {
  const e = _leadCache.get(cacheKey);
  if (!e) return null;
  if (Date.now() - e.ts > LEAD_TTL) { _leadCache.delete(cacheKey); return null; }
  return e.record;
}
function setCachedLead(cacheKey, record) { _leadCache.set(cacheKey, { record, ts: Date.now() }); }
function patchCachedLead(cacheKey, fields) {
  const e = _leadCache.get(cacheKey);
  if (!e) return;
  e.record = { ...e.record, fields: { ...e.record.fields, ...fields } };
  // Keep original timestamp so TTL still expires at the right time
}

// Client cache by WhatsApp Phone Number ID (webhook routing, Task 2). Only
// populated on a found match, same convention as _clientCache above. 5 min TTL.
const _clientByPnidCache = new Map();
function getCachedClientByPnid(pnid) {
  const e = _clientByPnidCache.get(pnid);
  if (!e) return null;
  if (Date.now() - e.ts > CLIENT_TTL) { _clientByPnidCache.delete(pnid); return null; }
  return e.record;
}
function setCachedClientByPnid(pnid, record) { _clientByPnidCache.set(pnid, { record, ts: Date.now() }); }

// Fast-fail retry for Airtable 429. 2 retries, ~3 s max.
async function atFetch(url, opts) {
  let delay = 1000;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(url, opts);
    if (r.status !== 429) return r;
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    const wait   = Math.max(300, delay + jitter);
    console.warn(`[Airtable] 429. wacht ${Math.round(wait)}ms (poging ${attempt + 1}/2)`);
    await new Promise(res => setTimeout(res, wait));
    delay *= 2;
  }
  return fetch(url, opts);
}

async function getClientByCode(code) {
  const key    = code.toUpperCase();
  const cached = getCachedClient(key);
  if (cached) return cached;
  // fldN4dL0bGgfBOXwM = Project Code field ID in Clients table. Stable across renames
  const filter = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(key)}"`);
  const url    = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${CLIENTS_TABLE}?filterByFormula=${filter}&maxRecords=1&returnFieldsByFieldId=true`;
  const res    = await atFetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const data   = await res.json();
  if (data.error) console.error('[Airtable] Client fout:', JSON.stringify(data.error));
  const record = data.records?.[0] || null;
  if (record) setCachedClient(key, record);
  return record;
}

// Reverse lookup: which client (if any) owns a given WhatsApp Phone Number ID
// (Task 2 webhook routing). Used only when the inbound webhook's
// metadata.phone_number_id differs from the shared PHONE_NUMBER_ID env var —
// i.e. never on today's default single-shared-number setup, where every
// client's F_WA_PHONE_NUMBER_ID is blank and this function is never called.
// Returns null (not just "no match") both when nobody owns the number AND
// when MORE than one client somehow owns it (a data-entry mistake) — in
// neither case is a direct route safe, so the caller falls back to the
// Task 1 phone-only heuristic rather than guessing.
/* ── Is er precies één actieve klant? ────────────────────────────────────────
   Alleen dan mag een koud binnenkomend bericht op het gedeelde nummer een lead
   worden (zie processMessage). Twee of meer klanten en het antwoord is nee --
   niet omdat het lastig is, maar omdat het dan een GOK is wie de beller
   bedoelt, en een verkeerd geraden tenant is precies wat deze codebase nergens
   doet.

   Bewust geen cache met een lange levensduur: dit is de schakelaar die vanzelf
   moet omvallen op de dag dat er een tweede klant bij komt. Vijf minuten is
   kort genoeg om dat binnen één koffiepauze te laten gebeuren en lang genoeg
   om niet bij elk bericht een extra Airtable-aanroep te doen. */
let _enigeKlantCache = { ts: 0, waarde: null };
const ENIGE_KLANT_TTL_MS = 5 * 60 * 1000;

async function enigeActieveKlant() {
  if (Date.now() - _enigeKlantCache.ts < ENIGE_KLANT_TTL_MS) return _enigeKlantCache.waarde;
  try {
    /* maxRecords=2 is het hele punt: we hoeven niet te weten hoeveel klanten
       er zijn, alleen of het er meer dan één is. */
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${CLIENTS_TABLE}`
              + `?maxRecords=2&filterByFormula=${encodeURIComponent('NOT({Project Code}="")')}`;
    const res  = await atFetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    const data = await res.json();
    if (data.error) { console.error('[WhatsApp] klantentelling mislukt:', JSON.stringify(data.error)); return null; }
    const recs = data.records || [];
    let waarde = null;
    if (recs.length === 1) {
      const f = recs[0].fields || {};
      const code = f['Project Code'] || '';
      /* Een klant zonder projectcode bestaat voor de rest van de app niet; die
         mag hier dus ook geen leads krijgen. */
      if (code) waarde = { projectCode: code, naam: f['Client Name'] || '', record: recs[0] };
    }
    _enigeKlantCache = { ts: Date.now(), waarde };
    return waarde;
  } catch (err) {
    console.error('[WhatsApp] klantentelling mislukt:', err && err.message);
    return null;
  }
}

/* Een lead aanmaken uit een binnenkomend WhatsApp-bericht.
   Dezelfde velden als api/form.js gebruikt, zodat het dashboard, de opvolging
   en de kwalificatie er niets bijzonders aan merken -- met twee verschillen die
   ertoe doen:

     Bron    'WhatsApp' in plaats van het formulier, zodat je later kan zien
             welke leads uit een advertentie of QR-code kwamen.
     consent hier NIET op true. Bij het formulier vinkt iemand expliciet aan;
             wie zelf appt heeft dat nooit gedaan. Hij heeft wel duidelijk
             contact gezocht -- dat is de grondslag -- maar dat is iets anders
             dan een gegeven toestemming, en het verschil hoort in de
             administratie te staan en niet weggemoffeld te worden.

   Mislukt het aanmaken, dan geeft dit null terug en valt de aanroeper terug op
   het formulierbericht. Een lead die door een Airtable-storing niets hoort is
   erger dan een lead die naar het formulier gestuurd wordt. */
async function maakLeadUitBinnenkomend(phone, eersteBericht, klant) {
  try {
    const nu = new Date().toISOString();
    const res = await atFetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${LEADS_TABLE}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        typecast: true,
        fields: {
          fldbk0LVNckOU0bqA: '',                    // Name -- de AI vraagt hem zo meteen
          fld6YaitW0lMqHUrd: phone,                 // Phone
          fldSmczuyUJd26HLe: klant.projectCode,     // Project Code
          fld8mkrEWcyq7mUip: 'new',                 // Conversation State
          fldGoerozqdea4BfU: 'WhatsApp',            // Bron
          fldR0r13EU4RwrtvH: nu,                    // Created At
          fldoLRI5W12ThTls7: JSON.stringify({
            _v: 1, notes: [], tasks: [], calls: [],
            consent: { given: false, ts: nu, via: 'inbound_whatsapp' },
          }),
        },
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      console.error('[WhatsApp] lead aanmaken uit inbound mislukt:',
                    JSON.stringify(data.error || {}).slice(0, 300));
      return null;
    }
    /* De cache van getLead() wist niet dat deze lead bestond; zonder deze regel
       leest de volgende beurt binnen de TTL nog steeds "geen lead". */
    setCachedLead(leadCacheKey(phone, null), data);
    return data;
  } catch (err) {
    console.error('[WhatsApp] lead aanmaken uit inbound mislukt:', err && err.message);
    return null;
  }
}

async function getClientByPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) return null;
  const cached = getCachedClientByPnid(phoneNumberId);
  if (cached) return cached;
  const filter = encodeURIComponent(`{${F_WA_PHONE_NUMBER_ID}}="${escapeFormula(phoneNumberId)}"`);
  const url    = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${CLIENTS_TABLE}?filterByFormula=${filter}&maxRecords=2&returnFieldsByFieldId=true`;
  const res    = await atFetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const data   = await res.json();
  if (data.error) { console.error('[Airtable] Client-by-PhoneNumberId fout:', JSON.stringify(data.error)); return null; }
  const records = data.records || [];
  if (records.length !== 1) {
    if (records.length > 1) {
      console.error(`[Multi-tenant] WhatsApp Phone Number ID staat op ${records.length} clients ingesteld. Kan niet direct routeren, val terug op heuristiek. pnid=${phoneNumberId}`);
    }
    return null;
  }
  setCachedClientByPnid(phoneNumberId, records[0]);
  return records[0];
}

// Pull the most recent inbound (`role:'user'`) and outbound (`role:'assistant'`)
// timestamps out of a lead's Conversation History JSON. Only entries stamped
// with a numeric `ts` count — user turns have been stamped since the 24h-window
// fix (see step 4's push comment in processMessage), assistant turns since the
// multitenancy collision fix below. Older conversations may have entries with
// no `ts` at all; those are silently skipped rather than crashing, and the
// caller (resolveLeadCollision) degrades to Created Date when nothing usable
// comes back.
function extractLastTimestamps(historyRaw) {
  let history = [];
  if (historyRaw) {
    try { history = JSON.parse(historyRaw); } catch { history = []; }
  }
  let lastOutboundTs = null, lastInboundTs = null;
  for (const m of history) {
    if (!m || typeof m.ts !== 'number') continue;
    if (m.role === 'assistant' && (lastOutboundTs === null || m.ts > lastOutboundTs)) lastOutboundTs = m.ts;
    if (m.role === 'user'      && (lastInboundTs  === null || m.ts > lastInboundTs))  lastInboundTs  = m.ts;
  }
  return { lastOutboundTs, lastInboundTs };
}

// Resolve a cross-client lead collision (Task 1): same phone number, more
// than one client's Leads record. `records` is one Airtable Leads record per
// competing Project Code (already reduced to each project's newest record —
// see getLead()). Picks a winner using, in priority order:
//   a. Most recent OUTBOUND message to this phone (a reply is a reply to
//      something — whoever messaged this phone most recently is almost
//      certainly who the lead is answering).
//   b. Tie-break: most recent INBOUND message.
//   c. Final tie-break: most recently created lead record.
// Never throws, never returns nothing — if no candidate has any usable
// timestamp at all, this degrades to created-date ordering (the record
// array's own order), matching today's single-client behaviour exactly.
function resolveLeadCollision(records) {
  const NEG_INF = -Infinity;
  const candidates = records.map(r => {
    const { lastOutboundTs, lastInboundTs } = extractLastTimestamps(r.fields['Conversation History']);
    const createdRaw = r.fields['fldR0r13EU4RwrtvH'] || r.fields['Created At'] || r.createdTime;
    const createdTs  = createdRaw ? new Date(createdRaw).getTime() : 0;
    return {
      record:      r,
      projectCode: r.fields['fldSmczuyUJd26HLe'] || r.fields['Project Code'] || '(onbekend)',
      lastOutboundTs,
      lastInboundTs,
      createdTs: Number.isFinite(createdTs) ? createdTs : 0,
    };
  });

  const sorted = [...candidates].sort((a, b) => {
    const aOut = a.lastOutboundTs ?? NEG_INF, bOut = b.lastOutboundTs ?? NEG_INF;
    if (aOut !== bOut) return bOut - aOut;
    const aIn = a.lastInboundTs ?? NEG_INF, bIn = b.lastInboundTs ?? NEG_INF;
    if (aIn !== bIn) return bIn - aIn;
    return b.createdTs - a.createdTs;
  });

  const winner   = sorted[0];
  const runnerUp = sorted[1];
  let decidedBy = 'created_date';
  if (runnerUp) {
    const wOut = winner.lastOutboundTs ?? NEG_INF, rOut = runnerUp.lastOutboundTs ?? NEG_INF;
    if (wOut !== NEG_INF && wOut !== rOut) {
      decidedBy = 'last_outbound';
    } else {
      const wIn = winner.lastInboundTs ?? NEG_INF, rIn = runnerUp.lastInboundTs ?? NEG_INF;
      decidedBy = (wIn !== NEG_INF && wIn !== rIn) ? 'last_inbound' : 'created_date';
    }
  }
  return { winner, decidedBy, sorted };
}

async function getLead(phone, scopedProjectCode) {
  const cacheKey = leadCacheKey(phone, scopedProjectCode);
  const cached   = getCachedLead(cacheKey);
  if (cached) return cached;

  if (scopedProjectCode) {
    // Own-number client (Task 2): the inbound webhook's phone_number_id maps
    // to EXACTLY this client (resolved in the handler above), so the
    // Airtable query itself is scoped to (phone, Project Code) — no
    // candidate list, no heuristic. A cross-client collision is structurally
    // impossible here: the AND() filter can only ever match this client's
    // own lead records for this phone.
    const filter = encodeURIComponent(
      `AND({fld6YaitW0lMqHUrd}="${escapeFormula(phone)}", {fldSmczuyUJd26HLe}="${escapeFormula(scopedProjectCode)}")`
    );
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${LEADS_TABLE}?filterByFormula=${filter}&maxRecords=1&sort[0][field]=fldR0r13EU4RwrtvH&sort[0][direction]=desc`;
    const res  = await atFetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    const data = await res.json();
    if (data.error) console.error('[Airtable] Lead fout (scoped):', JSON.stringify(data.error));
    const record = data.records?.[0] || null;
    if (record) setCachedLead(cacheKey, record);
    return record;
  }

  // Shared-number path (today's default). Fetch EVERY candidate for this
  // phone — not just the newest — because the only way to detect a
  // cross-client collision is to see every lead record that shares this
  // phone number. fld6YaitW0lMqHUrd = Phone field ID; fldR0r13EU4RwrtvH =
  // Created At field ID; fldSmczuyUJd26HLe = Project Code field ID. Field
  // IDs used throughout so renames never break this.
  const filter = encodeURIComponent(`{fld6YaitW0lMqHUrd}="${escapeFormula(phone)}"`);
  let records = [];
  let offset  = '';
  do {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${LEADS_TABLE}?filterByFormula=${filter}&pageSize=100&sort[0][field]=fldR0r13EU4RwrtvH&sort[0][direction]=desc${offset ? `&offset=${encodeURIComponent(offset)}` : ''}`;
    const res  = await atFetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    const data = await res.json();
    if (data.error) { console.error('[Airtable] Lead fout:', JSON.stringify(data.error)); break; }
    records = records.concat(data.records || []);
    offset  = data.offset || '';
  } while (offset && records.length < MAX_LEAD_CANDIDATES);

  if (records.length === 0) return null;

  if (records.length === 1) {
    setCachedLead(cacheKey, records[0]);
    return records[0];
  }

  // Multiple lead records share this phone. Reduce to one candidate PER
  // Project Code — `records` is already sorted desc by Created At, so the
  // first record seen for each project code is that project's newest.
  const bestPerProject = new Map();
  for (const r of records) {
    const pc = r.fields['fldSmczuyUJd26HLe'] || r.fields['Project Code'] || '';
    if (!bestPerProject.has(pc)) bestPerProject.set(pc, r);
  }

  if (bestPerProject.size === 1) {
    // Same client, multiple lead records for this phone (e.g. the form was
    // submitted twice). Not a collision — keep today's exact behaviour:
    // most recently created wins.
    const record = records[0];
    setCachedLead(cacheKey, record);
    return record;
  }

  // ── Real cross-client collision ────────────────────────────────────────
  const { winner, decidedBy, sorted } = resolveLeadCollision([...bestPerProject.values()]);
  const projectSummary = sorted.map(c => c.projectCode).join(', ');
  // Deliberate product metric, not a debug line — the rate of this log is
  // exactly what tells Sindi when a client needs their own WhatsApp number.
  // GDPR: never log the full phone number.
  console.warn(
    `[Multi-tenant] collision phone=${maskPhone(phone)} leadRecords=${records.length} ` +
    `competingClients=${sorted.length} projects=[${projectSummary}] chosen=${winner.projectCode} decidedBy=${decidedBy}`
  );

  // Never cache a collision result. The winner depends on which client most
  // recently messaged this phone — a signal that can flip between two
  // messages faster than this cache's TTL. Re-resolving fresh every time for
  // these rare colliding phones is far cheaper than risking a stale
  // cross-client leak being served out of cache.
  return winner.record;
}

async function updateLead(recordId, fields, phone, scopedProjectCode) {
  const url  = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${LEADS_TABLE}/${recordId}`;
  const res  = await atFetch(url, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
    // typecast als vangnet. Airtable weigert bij een ongeldige waarde niet dat
    // ene veld maar de HELE PATCH, en dit is de plek waar een gesprek wordt
    // vastgelegd: gaat het hier mis, dan verliest de lead in één klap zijn
    // Qualified, Reason, Ability, Urgency, Fit en Conversation State — zonder
    // dat de klant iets ziet, want de fout wordt alleen gelogd.
    //
    // De waarden worden hierboven al gevalideerd en begrensd; dit is de tweede
    // lijn voor het geval de AI iets teruggeeft waar niemand aan gedacht had.
    body:    JSON.stringify({ fields, typecast: true }),
  });
  const data = await res.json();
  if (data.error) console.error('[Airtable] Update fout:', JSON.stringify(data.error));
  // Keep in-memory lead cache in sync so the next message from this phone
  // sees the updated Conversation History / State without a fresh Airtable call.
  // Uses the same composite cache key as getLead() — a no-op if that key was
  // never cached in the first place (e.g. a collision result, which is
  // deliberately never cached — see getLead()'s own comment).
  if (phone && !data.error) patchCachedLead(leadCacheKey(phone, scopedProjectCode), fields);
  return data;
}

const APPOINTMENTS_TABLE = 'tblD058vEITs1xYFc';

// Maak een Appointment record aan. Geretourneerd { ok, id } of { ok:false, error }.
// Per-klant isolatie via Project Code veld.
async function createAppointment({ startTime, duration, projectCode, leadId, leadName, leadPhone, notes }) {
  if (!startTime || !projectCode) return { ok: false, error: 'missing required fields' };
  // Format appointment ID: PROJECTCODE-YYMMDDHHMM
  const dt = new Date(startTime);
  const apptId = `${projectCode}-${dt.getUTCFullYear().toString().slice(-2)}${String(dt.getUTCMonth()+1).padStart(2,'0')}${String(dt.getUTCDate()).padStart(2,'0')}${String(dt.getUTCHours()).padStart(2,'0')}${String(dt.getUTCMinutes()).padStart(2,'0')}`;

  const fields = {
    'Appointment ID': apptId,
    'Start Time':     startTime,
    'Duration':       duration || 30,
    'Project Code':   projectCode,
    'Lead':           leadId ? [leadId] : undefined,
    'Lead Name':      leadName || '',
    'Lead Phone':     leadPhone || '',
    'Status':         'booked',
    'Source':         'ai_chat',
    'Notes':          notes || '',
    'Created At':     new Date().toISOString()
  };
  // Remove undefined values
  Object.keys(fields).forEach(k => fields[k] === undefined && delete fields[k]);

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${APPOINTMENTS_TABLE}`;
  try {
    const res = await atFetch(url, {
      method:  'POST',
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fields, typecast: true })
    });
    const data = await res.json();
    if (data.error) {
      console.error('[Appointment] create fout:', JSON.stringify(data.error));
      return { ok: false, error: data.error.message };
    }
    return { ok: true, id: data.id, apptId };
  } catch (err) {
    console.error('[Appointment] create exception:', err.message);
    return { ok: false, error: err.message };
  }
}

// Human-readable afspraak-datum/tijd in de klant-taal, Brussels tijdzone.
// Gebruikt door de booking-confirmation hierboven. cron-followup.js en
// api/leads.js hebben elk hun eigen kopie — zelfde per-file helper-duplicatie
// conventie als mergeWaFailedFlag hierboven.
function formatApptDateTime(iso, lang) {
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return String(iso || '');
  // calendar:'gregory' is NOT redundant — verified this matters. Several
  // locales default Intl.DateTimeFormat to a non-Gregorian calendar (e.g.
  // fa-IR defaults to the Persian/Jalali calendar, shifting both the month
  // name AND the day number). Helvaro's appointments are Gregorian-dated
  // everywhere else (Google Calendar, Airtable, the dashboard) — a Persian-
  // speaking lead seeing a Jalali date that doesn't match what's in Google
  // Calendar would be genuinely confusing, not just a translation nicety.
  // Forcing 'gregory' keeps every language showing the SAME calendar date,
  // just formatted in that language's own words/script.
  const opts = { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels', calendar: 'gregory' };
  return dt.toLocaleString(_lang.getLocale(lang), opts);
}

// Haal upcoming appointments op voor een klant (komende 14 dagen) — als string
// lijst voor de AI prompt context. AI gebruikt dit om dubbele boekingen te voorkomen.
async function getUpcomingAppointments(projectCode) {
  if (!projectCode) return [];
  const now = new Date().toISOString();
  const twoWeeksLater = new Date(Date.now() + 14*24*60*60*1000).toISOString();
  const formula = encodeURIComponent(
    `AND({Project Code}="${projectCode.replace(/"/g, '\\"')}", {Status}="booked", IS_AFTER({Start Time}, "${now}"), IS_BEFORE({Start Time}, "${twoWeeksLater}"))`
  );
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${APPOINTMENTS_TABLE}?filterByFormula=${formula}&pageSize=50&fields%5B%5D=Start+Time&fields%5B%5D=Duration`;
  try {
    const res = await atFetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.records || []).map(r => {
      const dt = new Date(r.fields['Start Time']);
      const dur = r.fields['Duration'] || 30;
      // Format voor AI: "do 12 juni 14:00 (30 min)"
      const opts = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' };
      return `${dt.toLocaleString('nl-BE', opts)} (${dur} min)`;
    });
  } catch (err) {
    console.error('[Appointment] list exception:', err.message);
    return [];
  }
}

// ── Google Calendar (optional, per-client) ───────────────────────────────────
// Returns { token, calId } for the client's connected Google Calendar, or an
// empty token if they haven't connected / it's not configured. Never throws —
// Google issues must never block a WhatsApp reply or a booking.
// getClientByCode() fetches with returnFieldsByFieldId=true, so client.fields
// is keyed by field ID first (fldkYmK3jAabvytCF = Google Refresh Token,
// fldWBxxhGYEZNIMqA = Google Calendar ID); name fallback kept for defense,
// matching every other client.fields lookup in this file.
async function gcalAccess(client) {
  try {
    if (!_gcal.isConfigured()) return { token: '', calId: 'primary' };
    const enc = (client && client.fields && (client.fields['fldkYmK3jAabvytCF'] || client.fields['Google Refresh Token'])) || '';
    if (!enc) return { token: '', calId: 'primary' };
    const refresh = _gcal.decryptToken(enc);
    if (!refresh) return { token: '', calId: 'primary' };
    const token = await _gcal.getAccessToken(refresh);
    const calId = client.fields['fldWBxxhGYEZNIMqA'] || client.fields['Google Calendar ID'] || 'primary';
    return { token, calId };
  } catch (e) {
    console.error('[gcal] access failed:', e && e.message);
    return { token: '', calId: 'primary' };
  }
}

// Store the created Google event ID back on the Helvaro appointment record so a
// later reschedule/cancel (dashboard-side, api/leads.js) can update/delete the
// matching Google event. Best-effort — the appointment itself already exists.
async function setApptGoogleEvent(recordId, eventId) {
  if (!recordId || !eventId) return;
  try {
    await atFetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${APPOINTMENTS_TABLE}/${recordId}`, {
      method:  'PATCH',
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fields: { 'Google Event ID': eventId }, typecast: true })
    });
  } catch (e) { console.error('[gcal] store event id failed:', e && e.message); }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// Buffer the raw request body directly off the Node.js stream, before the
// Vercel req.body getter (or anything else) has a chance to consume it.
// 2 MB cap: Meta's webhook payloads are small (a handful of KB); this just
// guards against an abusive/oversized POST tying up the function.
function readRawBody(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Timing-safe string comparison. Prevents timing attacks on signature checks
function safeEqual(a, b) {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

// Escape double-quotes and backslashes for Airtable formula strings
function escapeFormula(val) {
  return String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Strip control characters and limit message length before passing to AI
function sanitize(val) {
  return String(val || '').replace(/[\x00-\x1F\x7F]/g, '').slice(0, 2000);
}

// ── Wat de AI teruggeeft past niet vanzelf in Airtable ───────────────────────
// Deze drie velden zijn singleSelect met een vaste keuzelijst, en Lead Score is
// een rating-veld met maximum 10. Airtable weigert bij ÉÉN ongeldige waarde de
// hele PATCH, niet alleen dat veld. Dat is precies wat er misging: de prompt
// vroeg een score van 0-100, het veld gaat tot 10, en dus mislukte bij vrijwel
// elk afgerond gesprek de volledige opslag — Qualified, Reason, Ability,
// Urgency en Fit verdwenen samen met de score. De klant zag een lead die in
// zijn oude status bleef hangen, en in de logs alleen een weggeslikte fout.
//
// Vandaar: eerst valideren, dan pas schrijven. Een LLM die iets onverwachts
// teruggeeft hoort één leeg veld op te leveren, niet een verloren gesprek.
const ABILITY_CHOICES = ['low', 'medium', 'high'];
const URGENCY_CHOICES = ['low', 'medium', 'high'];
const FIT_CHOICES     = ['poor', 'moderate', 'strong'];

function oneOf(val, choices) {
  const v = String(val || '').trim().toLowerCase();
  return choices.includes(v) ? v : '';
}

// 0-10, want zo staat het veld in Airtable ingesteld en zo rekent het dashboard
// (score >= 7 telt daar als sterke lead).
//
// Alles boven de 10 wordt gedeeld door 10 in plaats van afgekapt. Een score
// boven 10 kan namelijk maar één ding betekenen: het model rekende nog op de
// oude 0-100-schaal. Afkappen zou van elke 60 en elke 95 een 10 maken en dus
// het onderscheid tussen "redelijk" en "uitstekend" wissen; delen behoudt het.
function clampScore(val) {
  let n = Number(val);
  if (!isFinite(n) || n <= 0) return 0;
  if (n > 10) n = n / 10;
  return Math.min(Math.round(n), 10);
}

// Voor waarden die in een e-mail Subject: terechtkomen. Een lead vult zijn eigen
// naam in op het publieke formulier, en dat veld wordt daar alleen getrimd en
// afgekapt — niet ontdaan van stuurtekens. Een naam als "Jan\r\nBcc: ..." zou
// dus als losse header in de melding aan de klant belanden. Mailers weren dat
// meestal zelf, maar dat is hun verdediging, niet de onze. Zelfde stripset als
// sanitize(), korter afgekapt omdat een onderwerpregel geen 2000 tekens is.
function subjectSafe(val) {
  return sanitize(val).replace(/\s+/g, ' ').trim().slice(0, 120);
}

// GDPR: mask a phone number for logging, keeping only the last 4 digits
// (e.g. "32478123456" -> "*******3456"). Used by the [Multi-tenant] collision
// log — that line is a permanent product metric (see getLead()), so unlike
// most of this file's existing debug logs (which do log the full number) it
// must never carry a full phone number.
function maskPhone(phone) {
  const s = String(phone || '');
  if (s.length <= 4) return '*'.repeat(s.length);
  return '*'.repeat(s.length - 4) + s.slice(-4);
}

// Merge a waFailed:true marker into a lead's existing Notities JSON without
// clobbering notes/tasks/calls a client may already have added manually.
// api/form.js's flagWaFailed overwrites the field outright, which is safe
// there because it only ever runs immediately after lead creation (Notities
// is still empty). Here we're mid-conversation, so an unconditional overwrite
// could wipe out real staff notes — merge instead.
//
// Notities isn't always JSON: dashboard.js's parseNotities() also accepts
// bare legacy text (pre-JSON-envelope manual notes) and wraps it as a
// {id:'legacy', text, ts} note on read. If we don't do the same here, a lead
// with an old-style plain-text note would have that note silently destroyed
// the moment it gets flagged — preserve it instead.
//
// `detail` (optional, added for the status-callback path — see
// handleStatusCallback() above): Meta's error code/title for a 'failed'
// status. Stored alongside the same `waFailed:true` flag the dashboard's
// "Niet bereikbaar" widget already reads — NOT a new flag/mechanism, just
// richer context riding in the same envelope for whoever investigates later.
// api/form.js's flagWaFailed call site never had this context to give, so it
// stays undefined there and this parameter is a no-op for that caller.
function mergeWaFailedFlag(raw, detail) {
  const trimmed = raw ? String(raw).trim() : '';
  let data    = { _v: 1, notes: [], tasks: [], calls: [] };
  let handled = false;
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') { data = { ...data, ...parsed }; handled = true; }
    } catch { /* malformed JSON: fall through, preserve as legacy text below */ }
  }
  if (!handled && trimmed) {
    data.notes = [{ id: 'legacy', text: trimmed, ts: new Date().toISOString() }];
  }
  data.waFailed = true;
  if (detail && (detail.code !== undefined || detail.title !== undefined)) {
    data.waFailedReason = { code: detail.code ?? null, title: detail.title ?? null, at: new Date().toISOString() };
  }
  return JSON.stringify(data);
}

// Merge a 'read' marker into a lead's Notities JSON — same merge-not-
// overwrite contract as mergeWaFailedFlag above (including legacy-plain-text
// preservation). Deliberately just a timestamp: see handleStatusCallback()'s
// volume/cost comment for why 'read' is the only non-failed status that gets
// an Airtable write at all.
function mergeWaReadFlag(raw) {
  const trimmed = raw ? String(raw).trim() : '';
  let data    = { _v: 1, notes: [], tasks: [], calls: [] };
  let handled = false;
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') { data = { ...data, ...parsed }; handled = true; }
    } catch { /* malformed JSON: fall through, preserve as legacy text below */ }
  }
  if (!handled && trimmed) {
    data.notes = [{ id: 'legacy', text: trimmed, ts: new Date().toISOString() }];
  }
  data.waRead = { at: new Date().toISOString() };
  return JSON.stringify(data);
}

// Read-only check for the AI-pause flag (human takeover). Written by
// api/leads.js's 'ai-pause'/'ai-resume' modes into the same Notities JSON
// envelope mergeWaFailedFlag writes to. Returns the `{at, by}` object when
// paused, or null when not paused / envelope absent / legacy plain-text note
// (which can never carry structured keys, so it can never be "paused").
function getAiPauseInfo(raw) {
  const trimmed = raw ? String(raw).trim() : '';
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return (parsed && parsed.aiPaused && typeof parsed.aiPaused === 'object') ? parsed.aiPaused : null;
  } catch {
    return null;
  }
}

// Merge an 'escalated' marker into a lead's existing Notities JSON. Same
// merge-not-overwrite contract as mergeWaFailedFlag above (including the
// legacy-plain-text-note preservation) — see its doc comment for why.
// Cleared by api/leads.js's manual-reply mode once a human actually answers.
function mergeEscalatedFlag(raw, question) {
  const trimmed = raw ? String(raw).trim() : '';
  let data    = { _v: 1, notes: [], tasks: [], calls: [] };
  let handled = false;
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') { data = { ...data, ...parsed }; handled = true; }
    } catch { /* malformed JSON: fall through, preserve as legacy text below */ }
  }
  if (!handled && trimmed) {
    data.notes = [{ id: 'legacy', text: trimmed, ts: new Date().toISOString() }];
  }
  data.escalated = { at: new Date().toISOString(), question: String(question || '').slice(0, 280) };
  return JSON.stringify(data);
}

// Remove the 'escalated' marker if present. Returns null when there's
// nothing to clear (no JSON envelope, or envelope has no escalated key) so
// callers can skip an unnecessary Airtable write. Used both by the
// opportunistic cleanup above (a later turn resolved itself without a human
// reply) and mirrors api/leads.js's mergeNotitiesPatch(raw, {escalated:
// undefined}) used when a human actually sends a manual reply.
function clearEscalatedFlag(raw) {
  const trimmed = raw ? String(raw).trim() : '';
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || !parsed.escalated) return null;
    const { escalated, ...rest } = parsed;
    return JSON.stringify(rest);
  } catch {
    return null;
  }
}

// ─── WHATSAPP ────────────────────────────────────────────────────────────────

// Check whether the current Brussels-time falls inside a client's Working Hours.
// Format examples:
//   'mon-fri 9-18'    → Mon to Fri, 09:00-18:00
//   'mon-sat 8-20'    → Mon to Sat, 08:00-20:00
//   'tue-sat 10-18'   → Tue to Sat, 10:00-18:00 (gesloten op maandag + zondag)
// Empty → always within hours (24/7).
function isWithinWorkingHours(spec) {
  if (!spec) return true;
  const m = String(spec).toLowerCase().trim().match(/^([a-z]+)\s*[-–]\s*([a-z]+)\s+(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?$/);
  if (!m) { console.warn('[workingHours] kan format niet parsen:', spec); return true; }
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  // Accept Dutch + French day abbreviations so klanten kunnen 'ma-vr 9-18'
  // of 'lun-ven 9-18' invoeren. Niet enkel het Engelse 'mon-fri'.
  const dayAliases = {
    // Nederlands
    ma: 'mon', di: 'tue', wo: 'wed', do: 'thu', vr: 'fri', za: 'sat', zo: 'sun',
    maa: 'mon', din: 'tue', woe: 'wed', don: 'thu', vri: 'fri', zat: 'sat', zon: 'sun',
    // Français
    lun: 'mon', mar: 'tue', mer: 'wed', jeu: 'thu', ven: 'fri', sam: 'sat', dim: 'sun'
  };
  const normalizeDay = (d) => {
    const lower = d.toLowerCase();
    if (dayAliases[lower]) return dayAliases[lower];
    const head3 = lower.slice(0, 3);
    if (dayAliases[head3]) return dayAliases[head3];
    return head3;  // assume already english (mon/tue/...)
  };
  const fromDay = days.indexOf(normalizeDay(m[1]));
  const toDay   = days.indexOf(normalizeDay(m[2]));
  if (fromDay < 0 || toDay < 0) return true;
  const hStart  = parseInt(m[3], 10) + (m[4] ? parseInt(m[4], 10) / 60 : 0);
  const hEnd    = parseInt(m[5], 10) + (m[6] ? parseInt(m[6], 10) / 60 : 0);
  // Brussels time (Europe/Brussels, handles DST automatically)
  const parts = new Intl.DateTimeFormat('nl-BE', {
    timeZone: 'Europe/Brussels',
    weekday:  'short',
    hour:     'numeric',
    minute:   'numeric',
    hour12:   false
  }).formatToParts(new Date());
  let wdShort = (parts.find(p => p.type === 'weekday')?.value || '').toLowerCase().slice(0, 3);
  // nl-BE weekday short ('ma', 'di', ...) → map back to en-3-letter
  const nlMap = { ma: 'mon', di: 'tue', wo: 'wed', do: 'thu', vr: 'fri', za: 'sat', zo: 'sun' };
  if (nlMap[wdShort]) wdShort = nlMap[wdShort];
  const wd = days.indexOf(wdShort);
  if (wd < 0) return true;
  // Day-range check (wraps over week boundary if needed)
  const dayInRange = (fromDay <= toDay)
    ? (wd >= fromDay && wd <= toDay)
    : (wd >= fromDay || wd <= toDay);
  if (!dayInRange) return false;
  const hourNum = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minNum  = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const now = hourNum + minNum / 60;
  return now >= hStart && now < hEnd;
}

// Returns true on confirmed delivery-to-Meta, false on any failure. Never
// throws — callers (esp. the delayed-send flow in processMessage) rely on
// this to decide what's safe to persist to Airtable, so a thrown network
// error must resolve to `false` rather than propagate and skip that logic.
//
// `phoneNumberId` (Task 2, multitenancy prep): the per-client sender number,
// resolved from Client Config's F_WA_PHONE_NUMBER_ID by callers in
// processMessage. Falls back to the shared PHONE_NUMBER_ID env var when
// omitted/blank — this is the fallback that keeps every existing client
// (all fields still blank) sending from EXACTLY the same number as before.
async function sendWA(to, message, phoneNumberId) {
  try {
    const pnid = phoneNumberId || PHONE_NUMBER_ID;
    /* Elk uitgaand bericht gaat hier langs -- AI-antwoord, eigenaarsmelding,
       bevestiging. Eén plek, zodat geen enkele aanroeper het kan overslaan. */
    const tekst = _waOpmaak.voorWhatsApp(message);
    if (!tekst) {
      console.error(`[WhatsApp] Leeg bericht na opschonen, niet verstuurd naar ${to}`);
      return false;
    }
    const url = `https://graph.facebook.com/v19.0/${pnid}/messages`;
    const res = await fetch(url, {
      method:  'POST',
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: tekst },
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      console.error(`[WhatsApp] Sturen naar ${to} mislukt:`, JSON.stringify(data.error || data));
      return false;
    }
    console.log(`[WhatsApp] Bericht gestuurd naar ${to}`);
    return true;
  } catch (err) {
    console.error(`[WhatsApp] Netwerkfout bij sturen naar ${to}:`, err.message);
    return false;
  }
}
