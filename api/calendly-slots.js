// GET /api/calendly-slots?date=YYYY-MM-DD[&event_type=uri]
// Returns available time slots for a given date from Calendly API.
const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const AIRTABLE_TOKEN = process.env.API_Airtable;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const CLIENT_ID      = process.env.CALENDLY_CLIENT_ID;
  const CLIENT_SECRET  = process.env.CALENDLY_CLIENT_SECRET;

  const apiKey = String(req.headers['x-api-key'] || '').trim().slice(0, 100);
  if (!apiKey || !/^[A-Za-z0-9\-_]{8,100}$/.test(apiKey)) {
    return res.status(401).json({ error: 'Ongeldige API key' });
  }
  if (process.env.ADMIN_KEY && apiKey === process.env.ADMIN_KEY) {
    return res.status(200).json({ connected: false, eventTypes: [], slots: [] });
  }

  // ── Load client + tokens ────────────────────────────────────
  let accessToken, refreshToken, tokenExpiry, recordId;
  try {
    const formula = encodeURIComponent(`{API Key}="${escapeFormula(apiKey)}"`);
    const cRes    = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );
    const cData = await cRes.json();
    if (!cData.records?.length) return res.status(401).json({ error: 'Ongeldige API key' });
    const client  = cData.records[0];
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

  // ── Auto-refresh if expired ─────────────────────────────────
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
            'Calendly Access Token':  accessToken,
            'Calendly Token Expiry':  newExpiry,
            ...(tok.refresh_token ? { 'Calendly Refresh Token': tok.refresh_token } : {}),
          }}),
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

  // ── Validate date ───────────────────────────────────────────
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({ error: 'Ongeldig datum formaat (gebruik YYYY-MM-DD)' });
  }

  try {
    // Get user URI
    const meRes = await fetch('https://api.calendly.com/users/me', { headers });
    if (!meRes.ok) return res.status(200).json({ connected: true, eventTypes: [], slots: [] });
    const userUri = (await meRes.json()).resource?.uri;
    if (!userUri)  return res.status(200).json({ connected: true, eventTypes: [], slots: [] });

    // Get active event types
    const etRes  = await fetch(`https://api.calendly.com/event_types?user=${encodeURIComponent(userUri)}&active=true&count=20`, { headers });
    const etData = etRes.ok ? await etRes.json() : { collection: [] };
    const eventTypes = (etData.collection || []).map(et => ({
      uri:        et.uri,
      name:       et.name,
      duration:   et.duration,       // minutes
      slug:       et.slug,
      bookingUrl: et.scheduling_url, // full Calendly URL
      color:      et.color || null,
    }));

    if (!eventTypes.length) {
      return res.status(200).json({ connected: true, eventTypes: [], slots: [] });
    }

    // Get available slots for the selected (or first) event type
    const targetUri = reqType && eventTypes.find(e => e.uri === reqType)
      ? reqType
      : eventTypes[0].uri;

    // Use local midnight → 23:59 for the date
    const dayStart = dateStr + 'T00:00:00.000Z';
    const dayEnd   = dateStr + 'T23:59:59.000Z';

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

    return res.status(200).json({
      connected:         true,
      eventTypes,
      selectedEventType: targetUri,
      slots,
    });

  } catch (err) {
    console.error('calendly-slots fetch:', err.message);
    return res.status(200).json({ connected: true, eventTypes: [], slots: [], error: err.message });
  }
};

function escapeFormula(val) {
  return String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
