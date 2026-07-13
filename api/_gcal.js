'use strict';
/*
 * Google Calendar engine for Helvaro (per-client OAuth).
 *
 * WHAT THIS IS: a self-contained helper that lets each Helvaro client connect
 * their own Google Calendar. Once connected we can (a) read their free/busy so
 * the WhatsApp AI never proposes a slot they're already busy on, and (b) write
 * every booked appointment into their Google Calendar as a real event.
 *
 * IMPORTANT — additive & fail-soft by design:
 *   - A client that has NOT connected Google has NO refresh token, so every
 *     function here short-circuits and the existing Airtable-only calendar +
 *     WhatsApp booking behave exactly as before. Google is a layer on top.
 *   - Every network call is best-effort. Google being slow or down must NEVER
 *     block a booking or a WhatsApp reply. Callers treat failures as "no Google".
 *
 * REQUIRED ENV (set in Vercel before this does anything):
 *   GOOGLE_CLIENT_ID       OAuth 2.0 Web client ID (Google Cloud Console)
 *   GOOGLE_CLIENT_SECRET   OAuth 2.0 client secret
 *   GOOGLE_REDIRECT_URI    e.g. https://app.helvaro.pro/api/gcal?action=callback
 *   GOOGLE_TOKEN_KEY       (optional) key for encrypting stored refresh tokens.
 *                          Falls back to SESSION_SECRET / ADMIN_KEY. Fails closed
 *                          if none is set (never store tokens with a known key).
 *
 * Filename starts with '_' so Vercel does NOT expose it as a route.
 */
const crypto = require('crypto');

const OAUTH_AUTH   = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN  = 'https://oauth2.googleapis.com/token';
const CAL_BASE     = 'https://www.googleapis.com/calendar/v3';
// events = create/patch/delete events; readonly = free/busy across their calendars;
// email/openid = learn which Google account connected (for display only).
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

function isConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && redirectUri());
}
function redirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || '';
}

// ── Refresh-token encryption (AES-256-GCM) ──────────────────────────────────────
// The refresh token is long-lived and grants calendar access, so it is encrypted
// at rest (Airtable stores only ciphertext). Fail closed: never encrypt/decrypt
// with a default constant.
function encKey() {
  const base = process.env.GOOGLE_TOKEN_KEY || process.env.SESSION_SECRET || process.env.ADMIN_KEY;
  if (!base) throw new Error('No GOOGLE_TOKEN_KEY / SESSION_SECRET / ADMIN_KEY set — refusing to handle Google tokens with a default key');
  return crypto.createHash('sha256').update(String(base) + ':gcal-token-v1').digest(); // 32 bytes
}
function encryptToken(plain) {
  const iv  = crypto.randomBytes(12);
  const c   = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const ct  = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return 'v1:' + Buffer.concat([iv, tag, ct]).toString('base64');
}
function decryptToken(stored) {
  const s = String(stored || '');
  if (!s.startsWith('v1:')) return ''; // not encrypted / empty
  try {
    const raw = Buffer.from(s.slice(3), 'base64');
    const iv  = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct  = raw.subarray(28);
    const d   = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  } catch (err) {
    console.error('[gcal] token decrypt failed:', err && err.message);
    return '';
  }
}

// ── OAuth flow ──────────────────────────────────────────────────────────────────
function getAuthUrl(state) {
  const p = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  redirectUri(),
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',   // needed to receive a refresh_token
    prompt:        'consent',   // force refresh_token even on re-consent
    include_granted_scopes: 'true',
    state,
  });
  return `${OAUTH_AUTH}?${p.toString()}`;
}

