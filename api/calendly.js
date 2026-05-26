// Single handler for all Calendly routes.
// Routes by URL path:
//   /api/calendly-events          → fetchEvents()
//   /api/calendly-slots           → fetchSlots()
//   /api/calendly-oauth-start     → oauthStart()
//   /api/calendly-oauth-callback  → oauthCallback()
const crypto        = require('crypto');
const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';

// Single 30-second retry for Airtable 429. matches form.js backoff strategy.
// Rapid retries extend Airtable's sustained throttle ban; one 30s wait gives
// the rate-limit window a real chance to clear before the final attempt.
async function atFetch(url, opts) {
  const r1 = await fetch(url, opts);
  if (r1.status !== 429) return r1;
  await new Promise(res => setTimeout(res, 30000));
  return fetch(url, opts);
}

// ── Session token verification (same logic as leads.js) ────────────────────────
function sessionSecret() {
  const base = process.env.SESSION_SECRET || process.env.ADMIN_KEY || 'helvaro-default-v1';
  return crypto.createHmac('sha256', base).update('helvaro-session-v1').digest('hex');
}
function verifySession(token) {
  try {
    if (typeof token !== 'string' || !token.startsWith('hvs1.')) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [, payload, sig] = parts;
    if (!payload || !sig) return null;
    const secret   = sessionSecret();
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    const a = Buffer.from(sig,      'base64url');
    const b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch { return null; }
}

// Resolve the raw Airtable API key from either a signed session token or a
// legacy plaintext key.  Returns null when the input is invalid.
function resolveApiKey(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  if (raw.startsWith('hvs1.')) {
    const session = verifySession(raw);
    return (session && session.apiKey) ? session.apiKey : null;
  }
  return /^[A-Za-z0-9\-_]{8,100}$/.test(raw) ? raw : null;
}

// Timing-safe admin token check (derived HMAC, not the raw key)
function isAdminKey(apiKey) {
  const key = process.env.ADMIN_KEY;
  if (!key || !apiKey) return false;
  const expected = crypto.createHmac('sha256', key).update('helvaro-admin-v1').digest('hex');
  try {
    const a = Buffer.from(apiKey,   'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

// Client record cache keyed by resolved API key. 10 min TTL.
// fetchEvents and fetchSlots both look up the Clients table on every call;
// with the dashboard polling every 90 s this adds a steady Airtable drain.
// The cache eliminates that drain: token refresh (PATCH) still always hits
// Airtable because it writes, not reads.
const _clientTokenCache = new Map();
const CLIENT_CACHE_TTL  = 10 * 60 * 1000;
function getCachedClientRecord(apiKey) {
  const e = _clientTokenCache.get(apiKey);
  if (!e) return null;
  if (Date.now() - e.ts > CLIENT_CACHE_TTL) { _clientTokenCache.delete(apiKey); return null; }
  return e.record;
}
function setCachedClientRecord(apiKey, record) {
  _clientTokenCache.set(apiKey, { record, ts: Date.now() });
}
// Call after a token refresh PATCH so the cache reflects the new tokens.
function patchCachedClientRecord(apiKey, fields) {
  const e = _clientTokenCache.get(apiKey);
  if (!e) return;
  e.record = { ...e.record, fields: { ...e.record.fields, ...fields } };
}

// Rate limiter. 30 req / 60s per IP (calendar ops, not a hot path)
const _rl = new Map();
function isRateLimited(ip) {
  const now = Date.now(), w = 60_000, max = 30;
  const hits = (_rl.get(ip) || []).filter(t => now - t < w);
  hits.push(now);
  _rl.set(ip, hits);
  if (_rl.size > 1000) { for (const [k, v] of _rl) if (!v.some(t => now - t < w)) _rl.delete(k); }
  return hits.length > max;
}

module.exports = async function handler(req, res) {
  const ip   = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    res.setHeader('Access-Control-Allow-Origin', 'https://app.helvaro.pro');
    return res.status(429).json({ error: 'Te veel verzoeken. Probeer later opnieuw.' });
  }

  const path = (req.url || '').split('?')[0];
  if (path.endsWith('calendly-oauth-start'))    return oauthStart(req, res);
  if (path.endsWith('calendly-oauth-callback')) return oauthCallback(req, res);
  if (path.endsWith('calendly-slots'))          return fetchSlots(req, res);
  return fetchEvents(req, res); // default: calendly-events
};

// ─────────────────────────────────────────────────────────────
// 1. FETCH EVENTS
// ─────────────────────────────────────────────────────────────
async function fetchEvents(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://app.helvaro.pro');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const CLIENT_ID      = process.env.CALENDLY_CLIENT_ID;
  const CLIENT_SECRET  = process.env.CALENDLY_CLIENT_SECRET;

  const raw    = String(req.headers['x-api-key'] || '').trim().slice(0, 2048);
  if (!raw) return res.status(401).json({ error: 'API key ontbreekt' });
  const apiKey = resolveApiKey(raw);
  if (!apiKey) return res.status(401).json({ error: 'Ongeldige API key' });
  if (isAdminKey(apiKey)) return res.status(200).json({ events: [], connected: false });

  let recordId, accessToken, refreshToken, tokenExpiry;
  try {
    let client = getCachedClientRecord(apiKey);
    if (!client) {
      const formula = encodeURIComponent(`{API Key}="${escapeFormula(apiKey)}"`);
      const cRes    = await atFetch(
        `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
        { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
      );
      const cData = await cRes.json();
      if (!cData.records || cData.records.length === 0) return res.status(401).json({ error: 'Ongeldige API key' });
      client = cData.records[0];
      setCachedClientRecord(apiKey, client);
    }
    recordId      = client.id;
    accessToken   = client.fields['Calendly Access Token']  || '';
    refreshToken  = client.fields['Calendly Refresh Token'] || '';
    tokenExpiry   = client.fields['Calendly Token Expiry']  || '';
  } catch (err) {
    console.error('calendly fetchEvents auth error:', err.message);
    return res.status(500).json({ error: 'Database fout' });
  }

  if (!accessToken && !refreshToken) return res.status(200).json({ events: [], connected: false });

  // Auto-refresh token if expired
  const isExpired = tokenExpiry && new Date(tokenExpiry) < new Date(Date.now() + 60_000);
  if (isExpired && refreshToken && CLIENT_ID && CLIENT_SECRET) {
    try {
      const tokRes = await fetch('https://auth.calendly.com/oauth/token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    new URLSearchParams({
          grant_type:    'refresh_token',
          refresh_token: refreshToken,
          client_id:     CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }).toString(),
      });
      if (tokRes.ok) {
        const tok       = await tokRes.json();
        accessToken     = tok.access_token;
        const newExpiry = new Date(Date.now() + (tok.expires_in || 7200) * 1000).toISOString();
        const newFields = {
          'Calendly Access Token': accessToken,
          'Calendly Token Expiry': newExpiry,
          ...(tok.refresh_token ? { 'Calendly Refresh Token': tok.refresh_token } : {}),
        };
        // Keep in-memory cache current so the next poll doesn't hit Airtable
        patchCachedClientRecord(apiKey, newFields);
        fetch(`https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${recordId}`, {
          method:  'PATCH',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fields: newFields }),
        }).catch(() => {});
      }
    } catch (e) { console.error('Token refresh error:', e.message); }
  }

  if (!accessToken) return res.status(200).json({ events: [], connected: false });

  const qs       = new URLSearchParams((req.url || '').split('?')[1] || '');
  const minStart = qs.get('min') || new Date().toISOString();
  const maxStart = qs.get('max') || new Date(Date.now() + 7 * 86400000).toISOString();
  const headers  = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

  try {
    const meRes = await fetch('https://api.calendly.com/users/me', { headers });
    if (!meRes.ok) return res.status(200).json({ events: [], connected: true, error: 'Calendly API fout' });
    const userUri = (await meRes.json()).resource?.uri;
    if (!userUri) return res.status(200).json({ events: [], connected: true });

    const evUrl  = `https://api.calendly.com/scheduled_events?user=${encodeURIComponent(userUri)}&status=active&min_start_time=${encodeURIComponent(minStart)}&max_start_time=${encodeURIComponent(maxStart)}&count=100`;
    const evRes  = await fetch(evUrl, { headers });
    if (!evRes.ok) return res.status(200).json({ events: [], connected: true });

    const rawEvents = (await evRes.json()).collection || [];
    const events = await Promise.all(rawEvents.slice(0, 20).map(async ev => {
      let name = '', email = '';
      try {
        const inv = await (await fetch(`${ev.uri}/invitees?count=1`, { headers })).json();
        name  = inv.collection?.[0]?.name  || '';
        email = inv.collection?.[0]?.email || '';
      } catch {}
      return {
        id:            ev.uri,
        name:          name || 'Afspraak',
        email,
        eventType:     ev.name || '',
        startTime:     ev.start_time,
        endTime:       ev.end_time,
        status:        ev.status,
        location:      ev.location?.join_url || ev.location?.location || '',
        cancelUrl:     ev.cancel_url     || '',
        rescheduleUrl: ev.reschedule_url || '',
      };
    }));

    // Cache events for 5 min in the browser. reduces Airtable pressure from
    // repeated dashboard opens within a short window (cold-start instances).
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Vary', 'x-api-key');
    return res.status(200).json({ events, connected: true });
  } catch (err) {
    console.error('Calendly fetch error:', err.message);
    return res.status(200).json({ events: [], connected: true, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// 2. OAUTH START. redirect client to Calendly consent page
// ─────────────────────────────────────────────────────────────
async function oauthStart(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://app.helvaro.pro');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const qs     = new URLSearchParams((req.url || '').split('?')[1] || '');
  const raw    = String(qs.get('key') || '').trim().slice(0, 2048);
  const apiKey = resolveApiKey(raw);  // handles both session tokens and legacy keys

  if (!apiKey) return res.status(400).send('Ongeldige API key');

  const CLIENT_ID    = process.env.CALENDLY_CLIENT_ID;
  const REDIRECT_URI = process.env.CALENDLY_REDIRECT_URI;

  if (!CLIENT_ID || !REDIRECT_URI) {
    return res.status(500).send('Calendly OAuth is niet geconfigureerd door de beheerder.');
  }

  const state   = Buffer.from(apiKey).toString('base64url');
  const authUrl = new URL('https://auth.calendly.com/oauth/authorize');
  authUrl.searchParams.set('client_id',     CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri',  REDIRECT_URI);
  authUrl.searchParams.set('state',         state);

  return res.redirect(302, authUrl.toString());
}

// ─────────────────────────────────────────────────────────────
// 3. OAUTH CALLBACK. exchange code, store tokens in Airtable
// ─────────────────────────────────────────────────────────────
async function oauthCallback(req, res) {
  const qs         = new URLSearchParams((req.url || '').split('?')[1] || '');
  const code       = qs.get('code')  || '';
  const state      = qs.get('state') || '';
  const oauthError = qs.get('error') || '';

  if (oauthError) {
    console.error('Calendly OAuth denied:', oauthError);
    return res.redirect(302, '/dashboard?calendly=denied');
  }
  if (!code || !state) return res.status(400).send('Ongeldige OAuth callback. code of state ontbreekt.');

  let apiKey;
  try {
    apiKey = Buffer.from(state, 'base64url').toString('utf8');
    if (!/^[A-Za-z0-9\-_]{8,100}$/.test(apiKey)) throw new Error('bad format');
  } catch {
    return res.status(400).send('Ongeldige state parameter.');
  }

  const CLIENT_ID      = process.env.CALENDLY_CLIENT_ID;
  const CLIENT_SECRET  = process.env.CALENDLY_CLIENT_SECRET;
  const REDIRECT_URI   = process.env.CALENDLY_REDIRECT_URI;
  const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
  const BASE_ID        = process.env.BASE_AIRTABLE;

  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    return res.status(500).send('Server configuratie ontbreekt.');
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://auth.calendly.com/oauth/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }).toString(),
    });

    if (!tokenRes.ok) {
      console.error('Token exchange failed:', tokenRes.status, await tokenRes.text());
      return res.redirect(302, '/dashboard?calendly=error');
    }

    const tok          = await tokenRes.json();
    const accessToken  = tok.access_token;
    const refreshToken = tok.refresh_token;
    const expiryISO    = new Date(Date.now() + (tok.expires_in || 7200) * 1000).toISOString();

    // Find client record
    const formula = encodeURIComponent(`{API Key}="${escapeFormula(apiKey)}"`);
    const cRes    = await atFetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );
    const cData = await cRes.json();
    if (!cData.records || cData.records.length === 0) {
      return res.status(404).send('Client niet gevonden in de database.');
    }
    const recordId = cData.records[0].id;

    // Store tokens
    const patchRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${recordId}`,
      {
        method:  'PATCH',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fields: {
          'Calendly Access Token':  accessToken,
          'Calendly Refresh Token': refreshToken,
          'Calendly Token Expiry':  expiryISO,
        }}),
      }
    );

    if (!patchRes.ok) {
      console.error('Airtable PATCH failed:', patchRes.status, await patchRes.text());
      return res.redirect(302, '/dashboard?calendly=save_error');
    }

    return res.redirect(302, '/dashboard?calendly=connected');
  } catch (err) {
    console.error('OAuth callback error:', err.message);
    return res.redirect(302, '/dashboard?calendly=error');
  }
}

function escapeFormula(val) {
  return String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ─────────────────────────────────────────────────────────────
// 4. FETCH SLOTS. available times for a given date
// GET /api/calendly-slots?date=YYYY-MM-DD[&event_type=uri]
// ─────────────────────────────────────────────────────────────
async function fetchSlots(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://app.helvaro.pro');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const CLIENT_ID      = process.env.CALENDLY_CLIENT_ID;
  const CLIENT_SECRET  = process.env.CALENDLY_CLIENT_SECRET;

  const raw    = String(req.headers['x-api-key'] || '').trim().slice(0, 2048);
  const apiKey = resolveApiKey(raw);
  if (!apiKey) return res.status(401).json({ error: 'Ongeldige API key' });
  if (isAdminKey(apiKey)) return res.status(200).json({ connected: false, eventTypes: [], slots: [] });

  let accessToken, refreshToken, tokenExpiry, recordId;
  try {
    let client = getCachedClientRecord(apiKey);
    if (!client) {
      const formula = encodeURIComponent(`{API Key}="${escapeFormula(apiKey)}"`);
      const cRes    = await atFetch(
        `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
        { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
      );
      const cData = await cRes.json();
      if (!cData.records?.length) return res.status(401).json({ error: 'Ongeldige API key' });
      client = cData.records[0];
      setCachedClientRecord(apiKey, client);
    }
    recordId      = client.id;
    accessToken   = client.fields['Calendly Access Token']  || '';
    refreshToken  = client.fields['Calendly Refresh Token'] || '';
    tokenExpiry   = client.fields['Calendly Token Expiry']  || '';
  } catch (err) {
    console.error('calendly-slots auth:', err.message);
    return res.status(500).json({ error: 'Database fout' });
  }

  if (!accessToken && !refreshToken) {
    return res.status(200).json({ connected: false, eventTypes: [], slots: [] });
  }

  // Auto-refresh token if expired
  const isExpired = tokenExpiry && new Date(tokenExpiry) < new Date(Date.now() + 60_000);
  if (isExpired && refreshToken && CLIENT_ID && CLIENT_SECRET) {
    try {
      const tokRes = await fetch('https://auth.calendly.com/oauth/token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    new URLSearchParams({
          grant_type:    'refresh_token',
          refresh_token: refreshToken,
          client_id:     CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }).toString(),
      });
      if (tokRes.ok) {
        const tok       = await tokRes.json();
        accessToken     = tok.access_token;
        const newExpiry = new Date(Date.now() + (tok.expires_in || 7200) * 1000).toISOString();
        const newFields = {
          'Calendly Access Token':  accessToken,
          'Calendly Token Expiry':  newExpiry,
          ...(tok.refresh_token ? { 'Calendly Refresh Token': tok.refresh_token } : {}),
        };
        patchCachedClientRecord(apiKey, newFields);
        fetch(`https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${recordId}`, {
          method:  'PATCH',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fields: newFields }),
        }).catch(() => {});
      }
    } catch (e) { console.error('Token refresh:', e.message); }
  }

  if (!accessToken) {
    return res.status(200).json({ connected: false, eventTypes: [], slots: [] });
  }

  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  const qs      = new URLSearchParams((req.url || '').split('?')[1] || '');
  const dateStr = qs.get('date') || new Date().toISOString().slice(0, 10);
  const reqType = qs.get('event_type') || '';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({ error: 'Ongeldig datum formaat (gebruik YYYY-MM-DD)' });
  }

  try {
    const meRes = await fetch('https://api.calendly.com/users/me', { headers });
    if (!meRes.ok) return res.status(200).json({ connected: true, eventTypes: [], slots: [] });
    const userUri = (await meRes.json()).resource?.uri;
    if (!userUri)  return res.status(200).json({ connected: true, eventTypes: [], slots: [] });

    const etRes  = await fetch(`https://api.calendly.com/event_types?user=${encodeURIComponent(userUri)}&active=true&count=20`, { headers });
    const etData = etRes.ok ? await etRes.json() : { collection: [] };
    const eventTypes = (etData.collection || []).map(et => ({
      uri:        et.uri,
      name:       et.name,
      duration:   et.duration,
      slug:       et.slug,
      bookingUrl: et.scheduling_url,
      color:      et.color || null,
    }));

    if (!eventTypes.length) {
      return res.status(200).json({ connected: true, eventTypes: [], slots: [] });
    }

    const targetUri = reqType && eventTypes.find(e => e.uri === reqType) ? reqType : eventTypes[0].uri;
    const dayStart  = dateStr + 'T00:00:00.000Z';
    const dayEnd    = dateStr + 'T23:59:59.000Z';

    const slotsRes  = await fetch(
      `https://api.calendly.com/event_type_available_times` +
      `?event_type=${encodeURIComponent(targetUri)}` +
      `&start_time=${encodeURIComponent(dayStart)}` +
      `&end_time=${encodeURIComponent(dayEnd)}`,
      { headers }
    );
    const slotsData = slotsRes.ok ? await slotsRes.json() : { collection: [] };
    const slots = (slotsData.collection || [])
      .filter(s => s.status === 'available')
      .map(s => ({ startTime: s.start_time, inviteesRemaining: s.invitees_remaining ?? 1 }));

    // Cache slots for 2 min. available times change infrequently within a day.
    res.setHeader('Cache-Control', 'private, max-age=120');
    res.setHeader('Vary', 'x-api-key');
    return res.status(200).json({ connected: true, eventTypes, selectedEventType: targetUri, slots });
  } catch (err) {
    console.error('calendly-slots fetch:', err.message);
    return res.status(200).json({ connected: true, eventTypes: [], slots: [], error: err.message });
  }
}
