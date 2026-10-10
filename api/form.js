// waitUntil() registers a promise with the platform's request context so it
// keeps running for the lifetime of that promise (bounded by maxDuration),
// even after our HTTP response has already been returned to the browser.
// Without this, Vercel gives no documented guarantee that a container
// survives the setTimeout below (INTRO_VERTRAGING_MS) once the response is flushed. Safe to
// call in any environment: it's a no-op (getContext().waitUntil?.()) when
// the platform doesn't provide a request context (e.g. local dev).
const { maskPhone } = require('./_masker');
const { waitUntil } = require('@vercel/functions');
const _klant = require('./_klant');
const _trace = require('./_trace');

/* Pauze tussen formulier en eerste WhatsApp-bericht; zie de uitleg bij de
   setTimeout verderop. */
const INTRO_VERTRAGING_MS = Math.min(45000, Math.max(0, Number(process.env.INTRO_VERTRAGING_MS) || 5000));
// Trial/plan-status interpretation. Pure, no I/O — see its file header.
const { getPlanState } = require('./_plan');
// Language registry — see its file header.
const _lang = require('./_lang');
const _eigenaar = require('./_eigenaar-melding'); // WhatsApp-melding aan de eigenaar: aan/uit per klant
const _regio = require('./_regio');   // land, tijdzone, munt en telefoon per klant
// Approved-template WhatsApp sender (Meta 24h-window workaround) — shared
// helper, not duplicated here. See api/leads.js:sendWATemplate's own header.
// Safe to require: api/leads.js's module.exports is the route handler
// function itself with extra named properties attached; requiring it here
// only evaluates the module top-level (function/const declarations, no I/O)
// and does NOT invoke the handler. api/cron-followup.js already does this
// exact `require('./leads')` for getClientWaPhoneNumberId/aggregateReportPeriod.
const { sendWATemplate } = require('./leads');
// Shared, cross-instance rate limiter (Upstash-backed with safe in-memory
// fallback) — see api/_ratelimit.js's header. api/auth.js, api/leads.js and
// api/_demo-chat.js already moved off plain in-memory Maps for exactly this
// reason: on serverless, a per-instance counter resets on every cold start
// and is duplicated across every warm instance, which is close to no limit
// at all for a determined submitter. This is the public lead-capture form —
// unauthenticated, writes to Airtable, and sends email/WhatsApp — so it gets
// the same shared counter.
const _rl = require('./_ratelimit');
const _errors = require('./_errors');
// Gedeelde Notities-merge voor de waFailed-vlag (zelfde functie als whatsapp.js).
const { mergeWaFailedFlag } = require('./_notities-vlag');
// Cross-instance sloten (fail-open zonder Redis) -- zie L-15 hieronder.
const _lock = require('./_lock');

// Single 30-second retry for Airtable 429 on the lead-creation critical path.
//
// Previous design (4 retries, 1/2/4/8 s delays) kept pounding Airtable every
// few seconds, extending its sustained throttle ban instead of letting it recover.
// Airtable's own Retry-After guidance is 30 s. One wait of that length gives
// the rate-limit window a real chance to clear before the final attempt.
// Total worst-case time: ~31 s. Well within the 60 s Vercel function limit.
async function atFetch(url, opts) {
  const r1 = await fetch(url, opts);
  if (r1.status !== 429) return r1;
  // Wait 30 s (Airtable's recommended backoff) then try once more
  await new Promise(res => setTimeout(res, 30000));
  return fetch(url, opts);
}

// Rate limit. Max 5 form submissions per IP per 10 minutes, via the shared
// _ratelimit.js counter (see require above) rather than a local Map.
const FORM_RL_MAX       = 5;
const FORM_RL_WINDOW_MS = 10 * 60 * 1000;
async function isRateLimited(ip) {
  const gate = await _rl.hit('form', ip, FORM_RL_MAX, FORM_RL_WINDOW_MS);
  return gate.limited;
}

/* Eén kenmerk per verzoek op elke logregel (api/_trace.js, audit L-5):
   [form-xxxxxx] voor het formulier, [chat-xxxxxx] voor de websiteassistent,
   [voorraad-xxxxxx] voor de publieke voorraadfeed. */
module.exports = _errors.vangAf(function (req, res) {
  const q = req.query || {};
  const soort = q.__assistant ? 'chat' : q.__voorraad ? 'voorraad' : 'form';
  return _trace.met(_trace.maakId(soort), () => formHandler(req, res));
});

/* Gedeeld met de websiteassistent (api/_assistent.js): één open lead per persoon. */
module.exports._leadHulp = { zoekOpenLead, werkOpenLeadBij };

