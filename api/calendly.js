// Single handler for all Calendly routes.
// Routes by URL path:
//   /api/calendly-events          → fetchEvents()
//   /api/calendly-oauth-start     → oauthStart()
//   /api/calendly-oauth-callback  → oauthCallback()
const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';

module.exports = async function handler(req, res) {
  const path = (req.url || '').split('?')[0];

  if (path.endsWith('calendly-oauth-start'))    return oauthStart(req, res);
  if (path.endsWith('calendly-oauth-callback')) return oauthCallback(req, res);
  return fetchEvents(req, res); // default: calendly-events
};

// ─────────────────────────────────────────────────────────────
// 1. FETCH EVENTS
// ─────────────────────────────────────────────────────────────
async function fetchEvents(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const AIRTABLE_TOKEN = process.env.API_Airtable;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const CLIENT_ID      = process.env.CALENDLY_CLIENT_ID;
  const CLIENT_SECRET  = process.env.CALENDLY_CLIENT_SECRET;

  const apiKey = String(req.headers['x-api-key'] || '').trim().slice(0, 100);
  if (!apiKey) return res.status(401).json({ error: 'API key ontbreekt' });
  if (!/^[A-Za-z0-9\-_]{8,100}$/.test(apiKey)) return res.status(401).json({ error: 'Ongeldige API key' });
  if (process.env.ADMIN_KEY && apiKey === process.env.ADMIN_KEY) {
    return res.status(200).json({ events: [], connected: false });
  }

  let recordId, accessToken, refreshToken, tokenExpiry;
  try {
    const formula = encodeURIComponent(`{API Key}="${escapeFormula(apiKey)}"`);
    const cRes    = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );
    const cData = await cRes.json();
    if (!cData.records || cData.records.length === 0) return res.status(401).json({ error: 'Ongeldige API key' });

    const client  = cData.records[0];
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
        fetch(`https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${recordId}`, {
          method:  'PATCH',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fields: {
            'Calendly Access Token': accessToken,
            'Calendly Token Expiry': newExpiry,
            ...(tok.refresh_token ? { 'Calendly Refresh Token': tok.refresh_token } : {}),
          }}),
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

    return res.status(200).json({ events, connected: true });
  } catch (err) {
    console.error('Calendly fetch error:', err.message);
    return res.status(200).json({ events: [], connected: true, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// 2. OAUTH START — redirect client to Calendly consent page
// ─────────────────────────────────────────────────────────────
async function oauthStart(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const qs     = new URLSearchParams((req.url || '').split('?')[1] || '');
  const apiKey = String(qs.get('key') || '').trim().slice(0, 100);

  if (!apiKey || !/^[A-Za-z0-9\-_]{8,100}$/.test(apiKey)) {
    return res.status(400).send('Ongeldige API key');
  }

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
// 3. OAUTH CALLBACK — exchange code, store tokens in Airtable
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
  if (!code || !state) return res.status(400).send('Ongeldige OAuth callback — code of state ontbreekt.');

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
  const AIRTABLE_TOKEN = process.env.API_Airtable;
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
    const cRes    = await fetch(
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