// Exchange the one-time auth code for tokens. Returns { refreshToken, accessToken, email }.
async function exchangeCode(code) {
  const body = new URLSearchParams({
    code,
    client_id:     process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri:  redirectUri(),
    grant_type:    'authorization_code',
  });
  const r = await fetch(OAUTH_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error('token exchange failed: ' + (d.error_description || d.error || r.status));
  let email = '';
  try {
    if (d.id_token) {
      const payload = JSON.parse(Buffer.from(d.id_token.split('.')[1], 'base64').toString('utf8'));
      email = payload.email || '';
    }
  } catch { /* email is display-only, ignore */ }
  return { refreshToken: d.refresh_token || '', accessToken: d.access_token, email };
}

// Trade a stored refresh token for a short-lived access token.
async function getAccessToken(refreshToken) {
  if (!refreshToken) return '';
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id:     process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    grant_type:    'refresh_token',
  });
  const r = await fetch(OAUTH_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error('refresh failed: ' + (d.error || r.status));
  return d.access_token;
}

// ── Calendar operations ─────────────────────────────────────────────────────────
// Returns busy intervals [{start,end}] for a window. Empty array on any failure.
async function freeBusy(accessToken, calendarId, timeMinISO, timeMaxISO) {
  try {
    const r = await fetch(`${CAL_BASE}/freeBusy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeMin: timeMinISO, timeMax: timeMaxISO, items: [{ id: calendarId || 'primary' }] }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return [];
    const cal = (d.calendars || {})[calendarId || 'primary'] || {};
    return Array.isArray(cal.busy) ? cal.busy : [];
  } catch { return []; }
}

// True if [startISO, startISO+duration) overlaps NO busy interval. On failure
// returns true (fail-open: don't lose a booking because Google was unreachable).
async function isSlotFree(accessToken, calendarId, startISO, durationMin) {
  const start = new Date(startISO).getTime();
  const end   = start + (parseInt(durationMin) || 30) * 60000;
  const busy  = await freeBusy(accessToken, calendarId, new Date(start).toISOString(), new Date(end).toISOString());
  return !busy.some(b => {
    const bs = new Date(b.start).getTime(), be = new Date(b.end).getTime();
    return start < be && end > bs; // overlap
  });
}

function eventBody({ summary, description, startISO, durationMin, timeZone }) {
  const start = new Date(startISO);
  const end   = new Date(start.getTime() + (parseInt(durationMin) || 30) * 60000);
  const tz = timeZone || 'Europe/Brussels';
  return {
    summary:     summary || 'Afspraak (Helvaro)',
    description: description || '',
    start: { dateTime: start.toISOString(), timeZone: tz },
    end:   { dateTime: end.toISOString(),   timeZone: tz },
  };
}

// Create an event. Returns { ok, eventId? , error? }. Never throws.
async function createEvent(accessToken, calendarId, ev) {
  try {
    const r = await fetch(`${CAL_BASE}/calendars/${encodeURIComponent(calendarId || 'primary')}/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody(ev)),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: d.error?.message || ('http ' + r.status) };
    return { ok: true, eventId: d.id };
  } catch (err) { return { ok: false, error: err.message }; }
}

async function updateEvent(accessToken, calendarId, eventId, ev) {
  if (!eventId) return { ok: false, error: 'no eventId' };
  try {
    const r = await fetch(`${CAL_BASE}/calendars/${encodeURIComponent(calendarId || 'primary')}/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody(ev)),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: d.error?.message || ('http ' + r.status) };
    return { ok: true, eventId: d.id };
  } catch (err) { return { ok: false, error: err.message }; }
}

async function deleteEvent(accessToken, calendarId, eventId) {
  if (!eventId) return { ok: false, error: 'no eventId' };
  try {
    const r = await fetch(`${CAL_BASE}/calendars/${encodeURIComponent(calendarId || 'primary')}/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok && r.status !== 410 && r.status !== 404) { // 410/404 = already gone, treat as success
      return { ok: false, error: 'http ' + r.status };
    }
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

module.exports = {
  isConfigured, getAuthUrl, exchangeCode, getAccessToken,
  encryptToken, decryptToken,
  freeBusy, isSlotFree, createEvent, updateEvent, deleteEvent,
  SCOPES,
};
