const crypto = require('crypto');

// Exponential backoff + jitter retry for Airtable 429 — 6 attempts, ≤ ~63 s total.
async function atFetch(url, opts) {
  let delay = 1000;
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(url, opts);
    if (r.status !== 429) return r;
    if (attempt < 5) {
      const jitter = delay * 0.25 * (Math.random() * 2 - 1);
      await new Promise(res => setTimeout(res, Math.max(500, delay + jitter)));
    }
    delay = Math.min(delay * 2, 32_000);
  }
  return fetch(url, opts);
}

// Client config cache by API key — 5 min TTL
// Saves 1 Airtable call per request on the hot GET/PATCH path
const _clientCache = new Map();
const CLIENT_TTL   = 5 * 60 * 1000;
function getCachedClient(key) {
  const e = _clientCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CLIENT_TTL) { _clientCache.delete(key); return null; }
  return e.record;
}
function setCachedClient(key, record) {
  _clientCache.set(key, { record, ts: Date.now() });
}

// Rate limiter — 120 req / 60s per IP (allows normal polling, blocks hammering)
const _rl = new Map();
function isRateLimited(ip, max = 120, windowMs = 60_000) {
  const now  = Date.now();
  const hits = (_rl.get(ip) || []).filter(t => now - t < windowMs);
  hits.push(now);
  _rl.set(ip, hits);
  if (_rl.size > 2000) { for (const [k, v] of _rl) if (!v.some(t => now - t < windowMs)) _rl.delete(k); }
  return hits.length > max;
}

