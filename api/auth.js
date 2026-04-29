// Simple in-memory rate limiter — max 10 login attempts per IP per 15 minutes
const loginAttempts = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const window = 15 * 60 * 1000; // 15 min
  const max = 10;
  const attempts = (loginAttempts.get(ip) || []).filter(t => now - t < window);
  attempts.push(now);
  loginAttempts.set(ip, attempts);
  // Clean old IPs occasionally
  if (loginAttempts.size > 1000) {
    for (const [k, v] of loginAttempts) {
      if (v.every(t => now - t > window)) loginAttempts.delete(k);
    }
  }
  return attempts.length > max;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit by IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Te veel pogingen. Probeer over 15 minuten opnieuw.' });
  }

  const AIRTABLE_TOKEN = process.env.API_Airtable;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const USERS_TABLE    = 'tbl2hrPW7gIx5XF4S';

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    const email    = String(body.email    || '').trim().slice(0, 254);
    const password = String(body.password || '').trim().slice(0, 200);

    if (!email)    return res.status(400).json({ error: 'E-mailadres is verplicht' });
    if (!password) return res.status(400).json({ error: 'Wachtwoord is verplicht' });

    // Admin shortcut — if password matches ADMIN_KEY, grant admin access directly
    const ADMIN_KEY = process.env.ADMIN_KEY;
    if (ADMIN_KEY && password === ADMIN_KEY) {
      return res.status(200).json({
        success:     true,
        apiKey:      ADMIN_KEY,
        clientName:  'Admin',
        projectCode: ''
      });
    }

    // Basic email shape check — reject obvious injections early
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Ongeldig e-mailadres' });
    }

    // Escape values before embedding in Airtable formula
    const safeEmail    = escapeFormula(email);
    const safePassword = escapeFormula(password);
    const formula = encodeURIComponent(
      `AND({Email}="${safeEmail}",{Password Hash}="${safePassword}",{Active}=1)`
    );
    const url = `https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE}?filterByFormula=${formula}&maxRecords=1`;

    const atRes = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    });

    if (!atRes.ok) {
      console.error('Airtable auth error:', atRes.status);
      return res.status(500).json({ error: 'Database fout. Probeer opnieuw.' });
    }

    const data = await atRes.json();

    if (!data.records || data.records.length === 0) {
      // Same message for wrong email or wrong password — don't reveal which one
      return res.status(401).json({ error: 'Verkeerd e-mailadres of wachtwoord' });
    }

    const user = data.records[0].fields;

    return res.status(200).json({
      success:     true,
      apiKey:      user['fldxZMgVXSy7EShDL'] || user['API Key']      || '',
      clientName:  user['fldmKwegSUj1joru3']  || user['Client Name'] || '',
      projectCode: user['fldbrCpBuQjJBfZsv']  || user['Project Code'] || ''
    });

  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(500).json({ error: 'Serverfout. Probeer later opnieuw.' });
  }
};

// Escape double-quotes and backslashes for Airtable formula strings
function escapeFormula(val) {
  return val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
