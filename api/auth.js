const crypto = require('crypto');

// Retry once on Airtable 429 after 1 second
async function atFetch(url, opts) {
  const r = await fetch(url, opts);
  if (r.status !== 429) return r;
  await new Promise(res => setTimeout(res, 1000));
  return fetch(url, opts);
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
      return res.status(200).json({
        success:     true,
        apiKey:      deriveAdminToken(ADMIN_KEY),  // derived, not the raw secret
        clientName:  'Admin',
        projectCode: ''
      });
    }

    // Basic email shape check — reject obvious injections early
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Ongeldig e-mailadres' });
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

    return res.status(200).json({
      success:     true,
      apiKey:      user['fldxZMgVXSy7EShDL'] || user['API Key']       || '',
      clientName:  user['fldmKwegSUj1joru3']  || user['Client Name']  || '',
      projectCode: user['fldbrCpBuQjJBfZsv']  || user['Project Code'] || ''
    });

  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(500).json({ error: 'Serverfout. Probeer later opnieuw.' });
  }
};

// Escape double-quotes and backslashes for Airtable formula strings
function escapeFormula(val) {
  return val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
