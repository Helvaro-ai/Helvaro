// waitUntil() registers a promise with the platform's request context so it
// keeps running for the lifetime of that promise (bounded by maxDuration),
// even after our HTTP response has already been returned to the browser.
// Without this, Vercel gives no documented guarantee that a container
// survives the 45s setTimeout below once the response is flushed. Safe to
// call in any environment: it's a no-op (getContext().waitUntil?.()) when
// the platform doesn't provide a request context (e.g. local dev).
const { waitUntil } = require('@vercel/functions');
// Trial/plan-status interpretation. Pure, no I/O — see its file header.
const { getPlanState } = require('./_plan');
// Language registry — see its file header.
const _lang = require('./_lang');
const _regio = require('./_regio');   // land, tijdzone, munt en telefoon per klant
// Approved-template WhatsApp sender (Meta 24h-window workaround) — shared
// helper, not duplicated here. See api/leads.js:sendWATemplate's own header.
// Safe to require: api/leads.js's module.exports is the route handler
// function itself with extra named properties attached; requiring it here
// only evaluates the module top-level (function/const declarations, no I/O)
// and does NOT invoke the handler. api/cron-followup.js already does this
// exact `require('./leads')` for getClientWaPhoneNumberId/aggregateReportPeriod.
const { sendWATemplate } = require('./leads');

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

// Rate limit. Max 5 form submissions per IP per 10 minutes
const formAttempts = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const window = 10 * 60 * 1000;
  const attempts = (formAttempts.get(ip) || []).filter(t => now - t < window);
  attempts.push(now);
  formAttempts.set(ip, attempts);
  // Evict IPs with no attempts left in the window so this Map doesn't grow
  // unbounded for the life of a warm serverless instance. Same pattern as
  // api/auth.js's loginAttempts.
  if (formAttempts.size > 1000) {
    for (const [k, v] of formAttempts) {
      if (v.every(t => now - t > window)) formAttempts.delete(k);
    }
  }
  return attempts.length > 5;
}

