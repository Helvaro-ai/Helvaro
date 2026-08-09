// ── Session transport ────────────────────────────────────────────────────────
// Where the session token LIVES, separate from how it is signed (that stays in
// api/auth.js) and how it is verified (api/leads.js verifySession).
//
// The token used to be handed to the browser as JSON and kept in localStorage,
// then sent back on every call as an x-api-key header. That means any XSS
// anywhere in the dashboard — one bad innerHTML in ~17k lines — can read a
// working 7-day session and exfiltrate it. Nothing else in the stack can
// mitigate that, because JavaScript is allowed to read its own localStorage.
//
// So the token now travels as an httpOnly cookie: script cannot read it, and
// the browser attaches it automatically. Two consequences handled here:
//
//   1. Cookies are sent automatically, including on requests a third-party site
//      triggers — that is CSRF. SameSite=Lax already blocks the cross-site POST
//      case, but we double-submit a CSRF token as defence in depth.
//   2. The header path cannot simply be deleted: existing logged-in sessions,
//      and any non-browser caller, still send x-api-key. readToken() accepts
//      both, cookie first. Header-authenticated requests are inherently
//      CSRF-safe (a cross-origin page cannot set a custom header without our
//      CORS approval), so CSRF is only enforced when the cookie was used.

const crypto = require('crypto');

const SESSION_COOKIE = 'hv_session';
const CSRF_COOKIE    = 'hv_csrf';
const CSRF_HEADER    = 'x-csrf-token';
const MAX_AGE_S      = 7 * 24 * 60 * 60;   // matches SESSION_TTL_MS in auth.js

function parseCookies(req) {
  const out = {};
  const raw = (req && req.headers && req.headers.cookie) || '';
  for (const part of String(raw).split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); }
    catch { out[k] = part.slice(i + 1).trim(); }
  }
  return out;
}

// Cookie first, then the legacy header. Returns '' when neither is present.
function readToken(req) {
  const fromCookie = parseCookies(req)[SESSION_COOKIE];
  if (fromCookie) return String(fromCookie).trim().slice(0, 2048);
  return String((req && req.headers && req.headers['x-api-key']) || '').trim().slice(0, 2048);
}

function authedViaCookie(req) {
  return !!parseCookies(req)[SESSION_COOKIE];
}

// Appends rather than overwrites: a handler may already have queued a cookie.
function appendCookie(res, value) {
  const prev = res.getHeader ? res.getHeader('Set-Cookie') : null;
  const list = !prev ? [] : (Array.isArray(prev) ? prev.slice() : [prev]);
  list.push(value);
  res.setHeader('Set-Cookie', list);
}

// Secure is unconditional: the app is HTTPS-only in every environment it runs
// in, and a session cookie without it can be stripped to plain HTTP.
// SameSite=Lax rather than Strict because the Google Calendar OAuth callback
// returns via a top-level cross-site redirect and Strict would drop the session
// exactly there, logging the user out mid-connect.
function setSessionCookies(res, token) {
  const csrf = crypto.randomBytes(24).toString('base64url');
  appendCookie(res, `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_S}`);
  // Deliberately NOT httpOnly — the page has to read this one to echo it back
  // in a header. That is the whole double-submit mechanism, and it is safe:
  // knowing your own CSRF token does not help an attacker who cannot read it
  // from another origin.
  appendCookie(res, `${CSRF_COOKIE}=${csrf}; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_S}`);
  return csrf;
}

function clearSessionCookies(res) {
  appendCookie(res, `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  appendCookie(res, `${CSRF_COOKIE}=; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}

function safeEqual(a, b) {
  try {
    const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}

// True when the request may proceed. Only cookie-authenticated, state-changing
// requests are checked; everything else is either read-only or immune.
function csrfOk(req) {
  const method = String((req && req.method) || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  if (!authedViaCookie(req)) return true;   // header auth: not forgeable cross-origin
  const cookie = parseCookies(req)[CSRF_COOKIE] || '';
  const header = String((req.headers && req.headers[CSRF_HEADER]) || '');
  return !!cookie && safeEqual(cookie, header);
}

// Verifies a session token signed by auth.js and returns its payload, or null.
// This is the same check api/leads.js does inline; it lives here so endpoints
// that only need "is this a real session?" (and not the full tenant-resolution
// pipeline) can ask without accepting any non-empty string as proof of login.
//
// Fails closed on a missing secret: verifying with a known constant would
// accept forged tokens for every tenant at once.
function verifySignedSession(token) {
  if (typeof token !== 'string' || !token.startsWith('hvs1.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, payload, sig] = parts;
  if (!payload || !sig) return null;

  const base = process.env.SESSION_SECRET || process.env.ADMIN_KEY;
  if (!base) {
    console.error('[session] SESSION_SECRET/ADMIN_KEY ontbreekt — sessies kunnen niet geverifieerd worden');
    return null;
  }
  const secret = crypto.createHmac('sha256', base).update('helvaro-session-v1').digest('hex');

  try {
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    const a = Buffer.from(sig,      'base64url');
    const b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    // A token without exp is malformed, not immortal — auth.js always sets it.
    if (typeof data.exp !== 'number' || !isFinite(data.exp) || Date.now() > data.exp) return null;
    return data;
  } catch { return null; }
}

module.exports = {
  SESSION_COOKIE, CSRF_COOKIE, CSRF_HEADER,
  parseCookies, readToken, authedViaCookie,
  setSessionCookies, clearSessionCookies, csrfOk,
  verifySignedSession,
};
