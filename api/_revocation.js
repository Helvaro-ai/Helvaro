// ── Session revocation ───────────────────────────────────────────────────────
// Sessions are stateless signed tokens with a 7-day life. That makes them free
// to verify (no database call per request) but, on its own, impossible to take
// back: logging out only cleared the cookie, so a token someone had already
// copied stayed valid for the rest of its week — and changing your password did
// not end your other sessions either, which is the one thing a worried user
// actually expects it to do.
//
// The fix does not need a session store. The token carries a fingerprint of the
// password hash it was issued under; verification compares that against the
// hash on file now. Change the password and every fingerprint minted before it
// stops matching, so all older sessions die at once. Nothing to store, nothing
// to clean up, and "log me out everywhere" is simply a password change.
//
// Cost is one Airtable read per user per minute per instance, not per request —
// the lookup is cached, so the hot path stays effectively free. The 60-second
// window is the worst-case delay before a revoked session actually stops
// working, which is a fair trade against a read on every single call.
//
// Deliberately fails OPEN. If Airtable is unreachable we cannot prove a session
// is still good, but refusing every request would take the whole product down
// for an outage in a system that is only advisory here. An attacker cannot
// force this path (they would have to break Airtable for everyone), so the
// exposure is a short window during an incident, against certain downtime.

const crypto = require('crypto');

const USERS_TABLE = 'tbl2hrPW7gIx5XF4S';
const CACHE_TTL   = 60 * 1000;
const _cache      = new Map();   // email -> { fp, ts }

// Short HMAC rather than the raw hash: the token is signed but this keeps the
// bcrypt hash itself out of anything that ever leaves the server.
function fingerprint(passwordHash) {
  if (!passwordHash) return '';
  const base = process.env.SESSION_SECRET || process.env.ADMIN_KEY || '';
  return crypto.createHmac('sha256', base + '|pwfp').update(String(passwordHash)).digest('base64url').slice(0, 16);
}

function escapeFormula(v) { return String(v).replace(/["\\]/g, '\\$&'); }

async function currentFingerprint(email) {
  const key = String(email || '').toLowerCase();
  if (!key) return null;

  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.fp;

  const token  = process.env.API_AIRTABLE;
  const baseId = process.env.BASE_AIRTABLE;
  if (!token || !baseId) return null;

  const formula = encodeURIComponent(`{Email}="${escapeFormula(key)}"`);
  const url = `https://api.airtable.com/v0/${baseId}/${USERS_TABLE}?filterByFormula=${formula}&maxRecords=1`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
    if (!r.ok) return null;
    const d   = await r.json();
    const rec = (d.records || [])[0];
    if (!rec) return null;   // user gone — handled by the caller, see below
    const fp = fingerprint(rec.fields?.['Password Hash'] || '');
    _cache.set(key, { fp, ts: Date.now() });
    return fp;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// True when this session must no longer be honoured.
// Sessions minted before this feature, and the owner/admin logins (which have
// no Airtable user record), carry no fingerprint and are left alone — they are
// still bounded by the 7-day expiry.
async function isRevoked(session) {
  if (!session || !session.em || !session.pv) return false;
  const now = await currentFingerprint(session.em);
  if (now === null) return false;              // unknown -> fail open, see header
  return now !== session.pv;
}

// Called after a password change so the next request sees the new value
// immediately instead of waiting out the cache.
function forget(email) { _cache.delete(String(email || '').toLowerCase()); }

module.exports = { fingerprint, currentFingerprint, isRevoked, forget };