module.exports = async function handler(req, res) {
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
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Te veel aanvragen. Probeer later opnieuw.' });
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
      return res.status(400).json({ error: 'Ongeldige projectcode' });
    }

    // ── Extract & validate name / phone ────────────────────────────────────────
    const name  = String(body.name  || '').trim().slice(0, 100);
    const phone = String(body.phone || '').trim().slice(0, 30);
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

    if (!name)  return res.status(400).json({ error: 'Naam is verplicht' });
    if (!phone) return res.status(400).json({ error: 'Telefoonnummer is verplicht' });
    // GDPR Art. 7(1): consent must be given (not just shown) and demonstrable.
    // The client-side checkbox already blocks the submit button, but that's
    // trivially bypassed by calling this API directly — enforce it here too,
    // and persist a timestamped record below so we can prove it was given.
    if (body.consent !== true) return res.status(400).json({ error: 'Toestemming voor contact is verplicht' });
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

    try {
      const cFormula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(project_code)}"`);
      const cRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${cFormula}&maxRecords=1`,
        { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
      );
      if (cRes.ok) {
        const cData = await cRes.json();
        const match = (cData.records || [])[0];
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

    // ── Normalise phone. Stored in Airtable in international digits-only format
    // so it matches what WhatsApp sends as message.from (e.g. "32478123456")
    const waPhone = _regio.naarE164(phone, regio);

    // Validate: digits only, 8-15 chars (standard E.164 range)
    if (!/^\d{8,15}$/.test(waPhone)) {
      return res.status(400).json({ error: 'Ongeldig telefoonnummer. Gebruik cijfers' });
    }

    // ── Create lead in Airtable (with retry on 429) ───────────────────────────
    const createOpts = {
      method:  'POST',
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          fldbk0LVNckOU0bqA: name,
          fld6YaitW0lMqHUrd: waPhone,   // normalized. Must match WhatsApp's message.from
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
            pand ? { property: pand } : {}
          ))
        }
      })
    };
    const createRes = await atFetch(
      `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}`,
      createOpts
    );
    const createRaw  = await createRes.text();
    let createData = {};
    try { createData = JSON.parse(createRaw); } catch {}
    if (!createRes.ok) {
      let _eb = {}; try { _eb = JSON.parse(createRaw); } catch {}
      console.error('[form] AT' + createRes.status + ' ' + (_eb?.error?.type || _eb?.errors?.[0]?.error || '?'));
      if (createRes.status === 429) {
        return res.status(503).json({ error: 'Systeem is even bezet. Probeer het in 30 seconden opnieuw.' });
      }
      return res.status(500).json({ error: 'Lead aanmaken mislukt' });
    }

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
    const notifyPhone = ownerPhone || process.env.NOTIFY_PHONE;

    // Fire after 45 seconds. Feels like a real person picking up the form
    // Note: Vercel maxDuration is 60s, so 45s delay + processing leaves ~15s buffer
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
          if (planState.isServiceStopped) {
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
              console.error(`[form] INTRO_TEMPLATE_NAME niet geconfigureerd — WhatsApp-begroeting naar lead ${leadId} (${waPhone}) overgeslagen. Freeform buiten het 24u-venster zou Meta-afwijzing/ban riskeren. Lead IS aangemaakt; stel INTRO_TEMPLATE_NAME + INTRO_TEMPLATE_LANG in.`);
              await flagWaFailed(leadId, AIRTABLE_TOKEN, BASE_ID, LEADS_TABLE);
            } else {
              // Template language gated through the Meta-approval registry
              // (nl/fr/en today) — never bypass this, see _lang.js header.
              const introLang = _lang.resolveTemplateLanguage(process.env.INTRO_TEMPLATE_LANG || lang, lang).code;
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
                console.error(`[form] WhatsApp-intro template "${process.env.INTRO_TEMPLATE_NAME}" (${introLang}) naar lead ${leadId} (${waPhone}) geweigerd door Meta. Lead IS aangemaakt, maar heeft nog geen WhatsApp-bericht ontvangen.`);
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
                [sanitize(name), phone, sanitize(project_code)],
                notifyPnid, process.env.WHATSAPP_TOKEN
              );
              if (!notifyOk) {
                console.warn(`[form] WhatsApp-eigenaarsmelding (template "${process.env.NOTIFY_TEMPLATE_NAME}") naar ${notifyPhone} geweigerd door Meta voor lead ${leadId}. Owner is al per e-mail verwittigd — geen verdere actie nodig.`);
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
      }, 45000);
    });
    waitUntil(deferredSend);

    // Email notification (fire-and-forget). prefer per-client Rapport Email
    sendEmailNotification({ name, phone, project_code, bron, clientName, toEmail: ownerEmail }).catch(() => {});

    return res.status(200).json({ success: true, id: createData.id });

  } catch (err) {
    console.error('Form error:', err.message);
    return res.status(500).json({ error: 'Serverfout. Probeer later opnieuw.' });
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

async function sendEmailNotification({ name, phone, project_code, bron, clientName, toEmail }) {
  // Prefer per-client Rapport Email; fall back to global NOTIFY_EMAIL for legacy setups
  const NOTIFY_EMAIL = (toEmail && toEmail.trim()) || process.env.NOTIFY_EMAIL;
  if (!NOTIFY_EMAIL) { console.warn('[form mail] geen ontvanger (Rapport Email / NOTIFY_EMAIL)'); return; }
  const { sendMail } = require('./_mailer');
  const html = `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#1e6fd9">Nieuwe lead voor ${escEmail(clientName)}</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;color:#666">Naam</td><td style="padding:8px;font-weight:600">${escEmail(name)}</td></tr>
            <tr><td style="padding:8px;color:#666">Telefoon</td><td style="padding:8px;font-weight:600">${escEmail(phone)}</td></tr>
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

async function flagWaFailed(leadId, token, baseId, tableId) {
  const notities = JSON.stringify({ _v: 1, notes: [], tasks: [], calls: [], waFailed: true });
  await fetch(
    `https://api.airtable.com/v0/${baseId}/${tableId}/${leadId}`,
    {
      method:  'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fields: { fldoLRI5W12ThTls7: notities } })
    }
  ).catch(err => console.error('[form] flagWaFailed error:', err.message));
}
