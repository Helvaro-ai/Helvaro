module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const AIRTABLE_TOKEN = process.env.API_Airtable;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const LEADS_TABLE    = 'tbliukTnDAbEDcZmt';
  const CLIENTS_TABLE  = 'tblPidTrwGRzRt4LZ';

  // ── Auth ────────────────────────────────────────────────────────────────────
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key ontbreekt' });

  let client;
  try {
    const formula = encodeURIComponent(`{API Key}="${apiKey}"`);
    const cRes    = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );
    const cData = await cRes.json();
    if (!cData.records || cData.records.length === 0) {
      return res.status(401).json({ error: 'Ongeldige API key' });
    }
    client = cData.records[0];
  } catch (err) {
    return res.status(500).json({ error: 'Database fout: ' + err.message });
  }

  const projectCode = client.fields['fldN4dL0bGgfBOXwM'] || client.fields['Project Code'] || '';
  const clientName  = client.fields['fldAnB848Sr5jl6dq']  || client.fields['Client Name']  || '';

  // ── PATCH — save notes ──────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    try {
      const pqs      = (req.url || '').split('?')[1] || '';
      const pParams  = new URLSearchParams(pqs);
      let recordId   = pParams.get('id');
      if (!recordId) {
        const p   = (req.url || '').split('?')[0].split('/').filter(Boolean);
        const last = p[p.length - 1];
        if (last && last.startsWith('rec')) recordId = last;
      }
      if (!recordId) return res.status(400).json({ error: 'Record ID ontbreekt' });

      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      if (!body || typeof body !== 'object') body = {};

      const pRes  = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${recordId}`,
        {
          method:  'PATCH',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fields: { fldoLRI5W12ThTls7: body.notities || '' } })
        }
      );
      const pData = await pRes.json();
      if (!pRes.ok) return res.status(500).json({ error: 'Airtable PATCH mislukt', details: pData });
      return res.status(200).json(pData);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── GET — fetch all leads (paginated) ───────────────────────────────────────
  let allLeads = [];
  try {
    const formula = encodeURIComponent(`{Project Code}="${projectCode}"`);
    let offset    = '';
    do {
      const url  = `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}?filterByFormula=${formula}&sort[0][field]=fldR0r13EU4RwrtvH&sort[0][direction]=desc&pageSize=100${offset ? '&offset=' + offset : ''}`;
      const lRes = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const lData = await lRes.json();
      if (!lRes.ok) throw new Error(JSON.stringify(lData));
      allLeads = allLeads.concat(lData.records || []);
      offset   = lData.offset || '';
    } while (offset);
  } catch (err) {
    return res.status(500).json({ error: 'Leads ophalen mislukt: ' + err.message });
  }

  // ── Field helpers ───────────────────────────────────────────────────────────
  function str(v)  { if (!v) return ''; if (typeof v === 'object' && v.name) return v.name; return String(v); }
  function bool(v) { return v === true || v === 1; }
  function num(v)  { return typeof v === 'number' ? v : parseFloat(v) || 0; }

  const leads = allLeads.map(r => {
    const f = r.fields;
    return {
      id:                    r.id,
      naam:                  f.fldbk0LVNckOU0bqA          || f.Name                    || '',
      telefoon:              f.fld6YaitW0lMqHUrd           || f.Phone                   || '',
      status:                str(f.fld8mkrEWcyq7mUip       || f['Conversation State']),
      qualified:             bool(f.fld0hAZJ5wgaXrNTn      || f.Qualified),
      reden:                 f.fld3NhSENma0okbT7           || f.Reason                  || '',
      samenvatting:          f.fldqerIiw5qyQjXHr           || f['AI Summary']           || '',
      capaciteit:            str(f.fldrfbTopJvZEYSKP        || f.Ability),
      urgentie:              str(f.fldlyLH1DKrWyG3Tr        || f.Urgency),
      fit:                   str(f.fldqNxsPshvZEBeLr        || f.Fit),
      bron:                  str(f.fldGoerozqdea4BfU        || f.Bron),
      boekingslinkVerstuurd: bool(f.fldLeEqwNefdglLis       || f['Booking Link Sent']),
      afspraakGeboekt:       bool(f.fldyIGNetqcSEkoaK       || f['Appointment Booked']),
      notities:              f.fldoLRI5W12ThTls7            || f.Notities               || '',
      leadScore:             num(f.fldpzQgMuWJLjogiD        || f['Lead Score']),
      opgepikt:              bool(f.fld86JQHB6dbuutA7       || f.Opgepikt),
      verwachteWaarde:       f.fldv7qOYvCN1xJfiR            || f['Verwachte Waarde']    || '',
      reactietijd:           num(f.fldUJJ8oSmAMQ9wB3        || f['Response Time (sec)']),
      datum:                 f.fldR0r13EU4RwrtvH            || f['Created At']          || r.createdTime || ''
    };
  });

  // ── Stats ───────────────────────────────────────────────────────────────────
  const now   = new Date();
  const total = leads.length;
  const qualified      = leads.filter(l => l.qualified).length;
  const booked         = leads.filter(l => l.afspraakGeboekt).length;
  const conversionRate = total > 0 ? Math.round((booked / total) * 1000) / 10 : 0;
  const thisMonth      = leads.filter(l => {
    const d = new Date(l.datum);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const times          = leads.map(l => l.reactietijd).filter(v => v > 0);
  const avgResponseTime = times.length > 0
    ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10
    : 0;
  const avgLeadScore   = leads.length > 0
    ? Math.round(leads.reduce((a, l) => a + (l.leadScore || 0), 0) / leads.length)
    : 0;
  const stats = { total, qualified, booked, conversionRate, thisMonth, avgResponseTime, avgLeadScore };

  // ── Query params ────────────────────────────────────────────────────────────
  const qs     = (req.url || '').split('?')[1] || '';
  const params = new URLSearchParams(qs);

  // CSV export
  if (params.get('export') === 'true') {
    const esc  = v => '"' + String(v || '').replace(/"/g, '""') + '"';
    const hdrs = ['Naam','Telefoon','Status','Gekwalificeerd','Bron','Score','Urgentie','Capaciteit','Fit','Verwachte Waarde','Datum','Samenvatting'];
    const rows = leads.map(l => [
      l.naam, l.telefoon, l.status, l.qualified ? 'Ja' : 'Nee',
      l.bron, l.leadScore, l.urgentie, l.capaciteit, l.fit,
      l.verwachteWaarde,
      l.datum ? new Date(l.datum).toLocaleDateString('nl-BE') : '',
      l.samenvatting
    ].map(esc).join(';'));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=helvaro-leads.csv');
    return res.status(200).send([hdrs.join(';'), ...rows].join('\n'));
  }

  // Weekly rapport
  if (params.get('rapport') === 'week') {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const wLeads  = leads.filter(l => l.datum && new Date(l.datum) >= sevenDaysAgo);
    const wTotal  = wLeads.length;
    const wQual   = wLeads.filter(l => l.qualified).length;
    const wBooked = wLeads.filter(l => l.afspraakGeboekt).length;
    const wConv   = wTotal > 0 ? Math.round((wBooked / wTotal) * 1000) / 10 : 0;
    const mn  = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
    const van = `${sevenDaysAgo.getDate()} ${mn[sevenDaysAgo.getMonth()]}`;
    const tot = `${now.getDate()} ${mn[now.getMonth()]} ${now.getFullYear()}`;
    return res.status(200).json({
      rapport: {
        periode:              `${van} - ${tot}`,
        totaalLeads:          wTotal,
        gekwalificeerd:       wQual,
        afspraken:            wBooked,
        conversie:            wConv,
        gekwalificeerdeLijst: wLeads.filter(l => l.qualified)
          .map(l => ({ naam: l.naam, telefoon: l.telefoon, samenvatting: l.samenvatting, leadScore: l.leadScore }))
      },
      leads, stats, client: { naam: clientName }
    });
  }

  return res.status(200).json({ leads, stats, client: { naam: clientName } });
};
