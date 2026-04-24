module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const AIRTABLE_TOKEN = process.env.API_Airtable;
  const BASE_ID = process.env.BASE_AIRTABLE;
  const USERS_TABLE = 'tbl2hrPW7gIx5XF4S';

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    if (!body || typeof body !== 'object') body = {};

    const email = (body.email || '').trim();
    const password = (body.password || '').trim();

    if (!email) return res.status(400).json({ error: 'E-mailadres is verplicht' });
    if (!password) return res.status(400).json({ error: 'Wachtwoord is verplicht' });

    const formula = encodeURIComponent(`AND({Email}="${email}",{Password Hash}="${password}",{Active}=1)`);
    const url = `https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE}?filterByFormula=${formula}&maxRecords=1`;

    const atRes = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    });

    if (!atRes.ok) {
      const err = await atRes.text();
      console.error('Airtable error:', err);
      return res.status(500).json({ error: 'Database fout. Probeer opnieuw.' });
    }

    const data = await atRes.json();

    if (!data.records || data.records.length === 0) {
      return res.status(401).json({ error: 'Verkeerd e-mailadres of wachtwoord' });
    }

    const user = data.records[0].fields;

    return res.status(200).json({
      success: true,
      apiKey: user['fldxZMgVXSy7EShDL'] || user['API Key'] || '',
      clientName: user['fldmKwegSUj1joru3'] || user['Client Name'] || '',
      projectCode: user['fldbrCpBuQjJBfZsv'] || user['Project Code'] || ''
    });

  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ error: 'Serverfout: ' + err.message });
  }
};
