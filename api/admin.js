// Admin endpoint. GET: all clients + lead stats | POST: create new client
// Protected by ADMIN_KEY env var (timing-safe comparison)
const crypto = require('crypto');
// Marketing Posts moved off Airtable to the VPS Postgres API (Airtable-shaped facade).
const { pgFetch, configured: pgConfigured } = require('./_pgapi');

/* De VPS die deze drie standen bediende is opgeheven, en de bijbehorende
   variabelen horen uit Vercel te zijn (zie de kop van api/_pgapi.js: het token
   ging naar een vrijgegeven IP-adres). Zonder die variabelen GOOIT pgFetch, en
   die drie aanroepen stonden niet in een try -- dus kreeg je een kale 500 van
   Vercel zonder te zien waarom.

   Een 503 met een reden is hier het eerlijke antwoord: de dienst bestaat niet
   meer, dat is geen fout van de aanroeper en ook niets dat overgaat door het
   nog eens te proberen. */
function pgWeg(res) {
  if (pgConfigured()) return false;
  res.status(503).json({
    error: 'Deze functie hing aan de opgeheven VPS en is buiten dienst.',
    reason: 'pgapi_gone',
  });
  return true;
}
// Credit/usage accounting — see its file header for the fail-open contract
// and the INTERNAL_PROJECT_CODE decision for founder-only tools below.
const credits = require('./_credits');
// Trial/plan-status interpretation (pure, no I/O) — see its file header.
const { getPlanState, computeTrialEndsAt, FIELD: PLAN_FIELD, VALID_STATUSES: PLAN_STATUSES } = require('./_plan');
// Language registry — see its file header.
const _lang = require('./_lang');
// Email-ownership verification for self-serve signup — see its file header.
const verifyEmail = require('./_verify');
const _session = require('./_session'); // cookie-first session transport + CSRF
const _ai = require('./_ai');           // AI-router: taak in, model uit

// Single-shot Airtable fetch. No retries (admin is low-frequency)
// Zie de uitleg bij atFetch in api/leads.js: zonder timeout hangt een trage
// Airtable-call tot de functie zelf wordt afgekapt.
const AT_TIMEOUT_MS = 10_000;
async function atFetch(url, opts) {
  return fetch(url, { ...opts, signal: (opts && opts.signal) || AbortSignal.timeout(AT_TIMEOUT_MS) });
}

// Concurrency-limited map. Airtable allows 5 requests/second per base and
// answers anything above that with a 429. Promise.all over a client list
// fires one request per client simultaneously, so from roughly the sixth
// client onward the extra calls get rejected — and because the per-item
// error handler falls back to zeroes, the admin overview quietly showed
// "0 leads" for real, healthy clients instead of failing loudly.
// Four at a time with a beat between waves stays inside the limit and costs
// about a second on a 20-client list.
async function mapPaced(items, fn, { concurrency = 4, pauseMs = 250 } = {}) {
  const out = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency);
    out.push(...await Promise.all(slice.map(fn)));
    if (i + concurrency < items.length) await new Promise(r => setTimeout(r, pauseMs));
  }
  return out;
}

// Rate limiter. 20 req / 60s per IP
const _rl = new Map();

// Presence map. ApiKey (sha256 prefix) -> { ts, clientName }
// Cleared on cold start; that's OK for "online now" semantics.
const _presence = new Map();
function _presenceKey(apiKey) {
  return crypto.createHash('sha256').update(String(apiKey)).digest('hex').slice(0, 16);
}
function _gcPresence() {
  const cutoff = Date.now() - 30 * 60_000; // 30 min. Twice the "online" window
  for (const [k, v] of _presence) if (v.ts < cutoff) _presence.delete(k);
}
function isRateLimited(ip) {
  const now = Date.now(), w = 60_000, max = 20;
  const hits = (_rl.get(ip) || []).filter(t => now - t < w);
  hits.push(now);
  _rl.set(ip, hits);
  if (_rl.size > 500) { for (const [k, v] of _rl) if (!v.some(t => now - t < w)) _rl.delete(k); }
  return hits.length > max;
}

