'use strict';
/*
 * Google Calendar OAuth + connection management for Helvaro (per-client).
 *
 * Routes (Vercel serves this at /api/gcal):
 *   GET  /api/gcal?action=connect         -> redirect the logged-in client to Google consent
 *   GET  /api/gcal?action=callback&code=&state= -> store the client's refresh token, back to dashboard
 *   POST /api/gcal  { mode: 'status' }     -> { connected, email }
 *   POST /api/gcal  { mode: 'disconnect' } -> clear the client's Google connection
 *
 * Additive & safe: touching this never affects clients who haven't connected Google.
 * The heavy lifting (token exchange, encryption, calendar calls) lives in _gcal.js.
 */
const crypto = require('crypto');
const gcal   = require('./_gcal');

const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';
const F_PROJECT     = 'fldN4dL0bGgfBOXwM';       // Project Code (field ID, rename-proof)
// New fields on the Klanten table (written by NAME + typecast, so no field-ID lookup needed):
const F_REFRESH     = 'Google Refresh Token';
const F_GEMAIL      = 'Google Calendar Email';
const F_CALID       = 'Google Calendar ID';

const STATE_TTL_MS = 10 * 60 * 1000; // OAuth round-trip must complete within 10 min

// ── Session verification (mirrors auth.js / leads.js — fail closed) ─────────────
function sessionSecret() {
  const base = process.env.SESSION_SECRET || process.env.ADMIN_KEY;
  if (!base) throw new Error('SESSION_SECRET (or ADMIN_KEY) is not configured');
  return crypto.createHmac('sha256', base).update('helvaro-session-v1').digest('hex');
}
function verifySession(token) {
  try {
    if (typeof token !== 'string' || !token.startsWith('hvs1.')) return null;
    const [, payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
    const a = Buffer.from(sig, 'base64url'), b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch { return null; }
}
function readSessionToken(req) {
  const hdr = String(req.headers['x-api-key'] || '').trim();
  if (hdr && hdr !== 'HV_COOKIE_SESSION') return hdr;
  const m = String(req.headers['cookie'] || '').match(/(?:^|;\s*)hv_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}
// Resolve the calling client's projectCode from their session.
function callerProject(req) {
  const s = verifySession(readSessionToken(req));
  return s && s.projectCode ? s.projectCode : '';
}

// ── Signed OAuth state (prevents an attacker binding their calendar to another tenant) ──
function signState(projectCode) {
  const payload = Buffer.from(JSON.stringify({ p: projectCode, t: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifyState(state) {
  try {
    const [payload, sig] = String(state || '').split('.');
    if (!payload || !sig) return '';
    const expected = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
    const a = Buffer.from(sig, 'base64url'), b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return '';
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.p || !data.t || Date.now() - data.t > STATE_TTL_MS) return '';
    return data.p;
  } catch { return ''; }
}

// ── Airtable helpers (Klanten table) ────────────────────────────────────────────
function atCreds() {
  return { token: process.env.API_AIRTABLE, base: process.env.BASE_AIRTABLE };
}
async function getClientByProject(projectCode) {
  const { token, base } = atCreds();
  const safe = String(projectCode).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const formula = encodeURIComponent(`{${F_PROJECT}}="${safe}"`);
  const r = await fetch(
    `https://api.airtable.com/v0/${base}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) return null;
  const d = await r.json();
  return (d.records || [])[0] || null;
}
async function patchClient(recordId, fields) {
  const { token, base } = atCreds();
  return fetch(`https://api.airtable.com/v0/${base}/${CLIENTS_TABLE}/${recordId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields, typecast: true }),
  });
}

function redirect(res, url) { res.statusCode = 302; res.setHeader('Location', url); res.end(); }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://app.helvaro.pro');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!gcal.isConfigured()) {
    // Not set up yet — behave gracefully rather than 500.
    if (req.method === 'GET') return redirect(res, '/dashboard?gcal=unconfigured');
    return res.status(200).json({ connected: false, configured: false });
  }

  const url    = new URL(req.url, 'https://app.helvaro.pro');
  const action = url.searchParams.get('action') || '';

  // ── GET connect: send the logged-in client to Google (cookie carries auth) ─
  if (req.method === 'GET' && action === 'connect') {
    const projectCode = callerProject(req);
    if (!projectCode) return redirect(res, '/dashboard?gcal=login_required');
    return redirect(res, gcal.getAuthUrl(signState(projectCode)));
  }

  // ── GET callback: Google returns here with ?code & ?state ─────────────────
  if (req.method === 'GET' && action === 'callback') {
    const err = url.searchParams.get('error');
    if (err) return redirect(res, '/dashboard?gcal=denied');
    const code = url.searchParams.get('code');
    const projectCode = verifyState(url.searchParams.get('state'));
    if (!code || !projectCode) return redirect(res, '/dashboard?gcal=invalid_state');
    try {
      const { refreshToken, email } = await gcal.exchangeCode(code);
      const client = await getClientByProject(projectCode);
      if (!client) return redirect(res, '/dashboard?gcal=client_not_found');
      const fields = { [F_GEMAIL]: email || '', [F_CALID]: 'primary' };
      // Google only returns a refresh token on first consent. If present, store it
      // (encrypted). If absent, keep whatever we already had.
      if (refreshToken) fields[F_REFRESH] = gcal.encryptToken(refreshToken);
      await patchClient(client.id, fields);
      return redirect(res, '/dashboard?gcal=connected');
    } catch (e) {
      console.error('[gcal callback]', e && e.message);
      return redirect(res, '/dashboard?gcal=error');
    }
  }

  // ── POST status / disconnect ──────────────────────────────────────────────
  if (req.method === 'POST') {
    const projectCode = callerProject(req);
    if (!projectCode) return res.status(401).json({ error: 'Niet ingelogd' });
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};

    if (body.mode === 'status') {
      const client = await getClientByProject(projectCode);
      const f = (client && client.fields) || {};
      return res.status(200).json({
        configured: true,
        connected:  !!f[F_REFRESH],
        email:      f[F_GEMAIL] || '',
      });
    }

    if (body.mode === 'disconnect') {
      const client = await getClientByProject(projectCode);
      if (client) await patchClient(client.id, { [F_REFRESH]: '', [F_GEMAIL]: '' });
      return res.status(200).json({ ok: true, connected: false });
    }

    return res.status(400).json({ error: 'Onbekende mode' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