function safeEqual(a, b) {
  try {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}

function isAdminToken(provided, adminKey) {
  if (!adminKey || !provided) return false;
  const expected = crypto.createHmac('sha256', adminKey).update('helvaro-admin-v1').digest('hex');
  return safeEqual(provided, expected);
}

// ── Session token verification ─────────────────────────────────────────────────
// Tokens are signed by auth.js; verifying locally saves one Airtable call per
// request for every client — no env vars needed, works at any scale.
function sessionSecret() {
  const base = process.env.SESSION_SECRET || process.env.ADMIN_KEY || 'helvaro-default-v1';
  return crypto.createHmac('sha256', base).update('helvaro-session-v1').digest('hex');
}
function verifySession(token) {
  try {
    if (typeof token !== 'string' || !token.startsWith('hvs1.')) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [, payload, sig] = parts;
    if (!payload || !sig) return null;
    const secret   = sessionSecret();
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    const a = Buffer.from(sig,      'base64url');
    const b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://app.helvaro.pro');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Te veel verzoeken. Probeer later opnieuw.' });

  const AIRTABLE_TOKEN = process.env.API_Airtable;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const LEADS_TABLE    = 'tbliukTnDAbEDcZmt';
  const CLIENTS_TABLE  = 'tblPidTrwGRzRt4LZ';

  // ── Auth ────────────────────────────────────────────────────────────────────
  // Accept up to 2 KB to accommodate signed session tokens (~400 chars)
  const raw = String(req.headers['x-api-key'] || '').trim().slice(0, 2048);
  if (!raw) return res.status(401).json({ error: 'API key ontbreekt' });

  let projectCode = '', clientName = '', calendlyLink = '';

  // Path A: signed session token — verify locally, zero Airtable calls
  const session = verifySession(raw);
  if (session) {
    projectCode  = session.projectCode  || '';
    clientName   = session.clientName   || '';
    calendlyLink = session.calendlyLink || '';
  } else {
    // Path B: legacy API key (admin derived token or old sessions before this deploy)
    if (!/^[A-Za-z0-9\-_]{8,100}$/.test(raw)) {
      return res.status(401).json({ error: 'Ongeldige API key' });
    }

    // Admin token — timing-safe check against the derived token (not the raw key)
    if (isAdminToken(raw, process.env.ADMIN_KEY)) {
      return res.status(200).json({
        leads: [],
        stats: { total: 0, qualified: 0, booked: 0, conversionRate: 0, thisMonth: 0, avgResponseTime: 0 },
        client: { naam: 'Admin', calendly: '' }
      });
    }

    // Airtable Clients table lookup (with 5-min in-memory cache as last resort)
    try {
      let client = getCachedClient(raw);
      if (!client) {
        const formula = encodeURIComponent(`{API Key}="${escapeFormula(raw)}"`);
        const cRes    = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        if (cRes.status === 429) {
          return res.status(503).json({ error: 'Systeem is druk. Probeer over 30 seconden opnieuw.' });
        }
        const cData = await cRes.json();
        if (!cData.records || cData.records.length === 0) {
          return res.status(401).json({ error: 'Ongeldige API key' });
        }
        client = cData.records[0];
        setCachedClient(raw, client);
      }
      projectCode  = client.fields['fldN4dL0bGgfBOXwM'] || client.fields['Project Code']  || '';
      clientName   = client.fields['fldAnB848Sr5jl6dq'] || client.fields['Client Name']   || '';
      calendlyLink = client.fields['fldNEj1ysRgINOOtr'] || client.fields['Calendly Link'] || '';
    } catch (err) {
      console.error('Leads auth error:', err.message);
      return res.status(500).json({ error: 'Database fout. Probeer later opnieuw.' });
    }
  }

  // ── PATCH — save notes ──────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    try {
      const pqs     = (req.url || '').split('?')[1] || '';
      const pParams = new URLSearchParams(pqs);
      let recordId  = pParams.get('id') || '';

      // Fallback: last URL segment
      if (!recordId) {
        const p    = (req.url || '').split('?')[0].split('/').filter(Boolean);
        recordId   = p[p.length - 1] || '';
      }

      // Strict Airtable record ID format: rec + 14 alphanumeric chars
      if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) {
        return res.status(400).json({ error: 'Ongeldig record ID' });
      }

      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      if (!body || typeof body !== 'object') body = {};

      const fields = {};
      if (body.notities !== undefined) fields['fldoLRI5W12ThTls7'] = String(body.notities).slice(0, 8000);
      if (body.status   !== undefined) {
        const allowed = ['new', 'in_progress', 'completed', 'verloren'];
        if (allowed.includes(body.status)) fields['fld8mkrEWcyq7mUip'] = body.status;
      }
      if (body.dealWaarde   !== undefined) fields['fldv7qOYvCN1xJfiR'] = String(body.dealWaarde).slice(0, 200);
      if (body.verliesReden !== undefined) fields['fld3NhSENma0okbT7'] = String(body.verliesReden).slice(0, 500);
      if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'Geen velden om bij te werken' });

      const pRes  = await atFetch(
        `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${recordId}`,
        {
          method:  'PATCH',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fields })
        }
      );
      const pData = await pRes.json();
      if (!pRes.ok) {
        console.error('Airtable PATCH error:', pRes.status);
        return res.status(500).json({ error: 'Opslaan mislukt. Probeer later opnieuw.' });
      }

      // ── Deal-closed email notification ──────────────────────────────────────
      if (body.dealWaarde) {
        const leadName = pData.fields?.['fldbk0LVNckOU0bqA'] || pData.fields?.['Name'] || '(onbekend)';
        sendResendEmail({
          subject: `Deal gesloten - ${escHtml(leadName)} (${escHtml(body.dealWaarde)})`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto">
              <h2 style="color:#16a34a">Deal gesloten</h2>
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px;color:#666">Lead</td><td style="padding:8px;font-weight:600">${escHtml(leadName)}</td></tr>
                <tr><td style="padding:8px;color:#666">Waarde</td><td style="padding:8px;font-weight:700;color:#16a34a">${escHtml(body.dealWaarde)}</td></tr>
                <tr><td style="padding:8px;color:#666">Client</td><td style="padding:8px">${escHtml(clientName)}</td></tr>
              </table>
              <a href="https://app.helvaro.pro/dashboard" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none">Open Dashboard</a>
            </div>`
        }).catch(() => {});
      }

      return res.status(200).json(pData);
    } catch (err) {
      console.error('PATCH error:', err.message);
      return res.status(500).json({ error: 'Serverfout. Probeer later opnieuw.' });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── GET — fetch all leads (paginated) ───────────────────────────────────────
  let allLeads = [];
  try {
    const formula = encodeURIComponent(`{Project Code}="${escapeFormula(projectCode)}"`);
    let offset    = '';
    do {
      const url  = `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}?filterByFormula=${formula}&sort[0][field]=fldR0r13EU4RwrtvH&sort[0][direction]=desc&pageSize=100${offset ? '&offset=' + offset : ''}`;
      const lRes = await atFetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      if (lRes.status === 429) throw new Error('Airtable 429');
      const lData = await lRes.json();
      if (!lRes.ok) throw new Error('Airtable ' + lRes.status);
      allLeads = allLeads.concat(lData.records || []);
      offset   = lData.offset || '';
    } while (offset);
  } catch (err) {
    console.error('Leads fetch error:', err.message);
    return res.status(500).json({ error: 'Leads ophalen mislukt. Probeer later opnieuw.' });
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
      gesprek:               f['Conversation History']       || '',
      leadScore:             num(f.fldpzQgMuWJLjogiD        || f['Lead Score']),
      opgepikt:              bool(f.fld86JQHB6dbuutA7       || f.Opgepikt),
      verwachteWaarde:       f.fldv7qOYvCN1xJfiR            || f['Verwachte Waarde']    || '',
      reactietijd:           num(f.fldUJJ8oSmAMQ9wB3        || f['Response Time (sec)']),
      datum:                 f.fldR0r13EU4RwrtvH            || f['Created At']          || r.createdTime || ''
    };
  });

  // ── Stats ───────────────────────────────────────────────────────────────────
  const now            = new Date();
  const total          = leads.length;
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
      leads, stats, client: { naam: clientName, calendly: calendlyLink }
    });
  }

  return res.status(200).json({ leads, stats, client: { naam: clientName, calendly: calendlyLink } });
};

// Escape double-quotes and backslashes for Airtable formula strings
function escapeFormula(val) {
  return String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Escape HTML entities for safe embedding in email HTML
function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Resend email helper ──────────────────────────────────────────────────────
async function sendResendEmail({ subject, html }) {
  const key  = process.env.RESEND_API_KEY;
  const to   = process.env.NOTIFY_EMAIL;
  if (!key || !to) return;
  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ from: 'Helvaro <noreply@helvaro.pro>', to: [to], subject, html })
  });
}