function safeEqual(a, b) {
  try {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}

function isValidAdminToken(provided, adminKey) {
  if (!adminKey || !provided) return false;
  // Accept the derived HMAC token (current) or the raw key (legacy sessions)
  const derived = crypto.createHmac('sha256', adminKey).update('helvaro-admin-v1').digest('hex');
  return safeEqual(provided, derived) || safeEqual(provided, adminKey);
}

function escapeFormula(val) {
  return String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function generateApiKey() {
  return crypto.randomBytes(24).toString('base64url').slice(0, 32);
}

// Generic Client Config record PATCH by record id. typecast:true so a
// singleSelect field (Plan Status) accepts a value that isn't already one
// of its configured options without erroring — same reasoning admin.js's
// client-creation PATCH already uses for Niche. Throws on failure; callers
// decide how to log/degrade (see the trial-seeding and plan-admin-action
// call sites below).
async function _patchClientRecord(baseId, airtableToken, recordId, fields) {
  const r = await fetch(`https://api.airtable.com/v0/${baseId}/tblPidTrwGRzRt4LZ/${recordId}`, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields, typecast: true }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Airtable PATCH ${r.status}: ${t.slice(0, 300)}`);
  }
  return r.json();
}

// Friendly initial password: easy to read aloud + retype, still strong enough
// for 12-char entropy. We avoid look-alikes (0/O, 1/l/I) so the klant can
// reliably type it from the welcome mail before resetting via /forgot-password.
function generateFriendlyPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I, O
  const lower = 'abcdefghjkmnpqrstuvwxyz';    // no i, l, o
  const digit = '23456789';                   // no 0, 1
  const all   = upper + lower + digit;
  const pick = (set) => set[crypto.randomBytes(1)[0] % set.length];
  // Guarantee at least one of each class, then fill to 12 chars
  let out = pick(upper) + pick(lower) + pick(digit);
  for (let i = 0; i < 9; i++) out += pick(all);
  // Shuffle (Fisher-Yates with crypto bytes)
  const arr = out.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomBytes(1)[0] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

// Folds the onboarding wizard's "Vertel de AI over je bedrijf" free-text
// answers (step 4 — services/prices, FAQs, differentiators, what to never
// say) into the EXISTING AI Instructions field (fld1lqHctRbqFGQf5), combined
// with the shorter tone-of-voice instructions from step 2. This is the field
// whatsapp.js reads on EVERY turn (client.fields['AI Instructions']), so it's
// the only place that guarantees the AI has this business context from its
// very first message.
//
// Deliberately NOT written to 'AI Learned Patterns' (fldnbM5YKh274ISAl):
// that field is fully REPLACED (not appended) every Monday by
// cron-followup.js's runWeeklyLearning() job — see its `fields:
// { fldnbM5YKh274ISAl: newPatterns }` PATCH, which is a straight overwrite.
// Anything client-provided there would be AI-summarized away and lost within
// days. AI Instructions has no such job overwriting it, so it's the safe,
// permanent home for "everything about my business" content.
//
// Each sub-field is capped client- and server-side so the combined string
// stays comfortably under this field's existing 3000-char budget (same cap
// applied in leads.js's config-save path) without ever needing to silently
// truncate real content in normal use.
function composeAiInstructions(tone, biz) {
  const sections = [];
  if (tone) sections.push(tone);
  const bizLines = [];
  if (biz.bizServices)  bizLines.push(`Diensten & prijzen:\n${biz.bizServices}`);
  if (biz.bizFaqs)      bizLines.push(`Veelgestelde vragen:\n${biz.bizFaqs}`);
  if (biz.bizDifferent) bizLines.push(`Wat ons onderscheidt:\n${biz.bizDifferent}`);
  if (biz.bizNeverSay)  bizLines.push(`Dit mag de AI NOOIT zeggen:\n${biz.bizNeverSay}`);
  if (bizLines.length) {
    sections.push('--- Info over het bedrijf (ingevuld tijdens onboarding) ---\n' + bizLines.join('\n\n'));
  }
  return sections.join('\n\n').slice(0, 3000);
}

// Strip dashes (em/en/regular as zin-verbinder) and any euro pricing that
// leaked past the prompt's "no prices, no dashes" instruction. Last-line
// defense. The AI usually obeys but this guarantees the contract.
function scrubPost(text) {
  if (!text) return '';
  let t = String(text);

  // 1. Dashes as zinsverbinder: ". ", ". ", " - " between words/phrases
  //    Replace with ". " or ", " depending on what follows.
  //    Keep dashes inside hashtags, URLs, and dates (1-2 digits-1-2 digits).
  t = t.replace(/\s+[—–]\s+/g, '. ');                  // em/en dash with spaces
  t = t.replace(/([a-zà-ÿ])\s-\s([a-zà-ÿ])/gi, '$1, $2'); // " - " between words
  t = t.replace(/^[—–-]\s+/gm, '');                    // leading dash on a line

  // 2. Euro prices anywhere: €149, € 149, 149€, 149 euro, "vanaf X euro/maand",
  //    "€X per maand", any number followed by "/mnd" or "/maand" if it follows €.
  //    Replace whole sentences that contain pricing with an empty string and
  //    collapse double newlines.
  t = t.split('\n').filter(line => {
    const hasEuroPrice = /(€\s?\d|[\d.,]+\s?€|\b\d{2,4}\s?(?:euro|eur)\b|vanaf\s?€?\s?\d|\b\d+\s?\/\s?(?:mnd|maand|month))/i.test(line);
    return !hasEuroPrice;
  }).join('\n');

  // 3. Collapse triple+ blank lines that the filter might create.
  t = t.replace(/\n{3,}/g, '\n\n').trim();

  return t;
}

module.exports = async function handler(req, res) {
  // Allow the Helvaro app, the legacy Netlify Founder site, and any Cloudflare
  // Pages (*.pages.dev) preview the founder team spins up. Strict pattern
  // match, never reflect arbitrary origins.
  // NOTE: *.workers.dev was previously also whitelisted here, but neither
  // docs/architecture.md nor docs/api-reference.md document a Workers-hosted
  // origin (both only mention *.pages.dev), and no wrangler.toml / Workers
  // deployment exists anywhere in this repo. Tightened to match documented,
  // minimal-by-default CORS. If a legitimate *.workers.dev origin does need
  // access, re-add `|workers` to the pattern below AND update both docs.
  const allowedOrigins = ['https://app.helvaro.pro', 'https://founderyou.netlify.app'];
  const origin = req.headers.origin || '';
  const okCf = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.pages\.dev$/.test(origin);
  const ok = allowedOrigins.includes(origin) || okCf;
  res.setHeader('Access-Control-Allow-Origin', ok ? origin : 'https://app.helvaro.pro');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Vercel sets x-vercel-forwarded-for itself from the real edge connection and
  // strips/overwrites any client-supplied value, unlike x-forwarded-for, which
  // a client can set directly to spoof the rate-limit key. Fall back to
  // x-forwarded-for only when x-vercel-forwarded-for is absent (e.g. local dev
  // without the Vercel edge in front).
  const ip = req.headers['x-vercel-forwarded-for']?.split(',')[0]?.trim()
          || req.headers['x-forwarded-for']?.split(',')[0]?.trim()
          || 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Te veel verzoeken.' });

  const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const CLIENTS_TABLE  = 'tblPidTrwGRzRt4LZ';
  const LEADS_TABLE    = 'tbliukTnDAbEDcZmt';

  // ── GET ?mode=social-health: publieke, niet-gevoelige dag-status (alleen aantallen)
  // voor de lokale iMessage-alert. Geen post-content. ─────────────────────────
  const healthWanted = (req.query && (req.query.mode === 'social-health' || req.query.health === '1'))
    || /[?&](mode=social-health|health=1)/.test(req.url || '');
  if (req.method === 'GET' && healthWanted) {
    res.setHeader('Cache-Control', 'no-store');
    if (!AIRTABLE_TOKEN) return res.status(200).json({ ok: false, error: 'no token' });
    const today = new Date().toISOString().slice(0, 10);
    const start = today + 'T00:00:00.000Z';
    const end = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10) + 'T00:00:00.000Z';
    const f = encodeURIComponent(`AND(IS_AFTER({Scheduled For}, "${start}"), IS_BEFORE({Scheduled For}, "${end}"))`);
    try {
      const r = await pgFetch(`tblPxnfb5MThgsnaA?filterByFormula=${f}&pageSize=100`);
      if (!r.ok) return res.status(200).json({ ok: false, error: 'db ' + r.status });
      const recs = ((await r.json()).records) || [];
      let posted = 0, failed = 0, pending = 0;
      for (const rec of recs) {
        const s = String((rec.fields && rec.fields.Status) || '').toLowerCase();
        if (s === 'posted') posted++; else if (s === 'failed') failed++; else if (s === 'approved') pending++;
      }
      return res.status(200).json({ date: today, expected: 6, total: recs.length, posted, failed, pending, ok: failed === 0 && recs.length >= 6 });
    } catch (e) { return res.status(200).json({ ok: false, error: 'fetch failed' }); }
  }

  // ── POST. Create new client (admin OR invite-code onboarding) ────────────
  if (req.method === 'POST') {
    // Only bites on cookie-authenticated calls; public invite-code onboarding
    // carries no session and is therefore exempt (see api/_session.js).
    if (!_session.csrfOk(req)) return res.status(403).json({ error: 'Ongeldig of ontbrekend CSRF-token' });
    // Zie _session.safeBody(): req.body is een lazy getter die bij ongeldige
    // JSON gooit, en die worp gebeurde hier buiten elke try/catch. Resultaat
    // was een kale 400 zonder body, niet de {error:...} die de rest van de API
    // teruggeeft. safeBody vangt ook het string- en Buffer-geval af, wat deze
    // twee regels hiervoor al deden.
    const body = _session.safeBody(req);

    const ONBOARD_CODE = process.env.ONBOARD_CODE;
    const ADMIN_KEY    = process.env.ADMIN_KEY;

    // ── test-email (admin only) ─────────────────────────────────────────────
    // POST { mode: 'test-email', to?: 'address@x.com' }
    // Sends a tiny test through Resend and returns the FULL Resend response
    // (status + body) so you can see exactly why a send fails (e.g. Domain
    // not verified, invalid key, etc.) without digging through logs.
    /* ── AI-verbruik: waar gaat het geld heen ────────────────────────────
       Geen nieuwe route: Vercel Hobby staat 12 functies toe en die zitten vol.
       Dit hangt daarom aan admin.js, achter dezelfde admincontrole als de rest.

       Bewust ALLEEN voor Helvaro: dit toont het verbruik van ALLE tenants naast
       elkaar, en welke klant hoeveel AI verstookt is niets wat een andere klant
       hoort te zien. Een makelaar die zijn eigen verbruik wil, kijkt naar zijn
       credits -- dat is een ander getal met een ander doel (wat hij betaalt,
       niet wat het jou kost). */
    if (body.mode === 'ai-usage') {
      const tProvided = _session.readToken(req);
      if (!isValidAdminToken(tProvided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
      const _aiUsage = require('./_ai/usage');
      const _aiReg   = require('./_ai/registry');
      const alles = _aiUsage.alles();

      /* Het aandeel per tier is het getal waar dit hele bouwsel om draait:
         als "cheap" niet de grootste is, doet de routering niet wat hij moet. */
      const perTier = { cheap: 0, conversational: 0, reasoning: 0, vision: 0, image: 0, video: 0 };
      const TAAK_TIER = require('./_ai/tasks').ROUTING;
      for (const [taak, tel] of Object.entries(alles.totaal.byTask || {})) {
        const r = TAAK_TIER[taak];
        if (r && perTier[r.tier] !== undefined) perTier[r.tier] += tel.requests || 0;
      }
      const totaalReq = Object.values(perTier).reduce((a, b) => a + b, 0) || 1;
      const aandeel = {};
      for (const [k, v] of Object.entries(perTier)) aandeel[k] = +(v / totaalReq * 100).toFixed(1);

      return res.status(200).json({
        ok: true,
        // Sinds wanneer deze cijfers lopen: de tellers zitten in het geheugen
        // van deze instantie, dus een koude start begint opnieuw. Dat er bij
        // zetten voorkomt dat een laag getal voor "rustige dag" wordt aangezien.
        sinds: new Date(Date.now() - (Date.now() - (alles.totaal.since || Date.now()))).toISOString(),
        instantieStartte: new Date(alles.totaal.since || Date.now()).toISOString(),
        totaal: alles.totaal,
        perTenant: alles.perTenant,
        aandeelPerTier: aandeel,
        configuratie: {
          tiers: Object.fromEntries(Object.values(_aiReg.TIERS).map((t) => [t, _aiReg.keten(t)])),
          ontbreekt: Object.fromEntries(Object.values(_aiReg.TIERS).map((t) => [t, _aiReg.watOntbreekt(t)])),
        },
      });
    }

    if (body.mode === 'test-email') {
      const tProvided = _session.readToken(req);
      if (!isValidAdminToken(tProvided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
      const to = String(body.to || process.env.NOTIFY_EMAIL || '').trim();
      if (!to) return res.status(200).json({ ok: false, reason: 'No "to" address. Pass {"to":"..."} or set NOTIFY_EMAIL env var' });
      const { sendMail } = require('./_mailer');
      const result = await sendMail({
        to,
        subject: 'Helvaro mailtest — ' + new Date().toISOString().slice(0, 16),
        html:    '<p>Als je dit leest, werkt de e-mailbezorging van Helvaro.</p>'
      }).catch(err => ({ ok: false, error: err && err.message }));
      return res.status(200).json({
        ok:     result.ok,
        via:    result.via || null,        // 'smtp' of 'resend'
        error:  result.error || null,
        to,
        envSet: {
          SMTP_HOST:      !!process.env.SMTP_HOST,
          SMTP_USER:      !!process.env.SMTP_USER,
          SMTP_PASS:      !!process.env.SMTP_PASS,
          RESEND_API_KEY: !!process.env.RESEND_API_KEY,
          RESEND_FROM:    !!process.env.RESEND_FROM,
          NOTIFY_EMAIL:   !!process.env.NOTIFY_EMAIL
        }
      });
    }

    // ── presence-ping (any logged-in user) ──────────────────────────────────
    // Lightweight heartbeat: stores apiKey hash + clientName in module map.
    // Used by founder dashboard to show "online now" dots for each client.
    if (body.mode === 'presence-ping') {
      const ak = _session.readToken(req);
      if (!ak) return res.status(401).json({ error: 'apiKey required' });
      // "Any logged-in user" used to mean "any non-empty string" — the token
      // was never checked at all.
      //
      // What that could NOT do is worth stating, because it bounds the fix: the
      // map is keyed by a hash of the caller's own credential, and the founder
      // dashboard looks each client up by that client's real API key (see the
      // read at ~line 1605). So a stranger cannot light up someone else's dot
      // without already holding their key. The only reachable damage is filling
      // the map with junk.
      //
      // Two things are worth refusing anyway. A string shaped like one of our
      // session tokens but failing its signature is a forgery attempt, not a
      // stale client, and should never be treated as a login. And a malformed
      // token is never a real credential. Opaque Airtable API keys still pass
      // on shape alone: verifying those means an Airtable read on what is
      // deliberately a cheap heartbeat, and since an unverified key can only
      // ever key its own useless entry, that read buys nothing.
      const looksLikeSession = ak.startsWith('hvs1.');
      const validSession     = looksLikeSession && !!_session.verifySignedSession(ak);
      const wellFormedKey    = /^[A-Za-z0-9\-_]{8,100}$/.test(ak);
      if (!validSession && !wellFormedKey && !isValidAdminToken(ak, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige sessie' });
      }
      if (looksLikeSession && !validSession) {
        return res.status(401).json({ error: 'Sessie verlopen of ongeldig' });
      }
      const cn = String(body.clientName || '').trim().slice(0, 80);
      _presence.set(_presenceKey(ak), { ts: Date.now(), clientName: cn });
      if (_presence.size > 500) _gcPresence();
      return res.status(200).json({ ok: true });
    }

    // ── credit management (admin only) ───────────────────────────────────────
    // body: { mode: 'credit-set-allowance', projectCode, allowance }
    // body: { mode: 'credit-add-credits',   projectCode, credits }
    // body: { mode: 'credit-reset-period',  projectCode }
    // These are the ONLY credit-system entry points that can return a real
    // error to the caller — if the Credit Allowance/Credits Used/Credit
    // Period fields aren't on the Client Config schema yet, Airtable's PATCH
    // rejects the unknown field name and that bubbles up here as a clear
    // message (see CREDITS-VERCEL-SUMMARY.md for the exact fields to add).
    const CREDIT_ADMIN_MODES = ['credit-set-allowance', 'credit-add-credits', 'credit-reset-period'];
    if (CREDIT_ADMIN_MODES.includes(body.mode)) {
      const cProvided = _session.readToken(req);
      if (!isValidAdminToken(cProvided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
      const projectCode = String(body.projectCode || '').trim().toUpperCase();
      if (!projectCode) return res.status(400).json({ error: 'projectCode is verplicht' });
      try {
        if (body.mode === 'credit-set-allowance') {
          await credits.setAllowance(projectCode, body.allowance);
          return res.status(200).json({ ok: true });
        }
        if (body.mode === 'credit-add-credits') {
          await credits.addCredits(projectCode, body.credits);
          return res.status(200).json({ ok: true });
        }
        if (body.mode === 'credit-reset-period') {
          await credits.resetPeriod(projectCode);
          return res.status(200).json({ ok: true });
        }
      } catch (err) {
        console.error('[admin] credit management error:', err.message);
        return res.status(500).json({ error: err.message || 'Serverfout' });
      }
    }

    // ── plan/trial management (admin only) ────────────────────────────────
    // body: { mode: 'plan-extend-trial', projectCode, days? }   — pushes
    //   Trial Ends At forward by `days` (default 7) from NOW, and forces
    //   Plan Status back to 'trial' (covers extending a client who already
    //   flipped to 'expired'). See TRIAL-DESIGN.md §4 "Day 14-21 reactivation
    //   is one admin action".
    // body: { mode: 'plan-set-active', projectCode }            — converts
    //   to a paying client: Plan Status='active', Trial Ends At cleared.
    // body: { mode: 'plan-set-status', projectCode, status }    — sets Plan
    //   Status directly to any of trial/active/expired/cancelled/paused.
    //   Setting 'trial' this way does NOT touch Trial Ends At — use
    //   plan-extend-trial if you also want that (re)computed.
    // Same "can return a real error" contract as the credit-admin modes
    // above: if the Plan Status/Trial Ends At fields aren't on the schema
    // yet, Airtable's PATCH rejects the unknown field name and that bubbles
    // up here as a clear message rather than a silent no-op.
    const PLAN_ADMIN_MODES = ['plan-extend-trial', 'plan-set-active', 'plan-set-status'];
    if (PLAN_ADMIN_MODES.includes(body.mode)) {
      const pProvided = _session.readToken(req);
      if (!isValidAdminToken(pProvided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
      const projectCode = String(body.projectCode || '').trim().toUpperCase();
      if (!projectCode) return res.status(400).json({ error: 'projectCode is verplicht' });
      try {
        const formula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(projectCode)}"`);
        const cRes = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        const cData = await cRes.json();
        const rec = (cData.records || [])[0];
        if (!rec) return res.status(404).json({ error: `Geen klant gevonden met Project Code "${projectCode}"` });

        if (body.mode === 'plan-extend-trial') {
          const days = Math.max(1, Math.min(90, Math.round(Number(body.days) || 7)));
          // computeTrialEndsAt() (used at onboarding) is fixed at the
          // trial's canonical 14-day length — an extension isn't a fresh
          // 14-day trial, it's "N more days from now", so compute that
          // directly here instead.
          const extendedEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
          await _patchClientRecord(BASE_ID, AIRTABLE_TOKEN, rec.id, {
            [PLAN_FIELD.STATUS]:        'trial',
            [PLAN_FIELD.TRIAL_ENDS_AT]: extendedEndsAt,
          });
          return res.status(200).json({ ok: true, status: 'trial', trialEndsAt: extendedEndsAt });
        }
        if (body.mode === 'plan-set-active') {
          // null (not '') clears an Airtable dateTime field — same
          // clear-a-field convention used elsewhere in this codebase (e.g.
          // leads.js's Phone-clear on lead anonymization).
          await _patchClientRecord(BASE_ID, AIRTABLE_TOKEN, rec.id, {
            [PLAN_FIELD.STATUS]:        'active',
            [PLAN_FIELD.TRIAL_ENDS_AT]: null,
          });
          return res.status(200).json({ ok: true, status: 'active' });
        }
        if (body.mode === 'plan-set-status') {
          const status = String(body.status || '').trim().toLowerCase();
          if (!PLAN_STATUSES.has(status)) {
            return res.status(400).json({ error: `Ongeldige status. Gebruik een van: ${[...PLAN_STATUSES].join(', ')}` });
          }
          await _patchClientRecord(BASE_ID, AIRTABLE_TOKEN, rec.id, { [PLAN_FIELD.STATUS]: status });
          return res.status(200).json({ ok: true, status });
        }
      } catch (err) {
        console.error('[admin] plan management error:', err.message);
        return res.status(500).json({ error: err.message || 'Serverfout' });
      }
    }

    // ── founder modes: pipeline + goals + AI advice (admin only) ────────────
    const FOUNDER_MODES = ['pipeline-create','pipeline-update','pipeline-delete','goal-save','goal-delete','ai-advice','ai-chat','linkedin-post','content-post','personalized-dm'];
    if (FOUNDER_MODES.includes(body.mode)) {
      const fProvided = _session.readToken(req);
      if (!isValidAdminToken(fProvided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
      const MYSTARTUP_BASE = 'appjJW396QWRaNOVi';
      const PIPELINE_TABLE = 'tblihBS81FqGUZoY1';
      const GOALS_TABLE    = 'tblAFVa64xoHmp942';

      try {
        // ── pipeline-create ──────────────────────────────────────────────────
        if (body.mode === 'pipeline-create') {
          const naam     = String(body.naam     || '').trim().slice(0, 100);
          const bedrijf  = String(body.bedrijf  || '').trim().slice(0, 100);
          const email    = String(body.email    || '').trim().slice(0, 200);
          const fase     = String(body.fase     || 'Gecontacteerd').trim();
          const notities = String(body.notities || '').trim().slice(0, 2000);
          if (!naam) return res.status(400).json({ error: 'Naam is verplicht' });
          const r = await fetch(`https://api.airtable.com/v0/${MYSTARTUP_BASE}/${PIPELINE_TABLE}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: {
              'Naam': naam, 'Bedrijf': bedrijf, 'Email': email,
              'Fase': fase, 'Notities': notities,
              'Aangemaakt': new Date().toISOString().slice(0, 10)
            }})
          });
          const d = await r.json();
          if (!r.ok) return res.status(500).json({ error: d?.error?.message || 'Aanmaken mislukt' });
          return res.status(200).json({ id: d.id, success: true });
        }

        // ── pipeline-update ──────────────────────────────────────────────────
        if (body.mode === 'pipeline-update') {
          const recId = String(body.id || '').trim();
          if (!/^rec[A-Za-z0-9]{14}$/.test(recId)) return res.status(400).json({ error: 'Ongeldig record ID' });
          const fields = {};
          if (body.naam     !== undefined) fields['Naam']      = String(body.naam).trim().slice(0, 100);
          if (body.bedrijf  !== undefined) fields['Bedrijf']   = String(body.bedrijf).trim().slice(0, 100);
          if (body.email    !== undefined) fields['Email']     = String(body.email).trim().slice(0, 200);
          if (body.fase     !== undefined) fields['Fase']      = String(body.fase).trim();
          if (body.notities !== undefined) fields['Notities']  = String(body.notities).trim().slice(0, 2000);
          const r = await fetch(`https://api.airtable.com/v0/${MYSTARTUP_BASE}/${PIPELINE_TABLE}/${recId}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields })
          });
          const d = await r.json();
          if (!r.ok) return res.status(500).json({ error: d?.error?.message || 'Update mislukt' });
          return res.status(200).json({ success: true });
        }

        // ── pipeline-delete ──────────────────────────────────────────────────
        if (body.mode === 'pipeline-delete') {
          const recId = String(body.id || '').trim();
          if (!/^rec[A-Za-z0-9]{14}$/.test(recId)) return res.status(400).json({ error: 'Ongeldig record ID' });
          const r = await fetch(`https://api.airtable.com/v0/${MYSTARTUP_BASE}/${PIPELINE_TABLE}/${recId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
          });
          if (!r.ok) return res.status(500).json({ error: 'Verwijderen mislukt' });
          return res.status(200).json({ success: true });
        }

        // ── goal-save (create or update) ─────────────────────────────────────
        if (body.mode === 'goal-save') {
          const doel     = String(body.doel     || '').trim().slice(0, 200);
          const target   = Number(body.target)  || 0;
          const eenheid  = String(body.eenheid  || '').trim().slice(0, 50);
          const deadline = String(body.deadline || '').trim();
          const actief   = body.actief !== false;
          if (!doel) return res.status(400).json({ error: 'Doel is verplicht' });
          const fields = { 'Doel': doel, 'Target': target, 'Eenheid': eenheid, 'Actief': actief };
          if (deadline) fields['Deadline'] = deadline;
          const goalRecId = String(body.id || '').trim();
          if (goalRecId && !/^rec[A-Za-z0-9]{14}$/.test(goalRecId)) {
            return res.status(400).json({ error: 'Ongeldig record ID' });
          }
          let r, d;
          if (goalRecId) {
            r = await fetch(`https://api.airtable.com/v0/${MYSTARTUP_BASE}/${GOALS_TABLE}/${goalRecId}`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ fields })
            });
          } else {
            r = await fetch(`https://api.airtable.com/v0/${MYSTARTUP_BASE}/${GOALS_TABLE}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ fields })
            });
          }
          d = await r.json();
          if (!r.ok) return res.status(500).json({ error: d?.error?.message || 'Opslaan mislukt' });
          return res.status(200).json({ id: d.id, success: true });
        }

        // ── goal-delete ──────────────────────────────────────────────────────
        if (body.mode === 'goal-delete') {
          const recId = String(body.id || '').trim();
          if (!/^rec[A-Za-z0-9]{14}$/.test(recId)) return res.status(400).json({ error: 'Ongeldig record ID' });
          const r = await fetch(`https://api.airtable.com/v0/${MYSTARTUP_BASE}/${GOALS_TABLE}/${recId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
          });
          if (!r.ok) return res.status(500).json({ error: 'Verwijderen mislukt' });
          return res.status(200).json({ success: true });
        }

        // ── ai-advice ────────────────────────────────────────────────────────
        if (body.mode === 'ai-advice') {
          // Founder-internal tool, billed to the shared '_internal' pseudo
          // client — see credits.INTERNAL_PROJECT_CODE's doc comment.
          // Fails open by default (no Client Config row for '_internal'
          // exists unless Sindi creates one).
          const aiAdviceCheck = await credits.checkCredits(credits.INTERNAL_PROJECT_CODE, credits.FEATURES.FOUNDER_AI_ADVICE);
          if (!aiAdviceCheck.allowed) return res.status(402).json({ error: 'credit_limit_reached', message: aiAdviceCheck.message });
          const ctx = body.context || {};
          const prompt = [
            'Je bent een strategische startup-adviseur voor Helvaro, een Belgische AI-aangedreven leadkwalificatie SaaS.',
            '',
            'Huidige status:',
            '- Actieve klanten: ' + (ctx.clients || 0),
            '- Leads deze maand: ' + (ctx.leadsMonth || 0),
            '- Gekwalificeerd: ' + (ctx.qualified || 0) + '%',
            '- Nieuwe ongelezen leads: ' + (ctx.newLeads || 0),
            '',
            'Sales pipeline:',
            '- Gecontacteerd: ' + (ctx.pipeContacted || 0) + ' prospects',
            '- Geïnteresseerd: ' + (ctx.pipeInterested || 0) + ' prospects',
            '- Beslissing: ' + (ctx.pipeDecision || 0) + ' prospects',
            '- Gewonnen: ' + (ctx.pipeWon || 0),
            '',
            (ctx.goals && ctx.goals.length ? 'Doelen:\n' + ctx.goals.map(g => '- ' + g.doel + ': target ' + g.target + ' ' + g.eenheid + (g.deadline ? ' (deadline ' + g.deadline + ')' : '')).join('\n') : ''),
            '',
            'Geef de 3 meest impactvolle acties voor deze week. Wees concreet, kort en direct. Antwoord in het Nederlands.'
          ].filter(Boolean).join('\n');

          let advice;
          try {
            const uit = await _ai.generateText({
              task: _ai.TASKS.INTERNAL_ASSISTANT,
              ctx: { projectCode: credits.INTERNAL_PROJECT_CODE, userId: 'founder' },
              messages: [{ role: 'user', content: prompt }],
              maxTokens: 600,
            });
            advice = (uit.text || '').trim() || 'Geen advies beschikbaar.';
          } catch (err) {
            console.error('[admin] ai-advice:', err && err.code, err && err.message);
            return res.status(500).json({ error: 'AI fout: ' + (err && err.message || 'onbekend') });
          }
          credits.recordUsage(credits.INTERNAL_PROJECT_CODE, credits.FEATURES.FOUNDER_AI_ADVICE, {
            credits: credits.WEIGHTS[credits.FEATURES.FOUNDER_AI_ADVICE],
          }).catch(() => {});
          return res.status(200).json({ advice });
        }

        // ── ai-chat ────────────────────────────────────────────────────────────
        if (body.mode === 'ai-chat') {
          const aiChatCheck = await credits.checkCredits(credits.INTERNAL_PROJECT_CODE, credits.FEATURES.FOUNDER_AI_CHAT);
          if (!aiChatCheck.allowed) return res.status(402).json({ error: 'credit_limit_reached', message: aiChatCheck.message });
          const rawMsgs = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
          const validMessages = rawMsgs
            .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
          if (!validMessages.length) return res.status(400).json({ error: 'Geen berichten' });

          const systemPrompt = [
            'Je bent een concrete business coach voor Helvaro, een Belgische AI-startup.',
            '',
            'Helvaro context:',
            '- Product: AI qualificeert leads automatisch via WhatsApp en boekt serieuze prospects direct in een afspraak',
            '- Founders: Frade (technisch) + Teljo (marketing/sales)',
            '- Doel: 5 klanten met 3-maands contract voor 20 juni 2026 (35 dagen resterend)',
            '- Doelgroep: marketingbureaus, vastgoedkantoren, coaches in Gent/Antwerpen',
            '- Prospects: CNIP, Ants Agency, VICUS Vastgoed, Opex Consulting, Bureau 9000, Concordia, Nouchka Design, SilverLine Studio, Magelaan',
            '- Prijs: €1.000/maand · alles inbegrepen · 14 dagen trial voor €1',
            '',
            'Geef altijd concrete, korte antwoorden in het Nederlands. Max 3 paragrafen. Doe aan actie, niet theorie.'
          ].join('\n');

          let reply;
          try {
            const uit = await _ai.converse({
              task: _ai.TASKS.INTERNAL_ASSISTANT,
              ctx: { projectCode: credits.INTERNAL_PROJECT_CODE, userId: 'founder' },
              system: systemPrompt,
              messages: validMessages,
              maxTokens: 500,
            });
            reply = (uit.text || '').trim() || 'Geen antwoord beschikbaar.';
          } catch (err) {
            console.error('[admin] ai-chat:', err && err.code, err && err.message);
            return res.status(500).json({ error: 'AI fout: ' + (err && err.message || 'onbekend') });
          }
          credits.recordUsage(credits.INTERNAL_PROJECT_CODE, credits.FEATURES.FOUNDER_AI_CHAT, {
            credits: credits.WEIGHTS[credits.FEATURES.FOUNDER_AI_CHAT],
          }).catch(() => {});
          return res.status(200).json({ reply });
        }

        // ── content-post (linkedin + instagram, all types) ─────────────────────
        if (body.mode === 'linkedin-post' || body.mode === 'content-post') {
          const contentPostCheck = await credits.checkCredits(credits.INTERNAL_PROJECT_CODE, credits.FEATURES.FOUNDER_CONTENT_POST);
          if (!contentPostCheck.allowed) return res.status(402).json({ error: 'credit_limit_reached', message: contentPostCheck.message });

          const platform   = String(body.platform   || 'linkedin');
          const contentType = String(body.contentType || 'pijnpunt');
          const day = new Date().getDay();
          // Day-sector rotation, aligned with the actual target sectors on
          // helvaro.pro (insurance, real estate, recruitment, B2B SaaS,
          // coaching, automotive).
          const daySectors = {
            1: 'verzekeringskantoren en independent makelaars',
            2: 'vastgoedkantoren en immo-makelaars',
            3: 'recruitment- en wervingsbureaus',
            4: 'B2B SaaS bedrijven met inkomende demo-aanvragen',
            5: 'business coaches en consultants',
            6: 'autoverkopers en automotive bedrijven',
            0: 'ondernemers die groeien via leadgeneratie'
          };
          const sector = String(body.sector || daySectors[day] || 'B2B bedrijven met veel inkomende leads');

          // Helvaro brand facts. Concrete, no fluff, NO PRICING.
          // Pricing on social posts attracts the wrong buyer and weakens the
          // pain hook. Sell on outcome (deals saved), not on a tag.
          // Source for the product facts: helvaro.pro
          const brandFacts = [
            'Helvaro: Belgische AI startup. Co-founders: Frade (tech) en Teljo (sales).',
            '',
            'Wat het doet (helvaro.pro):',
            '  > AI-gestuurde sales follow-up via WhatsApp voor salesteams.',
            '  > Kwalificeert leads automatisch (warm vs koud) en boekt afspraken zonder menselijke tussenkomst.',
            '  > Integreert met elk bestaand CRM-systeem.',
            '  > Real-time dashboard en wekelijkse e-mailrapporten met de cijfers die ertoe doen.',
            '  > Aanpasbare workflows per klant.',
            '',
            'Cijfers die kloppen:',
            '  > Reactie binnen 30 seconden, 24/7.',
            '  > Klanten besparen gemiddeld 20+ uur per week op manuele opvolging.',
            '  > SLA: response binnen 4 uur gegarandeerd.',
            '  > Implementatie binnen 72 uur, niet maanden.',
            '',
            'Doelsectoren: verzekeringen, recruitment, automotive, B2B SaaS, vastgoed, coaching.',
            '',
            'De pijn die we oplossen, dit moet centraal staan in de post:',
            '  > Leads die binnenkomen en in een onbeantwoorde inbox verdwijnen. Te laat opgevolgd is hetzelfde als nooit opgevolgd.',
            '  > Sales spendeert dagen aan manuele follow-up via telefoon en mail. De echte gesprekken die opbrengen worden gemist.',
            '  > 95% van de leads is koud. Tijd verspild aan rommel terwijl warme leads afkoelen.',
            '  > Aanvragen \'s avonds, in het weekend, tijdens vakanties. Niemand reageert. Concurrent wel.',
            '  > Geen zicht op welke prospects warm zijn. Geen rapportage, geen scoring, gewoon hopen.',
            '  > Extra salesmensen aannemen om dat op te lossen kost handenvol geld en lost het niet op.',
            '',
            'Concrete gemiste-deal scenarios om uit te putten:',
            '  > Vrijdag 22u, lead voor een woning van 280k komt binnen. Niemand belt. Maandag is hij elders aan het tekenen.',
            '  > Recruiter krijgt 14 sollicitanten op een vacature. Tegen dat hij ze opbelt zijn de 3 sterke profielen al ergens anders in gesprek.',
            '  > Verzekeringsmakelaar mist een aanvraag voor een hospitalisatieverzekering omdat het mailtje in spam belandde. Klant tekent online bij de eerste die wel reageerde.',
            '  > Weekend: 12 demo-aanvragen op de B2B SaaS website. Maandag 9u: 3 zijn al in trial bij de concurrent.',
            '  > Eén gemiste deal betaalt het Helvaro-budget van een heel jaar. Eén.',
            '',
            'NOOIT vermelden in een post: prijs, bedrag, euro per maand, "vanaf X". Geld hoort thuis in een DM, niet in een post.'
          ].join('\n');

          // Type-specific angle. Every angle leans on a missed-deal moment.
          const typeAngles = {
            pijnpunt:    'Vertel concreet over een gemiste deal. Een echte situatie: tijdstip, klant, sector, bedrag. Niet abstract. "Vrijdag 21:47, een vastgoedlead voor een appartement van 280k. Niemand belde. Maandag was hij al ergens anders aan het tekenen." Maak de lezer zenuwachtig over hoeveel van die deals door ZIJN handen glippen.',
            feature:     'Toon hoe de WhatsApp AI in de praktijk werkt zonder dat een lead ooit door de mazen valt. Lead vult formulier in, 30 seconden later krijgt hij WhatsApp, AI stelt 4 kwalificatievragen, warme afspraak boekt zichzelf. Stap voor stap, in concrete tijdstippen.',
            resultaat:   'Eén concrete, herkenbare uitkomst: nooit meer een lead missen buiten kantooruren, zelfs niet om 23u op zondag. Gebruik een voor/na of een specifiek getal van een klant. Verwijs naar de pijn die WEG is, niet naar features.',
            vergelijking:'Klassieke aanpak versus Helvaro. Geen buzzwords, eerlijk de cijfers naast elkaar leggen: leads per maand binnen, reactiesnelheid, conversie, gemiste deals, uren per week verloren. Verlies van deals is de cruciale rij.',
            founder:     'Schrijf als Teljo. 20-iets, Gent. Je zag bedrijven keer op keer dezelfde fout maken: leads kwamen binnen en niemand belde op tijd. Je was die persoon zelf ook. Frade bouwt de tech, jij verkoopt het. Eerlijk, licht kwetsbaar, geen hype, geen prijslijst.',
            update:      'Kort kijkje achter de schermen: wat er deze week is gebouwd, geleerd of mislukt bij Helvaro. Eerlijke startup update. Geen persbericht.'
          };
          const typeAngle = typeAngles[contentType] || typeAngles.pijnpunt;

          // SYSTEM: persona + strict format rules
          const liSystemPrompt = [
            'Je bent Teljo, 22 jaar, co-founder van Helvaro in Gent. Je schrijft LinkedIn posts zoals een echte ondernemer. Direct, concreet, geen AI-taal.',
            '',
            'ABSOLUTE VERBODEN. Gebruik deze NOOIT:',
            'Woorden: "In de snel veranderende wereld", "Excited to announce", "Trots om te delen", "Game-changer", "Revolutionair", "Naadloos", "Robuust", "Innovatief", "Leverage", "In het digitale tijdperk", "Als we eerlijk zijn" als opener, "The future of", "Disruptief".',
            'Leestekens: GEEN em-dashes (—), GEEN en-dashes (–), GEEN gewone "-" dashes als zinsverbinder. Gebruik in plaats daarvan een komma, een punt, of een nieuwe lijn. Dashes maken een post AI-achtig.',
            'Prijzen: NOOIT een prijs, bedrag, "vanaf X euro", "€X/maand", maandelijkse kost, of welk getal dan ook gevolgd door €. Geen pricing in posts. Punt.',
            'Geen opsomming van 5+ punten achter elkaar. Geen alinea\'s langer dan 2 zinnen.',
            '',
            'CONTENT-EIS. DE POST MOET PIJN VOELBAAR MAKEN:',
            'Werk altijd met een concreet voorbeeld van een GEMISTE DEAL. Tijdstip, sector, bedrag van de deal, wat er fout ging. De lezer moet denken: "shit, dat gebeurt bij mij ook." Vermijd algemeenheden.',
            '',
            'VERPLICHT FORMAT voor LinkedIn:',
            'Lijn 1: de haak. Max 10 woorden. Dit is alles wat mensen zien voor "...meer weergeven". Maak het raak: een statement, een getal, een vraag die doet nadenken.',
            '[lege lijn]',
            'Dan: 4-6 blokken van max 2 zinnen, telkens gescheiden door een lege lijn.',
            'Gebruik > voor lijsten (max 3-4 items). Nooit • en nooit ─.',
            'Eindig met 1 concrete vraag OF een zachte CTA (DM sturen, reageer hieronder).',
            '[lege lijn]',
            'Max 3 hashtags. Punt.',
            '',
            'Schrijf alleen de post. Geen uitleg, geen "Hier is je post:".'
          ].join('\n');

          const igSystemPrompt = [
            'Je bent Teljo, co-founder van Helvaro. Je schrijft Instagram captions die klinken als een echte jonge Belgische ondernemer. Niet als een social media manager.',
            '',
            'ABSOLUTE VERBODEN:',
            'Corporate taal. Emoji-spam (max 5 totaal). Lange alinea\'s. AI-zinnen.',
            'GEEN dashes: geen em-dash (—), geen en-dash (–), geen "-" als zinsverbinder. Vervang door komma, punt of nieuwe lijn.',
            'GEEN prijzen, bedragen, "€X/maand" of welke kost dan ook. Pricing hoort niet in een post.',
            '',
            'CONTENT-EIS: maak de pijn van een gemiste deal voelbaar in concrete termen. Tijdstip, sector, bedrag van de deal die verdween. Niet abstract.',
            '',
            'FORMAT:',
            'Lijn 1: hook met 1 emoji (max 10 woorden, wat mensen zien voor "...meer")',
            '[lege lijn]',
            '2-3 korte blokken (telkens max 2 zinnen, lege lijn ertussen)',
            '3 voordelen als lijst: elk met emoji en max 7 woorden',
            '1 CTA-zin',
            '[lege lijn]',
            '12-15 hashtags (mix niche + breed)',
            '[lege lijn]',
            'Visuele tip: 1 zin wat voor beeld/reel erbij past',
            '',
            'Schrijf alleen de caption. Geen uitleg.'
          ].join('\n');

          let contentPrompt, systemPrompt;
          if (platform === 'instagram') {
            systemPrompt = igSystemPrompt;
            contentPrompt = [
              'Schrijf een Instagram caption voor Helvaro.',
              'Doelgroep: ' + sector + '.',
              'Invalshoek: ' + typeAngle,
              '',
              'Brand feiten die je MAG gebruiken (niet verplicht allemaal):',
              brandFacts
            ].join('\n');
          } else {
            systemPrompt = liSystemPrompt;
            contentPrompt = [
              'Schrijf een LinkedIn post voor Helvaro.',
              'Doelgroep: ' + sector + '.',
              'Invalshoek: ' + typeAngle,
              '',
              'Brand feiten die je MAG gebruiken als het past (niet allemaal verplicht):',
              brandFacts
            ].join('\n');
          }

          let post;
          try {
            const uit = await _ai.generateText({
              task: _ai.TASKS.MARKETING_COPY,
              ctx: { projectCode: credits.INTERNAL_PROJECT_CODE, userId: 'founder' },
              system: systemPrompt,
              messages: [{ role: 'user', content: contentPrompt }],
              maxTokens: 600,
            });
            post = uit.text || '';
          } catch (err) {
            console.error('[admin] content-post:', err && err.code, err && err.message);
            return res.status(500).json({ error: 'AI fout: ' + (err && err.message || 'onbekend') });
          }
          post = scrubPost(post);
          credits.recordUsage(credits.INTERNAL_PROJECT_CODE, credits.FEATURES.FOUNDER_CONTENT_POST, {
            credits: credits.WEIGHTS[credits.FEATURES.FOUNDER_CONTENT_POST],
          }).catch(() => {});
          return res.status(200).json({ post });
        }

        // ── personalized-dm ────────────────────────────────────────────────────
        if (body.mode === 'personalized-dm') {
          const dmCheck = await credits.checkCredits(credits.INTERNAL_PROJECT_CODE, credits.FEATURES.FOUNDER_PERSONALIZED_DM);
          if (!dmCheck.allowed) return res.status(402).json({ error: 'credit_limit_reached', message: dmCheck.message });
          const bedrijf  = String(body.bedrijf  || '').trim().slice(0, 100);
          const sector   = String(body.sector   || '').trim().slice(0, 100);
          const fase     = String(body.fase     || 'Gecontacteerd').trim();
          const platform = String(body.platform || 'linkedin');
          const notities = String(body.notities || '').trim().slice(0, 400);
          const dagen    = Number(body.dagen    || 0);
          if (!bedrijf) return res.status(400).json({ error: 'Bedrijfsnaam verplicht' });

          const phaseCtx = {
            'Gecontacteerd':  'Dit is de eerste outreach. Wek nieuwsgierigheid zonder te pushen.',
            'Geinteresseerd': 'Ze hebben interesse getoond. Leid naar een demo of gesprek.',
            'Geïnteresseerd': 'Ze hebben interesse getoond. Leid naar een demo of gesprek.',
            'Beslissing':     'Ze overwegen het actief. Neem de laatste twijfel weg en sluit af.'
          };
          const dayNote = dagen > 0 ? ' Ze zijn al ' + dagen + ' dag(en) in deze fase zonder update.' : '';

          const emailPrompt = [
            'Schrijf een cold email voor Helvaro aan ' + bedrijf + (sector ? ' (' + sector + ')' : '') + '.',
            'Fase: ' + fase + '. ' + (phaseCtx[fase] || '') + dayNote,
            (notities ? 'Extra info: ' + notities : ''),
            '',
            'Helvaro = Belgische AI: volgt leads op via WhatsApp binnen 30 sec, 24/7. Alleen warme afspraken in de agenda. Installatie 30 min.',
            '',
            'Schrijf EXACT in dit format:',
            'Onderwerp: [max 8 woorden]',
            '',
            '[body. Max 110 woorden, persoonlijk, 1 CTA, Nederlands]'
          ].filter(Boolean).join('\n');

          const linkedinPrompt = [
            'Schrijf een LinkedIn DM voor Helvaro aan ' + bedrijf + (sector ? ' (' + sector + ')' : '') + '.',
            'Fase: ' + fase + '. ' + (phaseCtx[fase] || '') + dayNote,
            (notities ? 'Extra info: ' + notities : ''),
            '',
            'Helvaro = Belgische AI: volgt leads op via WhatsApp binnen 30 sec, 24/7. Alleen warme afspraken in de agenda.',
            '',
            'Eisen: max 5 zinnen, noem ' + bedrijf + ' bij naam, geen sales-pitch gevoel, eindig met 1 simpele vraag, Nederlands.'
          ].filter(Boolean).join('\n');

          const dmPrompt = platform === 'email' ? emailPrompt : linkedinPrompt;
          let dmTekst;
          try {
            const uit = await _ai.generateText({
              task: _ai.TASKS.MARKETING_COPY,
              ctx: { projectCode: credits.INTERNAL_PROJECT_CODE, userId: 'founder' },
              messages: [{ role: 'user', content: dmPrompt }],
              maxTokens: 350,
            });
            dmTekst = uit.text || '';
          } catch (err) {
            console.error('[admin] personalized-dm:', err && err.code, err && err.message);
            return res.status(500).json({ error: 'AI fout: ' + (err && err.message || 'onbekend') });
          }
          credits.recordUsage(credits.INTERNAL_PROJECT_CODE, credits.FEATURES.FOUNDER_PERSONALIZED_DM, {
            credits: credits.WEIGHTS[credits.FEATURES.FOUNDER_PERSONALIZED_DM],
          }).catch(() => {});
          return res.status(200).json({ message: dmTekst });
        }

      } catch (err) {
        console.error('[admin] founder POST error:', err.message);
        return res.status(500).json({ error: 'Serverfout' });
      }
    }

    // ── mode=generate-content: AI genereert week aan social posts ───────────
    // body: { mode: 'generate-content', startDate?: 'YYYY-MM-DD', days?: 7 }
    // Default: 7 dagen vanaf morgen, 3 posts per dag (LinkedIn, Instagram, Facebook).
    // Schrijft alles als status=draft naar Marketing Posts tabel. Klant approved
    // daarna manueel via dashboard of Airtable.
    if (body.mode === 'generate-content') {
      const provided = _session.readToken(req);
      if (!isValidAdminToken(provided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
      // This batch-generates up to days*6 posts (each = 1 Anthropic call via
      // generateOnePost). Gate the WHOLE batch up front (cheap, avoids a
      // half-generated week if '_internal' is ever capped) rather than
      // per-post — see credits.INTERNAL_PROJECT_CODE's doc comment for why
      // this fails open by default.
      const genContentCheck = await credits.checkCredits(credits.INTERNAL_PROJECT_CODE, credits.FEATURES.FOUNDER_CONTENT_POST);
      if (!genContentCheck.allowed) return res.status(402).json({ error: 'credit_limit_reached', message: genContentCheck.message });
      const days = Math.min(14, Math.max(1, parseInt(body.days || 7, 10)));
      const startDate = body.startDate ? new Date(body.startDate) : new Date(Date.now() + 24*60*60*1000);
      const result = await generateContentWeek(AIRTABLE_TOKEN, BASE_ID, days, startDate);
      // Bill for exactly the posts actually created (each = 1 successful
      // Anthropic call), not a fixed guess.
      if (result && result.created > 0) {
        credits.recordUsage(credits.INTERNAL_PROJECT_CODE, credits.FEATURES.FOUNDER_CONTENT_POST, {
          credits: credits.WEIGHTS[credits.FEATURES.FOUNDER_CONTENT_POST] * result.created,
          meta: { batch: true, created: result.created },
        }).catch(() => {});
      }
      return res.status(200).json(result);
    }

    // ── mode=list-content: haal de drafts/approved/posted op ────────────────
    // body: { mode: 'list-content', status?: 'draft'|'approved'|'posted', limit?: 50 }
    if (body.mode === 'list-content') {
      const provided = _session.readToken(req);
      if (!isValidAdminToken(provided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
      if (pgWeg(res)) return;
      const status = String(body.status || '').trim();
      // Same whitelist as the sibling update-content mode below.
      if (status && !['draft','approved','posted','failed','skipped'].includes(status)) {
        return res.status(400).json({ error: 'Ongeldige status' });
      }
      const limit  = Math.min(100, Math.max(1, parseInt(body.limit || 50, 10)));
      const formula = status ? encodeURIComponent(`{Status}="${escapeFormula(status)}"`) : '';
      const url = `tblPxnfb5MThgsnaA?pageSize=${limit}${formula ? `&filterByFormula=${formula}` : ''}&sort%5B0%5D%5Bfield%5D=Scheduled%20For&sort%5B0%5D%5Bdirection%5D=asc`;
      const r = await pgFetch(url);
      const d = await r.json();
      return res.status(200).json({ posts: d.records || [] });
    }

    // ── mode=update-content: approve/edit/skip een specifieke post ──────────
    // body: { mode: 'update-content', id: 'rec...', status?, content?, scheduledFor? }
    if (body.mode === 'update-content') {
      const provided = _session.readToken(req);
      if (!isValidAdminToken(provided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
      if (pgWeg(res)) return;
      const id = String(body.id || '').trim();
      if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return res.status(400).json({ error: 'Ongeldig record ID' });
      const fields = {};
      if (body.status !== undefined && ['draft','approved','posted','failed','skipped'].includes(body.status)) {
        fields.Status = body.status;
      }
      if (body.content !== undefined)      fields.Content      = String(body.content).slice(0, 3000);
      if (body.scheduledFor !== undefined) fields['Scheduled For'] = body.scheduledFor;
      if (body.imageUrl !== undefined)     fields['Image URL'] = String(body.imageUrl).slice(0, 500);
      if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'Niets om bij te werken' });
      const r = await pgFetch(
        `tblPxnfb5MThgsnaA/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ fields })
        }
      );
      const d = await r.json();
      if (!r.ok) return res.status(500).json({ error: d.error?.message || 'Update failed' });
      return res.status(200).json({ ok: true, record: d });
    }

    // ── mode=generate-image: genereer 1 afbeelding voor 1 post (per record) ──
    // body: { mode: 'generate-image', id: 'rec...' }
    // Apart per post zodat we nooit de 60s functie-timeout raken.
    if (body.mode === 'generate-image') {
      const provided = _session.readToken(req);
      if (!isValidAdminToken(provided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
      if (pgWeg(res)) return;
      const id = String(body.id || '').trim();
      if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return res.status(400).json({ error: 'Ongeldig record ID' });
      // Haal de post op
      const gr = await pgFetch(`tblPxnfb5MThgsnaA/${id}`);
      const grec = await gr.json();
      if (!gr.ok) return res.status(404).json({ error: 'Post niet gevonden' });
      const f = grec.fields || {};
      const platform = String(f.Platform || '').toLowerCase();
      if (platform === 'linkedin') return res.status(200).json({ ok: true, skipped: true, reason: 'LinkedIn = tekst-only' });
      const rawPrompt = String(f['Image Prompt'] || '').trim();
      let imageUrl = '';
      let spec = null;
      try { const p = JSON.parse(rawPrompt); if (p && (p.card || p.carousel)) spec = p; } catch {}

      // Carousel (Instagram, meerdere slides): render alle slides, upload elk,
      // bewaar de URLs newline-gescheiden in Image URL.
      if (spec && spec.carousel) {
        try {
          const { renderCarousel } = require('./_lib/card');
          const bufs = await renderCarousel({ cover: spec.cover, slides: spec.slides || [], cta: spec.cta });
          const urls = [];
          for (const b of bufs) { const u = await uploadToBlob(b, 'image/jpeg', platform).catch(() => ''); if (u) urls.push(u); }
          if (urls.length) imageUrl = urls.join('\n');
        } catch (e) { console.error('[carousel] render failed:', e.message); }
      }

      // Enkele branded tekst-card (standaard voor IG/FB, geen foto's/mensen).
      let cardSpec = (spec && spec.card) ? spec : null;
      if (!imageUrl && !cardSpec && (platform === 'instagram' || platform === 'facebook')) {
        const head = String(f.Content || '').split(/[.\n]/)[0].trim().slice(0, 70) || 'Je klant wacht niet. *Jij ook niet.*';
        cardSpec = { card: true, headline: head, bullets: [], tagline: 'Mis nooit meer een *klant.*' };
      }
      if (!imageUrl && cardSpec) {
        try {
          const { renderCard } = require('./_lib/card');
          const buf = await renderCard({ headline: cardSpec.headline, bullets: cardSpec.bullets || [], tagline: cardSpec.tagline });
          imageUrl = await uploadToBlob(buf, 'image/jpeg', platform).catch(() => '');
        } catch (e) { console.error('[card] render failed:', e.message); }
      }
      // Laatste redmiddel (alleen als renderen faalt): geen slop, wel een beeld.
      // Only THIS branch has a real external AI-image cost (renderCard/
      // renderCarousel above are local, free) — gate/bill only here, not the
      // whole mode, so the common (free) card-render path is never charged.
      if (!imageUrl) {
        const genImgCheck = await credits.checkCredits(credits.INTERNAL_PROJECT_CODE, credits.FEATURES.FOUNDER_GENERATE_IMAGE);
        if (!genImgCheck.allowed) return res.status(402).json({ error: 'credit_limit_reached', message: genImgCheck.message });
        const fb = spec ? `abstract dark blue tech background, glowing gradient, no people, no text` : (rawPrompt || `abstract dark blue tech background, no text`);
        imageUrl = await generateAIImage(fb, platform).catch(() => '');
        if (imageUrl) {
          credits.recordUsage(credits.INTERNAL_PROJECT_CODE, credits.FEATURES.FOUNDER_GENERATE_IMAGE, {
            credits: credits.WEIGHTS[credits.FEATURES.FOUNDER_GENERATE_IMAGE],
          }).catch(() => {});
        }
      }
      if (!imageUrl) return res.status(502).json({ error: 'Beeldgeneratie mislukt (zie logs)' });
      const pr = await pgFetch(`tblPxnfb5MThgsnaA/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { 'Image URL': imageUrl } })
      });
      if (!pr.ok) { const pd = await pr.json().catch(() => ({})); return res.status(500).json({ error: pd.error?.message || 'Opslaan mislukt' }); }
      return res.status(200).json({ ok: true, imageUrl });
    }

    // ── mode=invite-link: admin (authenticated) fetches the ready-made
    // invite link on demand. The dashboard used to embed ONBOARD_CODE
    // directly into the rendered page HTML (window.__hOnboard) so the
    // "invite new client" panel could build this same link client-side —
    // but GET /dashboard has no server-side auth check, so that secret was
    // readable by anyone who loaded the page, authenticated or not, making
    // it the only real gate on self-serve signup while PUBLIC_SIGNUP_ENABLED
    // is off. This endpoint returns just the finished link behind the same
    // x-api-key admin check every other admin mode uses below; the browser
    // never sees the raw code. ────────────────────────────────────────────
    if (body.mode === 'invite-link') {
      const provided = _session.readToken(req);
      if (!isValidAdminToken(provided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
      if (!ONBOARD_CODE) return res.status(200).json({ inviteLink: null });
      const inviteLink = `https://app.helvaro.pro/onboard?invite=${encodeURIComponent(ONBOARD_CODE)}`;
      return res.status(200).json({ inviteLink });
    }

    // ── mode=invite: admin sends an invite email to a client ─────────────────
    if (body.mode === 'invite') {
      const provided = _session.readToken(req);
      if (!isValidAdminToken(provided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
      if (!ONBOARD_CODE) {
        return res.status(500).json({ error: 'ONBOARD_CODE niet ingesteld op Vercel' });
      }
      const toEmail = String(body.email || '').trim().slice(0, 200);
      const toName  = String(body.name  || '').trim().slice(0, 100);
      if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
        return res.status(400).json({ error: 'Geldig e-mailadres is verplicht' });
      }
      const inviteLink = `https://app.helvaro.pro/onboard?invite=${encodeURIComponent(ONBOARD_CODE)}`;
      const inviteResult = await sendInviteEmail({ toEmail, toName, inviteLink });
      if (!inviteResult || !inviteResult.ok) {
        return res.status(502).json({ error: 'E-mail versturen mislukt (' + ((inviteResult && inviteResult.error) || 'onbekend') + '). Gebruik de handmatige link hieronder.' });
      }
      return res.status(200).json({ success: true, via: inviteResult.via });
    }

    // ── mode=onboard: client self-registration via invite code (default) OR
    // public self-serve signup (opt-in via PUBLIC_SIGNUP_ENABLED). ────────────
    //
    // PUBLIC_SIGNUP_ENABLED defaults to unset/false — i.e. CLOSED. With it
    // unset, this block behaves byte-for-byte like before this change: a
    // valid ONBOARD_CODE is the only way in, and none of the fraud-guard
    // code below ever runs. Sindi flips this env var on Vercel only when
    // she's ready to accept signups without an invite link — see
    // api/_signup-guard.js's file header for the full design and the two
    // hard rules it must never violate (never auto-reject; "no website"
    // alone is never enough to flag).
    const PUBLIC_SIGNUP_ENABLED = /^true$/i.test(String(process.env.PUBLIC_SIGNUP_ENABLED || '').trim());
    const isOnboard = body.mode === 'onboard';
    let signupGuardResult = null; // only ever set for a public, non-invite signup — see below
    if (isOnboard) {
      const provided = String(body.inviteCode || '').trim();
      const validInvite = !!ONBOARD_CODE && safeEqual(provided, ONBOARD_CODE);
      if (!validInvite) {
        if (!PUBLIC_SIGNUP_ENABLED) {
          // Exact pre-existing behavior: no valid invite code = hard reject.
          return res.status(401).json({ error: 'Ongeldige uitnodigingscode' });
        }
        // Public signup is enabled and this request has no valid invite —
        // this IS the risky path public signup opens up. First a real
        // structural throttle (separate, tighter than the endpoint-wide
        // isRateLimited() above — see _signup-guard.js's RATE_LIMIT doc
        // comment for why this one is allowed to actually reject a
        // request). Then the fraud-prevention guard, which by contract
        // NEVER rejects on its own — it only computes a trust score and an
        // accept/flag verdict; Sindi turns a flag into an actual
        // rejection/cancellation later via the existing plan-set-status
        // admin action.
        const signupGuard = require('./_signup-guard');
        const rl = signupGuard.checkSignupRateLimit(ip);
        if (rl.limited) {
          return res.status(429).json({ error: 'Te veel aanmeldingen vanaf dit IP-adres. Probeer het later opnieuw.' });
        }
        signupGuardResult = await signupGuard.evaluateSignup({
          email:             String(body.email || '').trim(),
          companyName:       String(body.clientName || '').trim(),
          phone:             String(body.phone || '').trim(),
          website:           String(body.website || '').trim(),
          ip,
          deviceFingerprint: String(body.deviceFingerprint || '').trim().slice(0, 128),
          airtableToken:     AIRTABLE_TOKEN,
          baseId:            BASE_ID,
        }).catch(err => {
          console.warn('[admin] signup-guard evaluate failed, failing OPEN (treated as accept):', err.message);
          return { score: null, decision: 'accept', reasons: ['Fraud-guard evaluatie mislukt — fail-open.'], signals: null };
        });
      }
    } else {
      // Regular admin path
      const provided = _session.readToken(req);
      if (!isValidAdminToken(provided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
    }

    const clientName     = String(body.clientName     || '').trim().slice(0, 100);
    const projectCode    = String(body.projectCode    || '').trim().toUpperCase().slice(0, 50);
    const email          = String(body.email          || '').trim().slice(0, 200);
    const calendlyLink   = String(body.calendlyLink   || '').trim().slice(0, 500);
    // Extended onboarding fields (all optional. Graceful fallback if not provided)
    const aiName         = String(body.aiName         || '').trim().slice(0, 60);
    const autoReplyTpl   = String(body.autoReplyTpl   || '').trim().slice(0, 1000);
    const website        = String(body.website        || '').trim().slice(0, 500);
    const address        = String(body.address        || '').trim().slice(0, 300);
    // Tone-of-voice instructions from wizard step 2. Capped shorter than the
    // field's overall 3000-char budget because step 4's business-context
    // free text (below) is folded into the SAME field.
    const aiToneInstructions = String(body.aiInstructions || '').trim().slice(0, 600);
    const sector         = String(body.sector         || '').trim().slice(0, 100);
    const phone          = String(body.phone          || '').trim().slice(0, 50);

    // ── Wizard step "Vertel de AI over je bedrijf" — free-text business
    // context. See composeAiInstructions() for why this lands in AI
    // Instructions (fld1lqHctRbqFGQf5) rather than AI Learned Patterns.
    const bizServices = String(body.bizServices  || '').trim().slice(0, 600);
    const bizFaqs      = String(body.bizFaqs      || '').trim().slice(0, 600);
    const bizDifferent = String(body.bizDifferent || '').trim().slice(0, 400);
    const bizNeverSay  = String(body.bizNeverSay  || '').trim().slice(0, 400);
    const aiInstructions = composeAiInstructions(aiToneInstructions, { bizServices, bizFaqs, bizDifferent, bizNeverSay });

    // ── Wizard step "Hoe je werkt" — mirrors the exact validation used by
    // leads.js's config-save (PATCH) path so onboarding and later dashboard
    // edits behave identically.
    const language = _lang.normalizeLanguageCode(body.language);
    const workingHours = (() => {
      const v = String(body.workingHours || '').trim().toLowerCase().slice(0, 60);
      // NOTE: leads.js's config-save uses {3,9} for the day-abbreviation
      // length, but the wizard's own Dutch default/example is 'ma-vr 9-18'
      // (2-letter days) — and whatsapp.js's isWithinWorkingHours() parser
      // (the actual runtime consumer) accepts 2-letter Dutch/French day
      // codes via its dayAliases map (ma/di/wo/do/vr/za/zo, lun/mar/...).
      // Using {3,9} here would silently reject the wizard's own suggested
      // chips for NL clients. Widened to {2,9} to match what actually parses
      // correctly at runtime. (leads.js itself is out of scope for this change.)
      return (v === '' || /^[a-z]{2,9}\s*[-–]\s*[a-z]{2,9}\s+\d{1,2}(?::\d{2})?\s*[-–]\s*\d{1,2}(?::\d{2})?$/.test(v)) ? v : '';
    })();
    // Booking Method is in_chat | callback in the LIVE product ('calendly' is
    // deprecated — see dashboard.js's ap-calendly hidden-field comment. The
    // wizard only ever offers these two).
    const bookingMethod = (() => {
      const v = String(body.bookingMethod || '').trim().toLowerCase();
      return v === 'callback' ? 'callback' : 'in_chat';
    })();
    const callbackWindow = String(body.callbackWindow || '').trim().slice(0, 100);
    const notifyPhone = (() => {
      const v = String(body.notifyPhone || '').trim().slice(0, 30);
      return (v === '' || /^[+]?[0-9][0-9\s\-().]{6,29}$/.test(v)) ? v : '';
    })();
    const reportEmail = (() => {
      const v = String(body.reportEmail || '').trim().slice(0, 100);
      return (v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) ? v : '';
    })();

    // ── Wizard step "Look & feel" — optional/skippable, same validation as
    // leads.js's config-save.
    const brandColor = (() => {
      const v = String(body.brandColor || '').trim().slice(0, 8);
      return (v === '' || /^#?[0-9a-fA-F]{6}$/.test(v)) ? v : '';
    })();
    const formIntro   = String(body.formIntro   || '').trim().slice(0, 600);
    const trustBadges = String(body.trustBadges || '').trim().slice(0, 300);
    const aiPhotoUrl = (() => {
      const raw = String(body.aiPhotoUrl || '').trim();
      if (raw === '') return '';
      const isHttps = /^https:\/\//.test(raw);
      const isData  = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(raw);
      if (isHttps && raw.length <= 500) return raw;
      if (isData && raw.length <= 200 * 1024) return raw;
      return ''; // invalid/oversized — silently dropped, mirrors leads.js config-save
    })();

    if (!clientName)  return res.status(400).json({ error: 'Naam is verplicht' });
    if (!projectCode) return res.status(400).json({ error: 'Projectcode is verplicht' });
    if (!/^[A-Z0-9_]{2,50}$/.test(projectCode)) {
      return res.status(400).json({ error: 'Projectcode mag alleen letters, cijfers en _ bevatten' });
    }
    // Email is required for onboarding (not for the plain admin-create path):
    // it's how the client's dashboard login account gets created below.
    const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (isOnboard && !emailLooksValid) {
      return res.status(400).json({ error: 'Geldig e-mailadres is verplicht' });
    }
    if (!isOnboard && email && !emailLooksValid) {
      return res.status(400).json({ error: 'Geldig e-mailadres is verplicht' });
    }
    if (website && !/^https?:\/\/.+\..+/.test(website)) {
      return res.status(400).json({ error: 'Website moet beginnen met http:// of https://' });
    }
    if (bookingMethod === 'callback' && !callbackWindow) {
      return res.status(400).json({ error: 'Vul in wanneer je lead terugbelt (bv. "binnen 30 minuten")' });
    }

    try {
      // Check for duplicate project code
      const formula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(projectCode)}"`);
      const checkRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
        { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
      );
      const checkData = await checkRes.json();
      if ((checkData.records || []).length > 0) {
        return res.status(409).json({ error: `Projectcode '${projectCode}' bestaat al` });
      }

      const apiKey = generateApiKey();
      // Build the Airtable fields payload using FIELD IDs (immune to renames).
      // Klanten / "Client Config" table: tblPidTrwGRzRt4LZ
      //   fldAnB848Sr5jl6dq  Client Name
      //   fldN4dL0bGgfBOXwM  Project Code
      //   fldhmnzVjrb2AyqJr  API Key
      //   fldNEj1ysRgINOOtr  Calendly Link
      //   fld2GjRvjpsxI8XD0  Email
      //   fldecVolseGXtQaAN  Phone
      //   fldRvoe1JMPOtPWC7  AI Name
      //   fldOGdVq6T54xEo6W  Auto-Reply Template
      //   fldzBclLhryWQ1veO  Website
      //   fldTvMSdTZOyNgWod  Adres
      //   fld1lqHctRbqFGQf5  AI Instructions
      //   fld0BsPnDbBOkTHzr  Niche  (singleSelect. Typecast:true auto-creates new options)
      //   fld1iiV9XwSbgAACZ  Language — 40-language registry, see api/_lang.js (form-page.js's own
      //                      i18n UI text still only covers nl/fr/en, see that file's header)
      //   fldq5oIqw5MG8fKhc  Working Hours       — verified in leads.js, whatsapp.js, form-page.js
      //   fldUI9BYO0TplgYlm  Booking Method (in_chat/callback — 'calendly' deprecated, see dashboard.js) — verified in leads.js, whatsapp.js
      //   fldKvMVBalSBRQE7H  Callback Window     — verified in leads.js, whatsapp.js
      //   fldZEApe0gfse07AU  Notify Phone        — verified in leads.js, whatsapp.js, form.js
      //   fldDBJCN6dVMA8jax  Rapport Email       — already in docs/architecture.md
      //   fldJAf4aTNlIQVL2q  Brand Color         — already in docs/architecture.md
      //   fldxZ5spOeIb5omPr  Form Intro Message  — already in docs/architecture.md
      //   fld4nzMbnQseuGhnN  Trust Badges        — verified in leads.js, form-page.js
      //   fld7L0Iijq7ti6A6w  AI Photo URL        — already in docs/architecture.md
      // NOTE: fld1iiV9XwSbgAACZ, fldq5oIqw5MG8fKhc, fldUI9BYO0TplgYlm,
      // fldKvMVBalSBRQE7H, fldZEApe0gfse07AU and fld4nzMbnQseuGhnN are NOT
      // listed in docs/architecture.md's Client Config table, but all six
      // are live, existing fields — cross-verified by matching field ID
      // across leads.js (config-get AND config-save), whatsapp.js and
      // form-page.js/form.js, which only work today if these fields already
      // exist on the live base. No new Airtable fields are created here.
      const fields = {
        fldAnB848Sr5jl6dq: clientName,
        fldN4dL0bGgfBOXwM: projectCode,
        fldhmnzVjrb2AyqJr: apiKey,
        // Booking Method always set (defaults 'in_chat') so a fresh client
        // config never relies on whatsapp.js's own '|| in_chat' fallback.
        fldUI9BYO0TplgYlm: bookingMethod
      };
      if (calendlyLink)   fields.fldNEj1ysRgINOOtr = calendlyLink;
      if (email)          fields.fld2GjRvjpsxI8XD0 = email;
      if (phone)          fields.fldecVolseGXtQaAN = phone;
      if (aiName)         fields.fldRvoe1JMPOtPWC7 = aiName;
      if (autoReplyTpl)   fields.fldOGdVq6T54xEo6W = autoReplyTpl;
      if (website)        fields.fldzBclLhryWQ1veO = website;
      if (address)        fields.fldTvMSdTZOyNgWod = address;
      if (aiInstructions) fields.fld1lqHctRbqFGQf5 = aiInstructions;
      if (sector)         fields.fld0BsPnDbBOkTHzr = sector;
      if (language)       fields.fld1iiV9XwSbgAACZ = language;
      if (workingHours)   fields.fldq5oIqw5MG8fKhc = workingHours;
      if (callbackWindow) fields.fldKvMVBalSBRQE7H = callbackWindow;
      if (notifyPhone)    fields.fldZEApe0gfse07AU = notifyPhone;
      if (reportEmail)    fields.fldDBJCN6dVMA8jax = reportEmail;
      if (brandColor)     fields.fldJAf4aTNlIQVL2q = brandColor;
      if (formIntro)      fields.fldxZ5spOeIb5omPr = formIntro;
      if (trustBadges)    fields.fld4nzMbnQseuGhnN = trustBadges;
      if (aiPhotoUrl)     fields.fld7L0Iijq7ti6A6w = aiPhotoUrl;

      const createRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}`,
        {
          method:  'POST',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          // typecast:true lets Airtable auto-create select options + relaxes type coercion
          body: JSON.stringify({ fields, typecast: true })
        }
      );
      const createData = await createRes.json();
      if (!createRes.ok) {
        console.error('[admin] create error:', JSON.stringify(createData).slice(0, 200));
        return res.status(500).json({ error: 'Aanmaken mislukt: ' + (createData?.error?.message || createRes.status) });
      }

      const formUrl      = `https://app.helvaro.pro/start/${projectCode}`;
      const dashboardUrl = `https://app.helvaro.pro/dashboard`;

      // ── Self-serve onboarding only: seed a Credit Allowance so the client
      // doesn't start fully unmetered (see IMPROVEMENTS-REVIEW.md §3.2 —
      // onboarding was built before the credit system existed, so it never
      // wired into it). De standaard komt uit api/_plans.js (Starter), te
      // overschrijven via body.creditAllowance en dan DEFAULT_CREDIT_ALLOWANCE.
      // The 'Credit Allowance' Airtable field may not exist yet on the live
      // base (owner must add it, see CREDITS-VERCEL-SUMMARY.md) — setAllowance()
      // PATCHes it by name and Airtable rejects the whole PATCH with an
      // unknown-field error when it's missing. Mirrors _credits.js's own
      // fail-open/unconfigured-schema contract: caught here, logged, never
      // allowed to fail onboarding — the Client Config record above already
      // exists regardless (createRes.ok checked first).
      let creditAllowance = 0;
      if (isOnboard) {
        const requestedAllowance = Math.max(0, Math.round(Number(body.creditAllowance) || 0));
        // Uit api/_plans.js, niet als los getal hier. Stond op een harde 2.000,
        // terwijl de prijspagina 3.000 voor Starter zegt -- elke nieuwe klant
        // kreeg dus een derde te weinig, en niets in de code wees erop.
        const _plans = require('./_plans');
        const starterCredits     = (_plans.plan(_plans.STANDAARD_PLAN) || {}).credits || 0;
        const defaultAllowance   = Math.max(0, Math.round(Number(process.env.DEFAULT_CREDIT_ALLOWANCE) || 0)) || starterCredits;
        creditAllowance = requestedAllowance || defaultAllowance;
        try {
          const { setAllowance } = require('./_credits');
          await setAllowance(projectCode, creditAllowance);
        } catch (err) {
          console.warn('[admin] onboarding: kon Credit Allowance niet zetten (veld bestaat mogelijk nog niet, zie CREDITS-VERCEL-SUMMARY.md):', err.message);
          creditAllowance = 0; // eerlijk in de notify-mail hieronder: niet effectief gezet
        }
      }

      // ── Self-serve onboarding only: start the 14-day free trial
      // (TRIAL-DESIGN.md §6). Same graceful-degradation contract as the
      // Credit Allowance seeding right above: if the Plan Status / Trial
      // Ends At fields somehow reject the PATCH, the client is still
      // created — getPlanState() fails open to 'active' for any client with
      // a blank/missing Plan Status, so a failed trial-seed here degrades to
      // "behaves like a plain active client", never to "blocked".
      let trialEndsAt = null;
      if (isOnboard) {
        try {
          trialEndsAt = computeTrialEndsAt();
          await _patchClientRecord(BASE_ID, AIRTABLE_TOKEN, createData.id, {
            [PLAN_FIELD.STATUS]:        'trial',
            [PLAN_FIELD.TRIAL_ENDS_AT]: trialEndsAt,
          });
        } catch (err) {
          console.warn('[admin] onboarding: kon trial niet starten (Plan Status/Trial Ends At velden bestaan mogelijk nog niet):', err.message);
          trialEndsAt = null; // eerlijk in de notify-mail hieronder: niet effectief gezet
        }
      }

      // ── Public self-serve signup only: persist the fraud-guard verdict on
      // the new Client Config record. Score/status/reasons are kept
      // indefinitely (not personal data on their own — see
      // api/_signup-guard.js's file header); the raw signals (IP, device-
      // fingerprint hash, inside FIELD_NAME.SIGNALS) get a SHORT retention,
      // cleared by api/cron-followup.js's runSignupSignalsRetention() once
      // past signupGuard.SIGNALS_RETENTION_DAYS days — see the GDPR section
      // this change adds to api/privacy.js. Same graceful-degradation
      // contract as the credit/trial seeding above: these are NEW Airtable
      // fields that may not exist yet, so a PATCH failure here is caught,
      // logged, and never blocks onboarding — the Client Config record
      // already exists regardless of what happens in this block.
      if (signupGuardResult) {
        try {
          const signupGuard = require('./_signup-guard');
          await _patchClientRecord(BASE_ID, AIRTABLE_TOKEN, createData.id, {
            [signupGuard.FIELD_NAME.SCORE]:   signupGuardResult.score,
            [signupGuard.FIELD_NAME.STATUS]:  signupGuardResult.decision === 'accept' ? 'accepted' : 'flagged',
            [signupGuard.FIELD_NAME.REASONS]: signupGuardResult.reasons.join('\n'),
            [signupGuard.FIELD_NAME.SIGNALS]: signupGuardResult.signals ? JSON.stringify(signupGuardResult.signals) : '',
          });
        } catch (err) {
          console.warn('[admin] onboarding: kon signup-fraud velden niet zetten (velden bestaan mogelijk nog niet — zie api/_signup-guard.js header voor de lijst):', err.message);
        }
        // Explainable decision log — same structured single-line convention
        // as the [erasure] log lines in api/leads.js / api/cron-followup.js.
        // Kept even when the PATCH above failed, so the verdict is always
        // recoverable from logs even if the Airtable fields aren't set up yet.
        console.log(`[signup-guard] action=${signupGuardResult.decision} projectCode=${projectCode} score=${signupGuardResult.score} reasons=${JSON.stringify(signupGuardResult.reasons)} ts=${new Date().toISOString()}`);
        if (signupGuardResult.decision === 'flag') {
          console.warn(`[admin] public signup FLAGGED for review: ${projectCode} (score ${signupGuardResult.score})`);
        }
      }

      // ── Self-serve onboarding only (invite-code OR public): send an
      // email-ownership confirmation link. Runs for BOTH invite and public
      // signups — an invite code proves someone had the link, not that the
      // typed email is theirs. Does NOT block or delay onboarding in any
      // way: the account above is already created and fully usable; this is
      // fire-and-forget, wrapped so a failure here can never fail the
      // request. See api/_verify.js's file header for the full design
      // (token format, TTL, single-use mechanics) and for why the status
      // field is a Single Select (not a Checkbox) — that choice is what
      // keeps this from ever locking out a pre-existing client once Sindi
      // creates the field. Same graceful-degradation contract as every
      // other NEW-field block above: if 'Email Verification Status' doesn't
      // exist on the live base yet, the PATCH fails, is logged, and no
      // verification email is sent — isVerified() then fails OPEN
      // (everyone reads as verified) everywhere else that checks it.
      if (isOnboard && email) {
        try {
          await _patchClientRecord(BASE_ID, AIRTABLE_TOKEN, createData.id, {
            [verifyEmail.FIELD_NAME.STATUS]: 'pending',
          });
          const sent = await verifyEmail.sendVerificationEmail(email, createData.id);
          if (!sent.ok) console.warn('[admin] onboarding: verificatiemail versturen mislukt:', sent.error);
        } catch (err) {
          console.warn('[admin] onboarding: kon e-mailverificatie niet opzetten (veld "Email Verification Status" bestaat mogelijk nog niet, zie api/_verify.js header):', err.message);
        }
      }

      // ── Also create the matching User record so the klant can actually log in.
      //    Generate a friendly random password (caller can override via body.password).
      //    USERS_TABLE = tbl2hrPW7gIx5XF4S. Same field IDs as in auth.js.
      let loginPassword = String(body.password || '').trim();
      if (!loginPassword || loginPassword.length < 8) loginPassword = generateFriendlyPassword();
      let userCreated = false;
      // Tracks a REAL failure (lookup/create call errored) so the response
      // can be honest about a partial create, instead of silently returning
      // 200 as if everything succeeded. "User already exists" is NOT an
      // error — that klant can already log in with their existing credentials.
      let userCreateError = false;
      if (email) {
        try {
          // Look up by email first so we don't create duplicates on retry
          const USERS_TABLE = 'tbl2hrPW7gIx5XF4S';
          const uFormula = encodeURIComponent(`{Email}="${escapeFormula(email)}"`);
          const lookup = await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE}?filterByFormula=${uFormula}&maxRecords=1`,
            { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
          );
          const lookupData = await lookup.json();
          if (lookup.ok && (lookupData.records || []).length === 0) {
            const userRes = await fetch(
              `https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE}`,
              {
                method:  'POST',
                headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fields: {
                    fldsqiSy41CCDickr: email,           // Email
                    fldqi8JWgFgJF4X4R: require('bcryptjs').hashSync(loginPassword, 10),   // Password Hash (bcrypt; auth.js verifieert)
                    fldmKwegSUj1joru3: clientName,      // Client Name
                    fldbrCpBuQjJBfZsv: projectCode,     // Project Code
                    fldxZMgVXSy7EShDL: apiKey,          // API Key
                    fldb8sGE3Bslch8f8: true             // Active
                  },
                  typecast: true
                })
              }
            );
            if (userRes.ok) {
              userCreated = true;
              // Mirror the account into Clerk when Clerk is live, so a client
              // onboarded today can actually sign in. Without this the Airtable
              // record exists but Clerk has never heard of them.
              // projectCode is the tenant key and _clerk.js refuses a session
              // without it, so it is set here at creation rather than left to a
              // later sync. Best-effort: a Clerk hiccup must not fail the
              // onboarding that already wrote to Airtable — the mismatch is
              // recoverable with scripts/clerk-sync-users.js.
              if (_clerk.enabled()) {
                try {
                  const { createClerkClient } = require('@clerk/backend');
                  await createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
                    .users.createUser({
                      emailAddress: [email],
                      password: loginPassword,
                      publicMetadata: { projectCode, clientName },
                    });
                } catch (ce) {
                  console.error('[admin] Clerk-gebruiker aanmaken mislukt voor', email, '-', ce && ce.message,
                                '- draai scripts/clerk-sync-users.js om dit recht te zetten');
                }
              }
            }
            else { userCreateError = true; console.error('[admin] user create failed:', await userRes.text().catch(() => '')); }
          } else if (lookup.ok) {
            console.warn('[admin] user already exists for', email, '— skipping user create');
          } else {
            userCreateError = true;
            console.error('[admin] user lookup failed:', lookup.status);
          }
        } catch (err) {
          userCreateError = true;
          console.error('[admin] user create error:', err.message);
        }
      }

      // ── Self-serve onboarding only: notify Sindi a signup happened. The
      // wizard's entire purpose is onboarding without her involvement, which
      // also means "without her involvement" == "she has no idea it happened"
      // (see IMPROVEMENTS-REVIEW.md §3.2). Fail-soft, same contract as
      // _credits.js's own threshold-alert emails: sendMail() never throws,
      // and this is wrapped in try/catch anyway so a notification failure can
      // never fail the onboarding request — the client is already created.
      if (isOnboard) {
        try {
          await notifyOwnerOfSignup({ clientName, projectCode, email, sector, creditAllowance, trialEndsAt, signupGuardResult });
        } catch (err) {
          console.warn('[admin] onboarding: signup-notificatie mislukt:', err.message);
        }
      }

      // Welkomstmail bewust NIET geautomatiseerd. Admin kopieert de
      // ready-to-paste mailtekst uit de dashboard en stuurt zelf (vanuit
      // eigen mailbox sindi.s@usehelvaro.pro). Dit voorkomt Resend domain-
      // verification gedoe en geeft de eerste klant-interactie een echte
      // persoonlijke uitstraling (van een echt persoon, niet van een
      // noreply adres).

      return res.status(200).json({
        id: createData.id, apiKey, projectCode, clientName, formUrl, dashboardUrl,
        userCreated,
        trialEndsAt: trialEndsAt || undefined, // set only when the trial was actually seeded (see graceful-degradation comment above)
        loginPassword: userCreated ? loginPassword : undefined,  // surfaced once to the admin caller; not persisted in response logs
        // Honest partial-failure signal: the Client Config record above WAS
        // created successfully (createRes.ok), but the login account wasn't.
        // Still 200 (the client record is real and usable) but the wizard
        // must tell the founder/client this, not pretend it's fully done.
        warning: (email && !userCreated && userCreateError)
          ? 'Klantconfig is aangemaakt, maar het dashboard-login-account kon niet automatisch worden aangemaakt. Probeer het opnieuw, of neem contact op met Helvaro om je login handmatig te laten instellen.'
          : undefined
      });
    } catch (err) {
      console.error('[admin] create error:', err.message);
      return res.status(500).json({ error: 'Serverfout' });
    }
  }

  // ── GET. All clients + lead stats (admin only) ──────────────────────────
  const ADMIN_KEY = process.env.ADMIN_KEY;
  const provided  = _session.readToken(req);
  if (!isValidAdminToken(provided, ADMIN_KEY)) {
    return res.status(401).json({ error: 'Ongeldige admin key' });
  }

  // ── GET founder routes (/api/admin?section=founder&type=...) ────────────
  const MYSTARTUP_BASE  = 'appjJW396QWRaNOVi';
  const PIPELINE_TABLE  = 'tblihBS81FqGUZoY1';
  const GOALS_TABLE     = 'tblAFVa64xoHmp942';

  if (req.query && req.query.section === 'founder') {
    const type = req.query.type || 'all';
    try {
      if (type === 'pipeline') {
        const r = await fetch(
          `https://api.airtable.com/v0/${MYSTARTUP_BASE}/${PIPELINE_TABLE}?pageSize=100`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        const d = await r.json();
        const pipeline = (d.records || []).map(rec => ({
          id:          rec.id,
          naam:        rec.fields['Naam']       || '',
          bedrijf:     rec.fields['Bedrijf']    || '',
          email:       rec.fields['Email']      || '',
          fase:        rec.fields['Fase']       || 'Gecontacteerd',
          notities:    rec.fields['Notities']   || '',
          aangemaakt:  rec.fields['Aangemaakt'] || ''
        }));
        return res.status(200).json({ pipeline });
      }
      if (type === 'goals') {
        const r = await fetch(
          `https://api.airtable.com/v0/${MYSTARTUP_BASE}/${GOALS_TABLE}?pageSize=100`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        const d = await r.json();
        const goals = (d.records || []).map(rec => ({
          id:       rec.id,
          doel:     rec.fields['Doel']     || '',
          target:   rec.fields['Target']   || 0,
          eenheid:  rec.fields['Eenheid']  || '',
          deadline: rec.fields['Deadline'] || '',
          actief:   rec.fields['Actief']   || false
        }));
        return res.status(200).json({ goals });
      }
      return res.status(400).json({ error: 'Onbekend type' });
    } catch (err) {
      console.error('[admin] founder GET error:', err.message);
      return res.status(500).json({ error: 'Serverfout' });
    }
  }

  // ── GET credit routes (/api/admin?section=credits&type=usage-overview) ──
  // Usage + estimated real cost per client, for margin visibility. Empty
  // array (not an error) when the Credit fields haven't been added to the
  // Client Config schema yet — see _credits.js's header.
  if (req.query && req.query.section === 'credits') {
    const type = req.query.type || 'usage-overview';
    if (type !== 'usage-overview') return res.status(400).json({ error: 'Onbekend type' });
    const summaries = await credits.getAllUsageSummaries();
    return res.status(200).json({ clients: summaries });
  }

  try {
    const cRes  = await atFetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?pageSize=100`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );
    const cData = await cRes.json();
    if (!cRes.ok) throw new Error('Clients: ' + cRes.status);

    const clients = (cData.records || []).map(r => ({
      id:          r.id,
      naam:        r.fields['fldAnB848Sr5jl6dq'] || r.fields['Client Name']   || '—',
      projectCode: r.fields['fldN4dL0bGgfBOXwM'] || r.fields['Project Code']  || '',
      apiKey:      r.fields['API Key']            || r.fields['fldApiKey']     || '',
      calendly:    r.fields['fldNEj1ysRgINOOtr']  || r.fields['Calendly Link'] || ''
    }));

    // Paced, not Promise.all — see mapPaced()'s header for why.
    const withStats = await mapPaced(clients, async c => {
      const lastSeen = c.apiKey ? (_presence.get(_presenceKey(c.apiKey))?.ts || 0) : 0;
      if (!c.projectCode) return { ...c, totalLeads: 0, newLeads: 0, qualified: 0, appointments: 0, firstLeadDate: '', lastSeen };
      try {
        const formula = encodeURIComponent(`{fldSmczuyUJd26HLe}="${escapeFormula(c.projectCode)}"`);
        // Airtable geeft maximaal 100 records per pagina. Hier stond geen
        // offset-lus, dus elke klant met meer dan 100 leads werd stilletjes
        // afgekapt: totalLeads bleef op 100 staan, en newLeads/qualified/
        // appointments/firstLeadDate werden over dat ene venster berekend.
        // Op het founderoverzicht zag je een goedlopende klant dus kleiner dan
        // hij is — en juist de beste klant het meest verkeerd.
        //
        // Dezelfde bovengrens als leads.js' csv-export: 20 pagina's. Dit draait
        // per klant, dus een ongelimiteerde lus laat één grote klant het hele
        // overzicht ophouden. Boven de grens wordt `truncated` gezet in plaats
        // van te doen alsof het getal klopt.
        const MAX_PAGES = 20;
        let records = [];
        let lOffset  = '';
        let pages    = 0;
        let truncated = false;
        do {
          const lRes = await atFetch(
            `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}?filterByFormula=${formula}&fields[]=fld8mkrEWcyq7mUip&fields[]=fld0hAZJ5wgaXrNTn&fields[]=fldyIGNetqcSEkoaK&fields[]=fldR0r13EU4RwrtvH&pageSize=100${lOffset ? '&offset=' + lOffset : ''}`,
            { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
          );
          const lData = await lRes.json();
          records = records.concat(lData.records || []);
          lOffset = lData.offset || '';
          pages++;
          if (lOffset && pages >= MAX_PAGES) { truncated = true; break; }
        } while (lOffset);
        // Oldest lead date = client's "first lead" timestamp (proxy for tenure start)
        let firstLeadDate = '';
        for (const rec of records) {
          const d = rec.fields['fldR0r13EU4RwrtvH'] || '';
          if (d && (!firstLeadDate || d < firstLeadDate)) firstLeadDate = d;
        }
        return {
          ...c,
          totalLeads:    records.length,
          newLeads:      records.filter(r => r.fields['fld8mkrEWcyq7mUip'] === 'new').length,
          qualified:     records.filter(r => r.fields['fld0hAZJ5wgaXrNTn'] === true).length,
          appointments:  records.filter(r => r.fields['fldyIGNetqcSEkoaK'] === true).length,
          firstLeadDate,
          truncated,
          lastSeen
        };
      } catch {
        return { ...c, totalLeads: 0, newLeads: 0, qualified: 0, appointments: 0, firstLeadDate: '', lastSeen };
      }
    });

    return res.status(200).json({ clients: withStats });
  } catch (err) {
    console.error('[admin] Error:', err.message);
    return res.status(500).json({ error: 'Serverfout' });
  }
};

async function sendWelcomeEmail({ clientName, projectCode, apiKey, email, formUrl, dashboardUrl, loginPassword }) {
  // De welkomstmail gaat via het standaard verzendadres (SMTP_FROM = noreply@helvaro.pro),
  // betrouwbaar bezorgd. Maar met een Reply-To naar een echt postvak kan de klant
  // gewoon antwoorden en komt dat bij een mens terecht. Zo: deliverability + persoonlijk.
  const replyTo = process.env.REPLY_TO || 'sindi.s@usehelvaro.pro';
  // Login-blok wordt enkel toegevoegd als we ook een User hebben aangemaakt (en dus een password hebben)
  const loginBlock = loginPassword ? `
            <h3 style="margin:24px 0 8px;color:#0f1117">Login gegevens</h3>
            <div style="background:#f3f4ff;border:1px solid #c7d2fe;border-radius:10px;padding:18px;margin-bottom:8px">
              <table style="width:100%;border-collapse:collapse">
                <tr>
                  <td style="padding:6px 0;color:#5c6478;width:110px;font-size:13px">E-mail</td>
                  <td style="padding:6px 0;font-weight:600;font-family:monospace;font-size:14px">${escHtml(email)}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#5c6478;font-size:13px">Wachtwoord</td>
                  <td style="padding:6px 0;font-weight:600;font-family:monospace;font-size:15px;color:#3730a3;letter-spacing:1px">${escHtml(loginPassword)}</td>
                </tr>
              </table>
            </div>
            <p style="font-size:12px;color:#5c6478;margin:6px 0 18px">Wijzig je wachtwoord na de eerste login via <a href="https://app.helvaro.pro/forgot-password" style="color:#6366f1">Wachtwoord vergeten</a>.</p>
          ` : '';
  const html = `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;color:#0f1117">
          <div style="background:#080c14;padding:32px;border-radius:12px;text-align:center;margin-bottom:24px">
            <h1 style="color:#818cf8;font-family:monospace;letter-spacing:4px;margin:0">HELVARO</h1>
          </div>
          <h2 style="margin-bottom:8px">Welkom, ${escHtml(clientName)}</h2>
          <p style="color:#5c6478;margin-bottom:24px">Je Helvaro account staat klaar. Hieronder vind je alles om vandaag nog je eerste lead binnen te halen.</p>
          ${loginBlock}
          <h3 style="margin:24px 0 8px;color:#0f1117">Jouw lead-formulier</h3>
          <p style="color:#5c6478;margin:0 0 8px;font-size:13px">Plak deze URL in je advertenties, op je website of in je e-mail handtekening:</p>
          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:18px;font-family:monospace;font-size:13px;word-break:break-all">
            <a href="${escHtml(formUrl)}" style="color:#6366f1;text-decoration:none">${escHtml(formUrl)}</a>
          </div>
          <h3 style="margin:24px 0 8px;color:#0f1117">Eerste 3 stappen</h3>
          <ol style="color:#374151;line-height:1.7;padding-left:20px;margin-bottom:24px">
            <li>Log in op <a href="${escHtml(dashboardUrl)}" style="color:#6366f1">je dashboard</a></li>
            <li>Open <strong>AI Persoonlijkheid</strong> en pas de AI-naam + welkomstbericht aan</li>
            <li>Test zelf je formulier. Je krijgt direct WhatsApp van je AI</li>
          </ol>
          <p style="text-align:center">
            <a href="${escHtml(dashboardUrl)}" style="display:inline-block;padding:14px 28px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open Dashboard</a>
          </p>
          <p style="margin-top:32px;font-size:13px;color:#a0aab8;border-top:1px solid #eee;padding-top:16px">Vragen? Antwoord op deze mail. Team Helvaro</p>
        </div>`;
  const { sendMail } = require('./_mailer');
  await sendMail({ to: email, replyTo, subject: 'Welkom bij Helvaro — je account is klaar', html })
    .catch(err => console.error('[welcome mail]', err && err.message));
}

async function sendInviteEmail({ toEmail, toName, inviteLink }) {
  const greeting = toName ? `Hallo ${escHtml(toName)}` : 'Hallo';
  const html = `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;color:#0f1117">
          <div style="background:#080c14;padding:32px;border-radius:12px;text-align:center;margin-bottom:24px">
            <h1 style="color:#818cf8;font-family:monospace;letter-spacing:4px;margin:0">HELVARO</h1>
          </div>
          <h2 style="margin-bottom:8px">${greeting}!</h2>
          <p style="color:#5c6478;margin-bottom:24px;line-height:1.6">
            U bent uitgenodigd om uw Helvaro account aan te maken.<br>
            Klik op de knop hieronder om uw gegevens in te vullen en direct toegang te krijgen tot uw persoonlijk dashboard.
          </p>
          <div style="text-align:center;margin-bottom:28px">
            <a href="${escHtml(inviteLink)}" style="display:inline-block;padding:14px 32px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">
              Account aanmaken →
            </a>
          </div>
          <p style="font-size:13px;color:#a0aab8;margin-bottom:8px">Of kopieer deze link in uw browser:</p>
          <p style="font-size:12px;color:#6366f1;word-break:break-all;margin-bottom:32px">${escHtml(inviteLink)}</p>
          <hr style="border:none;border-top:1px solid #eee;margin-bottom:24px">
          <p style="font-size:12px;color:#a0aab8">Vragen? Neem contact op met uw contactpersoon. Team Helvaro</p>
        </div>`;
  const { sendMail } = require('./_mailer');
  const replyTo = process.env.REPLY_TO || 'sindi.s@usehelvaro.pro';
  return sendMail({ to: toEmail, subject: 'U bent uitgenodigd voor Helvaro', html, replyTo })
    .catch(err => { console.error('[invite mail]', err && err.message); return { ok: false, error: err && err.message }; });
}

// ── Owner signup notification for self-serve onboarding (mode=onboard).
// Same fire-and-forget-but-logged shape as _credits.js's 80%/100%/runaway
// alerts ('const to = process.env.NOTIFY_EMAIL; if (to) sendMail(...)') —
// sendMail() never throws, and the catch below is a second, belt-and-braces
// layer so this can never fail the onboarding request it's called from.
async function notifyOwnerOfSignup({ clientName, projectCode, email, sector, creditAllowance, trialEndsAt, signupGuardResult }) {
  const to = process.env.NOTIFY_EMAIL;
  if (!to) {
    console.warn('[admin] onboarding: NOTIFY_EMAIL niet ingesteld — geen signup-notificatie verstuurd voor', projectCode);
    return;
  }
  const allowanceLine = creditAllowance > 0
    ? `<strong>${creditAllowance}</strong> credits`
    : `<span style="color:#e11d48">niet gezet — 'Credit Allowance' veld ontbreekt mogelijk nog op Airtable (zie CREDITS-VERCEL-SUMMARY.md)</span>`;
  const trialLine = trialEndsAt
    ? `<strong>14 dagen</strong> — eindigt ${escHtml(new Date(trialEndsAt).toLocaleDateString('nl-BE'))}`
    : `<span style="color:#e11d48">niet gezet — 'Plan Status'/'Trial Ends At' velden ontbreken mogelijk nog op Airtable (zie TRIAL-DESIGN.md)</span>`;
  // Only present for a public, non-invite signup (see admin.js's onboard-
  // mode block) — an invite-code signup never runs the fraud guard, so this
  // row is simply omitted for those (the normal, expected case today).
  const fraudLine = signupGuardResult
    ? `<tr><td style="padding:4px 0;color:#666">Fraude-check</td><td style="padding:4px 0">
        <strong style="color:${signupGuardResult.decision === 'flag' ? '#e11d48' : '#16a34a'}">${signupGuardResult.decision === 'flag' ? 'GEFLAGD voor review' : 'geaccepteerd'}</strong>
        (score ${escHtml(String(signupGuardResult.score))}/100)<br>
        <span style="font-size:12px;color:#666">${escHtml(signupGuardResult.reasons.join(' · '))}</span>
      </td></tr>`
    : '';
  const { sendMail } = require('./_mailer');
  return sendMail({
    to,
    subject: `[Helvaro] Nieuwe self-serve klant: ${clientName}${signupGuardResult && signupGuardResult.decision === 'flag' ? ' (GEFLAGD)' : ''}`,
    html: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:auto;padding:20px;color:#111">
      <h2 style="margin:0 0 12px">Nieuwe self-serve onboarding</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:4px 0;color:#666;width:140px">Klant</td><td style="padding:4px 0;font-weight:600">${escHtml(clientName)}</td></tr>
        <tr><td style="padding:4px 0;color:#666">Projectcode</td><td style="padding:4px 0;font-family:monospace">${escHtml(projectCode)}</td></tr>
        <tr><td style="padding:4px 0;color:#666">E-mail</td><td style="padding:4px 0">${escHtml(email)}</td></tr>
        <tr><td style="padding:4px 0;color:#666">Niche</td><td style="padding:4px 0">${escHtml(sector || '—')}</td></tr>
        <tr><td style="padding:4px 0;color:#666">Credit Allowance</td><td style="padding:4px 0">${allowanceLine}</td></tr>
        <tr><td style="padding:4px 0;color:#666">Proefperiode</td><td style="padding:4px 0">${trialLine}</td></tr>
        ${fraudLine}
      </table>
    </div>`,
  }).catch(err => console.warn('[admin] onboarding: signup-notificatie mislukt:', err && err.message));
}

// ─── CONTENT GENERATOR ────────────────────────────────────────────────────────
// Wekelijkse 21-posts batch (7 dagen × 3 platforms) of partial run via admin
// mode='generate-content'. Per platform-dag combo: pick een content pillar,
// vraag Claude Haiku 4.5 om een post + hashtags, schrijf naar Airtable als draft.

const CONTENT_PILLARS = [
  { name: 'pain-point',       weight: 20, focus: 'Schets een herkenbaar probleem dat KMO-eigenaren met leads hebben. Concreet voorbeeld (auto-handel, kapper, advocaat). Eindig met een vraag of hint naar de oplossing.' },
  { name: 'solution',         weight: 20, focus: 'Hoe Helvaro een specifiek probleem oplost. AI WhatsApp die in 30 seconden kwalificeert. Geen sales pitch, maar concreet "zo werkt het".' },
  { name: 'industry-insight', weight: 15, focus: 'Inzicht uit B2B lead-data. Cijfers, percentages, trends. "80% van leads loopt weg binnen 5 min" stijl. Maak het scrollwaardig.' },
  { name: 'founder-pov',      weight: 15, focus: 'Eerlijke observatie als oprichter van een SaaS. Iets dat je deze week geleerd, vroeg, of besefte. Mens-achtig, niet corporate.' },
  { name: 'educational',      weight: 15, focus: 'Concrete tip die KMO-eigenaars zelf kunnen toepassen om hun lead-flow te verbeteren. 3 vragen, 5 stappen, etc.' },
  { name: 'behind-scenes',    focus: 'Wat er deze week is gebouwd of veranderd in Helvaro. Klein product moment. Maakt het tastbaar dat er een mens achter zit.' },
  { name: 'customer-win',     focus: 'Hypothetische klant-story OF echte cijfers van een klant (met permissie). Resultaat-gedreven.' },
  { name: 'personal-struggle', focus: 'Een eerlijk persoonlijk probleem of worsteling als solo-oprichter die Helvaro bouwt: twijfel, een tegenslag, een fout en de les eruit, of iets moeilijks van deze week. Kwetsbaar en echt, geen humblebrag. Ik-vorm. Eindig met een reflectie of vraag.' },
  { name: 'company-story',     focus: 'Waarom Helvaro bestaat en waar het naartoe gaat. De missie: KMOs helpen geen leads meer te verliezen. Persoonlijke "waarom ik dit bouw" hoek, het verhaal achter het bedrijf. Geen verkooppraatje.' },
  { name: 'ai-usage',          focus: 'Hoe jij als founder AI concreet gebruikt om je bedrijf te bouwen en runnen: een echte workflow, tool of prompt-aanpak die deze week hielp, met het concrete resultaat. Deel het als iemand die het echt doet, niet als hype. Een concreet voorbeeld, geen algemeenheden.' },
  { name: 'practical-tips',    focus: 'Een concrete, direct toepasbare tip voor andere ondernemers of makers: iets over AI, marketing, verkoop, productiviteit of bouwen dat jij zelf hebt geleerd. Kort, bruikbaar, uit eigen ervaring. Geen open deuren.' },
  { name: 'marketing-struggle', focus: 'Een eerlijke marketing-worsteling: iets dat niet werkte, een kanaal dat floppte, hoe moeilijk het is om gezien te worden, wat je nu anders probeert. Kwetsbaar en concreet, ik-vorm. De les of het experiment, geen humblebrag.' },
  { name: 'quick-tip',        weight: 20, focus: 'Een concrete, direct toepasbare tip voor KMO-eigenaren om meer leads te winnen of sneller op te volgen. Educatief (dit is het best presterende format op Instagram). De CARD_HEADLINE is de tip in 4-7 woorden, de 3 bullets zijn de mini-stappen. Bruikbaar, niet vaag.' },
  { name: 'big-stat',         weight: 16, focus: 'Een scroll-stoppend cijfer over reactietijd, gemiste leads of AI-opvolging. De CARD_HEADLINE = het cijfer als statement (bv "78% kiest wie eerst antwoordt"). Bullets = korte duiding en wat het betekent. Scrollwaardig, geen verzonnen cijfers: gebruik bekende, realistische orders van grootte.' },
  { name: 'myth-buster',      weight: 12, focus: 'Ontkracht een hardnekkige aanname over leads, WhatsApp of AI-opvolging. CARD_HEADLINE in "Mythe -> waarheid" stijl (bv "Meer leads is niet het probleem"). Bullets leggen de echte oorzaak en oplossing uit. Contra-intuitief maar waar.' },
  { name: 'hot-take',         weight: 12, focus: 'Een scherpe, licht contra-intuitieve mening over lead-opvolging of marketing voor KMOs, vanuit de founder. CARD_HEADLINE = de stelling, kort en gedurfd. Bullets onderbouwen kort. Prikkelt zonder clickbait, geen ruzie zoeken.' }
];

// LinkedIn leunt op persoonlijke + bedrijfsverhalen (founder-stem), niet op product-pitch.
const LINKEDIN_PILLARS = ['founder-pov', 'personal-struggle', 'company-story', 'behind-scenes', 'industry-insight'];
// Instagram/Facebook: alleen marketing-pijlers, geen persoonlijke founder-content.
// IG/FB: trending, card-native formats. Educatief/tips + stats scoren het best
// (Buffer 2026: educatieve carousels/graphics winnen), dus die wegen zwaarder.
const MARKETING_PILLARS = ['quick-tip', 'big-stat', 'myth-buster', 'hot-take', 'educational', 'pain-point', 'solution', 'customer-win', 'industry-insight'];
// LinkedIn = Sindi's persoonlijke founder-account: hoe ze AI gebruikt, tips,
// marketing-worstelingen, lessen uit het bouwen. Owner-stem, geen bedrijfs-advertentie.
const PERSONAL_PILLARS = ['founder-pov', 'personal-struggle', 'company-story', 'behind-scenes', 'ai-usage', 'practical-tips', 'marketing-struggle'];

// Echte momenten uit de bouwreis van Helvaro, BEWUST geabstraheerd tot de menselijke
// les. Voeden de persoonlijke/founder-posts zodat ze authentiek aanvoelen. Hier staat
// met opzet NIETS gevoeligs in: geen security, geen tools bij naam, geen kapotte zaken.
// De NOOIT-LEKKEN regel in de prompt bewaakt dat de AI er ook niets bij verzint.
const FOUNDER_JOURNEY = [
  'De keuze om een externe tool te schrappen en het zelf, geintegreerd te bouwen: minder afhankelijkheid, meer grip op de klantervaring.',
  'Bewust een mens-in-de-loop houden in plaats van alles meteen automatiseren, zolang er nog maar weinig klanten zijn.',
  'Als bootstrapper kiezen voor simpele, betaalbare oplossingen in plaats van een dure, indrukwekkende stack.',
  'De discipline om niets te bouwen wat je niet echt gaat gebruiken.',
  'Het geduld dat het kost om met grote platformen te integreren.',
  'De afweging tussen snel willen lanceren en het zorgvuldig en goed doen.',
  'Solo bouwen: prioriteren wat klanten binnenhaalt boven wat technisch indrukwekkend is.',
  'Een feature volledig herzien nadat de eerste aanpak niet bleek te passen.',
  'Leren dat saai en betrouwbaar vaak wint van slim en fragiel.',
  'Eerlijk durven zeggen dat een eerdere aanpak niet werkte, en opnieuw beginnen.'
];
const JOURNEY_PILLARS = ['personal-struggle', 'company-story', 'behind-scenes', 'founder-pov', 'ai-usage', 'marketing-struggle'];

const PLATFORM_TONES = {
  linkedin:  { tone: 'Dit is JOUW persoonlijke LinkedIn-account als founder (schrijf alsof jij, de eigenaar, het zelf post, in de ik-vorm). Onderwerpen: hoe je AI gebruikt om je bedrijf te bouwen, concrete tips, marketing-worstelingen, lessen uit het ondernemen, en het bouwen van Helvaro. Verweef Helvaro natuurlijk waar het past (het is wat je bouwt), zonder harde verkoop. Persoonlijk en authentiek, geen bedrijfs-advertentie. Een concreet, echt moment met EEN duidelijke les. Reflectief alleen als het moment dat echt was, geen corporate inspiratie-cadans, geen fake-les framing. 150-300 woorden, kort genoeg uitgelegd voor mensen buiten de niche. Sterke hook in zin 1 (geen opwarmzin). Sluit ALTIJD af met een oprechte uitnodiging om je een DM te sturen bij vragen over AI, bv "Vragen over hoe je AI inzet in je bedrijf? Stuur me gerust een DM." (dit is een echte uitnodiging, geen reactie-farm vraag).', maxLength: 2900, hashtagCount: 3 },
  instagram: { tone: 'Kort en visueel, 50-120 woorden. EEN claim. Hook in zin 1, geen opwarmzin. De caption scherpt het beeld aan, herhaalt het niet. Eindig met een concreet inzicht (een vraag alleen als die echt past, nooit om reacties te farmen).', maxLength: 2200, hashtagCount: 7 },
  facebook:  { tone: 'Community-toon, 100-180 woorden, ruimte voor een klein verhaal maar EEN claim. Hook in zin 1, geen opwarmzin. Specifiek, niet vaag. Eindig met een concreet inzicht of het verhaal, niet met een reactie-farm vraag.', maxLength: 5000, hashtagCount: 4 }
};

function pickPillarByMode(mode) {
  // 'personal' = persoonlijke groei (founder-stem). Anders = marketing (gewogen).
  if (mode === 'personal') {
    const pool = CONTENT_PILLARS.filter(p => PERSONAL_PILLARS.includes(p.name));
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const pool = CONTENT_PILLARS.filter(p => MARKETING_PILLARS.includes(p.name));
  const weighted = pool.flatMap(p => Array(p.weight || 5).fill(p));
  return weighted[Math.floor(Math.random() * weighted.length)];
}

async function generateOnePost(platform, pillar, dateIso, learn) {
  const tone = PLATFORM_TONES[platform];
  // Instagram educatieve pijlers worden een CAROUSEL (topformat voor SaaS: saves + shares).
  const isCarousel = platform === 'instagram' && ['quick-tip', 'myth-buster'].includes(pillar.name);
  const visualBlock = isCarousel
    ? `CAROUSEL_COVER: <Korte krachtige hook voor slide 1. 4 tot 8 woorden, *sterren* rond 1-2 kernwoorden. Bv "3 manieren om nooit meer een *lead te missen*">
CAROUSEL_SLIDES: <Precies 3 slides, gescheiden door | (pipe). Elke slide = "TITEL :: uitleg". Titel 2 tot 5 woorden met *sterren* rond een kernwoord, uitleg 1 tot 2 korte zinnen, geen emoji. Bv "Antwoord *binnen 5 min* :: Wie eerst reageert, wint de klant. Zorg dat elk bericht direct opgevolgd wordt. | Stel *de juiste vragen* :: Kwalificeer meteen zodat je tijd naar de juiste leads gaat. | Automatiseer *de opvolging* :: Jij kan niet 24/7 antwoorden, een systeem wel.">

Dit wordt een Instagram CAROUSEL van branded tekst-slides (donker, electric-blue). Educatief en concreet, geen fotobeschrijving.`
    : `CARD_HEADLINE: <Korte, krachtige statement voor de post-afbeelding. 4 tot 9 woorden, in het Nederlands, geen emoji. Zet de 1 tot 3 kernwoorden tussen *sterren* voor blauw accent. Bv "Je klant wacht niet. *Jij ook niet.*">
CARD_BULLETS: <Precies 3 hele korte voordelen, max 5 woorden elk, gescheiden door | (pipe). Geen emoji. Bv "Direct antwoord op elk bericht | De juiste vragen, automatisch | Alleen leads die klaar zijn">
CARD_TAGLINE: <1 korte slotzin, 1 tot 2 woorden tussen *sterren*. Bv "Mis nooit meer een *klant.*">

De CARD-velden worden een strak branded tekst-beeld (donker met electric-blue accent), GEEN foto. Schrijf ze als affiche-tekst, niet als fotobeschrijving.`;
  let journeyContext = '';
  if (JOURNEY_PILLARS.includes(pillar.name)) {
    const theme = FOUNDER_JOURNEY[Math.floor(Math.random() * FOUNDER_JOURNEY.length)];
    journeyContext = `\nECHT MOMENT UIT DE REIS (bouw de post hierrond, maak de les universeel en herkenbaar, verzin geen details):\n${theme}\n`;
  }
  // Leer-loop: voed eerdere keuzes van Sindi terug. Goedgekeurd/geplaatst = volg de
  // toon; overgeslagen = vermijd die stijl. Nooit letterlijk kopieren.
  let learnContext = '';
  if (learn && ((learn.good && learn.good.length) || (learn.bad && learn.bad.length))) {
    const g = (learn.good || []).slice(0, 2).map(s => `- "${s}"`).join('\n');
    const b = (learn.bad  || []).slice(0, 1).map(s => `- "${s}"`).join('\n');
    learnContext = `\nLEER VAN SINDI'S KEUZES (neem de TOON over, kopieer niet letterlijk):\n${g ? `Goedgekeurd, dit werkt:\n${g}\n` : ''}${b ? `Overgeslagen, vermijd deze stijl/onderwerp:\n${b}\n` : ''}`;
  }
  const prompt = `Je schrijft een social media post voor Helvaro op ${platform}.

OVER HELVARO:
Helvaro is een Belgische B2B SaaS. KMOs (auto-handel, kappers, advocaten, vastgoed, dentists, ...) krijgen een AI die hun WhatsApp leads in 30 seconden kwalificeert. €1.000/maand. NL/FR/EN. Lead vult formulier in op de website van de klant -> AI van Helvaro stuurt direct WhatsApp -> voert natuurlijk gesprek -> markeert qualified -> klant krijgt notif. Zonder Helvaro: lead loopt weg na 5-10 min.

CONTENT PIJLER VOOR DEZE POST: ${pillar.name}
${pillar.focus}
${journeyContext}${learnContext}
PLATFORM TONE:
${tone.tone}

KRITIEKE REGELS:
- EEN claim per post. Argumenteert de post twee dingen, kies er een.
- SPECIFIEK boven bijvoeglijk: een concrete situatie, een echt getal of een moment ("een autohandelaar verloor een lead van 30.000 euro door 12 minuten te laat te antwoorden"), nooit vage adjectieven.
- STERKE eerste zin, geen opwarmzin. Schrap zin 1 als die alleen opbouwt.
- GEEN reactie-farm vraag op het einde. Een vraag mag alleen als die echt uit de post volgt.
- GEEN emojis (Helvaro policy)
- GEEN em-dashes ( - ), gebruik gewone punten
- GEEN hype/cliches: "Did you know", "Stel je voor", "In een wereld waar", "game-changer", "revolutionair", "naadloos", "ontketen", "the future of"
- Schrijf in het Nederlands, zoals een echte ondernemer praat
- Geen vermelding van prijs (€1.000/maand) tenzij pillar=pain-point of customer-win
- NOOIT LEKKEN: noem geen technische details, geen security-, wachtwoord- of datalek-onderwerpen, geen specifieke tools/leveranciers bij naam (positief noch negatief), geen klantnamen of klantdata, geen interne werking of infrastructuur. Suggereer NOOIT dat iets in het product kapot, onveilig of onaf is. Abstraheer altijd naar de menselijke les. Bij twijfel: laat het weg.

OUTPUT FORMAT (strikt):
TITLE: <korte interne titel max 60 chars>
CONTENT: <de post tekst>
HASHTAGS: <${tone.hashtagCount} hashtags gescheiden door spaties, lowercase, beginnen met #>
${visualBlock}

Schrijf nu de post.`;

  try {
    const uit = await _ai.generateText({
      task: _ai.TASKS.MARKETING_COPY,
      ctx: { projectCode: credits.INTERNAL_PROJECT_CODE, userId: 'content-gen' },
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 800,
    });
    const raw = (uit.text || '').trim();
    // Parse the structured output
    const titleM    = raw.match(/TITLE:\s*(.+?)(?:\n|$)/i);
    const contentM  = raw.match(/CONTENT:\s*([\s\S]+?)(?:\n(?:HASHTAGS|CARD_HEADLINE|VISUAL_QUERY):|$)/i);
    const hashtagsM = raw.match(/HASHTAGS:\s*(.+?)(?:\n|$)/i);
    const cardHeadM = raw.match(/CARD_HEADLINE:\s*(.+?)(?:\n|$)/i);
    const cardBullM = raw.match(/CARD_BULLETS:\s*(.+?)(?:\n|$)/i);
    const cardTagM  = raw.match(/CARD_TAGLINE:\s*(.+?)(?:\n|$)/i);
    if (!contentM) return null;
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
    // Strip dashes/emojis as defense in depth
    let content = contentM[1].trim().replace(/[—–]/g, '.').slice(0, tone.maxLength).replace(emoji, '');

    // IG/FB krijgen een branded tekst-card (geen foto's, geen mensen). We bewaren de
    // card-spec als JSON in het 'Image Prompt' veld; mode=generate-image rendert de
    // card apart per post. LinkedIn = tekst-only, geen beeld.
    const clean = s => String(s || '').replace(emoji, '').replace(/\s+/g, ' ').trim();
    let imagePrompt = '';
    if (isCarousel) {
      const coverM  = raw.match(/CAROUSEL_COVER:\s*(.+?)(?:\n|$)/i);
      const slidesM = raw.match(/CAROUSEL_SLIDES:\s*([\s\S]+?)(?:\n[A-Z_]+:|$)/i);
      const cover = clean(coverM ? coverM[1] : '') || 'Nooit meer een *lead missen*';
      const slides = clean(slidesM ? slidesM[1] : '').split('|').map(s => {
        const parts = s.split('::');
        return { title: clean(parts[0]), body: clean(parts.slice(1).join('::')) };
      }).filter(s => s.title).slice(0, 4);
      imagePrompt = JSON.stringify({
        carousel: true, cover: { headline: cover }, slides,
        cta: { headline: 'Vragen over *AI?*', sub: 'Stuur me een DM. Ik help je graag op weg.' }
      });
    } else if (platform === 'instagram' || platform === 'facebook') {
      const headline = clean(cardHeadM ? cardHeadM[1] : '') || clean((titleM ? titleM[1] : '')) || 'Je klant wacht niet. *Jij ook niet.*';
      const bullets = clean(cardBullM ? cardBullM[1] : '').split('|').map(b => b.trim()).filter(Boolean).slice(0, 3);
      const tagline = clean(cardTagM ? cardTagM[1] : '') || 'Mis nooit meer een *klant.*';
      imagePrompt = JSON.stringify({ card: true, headline, bullets, tagline });
    }

    return {
      title:    (titleM ? titleM[1] : `${platform} ${pillar.name}`).trim().slice(0, 60),
      content,
      hashtags: (hashtagsM ? hashtagsM[1] : '').trim().slice(0, 200),
      imagePrompt
    };
  } catch (err) {
    console.error('[content-gen] exception:', err.message);
    return null;
  }
}

// Blob storage is reachable via the legacy long-lived BLOB_READ_WRITE_TOKEN
// or via Vercel's OIDC flow (BLOB_STORE_ID + the injected VERCEL_OIDC_TOKEN),
// which needs no stored secret. Both are accepted so the long-lived token can
// be removed from the project without silently disabling image hosting.
function blobStorageConfigured() {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID || process.env.VERCEL_OIDC_TOKEN);
}

// Upload een buffer naar Vercel Blob -> permanente publieke URL (of '' als niet kan).
async function uploadToBlob(buffer, contentType, platform) {
  let put;
  try { ({ put } = require('@vercel/blob')); }
  catch (e) { console.error('[ai-image] @vercel/blob niet beschikbaar:', e.message); return ''; }
  if (!blobStorageConfigured()) { console.warn('[ai-image] geen blob-opslag geconfigureerd'); return ''; }
  const ext = (contentType || '').includes('png') ? 'png' : 'jpg';
  const filename = `social/${platform}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  // Token alleen meegeven als de legacy variant echt gezet is; zonder token
  // lost de SDK de credentials via OIDC op.
  const putOpts = { access: 'public', contentType: contentType || 'image/png' };
  if (process.env.BLOB_READ_WRITE_TOKEN) putOpts.token = process.env.BLOB_READ_WRITE_TOKEN;
  const blob = await put(filename, buffer, putOpts);
  return (blob.url || '').slice(0, 500);
}

// OpenAI gpt-image-1-mini: goedkoop (~$0.005-0.015/beeld), actueel model (dall-e-3 is
// uit de API sinds mei 2026). Vereist een GEVERIFIEERDE org; anders 403 en GEEN credit
// verbruikt (we vallen dan stil terug op Pollinations). Geeft b64 terug -> upload Blob.
async function generateOpenAIImage(prompt, platform) {
  const KEY = process.env.OPENAI_API_KEY || process.env.OPENAI;
  if (!KEY) return '';
  if (!blobStorageConfigured()) return '';   // zonder hosting geen zin
  try {
    const size = platform === 'instagram' ? '1024x1024' : '1536x1024';   // IG vierkant, FB landscape
    const enriched = `${prompt}. Professional photography, clean, brand-safe, no text, no letters, no watermark.`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 55000);
    let r;
    try {
      r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model: 'gpt-image-1-mini', prompt: enriched.slice(0, 3000), size, quality: 'medium', n: 1 }),
        signal: ctrl.signal
      });
    } finally { clearTimeout(t); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) { console.error('[ai-image] OpenAI err', r.status, JSON.stringify(d.error || '').slice(0, 220)); return ''; }
    const b64 = d.data && d.data[0] && d.data[0].b64_json;
    if (!b64) { console.error('[ai-image] OpenAI gaf geen b64'); return ''; }
    return await uploadToBlob(Buffer.from(b64, 'base64'), 'image/png', platform);
  } catch (err) { console.error('[ai-image] OpenAI exception:', err.message); return ''; }
}

// Pollinations.ai: gratis, geen key, geen tegoed. Vangnet als OpenAI niet kan.
async function generatePollinationsImage(prompt, platform) {
  try {
    const width  = platform === 'instagram' ? 1024 : 1280;
    const height = platform === 'instagram' ? 1024 : 720;
    const seed = Math.floor(Math.random() * 1e9);
    const enriched = `${prompt}. Professional photography, clean, brand-safe, no text, no watermark, no letters.`;
    const params = new URLSearchParams({ width: String(width), height: String(height), seed: String(seed), model: 'flux', nologo: 'true', enhance: 'true' });
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(enriched.slice(0, 1500))}?${params}`;
    const headers = {};
    if (process.env.POLLINATIONS_TOKEN) headers.Authorization = `Bearer ${process.env.POLLINATIONS_TOKEN}`;
    // Zonder Blob: geef een compacte directe Pollinations-URL terug (browser laadt rechtstreeks).
    if (!blobStorageConfigured()) {
      const sp = new URLSearchParams({ width: String(width), height: String(height), seed: String(seed), model: 'flux', nologo: 'true' });
      const direct = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 120))}?${sp}`;
      return direct.length <= 500 ? direct : (`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 60))}?${sp}`).slice(0, 500);
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 45000);
    let r;
    try { r = await fetch(url, { headers, signal: ctrl.signal }); }
    finally { clearTimeout(t); }
    if (!r.ok) { console.error('[ai-image] Pollinations err', r.status); return ''; }
    const ct = r.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) { console.error('[ai-image] Pollinations gaf geen beeld:', ct); return ''; }
    const buffer = Buffer.from(await r.arrayBuffer());
    if (buffer.length < 1000) return '';
    return await uploadToBlob(buffer, ct, platform);
  } catch (err) { console.error('[ai-image] Pollinations exception:', err.message); return ''; }
}

// Orchestrator: OpenAI gpt-image-1-mini primair, Pollinations als gratis vangnet.
async function generateAIImage(prompt, platform) {
  let url = await generateOpenAIImage(prompt, platform).catch(() => '');
  if (!url) url = await generatePollinationsImage(prompt, platform).catch(() => '');
  return url;
}

// Pexels API. Gratis 200 req/uur. Vraagt 1 random foto die matcht met query.
// Fallback wanneer AI-beeldgeneratie niet beschikbaar is of faalt.
async function fetchPexelsImage(query) {
  const PEXELS_KEY = process.env.PEXELS_API_KEY;
  if (!PEXELS_KEY) {
    console.warn('[pexels] PEXELS_API_KEY niet ingesteld. Posts krijgen geen foto.');
    return '';
  }
  try {
    // per_page=15 + random pick zorgt voor variatie als zelfde query meerdere keren
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`;
    const r = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
    if (!r.ok) {
      console.error('[pexels] err', r.status, query);
      return '';
    }
    const d = await r.json();
    const photos = d.photos || [];
    if (photos.length === 0) return '';
    const photo = photos[Math.floor(Math.random() * photos.length)];
    // src.large is ~940px wide. Goed voor Instagram + Facebook feed.
    return (photo.src?.large || photo.src?.original || '').slice(0, 500);
  } catch (err) {
    console.error('[pexels] exception:', err.message);
    return '';
  }
}

// Leer-loop: haal recente posts op en bucket per platform in goed (approved/posted)
// en slecht (skipped). Geeft { instagram:{good:[],bad:[]}, facebook:{...}, linkedin:{...} }.
// Snippets ingekort; het model neemt de TOON over, kopieert niet letterlijk.
async function fetchLearningExamples(airtableToken, baseId) {
  const POSTS_TABLE = 'tblPxnfb5MThgsnaA';
  const out = {};
  try {
    const url = `${POSTS_TABLE}?pageSize=80&sort%5B0%5D%5Bfield%5D=Created%20At&sort%5B0%5D%5Bdirection%5D=desc`;
    const r = await pgFetch(url);
    if (!r.ok) return out;
    const d = await r.json();
    for (const rec of (d.records || [])) {
      const f = rec.fields || {};
      const platform = String(f.Platform || '').toLowerCase();
      const status   = String(f.Status   || '').toLowerCase();
      const content  = String(f.Content  || '').trim();
      if (!platform || !content) continue;
      const bucket = out[platform] || (out[platform] = { good: [], bad: [] });
      const snippet = content.replace(/\s+/g, ' ').slice(0, 220);
      if ((status === 'approved' || status === 'posted') && bucket.good.length < 4) bucket.good.push(snippet);
      else if (status === 'skipped' && bucket.bad.length < 3) bucket.bad.push(snippet);
    }
  } catch (err) { console.error('[content-gen] leer-loop ophalen mislukt:', err.message); }
  return out;
}

// Genereer N dagen aan content. Per dag: 3 posts (LinkedIn 08:30, IG 12:00, FB 18:00 Brussels-tijd).
async function generateContentWeek(airtableToken, baseId, days, startDate) {
  const POSTS_TABLE = 'tblPxnfb5MThgsnaA';
  // 6 posts per dag: 2 Instagram + 2 Facebook (marketing) + 2 LinkedIn
  // (1 persoonlijke groei + 1 Helvaro-marketing). Tijden in Brussel.
  const slots = [
    { name: 'linkedin',  hour: 8,  minute: 30, mode: 'personal'  },
    { name: 'instagram', hour: 11, minute: 0,  mode: 'marketing' },
    { name: 'facebook',  hour: 12, minute: 30, mode: 'marketing' },
    { name: 'linkedin',  hour: 13, minute: 30, mode: 'personal'   },
    { name: 'instagram', hour: 17, minute: 0,  mode: 'marketing' },
    { name: 'facebook',  hour: 18, minute: 30, mode: 'marketing' }
  ];

  let created = 0, failed = 0;
  const summary = [];

  // Leer-loop: haal 1x de recente keuzes van Sindi op (goedgekeurd vs overgeslagen),
  // per platform. Wordt aan elke generatie meegegeven zodat het model meebeweegt.
  const learnAll = await fetchLearningExamples(airtableToken, baseId).catch(() => ({}));

  // Dedup-guard: sla dagen over die al posts hebben, zodat de zondag-run en de
  // self-heal-run elkaar niet overlappen (geen dubbele dagen/content).
  const existingDates = new Set();
  try {
    const rStart = new Date(new Date(startDate).getTime() - 12 * 60 * 60 * 1000).toISOString();
    const rEnd   = new Date(new Date(startDate).getTime() + (days + 1) * 24 * 60 * 60 * 1000).toISOString();
    const ef = encodeURIComponent(`AND(IS_AFTER({Scheduled For}, "${rStart}"), IS_BEFORE({Scheduled For}, "${rEnd}"))`);
    const er = await pgFetch(`${POSTS_TABLE}?filterByFormula=${ef}&pageSize=100`);
    if (er.ok) for (const rec of ((await er.json()).records || [])) {
      const sf = rec.fields && rec.fields['Scheduled For'];
      if (sf) existingDates.add(String(sf).slice(0, 10));
    }
  } catch {}

  for (let day = 0; day < days; day++) {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + day);
    const dayKey = date.toISOString().slice(0, 10);
    if (existingDates.has(dayKey)) { summary.push(`${dayKey}: overgeslagen (al posts)`); continue; }

    // Genereer de 6 posts van deze dag PARALLEL (1 ronde i.p.v. 6 sequentiele
    // calls). Zo blijft 6 x 7 = 42 posts ruim binnen de 60s functie-limiet.
    const dayPosts = await Promise.all(slots.map(async (slot) => {
      const pillar = pickPillarByMode(slot.mode);
      const post = await generateOnePost(slot.name, pillar, date.toISOString(), learnAll[slot.name]).catch(() => null);
      return { slot, pillar, post };
    }));

    for (const { slot, pillar, post } of dayPosts) {
      if (!post) { failed++; continue; }
      // Brussels CET = UTC+1 (CEST = UTC+2); -1u correctie als CET-fallback.
      const scheduledUtc = new Date(Date.UTC(
        date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
        slot.hour - 1, slot.minute
      ));
      const fields = {
        Title:           post.title,
        Platform:        slot.name,
        Content:         post.content,
        'Scheduled For': scheduledUtc.toISOString(),
        // Volledig autonoom: posts gaan standaard direct 'approved' en worden door
        // de cron gepost. Zet AUTO_PUBLISH=false als je weer handmatig wil reviewen.
        Status:          process.env.AUTO_PUBLISH === 'false' ? 'draft' : 'approved',
        Pillar:          pillar.name,
        'AI Generated':  true,
        Hashtags:        post.hashtags,
        'Created At':    new Date().toISOString()
      };
      // Beeld-prompt bewaren voor IG + FB; afbeelding wordt later apart gegenereerd
      // via mode=generate-image (voorkomt timeout). LinkedIn = tekst-only.
      if (post.imagePrompt) fields['Image Prompt'] = post.imagePrompt;
      const r = await pgFetch(
        `${POSTS_TABLE}`,
        {
          method: 'POST',
          body: JSON.stringify({ fields, typecast: true })
        }
      );
      if (r.ok) {
        created++;
        summary.push({ date: scheduledUtc.toISOString(), platform: slot.name, pillar: pillar.name, preview: post.content.slice(0, 80) });
      } else {
        failed++;
        const errBody = await r.text().catch(() => '');
        console.error('[content-gen] Airtable err:', errBody.slice(0, 200));
      }
    }
  }
  return { ok: true, created, failed, summary };
}
