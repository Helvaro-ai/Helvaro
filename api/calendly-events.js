// Fetches scheduled Calendly events for the authenticated client.
// Uses OAuth tokens stored in Airtable; auto-refreshes expired access tokens.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const AIRTABLE_TOKEN = process.env.API_Airtable;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const CLIENTS_TABLE  = 'tblPidTrwGRzRt4LZ';
  const CLIENT_ID      = process.env.CALENDLY_CLIENT_ID;
  const CLIENT_SECRET  = process.env.CALENDLY_CLIENT_SECRET;

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const apiKey = String(req.headers['x-api-key'] || '').trim().slice(0, 100);
  if (!apiKey) return res.status(401).json({ error: 'API key ontbreekt' });
  if (!/^[A-Za-z0-9\-_]{8,100}$/.test(apiKey)) return res.status(401).json({ error: 'Ongeldige API key' });
  if (process.env.ADMIN_KEY && apiKey === process.env.ADMIN_KEY) {
    return res.status(200).json({ events: [], connected: false });
  }

  // ── Look up client + Calendly tokens ─────────────────────────────────────────
  let recordId, accessToken, refreshToken, tokenExpiry, clientCalendlyUrl;
  try {
    const formula = encodeURIComponent(`{API Key}="${escapeFormula(apiKey)}"`);
    const cRes    = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );
    const cData = await cRes.json();
    if (!cData.records || cData.records.length === 0) return res.status(401).json({ error: 'Ongeldige API key' });

    const client      = cData.records[0];
    recordId          = client.id;
    accessToken       = client.fields['Calendly Access Token']  || '';
    refreshToken      = client.fields['Calendly Refresh Token'] || '';
    tokenExpiry       = client.fields['Calendly Token Expiry']  || '';
    clientCalendlyUrl = client.fields['fldNEj1ysRgINOOtr']      || client.fields['Calendly Link'] || '';
  } catch (err) {
    console.error('calendly-events auth error:', err.message);
    return res.status(500).json({ error: 'Database fout' });
  }

  if (!accessToken && !refreshToken) {
    return res.status(200).json({ events: [], connected: false });
  }

  // ── Auto-refresh token if expired ────────────────────────────────────────────
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
        const tok      = await tokRes.json();
        accessToken    = tok.access_token;
        const newExpiry = new Date(Date.now() + (tok.expires_in || 7200) * 1000).toISOString();

        // Persist refreshed token back to Airtable (fire-and-forget)
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
    } catch (e) {
      console.error('Token refresh error:', e.message);
    }
  }

  if (!accessToken) return res.status(200).json({ events: [], connected: false });

  // ── Date range ───────────────────────────────────────────────────────────────
  const qs       = new URLSearchParams((req.url || '').split('?')[1] || '');
  const minStart = qs.get('min') || new Date().toISOString();
  const maxStart = qs.get('max') || new Date(Date.now() + 7 * 86400000).toISOString();

  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

  try {
    // 1. Get user URI
    const meRes = await fetch('https://api.calendly.com/users/me', { headers });
    if (!meRes.ok) {
      console.error('Calendly /users/me error:', meRes.status);
      return res.status(200).json({ events: [], connected: true, error: 'Calendly API fout' });
    }
    const userUri = (await meRes.json()).resource?.uri;
    if (!userUri) return res.status(200).json({ events: [], connected: true });

    // 2. Fetch scheduled events
    const evUrl = `https://api.calendly.com/scheduled_events?user=${encodeURIComponent(userUri)}&status=active&min_start_time=${encodeURIComponent(minStart)}&max_start_time=${encodeURIComponent(maxStart)}&count=100`;
    const evRes = await fetch(evUrl, { headers });
    if (!evRes.ok) return res.status(200).json({ events: [], connected: true });

    const rawEvents = (await evRes.json()).collection || [];

    // 3. Fetch invitee names in parallel (max 20)
    const events = await Promise.all(rawEvents.slice(0, 20).map(async ev => {
      let name = '', email = '';
      try {
        const inv = await (await fetch(`${ev.uri}/invitees?count=1`, { headers })).json();
        name  = inv.collection?.[0]?.name  || '';
        email = inv.collection?.[0]?.email || '';
      } catch {}
      return {
        id:           ev.uri,
        name:         name || 'Afspraak',
        email,
        eventType:    ev.name || '',
        startTime:    ev.start_time,
        endTime:      ev.end_time,
        status:       ev.status,
        location:     ev.location?.join_url || ev.location?.location || '',
        cancelUrl:    ev.cancel_url    || '',
        rescheduleUrl: ev.reschedule_url || '',
      };
    }));

    return res.status(200).json({ events, connected: true });

  } catch (err) {
    console.error('Calendly fetch error:', err.message);
    return res.status(200).json({ events: [], connected: true, error: err.message });
  }
};

function escapeFormula(val) {
  return String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
