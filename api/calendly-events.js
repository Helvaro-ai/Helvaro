module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const AIRTABLE_TOKEN = process.env.API_Airtable;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const CLIENTS_TABLE  = 'tblPidTrwGRzRt4LZ';

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const apiKey = String(req.headers['x-api-key'] || '').trim().slice(0, 100);
  if (!apiKey) return res.status(401).json({ error: 'API key ontbreekt' });
  if (!/^[A-Za-z0-9\-_]{8,100}$/.test(apiKey)) return res.status(401).json({ error: 'Ongeldige API key' });

  if (process.env.ADMIN_KEY && apiKey === process.env.ADMIN_KEY) {
    return res.status(200).json({ events: [] });
  }

  // ── Look up Calendly token from Airtable ──────────────────────────────────
  let calendlyToken = '';
  try {
    const formula = encodeURIComponent(`{API Key}="${escapeFormula(apiKey)}"`);
    const cRes    = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );
    const cData = await cRes.json();
    if (!cData.records || cData.records.length === 0) return res.status(401).json({ error: 'Ongeldige API key' });
    const client  = cData.records[0];
    // Try named field first, fall back to known field IDs
    calendlyToken = client.fields['Calendly Token'] || client.fields['calendlyToken'] || '';
  } catch (err) {
    console.error('calendly-events auth error:', err.message);
    return res.status(500).json({ error: 'Database fout' });
  }

  // Fall back to shared env-var token
  if (!calendlyToken) calendlyToken = process.env.CALENDLY_TOKEN || '';
  if (!calendlyToken) return res.status(200).json({ events: [], configured: false });

  // ── Date range from query params ──────────────────────────────────────────
  const qs       = new URLSearchParams((req.url || '').split('?')[1] || '');
  const minStart = qs.get('min') || new Date().toISOString();
  const maxStart = qs.get('max') || new Date(Date.now() + 7 * 86400000).toISOString();

  const headers = { Authorization: `Bearer ${calendlyToken}`, 'Content-Type': 'application/json' };

  try {
    // 1. Get user URI
    const meRes = await fetch('https://api.calendly.com/users/me', { headers });
    if (!meRes.ok) {
      const errText = await meRes.text();
      console.error('Calendly /users/me error:', meRes.status, errText);
      return res.status(200).json({ events: [], error: 'Calendly auth mislukt — controleer uw token' });
    }
    const meData  = await meRes.json();
    const userUri = meData.resource?.uri;
    if (!userUri) return res.status(200).json({ events: [], error: 'Calendly user URI niet gevonden' });

    // 2. Fetch scheduled events for the date range
    const evUrl = `https://api.calendly.com/scheduled_events?user=${encodeURIComponent(userUri)}&status=active&min_start_time=${encodeURIComponent(minStart)}&max_start_time=${encodeURIComponent(maxStart)}&count=100`;
    const evRes = await fetch(evUrl, { headers });
    if (!evRes.ok) {
      console.error('Calendly events error:', evRes.status);
      return res.status(200).json({ events: [] });
    }
    const evData    = await evRes.json();
    const rawEvents = evData.collection || [];

    // 3. Fetch invitee names (parallel, max 20 events)
    const events = await Promise.all(rawEvents.slice(0, 20).map(async ev => {
      let inviteeName  = '';
      let inviteeEmail = '';
      try {
        const invRes  = await fetch(`${ev.uri}/invitees?count=1`, { headers });
        const invData = await invRes.json();
        const inv     = invData.collection?.[0];
        inviteeName   = inv?.name  || '';
        inviteeEmail  = inv?.email || '';
      } catch {}

      return {
        id:           ev.uri,
        name:         inviteeName || 'Afspraak',
        email:        inviteeEmail,
        eventType:    ev.name || '30 min',
        startTime:    ev.start_time,
        endTime:      ev.end_time,
        status:       ev.status,
        location:     ev.location?.join_url || ev.location?.location || '',
        cancelUrl:    ev.cancel_url || '',
        rescheduleUrl: ev.reschedule_url || ''
      };
    }));

    return res.status(200).json({ events, configured: true });

  } catch (err) {
    console.error('Calendly fetch error:', err.message);
    return res.status(200).json({ events: [], error: err.message });
  }
};

function escapeFormula(val) {
  return String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
