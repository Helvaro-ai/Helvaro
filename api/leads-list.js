const crypto        = require('crypto');

// Rate limiter — 60 req / 60s per IP
const _rl = new Map();
function isRateLimited(ip) {
  const now = Date.now(), w = 60_000, max = 60;
  const hits = (_rl.get(ip) || []).filter(t => now - t < w);
  hits.push(now);
  _rl.set(ip, hits);
  if (_rl.size > 1000) { for (const [k, v] of _rl) if (!v.some(t => now - t < w)) _rl.delete(k); }
  return hits.length > max;
}

const AIRTABLE_TOKEN = process.env.API_Airtable;
const AIRTABLE_BASE  = process.env.BASE_AIRTABLE;
const LEADS_TABLE    = 'tbliukTnDAbEDcZmt';
const CLIENTS_TABLE  = 'tblPidTrwGRzRt4LZ';

// Validate API key format — alphanumeric + dash/underscore, 8-100 chars
const API_KEY_RE = /^[A-Za-z0-9\-_]{8,100}$/;

// Escape values embedded in Airtable formula strings
function escapeFormula(val) {
  return String(val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://app.helvaro.pro');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Te veel verzoeken. Probeer later opnieuw.' });

  const apiKey = String(req.headers['x-api-key'] || '').trim().slice(0, 100);
  if (!apiKey)             return res.status(401).json({ error: 'API key ontbreekt' });
  if (!API_KEY_RE.test(apiKey)) return res.status(401).json({ error: 'Ongeldige API key' });

  const client = await getClientByApiKey(apiKey);
  if (!client) return res.status(403).json({ error: 'Ongeldige API key' });

  const projectCode = client.fields['Project Code'] || '';
  const leads       = await getLeadsByProjectCode(projectCode);

  return res.status(200).json(leads.map(l => ({
    id:                    l.id,
    naam:                  l.fields['Name']                || 'Onbekend',
    telefoon:              l.fields['Phone']               || '',
    status:                l.fields['Conversation State']?.name || l.fields['Conversation State'] || '',
    qualified:             l.fields['Qualified']           || false,
    reden:                 l.fields['Reason']              || '',
    samenvatting:          l.fields['AI Summary']          || '',
    capaciteit:            l.fields['Ability']?.name       || l.fields['Ability']  || '',
    urgentie:              l.fields['Urgency']?.name       || l.fields['Urgency']  || '',
    fit:                   l.fields['Fit']?.name           || l.fields['Fit']      || '',
    bron:                  l.fields['Bron']?.name          || l.fields['Bron']     || '',
    boekingslinkVerstuurd: l.fields['Booking Link Sent']   || false,
    afspraakGeboekt:       l.fields['Appointment Booked']  || false,
    notities:              l.fields['Notities']            || '',
    leadScore:             l.fields['Lead Score']          || 0,
    opgepikt:              l.fields['Opgepikt']            || false,
    verwachteWaarde:       l.fields['Verwachte Waarde']    || '',
    reactietijd:           l.fields['Response Time (sec)'] || 0,
    datum:                 l.fields['Created At']          || l.createdTime,
  })));
};

async function getClientByApiKey(apiKey) {
  // Formula-escape the key before embedding — prevents Airtable formula injection
  const filter = encodeURIComponent(`{API Key}="${escapeFormula(apiKey)}"`);
  const url    = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${CLIENTS_TABLE}?filterByFormula=${filter}&maxRecords=1`;
  const res    = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const data   = await res.json();
  return data.records?.[0] || null;
}

async function getLeadsByProjectCode(projectCode) {
  const filter = encodeURIComponent(`{Project Code}="${escapeFormula(projectCode)}"`);
  const url    = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${LEADS_TABLE}?filterByFormula=${filter}&sort[0][field]=Created%20At&sort[0][direction]=desc`;
  const res    = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const data   = await res.json();
  return data.records || [];
}
