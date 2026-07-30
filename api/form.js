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
  return attempts.length > 5;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Te veel aanvragen. Probeer later opnieuw.' });
  }

  const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const LEADS_TABLE    = 'tbliukTnDAbEDcZmt';
  const CLIENTS_TABLE  = 'tblPidTrwGRzRt4LZ';

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
    let   aiName     = 'Mathis Willems';      // safe default. Overwritten by client's "AI Name" field if set
    let   clientName = project_code;          // safe default. Overwritten below if found
    let   autoReplyTpl = '';                  // per-client custom WhatsApp opener (Klanten table: "Auto-Reply Template")
    let   ownerPhone = '';                    // per-client WhatsApp notify phone (overrides NOTIFY_PHONE env)
    let   ownerEmail = '';                    // per-client notify email (overrides NOTIFY_EMAIL env)
    let   lang       = 'nl';                   // nl / fr / en. Language for the welcome WhatsApp
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
          autoReplyTpl = match.fields['fldOGdVq6T54xEo6W']   || match.fields['Auto-Reply Template'] || '';
          // "AI Name" = the persona that signs WhatsApp messages.
          // Tip for clients: use an actual employee name ("Sara", "Tim Janssen")
          // so leads feel they're chatting with a real human, not a bot.
          const customAiName = match.fields['fldRvoe1JMPOtPWC7'] || match.fields['AI Name'] || '';
          if (customAiName && String(customAiName).trim()) aiName = String(customAiName).trim().slice(0, 60);
          // Language (nl/fr/en) controls the default welcome message
          const lg = (match.fields['fld1iiV9XwSbgAACZ'] || match.fields['Language'] || '').toString().trim().toLowerCase();
          if (lg === 'fr' || lg === 'en' || lg === 'nl') lang = lg;
          // Per-client owner contacts (override the env-var defaults)
          ownerPhone = (match.fields['fldZEApe0gfse07AU'] || match.fields['Notify Phone']  || '').toString().trim();
          ownerEmail = (match.fields['fldDBJCN6dVMA8jax'] || match.fields['Rapport Email'] || '').toString().trim();
          planState  = getPlanState(match.fields);
        }
      }
      // 429 / error → use defaults, don't block the form submission
    } catch { /* network error. Use defaults */ }

    // ── Normalise phone. Stored in Airtable in international digits-only format
    // so it matches what WhatsApp sends as message.from (e.g. "32466358427")
    let waPhone = phone.replace(/[\s\-\(\)\.]/g, '');
    if      (waPhone.startsWith('00')) waPhone = waPhone.slice(2);
    else if (waPhone.startsWith('+'))  waPhone = waPhone.slice(1);
    else if (waPhone.startsWith('0'))  waPhone = '32' + waPhone.slice(1);

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
          fldoLRI5W12ThTls7: JSON.stringify({ _v: 1, notes: [], tasks: [], calls: [], consent: { given: true, ts: consentTs } })
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
    // falls back to the language-specific default opener so existing clients without the field keep working.
    const defaultTpls = {
      nl: 'Hey {naam}! {ai} hier van {bedrijf}. Zag dat je je gegevens achterliet. Wat bracht je bij ons?',
      fr: 'Salut {naam} ! Ici {ai} de {bedrijf}. J’ai vu que tu as laissé tes coordonnées. Qu’est-ce qui t’amène chez nous ?',
      en: 'Hey {naam}! It’s {ai} from {bedrijf}. I saw you left your details. What brought you to us?'
    };
    const defaultTpl  = defaultTpls[lang] || defaultTpls.nl;
    const tpl         = (autoReplyTpl && autoReplyTpl.trim()) || defaultTpl;
    const waGreeting  = tpl
      .replace(/\{naam\}/g,    firstName)
      .replace(/\{bedrijf\}/g, sanitize(clientName))
      .replace(/\{project\}/g, sanitize(project_code))
      .replace(/\{bron\}/g,    sanitize(bron))
      .replace(/\{ai\}/g,      sanitize(aiName));
    // Prefer per-client notify-phone over global env-var fallback
    const notifyPhone = ownerPhone || process.env.NOTIFY_PHONE;
    const notifyMsg   = notifyPhone
      ? `Nieuwe lead!\n\nNaam: ${sanitize(name)}\nTel: ${phone}\nProject: ${project_code}\nBron: ${sanitize(bron)}\n\nDashboard: https://app.helvaro.pro/dashboard`
      : null;

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
            const waOk = await sendWA(waPhone, waGreeting);
            if (!waOk) {
              // WhatsApp failed. Flag lead so dashboard shows it in "Niet bereikbaar"
              await flagWaFailed(leadId, AIRTABLE_TOKEN, BASE_ID, LEADS_TABLE);
            } else {
              // Persist the opening message into Conversation History so the dashboard
              // shows the very first bubble of the conversation (otherwise it looks
              // like the lead started the chat unprompted).
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
          if (notifyPhone && notifyMsg) await sendWA(notifyPhone, notifyMsg);
        } catch (err) {
          // Belt-and-suspenders: sendWA/atFetch already fail-soft internally,
          // but if something upstream still throws, flag the lead rather than
          // let it silently vanish with no "Niet bereikbaar" signal at all.
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
  await sendMail({ to: NOTIFY_EMAIL, subject: `Nieuwe lead — ${name} (${project_code})`, html })
    .catch(err => console.error('[form mail]', err && err.message));
}

async function sendWA(to, message) {
  try {
    const r = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: message } })
      }
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) {
      console.error(`[form] WhatsApp naar ${to} mislukt (${r.status}):`, JSON.stringify(data.error || data));
      return false;
    }
    console.log(`[form] WhatsApp gestuurd naar ${to}`);
    return true;
  } catch (err) {
    console.error(`[form] WhatsApp netwerk fout naar ${to}:`, err.message);
    return false;
  }
}

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
