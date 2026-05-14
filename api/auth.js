const crypto = require('crypto');

// Exponential backoff + jitter retry for Airtable 429.
// 6 attempts: ~1 s, ~2 s, ~4 s, ~8 s, ~16 s, ~32 s  (≤ ~63 s total).
// Jitter (±25 %) prevents synchronized retries from concurrent serverless instances
// hammering Airtable at the same millisecond after a shared rate-limit window.
async function atFetch(url, opts) {
  let delay = 1000;
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(url, opts);
    if (r.status !== 429) return r;
    if (attempt < 5) {
      const jitter = delay * 0.25 * (Math.random() * 2 - 1); // ±25 %
      await new Promise(res => setTimeout(res, Math.max(500, delay + jitter)));
    }
    delay = Math.min(delay * 2, 32_000);
  }
  return fetch(url, opts); // final attempt — caller handles non-200
}

// TTL cache — user records by email, 5 min TTL
// Avoids an Airtable call on every login attempt (hot path)
const _userCache = new Map();
const USER_TTL   = 5 * 60 * 1000;
function getCachedUser(email) {
  const entry = _userCache.get(email);
  if (!entry) return null;
  if (Date.now() - entry.ts > USER_TTL) { _userCache.delete(email); return null; }
  return entry.record;
}
function setCachedUser(email, record) {
  _userCache.set(email, { record, ts: Date.now() });
}

// Simple in-memory rate limiter — max 10 login attempts per IP per 15 minutes
const loginAttempts = new Map();
function isRateLimited(ip) {
  const now    = Date.now();
  const window = 15 * 60 * 1000;
  const max    = 10;
  const attempts = (loginAttempts.get(ip) || []).filter(t => now - t < window);
  attempts.push(now);
  loginAttempts.set(ip, attempts);
  if (loginAttempts.size > 1000) {
    for (const [k, v] of loginAttempts) {
      if (v.every(t => now - t > window)) loginAttempts.delete(k);
    }
  }
  return attempts.length > max;
}

// Derive a stable admin session token from ADMIN_KEY so the raw secret
// never leaves the server. The token is deterministic (no DB needed) but
// cannot be reversed to obtain the original key.
function deriveAdminToken(adminKey) {
  return crypto.createHmac('sha256', adminKey).update('helvaro-admin-v1').digest('hex');
}

// ── Signed session tokens ──────────────────────────────────────────────────────
// Embed client data in a signed token so downstream API handlers (leads, calendly)
// can verify identity locally — zero Airtable calls after login, for every client.
// Secret derived from ADMIN_KEY so no additional env var is required.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — matches dashboard TTL
function sessionSecret() {
  const base = process.env.SESSION_SECRET || process.env.ADMIN_KEY || 'helvaro-default-v1';
  return crypto.createHmac('sha256', base).update('helvaro-session-v1').digest('hex');
}
function signSession(data) {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  const sig     = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `hvs1.${payload}.${sig}`;
}

// Timing-safe string compare — prevents timing-based brute force
function safeEqual(a, b) {
  try {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://app.helvaro.pro');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Te veel pogingen. Probeer over 15 minuten opnieuw.' });
  }

  const AIRTABLE_TOKEN = process.env.API_Airtable;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const USERS_TABLE    = 'tbl2hrPW7gIx5XF4S';

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    const email    = String(body.email    || '').trim().slice(0, 254);
    const password = String(body.password || '').trim().slice(0, 200);

    if (!email)    return res.status(400).json({ error: 'E-mailadres is verplicht' });
    if (!password) return res.status(400).json({ error: 'Wachtwoord is verplicht' });

    // ── Admin shortcut ────────────────────────────────────────────────────────
    // Use timing-safe compare so attackers can't learn the key length/prefix.
    // Return a DERIVED token — the raw ADMIN_KEY never leaves the server.
    const ADMIN_KEY = process.env.ADMIN_KEY;
    if (ADMIN_KEY && safeEqual(password, ADMIN_KEY)) {
      // Admin gets the derived HMAC token — NOT a session token.
      // leads.js recognises it via isAdminToken() before session verification.
      return res.status(200).json({
        success:     true,
        apiKey:      deriveAdminToken(ADMIN_KEY),
        clientName:  'Admin',
        projectCode: ''
      });
    }

    // Basic email shape check — reject obvious injections early
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Ongeldig e-mailadres' });
    }

    // ── Owner bypass ──────────────────────────────────────────────────────────
    // Eliminates ALL Airtable calls for the primary owner account.
    // Set OWNER_EMAIL, OWNER_PASSWORD_HASH, OWNER_API_KEY, OWNER_CLIENT_NAME,
    // and OWNER_PROJECT_CODE in Vercel env vars to activate.
    // OWNER_PASSWORD_HASH = the same password value stored in Airtable "Password Hash".
    const OWNER_EMAIL = process.env.OWNER_EMAIL;
    const OWNER_PASS  = process.env.OWNER_PASSWORD_HASH;
    if (OWNER_EMAIL && OWNER_PASS &&
        safeEqual(email, OWNER_EMAIL) &&
        safeEqual(password, OWNER_PASS)) {
      const ownerData = {
        apiKey:      process.env.OWNER_API_KEY      || '',
        clientName:  process.env.OWNER_CLIENT_NAME  || 'Owner',
        projectCode: process.env.OWNER_PROJECT_CODE || ''
      };
      return res.status(200).json({ success: true, ...ownerData, apiKey: signSession(ownerData) });
    }

    // ── Fetch user by email only — password compared server-side ─────────────
    // Cached 5 min so repeated login attempts don't hammer Airtable.
    let userRecord = getCachedUser(email);
    if (!userRecord) {
      const formula = encodeURIComponent(
        `AND({Email}="${escapeFormula(email)}",{Active}=1)`
      );
      const url   = `https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE}?filterByFormula=${formula}&maxRecords=1`;
      const atRes = await atFetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });

      if (!atRes.ok) {
        console.error('Airtable auth error:', atRes.status);
        return res.status(500).json({ error: 'Database fout. Probeer opnieuw.' });
      }

      const data = await atRes.json();
      userRecord = data.records?.[0] || null;
      if (userRecord) setCachedUser(email, userRecord);
    }

    if (!userRecord) {
      return res.status(401).json({ error: 'Verkeerd e-mailadres of wachtwoord' });
    }

    const user       = userRecord.fields;
    const storedHash = String(user['Password Hash'] || user['fldPasswordHash'] || '');

    // Timing-safe server-side compare — never query Airtable with the password
    if (!storedHash || !safeEqual(password, storedHash)) {
      return res.status(401).json({ error: 'Verkeerd e-mailadres of wachtwoord' });
    }

    const userData = {
      apiKey:      user['fldxZMgVXSy7EShDL'] || user['API Key']       || '',
      clientName:  user['fldmKwegSUj1joru3']  || user['Client Name']  || '',
      projectCode: user['fldbrCpBuQjJBfZsv']  || user['Project Code'] || ''
    };
    return res.status(200).json({ success: true, ...userData, apiKey: signSession(userData) });

  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(500).json({ error: 'Serverfout. Probeer later opnieuw.' });
  }
};

// Escape double-quotes and backslashes for Airtable formula strings
function escapeFormula(val) {
  return val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
