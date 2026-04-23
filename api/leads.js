const BASE  = process.env.BASE_AIRTABLE;
const TOKEN = process.env.API_Airtable;

const LEADS_TABLE  = 'tbliukTnDAbEDcZmt';
const CLIENT_TABLE = 'tblPidTrwGRzRt4LZ';

const F = {
  name:             'fldbk0LVNckOU0bqA',
  phone:            'fld6YaitW0lMqHUrd',
  status:           'fld8mkrEWcyq7mUip',
  summary:          'fldqerIiw5qyQjXHr',
  qualified:        'fld0hAZJ5wgaXrNTn',
  reason:           'fld3NhSENma0okbT7',
  bookingLinkSent:  'fldLeEqwNefdglLis',
  appointmentBooked:'fldyIGNetqcSEkoaK',
  ability:          'fldrfbTopJvZEYSKP',
  urgency:          'fldlyLH1DKrWyG3Tr',
  fit:              'fldqNxsPshvZEBeLr',
  createdAt:        'fldR0r13EU4RwrtvH',
  projectCode:      'fldSmczuyUJd26HLe',
  responseTime:     'fldUJJ8oSmAMQ9wB3',
  bron:             'fldGoerozqdea4BfU',
  notities:         'fldoLRI5W12ThTls7',
  leadScore:        'fldpzQgMuWJLjogiD',
  opgepikt:         'fld86JQHB6dbuutA7',
  verwachteWaarde:  'fldv7qOYvCN1xJfiR',
};

const CF = {
  clientName:  'fldAnB848Sr5jl6dq',
  projectCode: 'fldN4dL0bGgfBOXwM',
  apiKey:      'fldhmnzVjrb2AyqJr',
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
}

async function airtable(path, opts = {}) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchAllPages(table, qs = '') {
  const records = [];
  let offset = '';
  do {
    const base = `/${table}?${qs}`;
    const url  = offset ? `${base}&offset=${encodeURIComponent(offset)}` : base;
    const data = await airtable(url);
    records.push(...(data.records || []));
    offset = data.offset || '';
  } while (offset);
  return records;
}

async function getClient(apiKey) {
  const formula = encodeURIComponent(`{${CF.apiKey}}="${apiKey}"`);
  const data    = await airtable(`/${CLIENT_TABLE}?filterByFormula=${formula}&maxRecords=1`);
  return data.records?.[0] || null;
}

function strVal(v) {
  if (v == null) return '';
  if (typeof v === 'object' && v.name) return v.name;
  return String(v);
}

function csvEsc(v) {
  return `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
}

function mapLead(r) {
  const f = r.fields;
  return {
    id:                    r.id,
    naam:                  f[F.name]               || '',
    telefoon:              f[F.phone]              || '',
    status:                strVal(f[F.status])     || 'new',
    qualified:             Boolean(f[F.qualified]),
    reden:                 f[F.reason]             || '',
    samenvatting:          f[F.summary]            || '',
    capaciteit:            strVal(f[F.ability]),
    urgentie:              strVal(f[F.urgency]),
    fit:                   strVal(f[F.fit]),
    bron:                  strVal(f[F.bron]),
    boekingslinkVerstuurd: Boolean(f[F.bookingLinkSent]),
    afspraakGeboekt:       Boolean(f[F.appointmentBooked]),
    notities:              f[F.notities]           || '',
    leadScore:             Number(f[F.leadScore])  || 0,
    opgepikt:              Boolean(f[F.opgepikt]),
    verwachteWaarde:       f[F.verwachteWaarde]    || '',
    reactietijd:           Number(f[F.responseTime]) || 0,
    datum:                 f[F.createdAt]          || '',
  };
}

function calcStats(leads) {
  const total      = leads.length;
  const qualified  = leads.filter(l => l.qualified).length;
  const booked     = leads.filter(l => l.afspraakGeboekt).length;
  const conversionRate = total ? Math.round((booked / total) * 1000) / 10 : 0;
  const now        = new Date();
  const thisMonth  = leads.filter(l => {
    if (!l.datum) return false;
    const d = new Date(l.datum);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const times = leads.map(l => l.reactietijd).filter(t => t > 0);
  const avgResponseTime = times.length
    ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10
    : 0;
  return { total, qualified, booked, conversionRate, thisMonth, avgResponseTime };
}

function dutchDate(d) {
  return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'Geen API-sleutel opgegeven.' });

  let client;
  try {
    client = await getClient(apiKey);
  } catch (err) {
    console.error('[leads] getClient:', err.message);
    return res.status(500).json({ error: 'Fout bij ophalen clientgegevens.' });
  }
  if (!client) return res.status(401).json({ error: 'Ongeldige API-sleutel.' });

  const projectCode = client.fields[CF.projectCode];
  const clientName  = client.fields[CF.clientName];

  if (req.method === 'PATCH') {
    try {
      const parts    = (req.url || '').split('/').filter(Boolean);
      const recordId = parts[parts.length - 1];
      const body     = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const result   = await airtable(`/${LEADS_TABLE}/${recordId}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { [F.notities]: body.notities || '' } }),
      });
      return res.status(200).json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  let leads;
  try {
    const formula = encodeURIComponent(`{${F.projectCode}}="${projectCode}"`);
    const sort    = `sort[0][field]=${F.createdAt}&sort[0][direction]=desc`;
    const records = await fetchAllPages(LEADS_TABLE, `filterByFormula=${formula}&${sort}`);
    leads = records.map(mapLead);
  } catch (err) {
    console.error('[leads] fetch:', err.message);
    return res.status(500).json({ error: 'Kon leads niet ophalen.' });
  }

  const qs     = (req.url || '').split('?')[1] || '';
  const params = new URLSearchParams(qs);

  if (params.get('export') === 'true') {
    const header = 'Naam;Telefoon;Status;Gekwalificeerd;Bron;Score;Urgentie;Capaciteit;Fit;Verwachte Waarde;Datum;Samenvatting';
    const rows   = leads.map(l => [
      l.naam, l.telefoon, l.status,
      l.qualified ? 'Ja' : 'Nee',
      l.bron, l.leadScore, l.urgentie, l.capaciteit, l.fit,
      l.verwachteWaarde,
      l.datum ? new Date(l.datum).toLocaleDateString('nl-NL') : '',
      l.samenvatting,
    ].map(csvEsc).join(';'));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=helvaro-leads.csv');
    return res.status(200).send([header, ...rows].join('\r\n'));
  }

  if (params.get('rapport') === 'week') {
    const sevenDaysAgo   = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weekLeads      = leads.filter(l => l.datum && new Date(l.datum) >= sevenDaysAgo);
    const totaalLeads    = weekLeads.length;
    const gekwalificeerd = weekLeads.filter(l => l.qualified).length;
    const afspraken      = weekLeads.filter(l => l.afspraakGeboekt).length;
    const conversie      = totaalLeads ? Math.round((gekwalificeerd / totaalLeads) * 1000) / 10 : 0;
    const periode        = `${dutchDate(sevenDaysAgo)} \u2013 ${dutchDate(new Date())}`;
    const gekwalificeerdeLijst = weekLeads
      .filter(l => l.qualified)
      .map(l => ({ naam: l.naam, telefoon: l.telefoon, samenvatting: l.samenvatting }));
    return res.status(200).json({
      rapport: { periode, totaalLeads, gekwalificeerd, afspraken, conversie, gekwalificeerdeLijst },
      leads,
      stats: calcStats(leads),
      client: { naam: clientName },
    });
  }

  return res.status(200).json({
    leads,
    stats: calcStats(leads),
    client: { naam: clientName },
  });
}