async function formHandler(req, res) {
  /* Websiteassistent (api/_assistent.js) via de rewrite /api/assistant. Eigen
     CORS (alleen de domeinen van de dealer), dus vóór de '*' hieronder. Via
     een rewrite op deze functie omdat form.js al de publieke ingang is; een
     eigen bestand mag ook (Vercel Pro, geen functielimiet). */
  if (req.query && req.query.__assistant) return require('./_assistent').handler(req, res);
  /* Publieke voorraad voor de website van de dealer (api/_voorraad-publiek.js)
     via de rewrite /api/inventory/:code. Alleen-lezen, eigen GET-CORS en een
     eigen rate-limit-emmer, dus ook vóór de POST-regels hieronder. */
  if (req.query && req.query.__voorraad) return require('./_voorraad-publiek').handler(req, res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Vercel sets x-vercel-forwarded-for itself from the real edge connection and
  // strips/overwrites any client-supplied value, unlike x-forwarded-for, which
  // a client can set directly to spoof the rate-limit key. Fall back to
  // x-forwarded-for only when x-vercel-forwarded-for is absent (e.g. local dev
  // without the Vercel edge in front).
  const ip = req.headers['x-vercel-forwarded-for']?.split(',')[0]?.trim()
          || req.headers['x-forwarded-for']?.split(',')[0]?.trim()
          || 'unknown';
  if (await isRateLimited(ip)) {
    /* De code is wat de FORMULIERPAGINA vertaalt; de Nederlandse zin blijft
       staan als laatste terugval -- voor logboeken, voor een curl, en voor een
       oude pagina die nog in iemands cache zit.

       Waarom dit nodig was: form-page.js deed `d.error || I18N.errGeneric`.
       De pagina HAD dus een vertaalde terugval, maar koos altijd de zin van de
       server. Een Waalse lead kreeg daardoor een Nederlandse foutmelding op
       het formulier van een Waals kantoor -- op de route waarlangs het geld
       binnenkomt, en op het moment dat er al iets misging. */
    return res.status(429).json({ code: 'rate_limited', error: 'Te veel aanvragen. Probeer later opnieuw.' });
  }

  const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const LEADS_TABLE    = 'tbliukTnDAbEDcZmt';
  const CLIENTS_TABLE  = 'tblPidTrwGRzRt4LZ';
  // Per-client WhatsApp sender number (multitenancy prep). Blank on every
  // client today (single shared number) — mirrors api/whatsapp.js's
  // F_WA_PHONE_NUMBER_ID / api/leads.js's constant of the same name. Only
  // ONE client is ever in scope for a single form submission, so this is
  // read straight off the client record already fetched below — no second
  // lookup/helper needed, unlike cron-followup.js's multi-client batch.
  const F_WA_PHONE_NUMBER_ID = 'fldbrhlSrsmlJwcYr';

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    /* Honeypot (audit L-18). Het gehoste formulier heeft een verborgen veld
       `website_url` dat een mens nooit ziet en dus nooit invult; een bot die
       elk veld vult wel. Dan: stil "gelukt" teruggeven en NIETS doen -- geen
       lead, geen WhatsApp, geen mail. Een duidelijke fout zou de bot alleen
       leren om het veld voortaan leeg te laten. */
    if (typeof body.website_url === 'string' && body.website_url.trim() !== '') {
      console.warn('[form] honeypot geraakt — inzending stil genegeerd.');
      return res.status(200).json({ success: true, id: '', kanaal: 'geen', status: 'niet_verzonden' });
    }

    // ── Extract & validate project_code ────────────────────────────────────────
    let project_code = '';
    const urlPath = (req.url || '').split('?')[0];
    const parts   = urlPath.split('/').filter(Boolean);
    const formIdx = parts.indexOf('form');
    if (formIdx !== -1 && parts[formIdx + 1]) {
      project_code = decodeURIComponent(parts[formIdx + 1]).trim().toUpperCase();
    }
    if (!project_code) project_code = String(body.project_code || '').trim().toUpperCase();
    if (!project_code) project_code = 'HELVARO';

    // Only allow alphanumeric + underscore project codes
    if (!/^[A-Z0-9_]{1,50}$/.test(project_code)) {
      return res.status(400).json({ code: 'bad_project', error: 'Ongeldige projectcode' });
    }

    // ── Extract & validate name / phone ────────────────────────────────────────
    const name  = String(body.name  || '').trim().slice(0, 100);
    const phone = String(body.phone || '').trim().slice(0, 30);
    /* E-mail is de uitwijk voor wie geen WhatsApp wil (Sindi, 2026-09-26: een
       koper op de website van een garage laat niet altijd zijn nummer achter).
       Nummer OF e-mail volstaat. Wie alleen e-mail geeft krijgt geen
       WhatsApp-begroeting -- er is geen nummer -- maar de lead bestaat, de
       eigenaar krijgt zijn melding met het adres erin, en de lead staat in het
       dashboard. Nooit meer dan dat: geen automatische mail vanaf hier. */
    const emailRaw = String(body.email || '').trim().slice(0, 120);
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailRaw) ? emailRaw.toLowerCase() : '';
    // Only pass bron if it matches a confirmed Airtable select option.
    // Unknown values → empty string → field omitted from create payload.
    // Add values here as you add them to the Bron field in Airtable.
    const VALID_BRON = new Set(['Website', 'Facebook', 'Google', 'Instagram', 'LinkedIn', 'TikTok', 'Advertentie', 'Advertenties', 'Doorverwijzing', 'Cold call', 'Overig', 'Anders']);
    const bronRaw = String(body.bron || '').trim().slice(0, 50);
    // Unknown values fall back to 'Website'. always set so analytics stay clean.
    const bron    = VALID_BRON.has(bronRaw) ? bronRaw : 'Website';

    /* De pandcode uit /start/TELJO/P3. Hij bepaalt straks over WELKE woning de
       AI praat, dus hij moet mee de lead in.

       Alleen het patroon wordt hier gecontroleerd, niet of het pand bestaat.
       Twee redenen: dit is de route waarlangs het geld binnenkomt en een extra
       Airtable-lezing maakt hem trager, en het patroon (hoofdletters, cijfers,
       streepje) kan niets injecteren. Een code die nergens op slaat wordt aan
       de andere kant gewoon genegeerd -- api/whatsapp.js zoekt hem op in de
       panden van DEZE klant en vindt hem dan niet. */
    const pandRaw = String(body.property || '').trim().toUpperCase();
    const pand    = /^[A-Z0-9][A-Z0-9-]{0,19}$/.test(pandRaw) ? pandRaw : '';

    /* Het aanbod waar de link naar verwees is niet (meer) zichtbaar
       (gearchiveerd/privé, audit L-10): de code blijft op de lead staan, met een
       markering zodat de dealer weet dat die auto/dat pand niet meer te koop is.
       Een hint van onze eigen pagina; niets leest hem als waarheid. */
    const pandWeg = !!pand && body.property_unavailable === true;

    if (!name)  return res.status(400).json({ code: 'name_required',  error: 'Naam is verplicht' });
    if (!phone && emailRaw && !email) return res.status(400).json({ code: 'bad_email', error: 'Ongeldig e-mailadres' });
    if (!phone && !email) return res.status(400).json({ code: 'contact_required', error: 'Telefoonnummer of e-mailadres is verplicht' });
    // GDPR Art. 7(1): consent must be given (not just shown) and demonstrable.
    // The client-side checkbox already blocks the submit button, but that's
    // trivially bypassed by calling this API directly — enforce it here too,
    // and persist a timestamped record below so we can prove it was given.
    if (body.consent !== true) return res.status(400).json({ code: 'consent_required', error: 'Toestemming voor contact is verplicht' });
    const consentTs = new Date().toISOString();

    // ── Look up client config (non-blocking) ───────────────────────────────────
    // Single-shot fetch (no retries). this is non-critical; on any failure we
    // fall back to safe defaults and always proceed with lead creation.
    // Uses a formula filter on the field ID so only 1 record is returned instead
    // of fetching all 100 clients and filtering client-side.
    let   regio      = _regio.standaard();    // België tenzij de klantrij iets anders zegt
  let   aiName     = 'Mathis Willems';      // safe default. Overwritten by client's "AI Name" field if set
    let   clientName = project_code;          // safe default. Overwritten below if found
    let   autoReplyTpl = '';                  // per-client custom WhatsApp opener (Klanten table: "Auto-Reply Template")
    let   ownerPhone = '';                    // per-client WhatsApp notify phone (overrides NOTIFY_PHONE env)
    let   ownerWaUit = false;                 // Instellingen → Meldingen: WhatsApp aan de eigenaar uit
    let   ownerEmail = '';                    // per-client notify email (overrides NOTIFY_EMAIL env)
    let   lang       = 'nl';                   // registry-driven (40 languages, see api/_lang.js). Language for the welcome WhatsApp
    let   clientPnid = '';                    // per-client WhatsApp sender (multitenancy prep). '' = fall back to shared PHONE_NUMBER_ID
    // TRIAL-DESIGN.md §3/§7: lead capture ALWAYS works, regardless of plan
    // state. The only thing plan state changes below is whether the
    // automated first WhatsApp greeting gets sent — never whether the lead
    // gets created. Defaults to 'active' (getPlanState's own fail-open
    // behaviour) if the client lookup below fails for any reason, so a
    // lookup hiccup can never accidentally suppress a real client's greeting.
    let   planState = { status: 'active', isServiceStopped: false };
    /* Bestaat deze projectcode echt? 'onbekend' = de opzoeking zelf faalde
       (dan falen we open, zoals altijd: liever een lead onder een standaardnaam
       dan een verloren aanvraag). 'afwezig' = Airtable antwoordde en er is GEEN
       klant met deze code (audit L-04: tikfout in data-project, of een oude
       /start/CODE-link). */
    let   klantStatus = 'onbekend';

    try {
      const cFormula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(project_code)}"`);
      const cRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${cFormula}&maxRecords=1`,
        { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
      );
      if (cRes.ok) {
        const cData = await cRes.json();
        const match = (cData.records || [])[0];
        klantStatus = match ? 'gevonden' : 'afwezig';
        if (match) {
          // Field IDs (immune to renames): fldAnB848Sr5jl6dq=Client Name,
          // fldOGdVq6T54xEo6W=Auto-Reply Template, fldRvoe1JMPOtPWC7=AI Name
          clientName   = match.fields['fldAnB848Sr5jl6dq']   || match.fields['Client Name']         || clientName;
          /* Land van de klant: bepaalt hoe een telefoonnummer met een nul
             ervoor gelezen wordt. Zonder dit werd 07700 900123 (Brits) een
             Belgisch nummer dat niet bestaat -- de lead kwam binnen, het
             WhatsApp-bericht ging nergens heen, en niemand zag een fout. */
          regio = _regio.lees(match.fields);
          autoReplyTpl = match.fields['fldOGdVq6T54xEo6W']   || match.fields['Auto-Reply Template'] || '';
          // "AI Name" = the persona that signs WhatsApp messages.
          // Tip for clients: use an actual employee name ("Sara", "Tim Janssen")
          // so leads feel they're chatting with a real human, not a bot.
          const customAiName = match.fields['fldRvoe1JMPOtPWC7'] || match.fields['AI Name'] || '';
          if (customAiName && String(customAiName).trim()) aiName = String(customAiName).trim().slice(0, 60);
          // Language controls the default welcome message (registry-driven)
          lang = _lang.normalizeLanguageCode(match.fields['fld1iiV9XwSbgAACZ'] || match.fields['Language']);
          // Per-client owner contacts (override the env-var defaults)
          ownerPhone = (match.fields['fldZEApe0gfse07AU'] || match.fields['Notify Phone']  || '').toString().trim();
          ownerWaUit = _eigenaar.waUit(match.fields);
          ownerEmail = (match.fields['fldDBJCN6dVMA8jax'] || match.fields['Rapport Email'] || '').toString().trim();
          planState  = getPlanState(match.fields);
          // Blank field (every client today) -> '' -> the sendWATemplate calls
          // below fall back to the shared PHONE_NUMBER_ID env var. Same
          // fallback chain api/whatsapp.js's clientPhoneNumberId already uses.
          clientPnid = (match.fields[F_WA_PHONE_NUMBER_ID] || match.fields['WhatsApp Phone Number ID'] || '').toString().trim();
        }
      }
      // 429 / error → use defaults, don't block the form submission
    } catch { /* network error. Use defaults */ }

    if (klantStatus === 'afwezig') {
      console.warn(`[form] projectcode ${project_code} bestaat niet — niets aangemaakt.`);
      return res.status(404).json({ code: 'unknown_project', error: 'Onbekende projectcode' });
    }

    // ── Normalise phone. Stored in Airtable in international digits-only format
    // so it matches what WhatsApp sends as message.from (e.g. "32478123456")
    const waPhone = phone ? _regio.naarE164(phone, regio) : '';

    // Validate: digits only, 8-15 chars (standard E.164 range)
    if (phone && !/^\d{8,15}$/.test(waPhone)) {
      return res.status(400).json({ code: 'bad_phone', error: 'Ongeldig telefoonnummer. Gebruik cijfers' });
    }

    /* ── Eén open lead per persoon (audit M-6) ───────────────────────────────
       Vult iemand het formulier opnieuw in terwijl er nog een open lead voor
       hem is (zelfde nummer of e-mail, status nieuw of in behandeling), dan
       werken we die bij in plaats van een tweede aan te maken: een notitie met
       de nieuwe aanvraag, en de wagen/het e-mailadres als die nog ontbraken.
       Geen tweede welkomstbericht; de dealer krijgt wel een melding.
       Faalt de opzoeking, dan maken we gewoon een nieuwe lead -- liever een
       dubbel dan een verloren aanvraag. */
    const maakOfHergebruik = async () => {
    let hergebruikt = null;
    try {
      hergebruikt = await zoekOpenLead({ token: AIRTABLE_TOKEN, baseId: BASE_ID, tabel: LEADS_TABLE, project: project_code, telefoon: waPhone, email });
    } catch (e) {
      console.warn('[form] open lead opzoeken mislukt, nieuwe lead:', e && e.message);
    }
    let createData = {};
    if (hergebruikt) {
      const bijgewerkt = await werkOpenLeadBij({ token: AIRTABLE_TOKEN, baseId: BASE_ID, tabel: LEADS_TABLE, lead: hergebruikt, pand, email, bron, consentTs })
        .catch((e) => { console.warn('[form] open lead bijwerken mislukt, nieuwe lead:', e && e.message); return false; });
      if (bijgewerkt) {
        createData = { id: hergebruikt.id };
        console.log(`[form] ${project_code}: bestaande open lead ${hergebruikt.id} bijgewerkt in plaats van een tweede aan te maken.`);
      } else {
        hergebruikt = null;
      }
    }

    if (!hergebruikt) {
    // ── Create lead in Airtable (with retry on 429) ───────────────────────────
    const createOpts = {
      method:  'POST',
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          fldbk0LVNckOU0bqA: name,
          ...(waPhone ? { fld6YaitW0lMqHUrd: waPhone } : {}),   // normalized. Must match WhatsApp's message.from
          fldSmczuyUJd26HLe: project_code,
          fld8mkrEWcyq7mUip: 'new',
          fldGoerozqdea4BfU: bron,
          fldR0r13EU4RwrtvH: new Date().toISOString(),
          // GDPR Art. 7(1) demonstrability: no dedicated Airtable column exists
          // for consent (schema changes are out of scope for a code branch), so
          // it rides in the existing free-text Notities field alongside the
          // notes/tasks/calls JSON blob the dashboard already reads/writes via
          // parseNotities()/serializeNotities(). Those spread unknown keys
          // through untouched, so this survives future dashboard note edits.
          /* property rijdt mee in dezelfde JSON-blob als consent. Bewust geen
             nieuwe Airtable-kolom: een veld dat nog niet bestaat laat de HELE
             create met een 422 stuklopen, en dat kost dan een echte lead. Zo
             werkt dit vanaf de dag dat het uitrolt, zonder dat iemand eerst
             een kolom moet aanmaken. parseNotities() laat onbekende sleutels
             ongemoeid, dus hij overleeft elke bewerking vanuit het dashboard. */
          fldoLRI5W12ThTls7: JSON.stringify(Object.assign(
            { _v: 1, notes: [], tasks: [], calls: [], consent: { given: true, ts: consentTs } },
            pand ? { property: pand } : {},
            pandWeg ? { propertyUnavailable: true } : {},
            /* Het e-mailadres in dezelfde blob en niet in de kolom Email: die
               kolom wordt door api/_schema.js aangemaakt en bestaat dus niet
               in elke base, en een onbekend veld laat de HELE create stuklopen
               -- dat kost een echte lead. api/_leads-read.js leest beide. */
            email ? { email } : {}
          ))
        }
      })
    };
    const createRes = await atFetch(
      `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}`,
      createOpts
    );
    const createRaw  = await createRes.text();
    try { createData = JSON.parse(createRaw); } catch {}
    if (!createRes.ok) {
      let _eb = {}; try { _eb = JSON.parse(createRaw); } catch {}
      console.error('[form] AT' + createRes.status + ' ' + (_eb?.error?.type || _eb?.errors?.[0]?.error || '?'));
      if (createRes.status === 429) {
        return { fout: [503, { code: 'busy', error: 'Systeem is even bezet. Probeer het in 30 seconden opnieuw.' }] };
      }
      return { fout: [500, { code: 'create_failed', error: 'Lead aanmaken mislukt' }] };
    }
    } // einde "if (!hergebruikt)"
    return { hergebruikt, createData };
    };

    /* Twee gelijktijdige inzendingen voor hetzelfde nummer/e-mailadres (twee
       tabbladen, of een herpoging na een timeout) zagen allebei "geen open
       lead" en maakten er twee aan -- met twee begroetingen (audit L-15).
       Zoeken + aanmaken loopt nu onder een slot per (dealer, persoon); de
       tweede wacht kort en vindt dan de lead van de eerste. Zonder Redis, of
       als het slot na een paar pogingen nog vastligt, gaat het zoals voorheen
       (api/_lock.js faalt bewust open). */
    const slotSleutel = 'form:' + project_code + ':' + (waPhone || email);
    /* Tot ~13 s wachten (10 pogingen, oplopend per 300 ms): een eerste inzending
       die Airtable en WhatsApp afwacht duurt langer dan de standaard ~1,5 s, en
       dan maakte de tweede alsnog een dubbele lead (review 2026-10-09). Ligt het
       slot daarna nog vast, dan gaat het door zoals voorheen: liever een dubbele
       dan een verloren lead. */
    const slot = await _lock.metSlot(slotSleutel, 35000, maakOfHergebruik, { pogingen: 10, pauzeMs: 300 });
    const uitkomst = slot && slot.bezet ? await maakOfHergebruik() : slot.resultaat;
    if (uitkomst.fout) return res.status(uitkomst.fout[0]).json(uitkomst.fout[1]);
    const hergebruikt = uitkomst.hergebruikt;
    const createData = uitkomst.createData;

    // ── Respond to browser immediately, send WhatsApp after 60s delay ──────────
    const firstName   = sanitize(name).split(' ')[0];
    // Per-client custom template (placeholders: {naam} {bedrijf} {project} {bron} {ai})
    // falls back to the language-specific default opener (registry-driven,
    // see api/_lang.js) so existing clients without the field keep working.
    const defaultTpl = _lang.buildWelcomeMessage(lang);
    const tpl         = (autoReplyTpl && autoReplyTpl.trim()) || defaultTpl;
    const waGreeting  = tpl
      .replace(/\{naam\}/g,    firstName)
      .replace(/\{bedrijf\}/g, sanitize(clientName))
      .replace(/\{project\}/g, sanitize(project_code))
      .replace(/\{bron\}/g,    sanitize(bron))
      .replace(/\{ai\}/g,      sanitize(aiName));
    // Prefer per-client notify-phone over global env-var fallback. E-mail
    // (sendEmailNotification below) is the RELIABLE owner-alert channel — see
    // the deferred callback below for why the WhatsApp ping here is
    // best-effort-only and template-gated, not a second guaranteed channel.
    /* Uit = ook geen terugval op het globale NOTIFY_PHONE; anders stond de
       schakelaar er voor niets. E-mail (hieronder) blijft. */
    const notifyPhone = ownerWaUit ? '' : (ownerPhone || process.env.NOTIFY_PHONE);

    // Korte adempauze vóór het eerste WhatsApp-bericht. Dit stond op 45 s
    // ('voelt als een mens die het formulier oppakt'), maar in de praktijk
    // wacht de lead dan bijna een minuut op het bericht dat hij net zelf heeft
    // aangevraagd -- en tijdens een demo of screencast is dat een eeuwigheid.
    // Nu 5 s, instelbaar via INTRO_VERTRAGING_MS (max 45 s: de functie heeft
    // maxDuration 120 in vercel.json, maar het bericht moet ook nog verzonden
    // worden). Zie Sindi, 2026-09-20.
    //
    // We already returned (are about to return) the HTTP response below, so
    // this setTimeout runs entirely after the response is sent. Vercel gives
    // no documented guarantee a container survives that long post-response
    // unless the work is registered via waitUntil() — see require() above.
    // We wrap the whole deferred callback in a Promise + try/catch (not just
    // `async () => {}` passed straight to setTimeout) for two reasons:
    //   1. waitUntil() needs an actual Promise to hold onto.
    //   2. An uncaught throw in a bare `setTimeout(async () => ...)` becomes
    //      an unhandled promise rejection, which can crash the whole process
    //      on modern Node — taking down every OTHER in-flight request in this
    //      Fluid Compute instance, not just this one lead's send.
    const leadId = createData.id;

    /* Wat de bezoeker mag verwachten (audit L-07). Alles wat bepaalt of er een
       WhatsApp-begroeting gaat volgen is vóór dit antwoord bekend, dus we
       beloven niets meer wat de deferred send hieronder toch niet doet.
         kanaal  whatsapp | email | geen   -- hoe we deze persoon bereiken
         status  verzonden       = er staat een WhatsApp-begroeting klaar voor
                                   verzending (aflevering zelf is pas later te
                                   weten; Meta kan hem nog weigeren)
                 niet_verzonden  = bewust geen automatisch bericht (zie reden)
                 mislukt         = gereserveerd voor een bekende storing
         reden   alleen bij niet_verzonden: bestaande_lead | alleen_email |
                 dienst_gestopt | niet_geconfigureerd
       Alleen additieve velden; success/id/bestaand blijven zoals ze waren. */
    const terugvalKanaal = email ? 'email' : 'geen';
    let kanaalUit = { kanaal: 'whatsapp', status: 'verzonden' };
    if (hergebruikt) kanaalUit = { kanaal: waPhone ? 'whatsapp' : terugvalKanaal, status: 'niet_verzonden', reden: 'bestaande_lead' };
    else if (!waPhone) kanaalUit = { kanaal: 'email', status: 'niet_verzonden', reden: 'alleen_email' };
    else if (planState.isServiceStopped) kanaalUit = { kanaal: terugvalKanaal, status: 'niet_verzonden', reden: 'dienst_gestopt' };
    else if (!process.env.INTRO_TEMPLATE_NAME) kanaalUit = { kanaal: terugvalKanaal, status: 'niet_verzonden', reden: 'niet_geconfigureerd' };

    const deferredSend = new Promise((resolve) => {
      setTimeout(async () => {
        try {
          // TRIAL-DESIGN.md §3: lead capture (above) ALWAYS runs regardless
          // of plan state. The ONLY thing plan state changes is whether the
          // automated first WhatsApp greeting goes out — the lead is still
          // created and visible in the dashboard either way. This is NOT a
          // send failure (skip flagWaFailed's "Niet bereikbaar" treatment),
          // it's a deliberate no-send: the owner notification below still
          // fires so they know to follow up manually.
          if (hergebruikt) {
            /* Deze persoon kreeg bij zijn eerste aanvraag al een welkomstbericht
               en loopt als open lead. Een tweede begroeting voelt als spam. */
            console.log(`[form] lead ${leadId} bestond al — geen tweede WhatsApp-begroeting.`);
          } else if (!waPhone) {
            /* Alleen e-mail: er is geen nummer om naar te sturen. Geen fout en
               geen "Niet bereikbaar"-vlag -- de koper koos zelf voor e-mail. */
            console.log(`[form] lead ${leadId} liet alleen een e-mailadres achter — geen WhatsApp-begroeting.`);
          } else if (planState.isServiceStopped) {
            console.log(`[form] project ${project_code} — Plan Status '${planState.status}', automatische WhatsApp-begroeting overgeslagen. Lead is wel aangemaakt.`);
          } else {
            // A web-form lead has never messaged the business, so Meta's 24h
            // customer-service window is NEVER open here — a freeform
            // `type: 'text'` send (the old behaviour) is silently rejected by
            // Meta every time. This MUST go through an approved template,
            // same rule cron-followup.js / leads.js's sendAppointmentConfirmation
            // already enforce for their own outside-the-window sends.
            const introPnid = clientPnid || process.env.PHONE_NUMBER_ID;
            if (!process.env.INTRO_TEMPLATE_NAME) {
              // Loud + specific: this is the exact failure mode that let the
              // original bug (freeform first-contact send) go unnoticed for
              // every form lead. Never let this degrade silently again.
              console.error(`[form] INTRO_TEMPLATE_NAME niet geconfigureerd — WhatsApp-begroeting naar lead ${leadId} (${maskPhone(waPhone)}) overgeslagen. Freeform buiten het 24u-venster zou Meta-afwijzing/ban riskeren. Lead IS aangemaakt; stel INTRO_TEMPLATE_NAME + INTRO_TEMPLATE_LANG in.`);
              /* Bewust GEEN flagWaFailed: dit is een ontbrekende omgevings-
                 instelling, geen eigenschap van deze lead. Vlaggen zou ELKE lead
                 als "Niet bereikbaar" markeren tot iemand de variabele zet
                 (audit L-01). De luide logregel hierboven is het signaal. */
            } else {
              // Template language gated through the Meta-approval registry
              // (nl/fr/en today) — never bypass this, see _lang.js header.
              let introLang = _lang.resolveTemplateLanguage(process.env.INTRO_TEMPLATE_LANG || lang, lang).code;
              /* Alleen in een taal waarin Meta de template goedkeurde; zie
                 api/_wa-templates.js goedgekeurdeTaalVoor. */
              try { introLang = (await require('./_wa-templates').goedgekeurdeTaalVoor('intro', process.env.INTRO_TEMPLATE_LANG || lang)) || introLang; } catch (_) {}
              // Params mirror the free-form welcome copy's {naam}/{ai}/{bedrijf}
              // placeholders: {{1}}=first name, {{2}}=AI/staff name, {{3}}=company
              // name. The approved Meta template body must declare exactly 3
              // variables in this order (e.g. "Hey {{1}}! {{2}} hier van {{3}}...").
              const waOk = await sendWATemplate(
                waPhone, process.env.INTRO_TEMPLATE_NAME, introLang,
                [firstName, sanitize(aiName), sanitize(clientName)],
                introPnid, process.env.WHATSAPP_TOKEN
              );
              if (!waOk) {
                // Meta rejected the template send (unapproved variant, wrong
                // param count, disabled template, etc). Same loud+flagged
                // treatment as the missing-config case above.
                console.error(`[form] WhatsApp-intro template "${process.env.INTRO_TEMPLATE_NAME}" (${introLang}) naar lead ${leadId} (${maskPhone(waPhone)}) geweigerd door Meta. Lead IS aangemaakt, maar heeft nog geen WhatsApp-bericht ontvangen.`);
                await flagWaFailed(leadId, AIRTABLE_TOKEN, BASE_ID, LEADS_TABLE);
              } else {
                // Persist a readable rendering of the opener into Conversation
                // History so the dashboard shows the very first bubble of the
                // conversation (otherwise it looks like the lead started the
                // chat unprompted). waGreeting is a display approximation —
                // the actual WhatsApp send used the approved template above,
                // not this free-text string.
                //
                // IMPORTANT: keep Conversation State = 'new' here. State only flips to
                // 'in_progress' when the LEAD replies. The cron-followup job relies on
                // this signal to know which leads still need a re-engagement message.
                try {
                  await atFetch(
                    `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${leadId}`,
                    {
                      method:  'PATCH',
                      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
                      body:    JSON.stringify({ fields: {
                        'Conversation History': JSON.stringify([{ role: 'assistant', content: waGreeting }])
                      }})
                    }
                  ).catch(() => {});
                } catch { /* non-critical */ }
              }
            }
          }
          // ── Owner WhatsApp ping: best-effort ONLY, never the reliable channel ──
          // The owner is not a lead and hasn't necessarily messaged the business
          // number recently either, so the same 24h-window rule applies to them.
          // Requiring every client to get a dedicated Meta template approved just
          // for internal "new lead" alerts doesn't scale the way email does (no
          // approval process, always deliverable) — so email (below, outside this
          // deferred block, fired unconditionally) is the RELIABLE owner-alert
          // channel. This WhatsApp ping only fires when NOTIFY_TEMPLATE_NAME is
          // configured; if it's not, or if the send fails, that's fine — the
          // owner already has the email either way, so this only warns, it never
          // flags the lead (the lead's own status is unaffected by this ping).
          if (notifyPhone) {
            if (process.env.NOTIFY_TEMPLATE_NAME) {
              const notifyPnid = clientPnid || process.env.PHONE_NUMBER_ID;
              const notifyLang = _lang.resolveTemplateLanguage(process.env.NOTIFY_TEMPLATE_LANG || lang, lang).code;
              // {{1}}=lead name, {{2}}=lead phone, {{3}}=project code
              const notifyOk = await sendWATemplate(
                notifyPhone, process.env.NOTIFY_TEMPLATE_NAME, notifyLang,
                [sanitize(name), phone || sanitize(email), sanitize(project_code)],
                notifyPnid, process.env.WHATSAPP_TOKEN
              );
              if (!notifyOk) {
                console.warn(`[form] WhatsApp-eigenaarsmelding (template "${process.env.NOTIFY_TEMPLATE_NAME}") naar ${maskPhone(notifyPhone)} geweigerd door Meta voor lead ${leadId}. Owner is al per e-mail verwittigd — geen verdere actie nodig.`);
              }
            } else {
              console.log(`[form] NOTIFY_TEMPLATE_NAME niet geconfigureerd — WhatsApp-melding aan eigenaar overgeslagen voor lead ${leadId} (freeform buiten 24u-venster zou Meta-afwijzing riskeren). E-mailmelding is al verstuurd.`);
            }
          }
        } catch (err) {
          // Belt-and-suspenders: sendWATemplate/atFetch already fail-soft
          // internally, but if something upstream still throws, flag the
          // lead rather than let it silently vanish with no "Niet
          // bereikbaar" signal at all.
          console.error('[form] deferred WhatsApp-send callback crashed:', err.message);
          await flagWaFailed(leadId, AIRTABLE_TOKEN, BASE_ID, LEADS_TABLE).catch(() => {});
        } finally {
          resolve();
        }
      }, INTRO_VERTRAGING_MS);
    });
    waitUntil(deferredSend);

    /* Klantidentiteit (api/_klant.js): deze lead aan zijn klant hangen, zodat
       dezelfde koper via WhatsApp, e-mail of de website als één persoon
       zichtbaar wordt. Alleen op exact nummer/e-mail, nooit op naam. Na het
       antwoord en fail-soft: een storing hier raakt de lead niet. */
    try {
      waitUntil(_klant.koppelLead(project_code, leadId, { telefoon: waPhone, naam: name, email, kanaal: 'website', bron: bron || 'formulier' }).catch(() => {}));
    } catch (e) { /* koppelen is bijzaak; de lead bestaat al */ }

    /* Het gevraagde voertuig (naam + code + prijs) voor de melding aan de
       eigenaar (audit L-09). Fail-soft en met een korte limiet: de melding
       gaat ook zonder uit. */
    const voertuigP = voertuigVoorMelding(project_code, pand);   // loopt mee in waitUntil; vertraagt het antwoord niet

    // Email notification: prefer per-client Rapport Email. Geregistreerd bij
    // waitUntil (audit L-16) zodat het platform de instantie niet afkapt
    // voordat de mail weg is.
    const mailWerk = voertuigP.then((voertuigTekst) => sendEmailNotification({ name, phone, email, project_code, bron, clientName, toEmail: ownerEmail, voertuig: voertuigTekst, pand })).catch(() => {});

    /* Pushmelding naar de apparaten van dit kantoor. Bewust NAAST de e-mail en
       de WhatsApp-ping, niet in plaats daarvan: die twee zijn de betrouwbare
       kanalen, dit is het snelle. Een makelaar die met zijn telefoon in zijn
       hand staat weet het hiermee binnen een seconde, ook als het dashboard
       dicht is -- en dat was nou net wat de oude browsermelding niet kon.

       Fail-soft en zonder await: er wordt niet op gewacht en er wordt niets mee
       gedaan. Ligt OneSignal eruit of staat de sleutel er niet, dan is de lead
       gewoon opgeslagen en heeft de eigenaar zijn mail. Zie api/_push.js. */
    const pushWerk = voertuigP.then((voertuigTekst) => (voertuigTekst
      ? require('./_push').stuurNaarKantoor({
          projectCode: project_code,
          titel: require('./_i18n').t(require('./_i18n').kort(process.env.DASHBOARD_LANG || require('./_i18n').STANDAARD), 'push.lead.title'),
          tekst: voertuigTekst,
          url:   'https://app.helvaro.pro/dashboard',
        })
      : require('./_push').stuurVertaald({
          projectCode:  project_code,
          titelSleutel: 'push.lead.title',
          tekstSleutel: 'push.lead.body',
          url:          'https://app.helvaro.pro/dashboard',
        }))).catch(() => {});
    try { waitUntil(Promise.allSettled([mailWerk, pushWerk])); } catch (_) { /* geen requestcontext: lokaal */ }

    return res.status(200).json({ success: true, id: createData.id, ...(hergebruikt ? { bestaand: true } : {}), ...kanaalUit });

  } catch (err) {
    console.error('Form error:', err.message);
    return res.status(500).json({ code: 'server_error', error: 'Serverfout. Probeer later opnieuw.' });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_VELD = 'fld8mkrEWcyq7mUip';
const TELEFOON_VELD = 'fld6YaitW0lMqHUrd';
const NOTITIES_VELD = 'fldoLRI5W12ThTls7';
const PROJECT_VELD = 'fldSmczuyUJd26HLe';
const GESLOTEN = ['completed', 'verloren', 'lost', 'won', 'gewonnen'];

/* De meest recente open lead van deze klant voor dit nummer of e-mailadres,
   of null. Open = elke status behalve de afgesloten. Het e-mailadres staat in
   de Notities-JSON (zie de create hieronder), dus daar zoeken we het. */
async function zoekOpenLead({ token, baseId, tabel, project, telefoon, email }) {
  const tel = String(telefoon || '').replace(/\D/g, '');
  const mail = String(email || '').trim().toLowerCase();
  if (!tel && !mail) return null;
  const wie = [];
  if (tel) wie.push(`{${TELEFOON_VELD}}="${escapeFormula(tel)}"`);
  if (mail) wie.push(`FIND("${escapeFormula('"email":"' + mail + '"')}", LOWER({${NOTITIES_VELD}}&""))`);
  const dicht = GESLOTEN.map((s) => `{${STATUS_VELD}}="${s}"`).join(',');
  const formule = `AND({${PROJECT_VELD}}="${escapeFormula(project)}", OR(${wie.join(',')}), NOT(OR(${dicht})))`;
  const url = `https://api.airtable.com/v0/${baseId}/${tabel}?filterByFormula=${encodeURIComponent(formule)}`
    + `&maxRecords=5&returnFieldsByFieldId=true&sort%5B0%5D%5Bfield%5D=fldR0r13EU4RwrtvH&sort%5B0%5D%5Bdirection%5D=desc`;
  const r = await atFetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error('Airtable ' + r.status);
  const d = await r.json();
  /* Tweede slot in code: tenant en status opnieuw nagaan. */
  const lead = (d.records || []).find((x) => {
    const f = (x && x.fields) || {};
    return String(f[PROJECT_VELD] || '') === String(project)
      && GESLOTEN.indexOf(String(f[STATUS_VELD] || '').toLowerCase()) === -1;
  });
  return lead || null;
}

