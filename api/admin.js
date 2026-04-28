// Admin endpoint — returns all clients + their lead stats
// Protected by ADMIN_KEY env var

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-api-key, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ADMIN_KEY      = process.env.ADMIN_KEY;
  const provided       = req.headers['x-api-key'] || '';
  if (!ADMIN_KEY || provided !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Ongeldige admin key' });
  }

  const AIRTABLE_TOKEN = process.env.API_Airtable;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const CLIENTS_TABLE  = 'tblPidTrwGRzRt4LZ';
  const LEADS_TABLE    = 'tbliukTnDAbEDcZmt';

  try {
    // Fetch all clients
    const cRes  = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?pageSize=100`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );
    const cData = await cRes.json();
    if (!cRes.ok) throw new Error('Clients: ' + cRes.status);

    const clients = (cData.records || []).map(r => ({
      id:          r.id,
      naam:        r.fields['fldAnB848Sr5jl6dq'] || r.fields['Client Name']  || '—',
      projectCode: r.fields['fldN4dL0bGgfBOXwM'] || r.fields['Project Code'] || '',
      apiKey:      r.fields['API Key']            || r.fields['fldApiKey']    || '',
      calendly:    r.fields['fldNEj1ysRgINOOtr']  || r.fields['Calendly Link']|| ''
    }));

    // Fetch lead counts per client (one request per client — batched)
    const withStats = await Promise.all(clients.map(async c => {
      if (!c.projectCode) return { ...c, totalLeads: 0, newLeads: 0, qualified: 0 };
      try {
        const formula = encodeURIComponent(`{fldSmczuyUJd26HLe}="${c.projectCode.replace(/"/g, '\\"')}"`);
        const lRes = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}?filterByFormula=${formula}&fields[]=fld8mkrEWcyq7mUip&fields[]=fld0hAZJ5wgaXrNTn&pageSize=100`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        const lData = await lRes.json();
        const records = lData.records || [];
        return {
          ...c,
          totalLeads: records.length,
          newLeads:   records.filter(r => r.fields['fld8mkrEWcyq7mUip'] === 'new').length,
          qualified:  records.filter(r => r.fields['fld0hAZJ5wgaXrNTn'] === true).length
        };
      } catch {
        return { ...c, totalLeads: 0, newLeads: 0, qualified: 0 };
      }
    }));

    return res.status(200).json({ clients: withStats });
  } catch (err) {
    console.error('[admin] Error:', err.message);
    return res.status(500).json({ error: 'Serverfout' });
  }
};