/* Notitie bij de bestaande lead + ontbrekende wagen/e-mail aanvullen. Laat
   alles wat al in Notities staat (aiPaused, taken, eerdere notities) staan.
   true = gelukt. */
async function werkOpenLeadBij({ token, baseId, tabel, lead, pand, email, bron, consentTs }) {
  const ruw = String((lead.fields || {})[NOTITIES_VELD] || '');
  let blob;
  try { blob = ruw ? JSON.parse(ruw) : {}; } catch (_) { blob = null; }
  if (!blob || typeof blob !== 'object' || Array.isArray(blob)) {
    /* Vrije tekst in plaats van JSON: niet overschrijven. Dan toch een nieuwe
       lead, zodat er niets verloren gaat. */
    return false;
  }
  const notes = Array.isArray(blob.notes) ? blob.notes : [];
  const wat = pand ? ` voor ${String(pand).slice(0, 120)}` : '';
  const via = bron ? ` (${String(bron).slice(0, 40)})` : '';
  notes.unshift({ id: 'n_' + Date.now(), text: `Vulde het formulier opnieuw in${wat}${via}.`, ts: new Date().toISOString() });
  const nieuw = Object.assign({}, blob, { _v: 1, notes, tasks: blob.tasks || [], calls: blob.calls || [] });
  if (pand && !blob.property) nieuw.property = pand;
  /* Vraagt dezelfde persoon later naar een ANDERE wagen, dan blijft de eerste
     de `property` (waar de AI over praat en waar een boeking aan hangt) en komt
     de nieuwe erbij in `properties` -- de dealer ziet beide (audit L-11). */
  if (pand && blob.property && pand !== blob.property) {
    const lijst = Array.isArray(blob.properties) ? blob.properties.slice() : [blob.property];
    if (lijst.indexOf(pand) === -1) lijst.push(pand);
    nieuw.properties = lijst.slice(0, 20);
  }
  if (email && !blob.email) nieuw.email = email;
  nieuw.consent = Object.assign({}, blob.consent || {}, { given: true, ts: consentTs });
  const r = await atFetch(`https://api.airtable.com/v0/${baseId}/${tabel}/${lead.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { [NOTITIES_VELD]: JSON.stringify(nieuw).slice(0, 95000) } }),
  });
  if (!r.ok) throw new Error('Airtable ' + r.status);
  return true;
}

function escapeFormula(val) {
  return val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Strip control characters and limit length before embedding in messages
function sanitize(val) {
  return String(val || '').replace(/[\x00-\x1F\x7F]/g, '').slice(0, 100);
}

function escEmail(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendEmailNotification({ name, phone, email, project_code, bron, clientName, toEmail, voertuig, pand }) {
  // Prefer per-client Rapport Email; fall back to global NOTIFY_EMAIL for legacy setups
  const NOTIFY_EMAIL = (toEmail && toEmail.trim()) || process.env.NOTIFY_EMAIL;
  if (!NOTIFY_EMAIL) { console.warn('[form mail] geen ontvanger (Rapport Email / NOTIFY_EMAIL)'); return; }
  const { sendMail } = require('./_mailer');
  const html = `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#1e6fd9">Nieuwe lead voor ${escEmail(clientName)}</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;color:#666">Naam</td><td style="padding:8px;font-weight:600">${escEmail(name)}</td></tr>
            <tr><td style="padding:8px;color:#666">Telefoon</td><td style="padding:8px;font-weight:600">${escEmail(phone || '—')}</td></tr>
            ${email ? `<tr><td style="padding:8px;color:#666">E-mail</td><td style="padding:8px;font-weight:600">${escEmail(email)}</td></tr>` : ''}
            ${voertuig || pand ? `<tr><td style="padding:8px;color:#666">Gevraagd voertuig</td><td style="padding:8px;font-weight:600">${escEmail(voertuig || pand)}</td></tr>` : ''}
            <tr><td style="padding:8px;color:#666">Project</td><td style="padding:8px">${escEmail(project_code)}</td></tr>
            <tr><td style="padding:8px;color:#666">Bron</td><td style="padding:8px">${escEmail(bron)}</td></tr>
          </table>
          <a href="https://app.helvaro.pro/dashboard" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#1e6fd9;color:#fff;border-radius:8px;text-decoration:none">Open Dashboard</a>
        </div>`;
  // name is raw body.name here (only trimmed/length-capped upstream) — strip
  // control characters before it lands in a header, same discipline already
  // applied to firstName (waGreeting) and to this same name via escEmail()
  // just above in the body. project_code is already regex-locked (A-Z0-9_).
  await sendMail({ to: NOTIFY_EMAIL, subject: `Nieuwe lead — ${sanitize(name)} (${project_code})`, html })
    .catch(err => console.error('[form mail]', err && err.message));
}

// NOTE: this file used to have its own freeform sendWA() helper here. It was
// removed — a web-form lead has never messaged the business, so Meta's 24h
// customer-service window is never open for that first contact, and a
// freeform `type: 'text'` send is silently rejected by Meta every time (the
// exact bug this file's WhatsApp sends were fixed for). Both the lead-intro
// and owner-notify sends above now go through the shared sendWATemplate()
// helper (imported from ./leads) instead. See api/leads.js:sendWATemplate.

/* Zet waFailed in de Notities van de lead ZONDER de rest weg te gooien. Eerst
   gold hier "Notities is nog leeg, dus overschrijven is veilig" -- maar sinds de
   create staan toestemmingsbewijs, voertuigcode en e-mailadres in die blob
   (audit L-01). Lezen, samenvoegen (api/_notities-vlag.js, dezelfde functie als
   whatsapp.js), terugschrijven. Kan de lead niet gelezen worden, dan schrijven
   we NIETS: een gemiste vlag is minder erg dan een gewist toestemmingsbewijs. */
async function flagWaFailed(leadId, token, baseId, tableId) {
  const url = `https://api.airtable.com/v0/${baseId}/${tableId}/${leadId}`;
  try {
    const gelezen = await fetch(`${url}?returnFieldsByFieldId=true`, { headers: { Authorization: `Bearer ${token}` } });
    if (!gelezen.ok) { console.error('[form] flagWaFailed: lead lezen mislukt (' + gelezen.status + ') — vlag niet gezet om Notities niet te overschrijven.'); return; }
    const rec = await gelezen.json();
    const ruw = (rec && rec.fields && (rec.fields[NOTITIES_VELD] || rec.fields['Notities'])) || '';
    await fetch(url, {
      method:  'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fields: { [NOTITIES_VELD]: mergeWaFailedFlag(ruw) } })
    });
  } catch (err) {
    console.error('[form] flagWaFailed error:', err.message);
  }
}

/* "Naam (CODE) — € prijs" voor de eigenaarsmelding, of ''. Alleen voor
   voertuigen; een pand of een onbekende code geeft '' en de melding toont dan
   gewoon de code. Nooit een fout naar buiten, nooit langer dan 2,5 s. */
async function voertuigVoorMelding(project, pand) {
  if (!pand) return '';
  try {
    const _v = require('./_vehicles');
    const lees = _v.leesVers(project, pand);
    const uit = await Promise.race([lees, new Promise((r) => setTimeout(() => r(null), 2500))]);
    const auto = uit && uit.voertuig;
    if (!auto) return '';
    const naam = _v.naam ? _v.naam(auto) : '';
    const prijs = _v.prijsTekst ? _v.prijsTekst(auto.prijs) : '';
    return [naam, '(' + pand + ')', prijs && '— ' + prijs].filter(Boolean).join(' ');
  } catch (_) { return ''; }
}
