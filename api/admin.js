// Admin endpoint — GET: all clients + lead stats | POST: create new client
// Protected by ADMIN_KEY env var (timing-safe comparison)
const crypto = require('crypto');

// Single-shot Airtable fetch — no retries (admin is low-frequency)
async function atFetch(url, opts) {
  return fetch(url, opts);
}

// Rate limiter — 20 req / 60s per IP
const _rl = new Map();
function isRateLimited(ip) {
  const now = Date.now(), w = 60_000, max = 20;
  const hits = (_rl.get(ip) || []).filter(t => now - t < w);
  hits.push(now);
  _rl.set(ip, hits);
  if (_rl.size > 500) { for (const [k, v] of _rl) if (!v.some(t => now - t < w)) _rl.delete(k); }
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

function isValidAdminToken(provided, adminKey) {
  if (!adminKey || !provided) return false;
  // Accept the derived HMAC token (current) or the raw key (legacy sessions)
  const derived = crypto.createHmac('sha256', adminKey).update('helvaro-admin-v1').digest('hex');
  return safeEqual(provided, derived) || safeEqual(provided, adminKey);
}

function escapeFormula(val) {
  return String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function generateApiKey() {
  return crypto.randomBytes(24).toString('base64url').slice(0, 32);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://app.helvaro.pro');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Te veel verzoeken.' });

  const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const CLIENTS_TABLE  = 'tblPidTrwGRzRt4LZ';
  const LEADS_TABLE    = 'tbliukTnDAbEDcZmt';

  // ── POST — create new client (admin OR invite-code onboarding) ────────────
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    // Invite-code path — used by the public /onboard form
    const ONBOARD_CODE = process.env.ONBOARD_CODE;
    const isOnboard = body.mode === 'onboard';
    if (isOnboard) {
      const provided = String(body.inviteCode || '').trim();
      if (!ONBOARD_CODE || !safeEqual(provided, ONBOARD_CODE)) {
        return res.status(401).json({ error: 'Ongeldige uitnodigingscode' });
      }
    } else {
      // Regular admin path
      const ADMIN_KEY = process.env.ADMIN_KEY;
      const provided  = String(req.headers['x-api-key'] || '').trim();
      if (!isValidAdminToken(provided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
    }

    const clientName   = String(body.clientName   || '').trim().slice(0, 100);
    const projectCode  = String(body.projectCode  || '').trim().toUpperCase().slice(0, 50);
    const email        = String(body.email        || '').trim().slice(0, 200);
    const calendlyLink = String(body.calendlyLink || '').trim().slice(0, 500);

    if (!clientName)  return res.status(400).json({ error: 'Naam is verplicht' });
    if (!projectCode) return res.status(400).json({ error: 'Projectcode is verplicht' });
    if (!/^[A-Z0-9_]{2,50}$/.test(projectCode)) {
      return res.status(400).json({ error: 'Projectcode mag alleen letters, cijfers en _ bevatten' });
    }

    try {
      // Check for duplicate project code
      const formula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(projectCode)}"`);
      const checkRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
        { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
      );
      const checkData = await checkRes.json();
      if ((checkData.records || []).length > 0) {
        return res.status(409).json({ error: `Projectcode '${projectCode}' bestaat al` });
      }

      const apiKey = generateApiKey();
      const createRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}`,
        {
          method:  'POST',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              'fldAnB848Sr5jl6dq': clientName,
              'fldN4dL0bGgfBOXwM': projectCode,
              'API Key':           apiKey,
              ...(calendlyLink ? { 'fldNEj1ysRgINOOtr': calendlyLink } : {})
            }
          })
        }
      );
      const createData = await createRes.json();
      if (!createRes.ok) {
        console.error('[admin] create error:', JSON.stringify(createData).slice(0, 200));
        return res.status(500).json({ error: 'Aanmaken mislukt: ' + (createData?.error?.message || createRes.status) });
      }

      const formUrl      = `https://app.helvaro.pro/start/${projectCode}`;
      const dashboardUrl = `https://app.helvaro.pro/dashboard`;

      if (email) {
        sendWelcomeEmail({ clientName, projectCode, apiKey, email, formUrl, dashboardUrl }).catch(() => {});
      }

      return res.status(200).json({ id: createData.id, apiKey, projectCode, clientName, formUrl, dashboardUrl });
    } catch (err) {
      console.error('[admin] create error:', err.message);
      return res.status(500).json({ error: 'Serverfout' });
    }
  }

  // ── GET — all clients + lead stats (admin only) ──────────────────────────
  const ADMIN_KEY = process.env.ADMIN_KEY;
  const provided  = String(req.headers['x-api-key'] || '').trim();
  if (!isValidAdminToken(provided, ADMIN_KEY)) {
    return res.status(401).json({ error: 'Ongeldige admin key' });
  }

  try {
    const cRes  = await atFetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?pageSize=100`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );
    const cData = await cRes.json();
    if (!cRes.ok) throw new Error('Clients: ' + cRes.status);

    const clients = (cData.records || []).map(r => ({
      id:          r.id,
      naam:        r.fields['fldAnB848Sr5jl6dq'] || r.fields['Client Name']   || '—',
      projectCode: r.fields['fldN4dL0bGgfBOXwM'] || r.fields['Project Code']  || '',
      apiKey:      r.fields['API Key']            || r.fields['fldApiKey']     || '',
      calendly:    r.fields['fldNEj1ysRgINOOtr']  || r.fields['Calendly Link'] || ''
    }));

    const withStats = await Promise.all(clients.map(async c => {
      if (!c.projectCode) return { ...c, totalLeads: 0, newLeads: 0, qualified: 0 };
      try {
        const formula = encodeURIComponent(`{fldSmczuyUJd26HLe}="${escapeFormula(c.projectCode)}"`);
        const lRes = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}?filterByFormula=${formula}&fields[]=fld8mkrEWcyq7mUip&fields[]=fld0hAZJ5wgaXrNTn&pageSize=100`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        const lData   = await lRes.json();
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

async function sendWelcomeEmail({ clientName, projectCode, apiKey, email, formUrl, dashboardUrl }) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return;
  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'Helvaro <noreply@helvaro.pro>',
      to:      [email],
      subject: `Welkom bij Helvaro — uw account is klaar`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;color:#0f1117">
          <div style="background:#080c14;padding:32px;border-radius:12px;text-align:center;margin-bottom:24px">
            <h1 style="color:#818cf8;font-family:monospace;letter-spacing:4px;margin:0">HELVARO</h1>
          </div>
          <h2 style="margin-bottom:8px">Welkom, ${escHtml(clientName)}!</h2>
          <p style="color:#5c6478;margin-bottom:24px">Uw account is aangemaakt. Hieronder vindt u uw inloggegevens.</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
            <tr style="border-bottom:1px solid #eee">
              <td style="padding:12px 0;color:#5c6478;width:140px">Projectcode</td>
              <td style="padding:12px 0;font-weight:600;font-family:monospace">${escHtml(projectCode)}</td>
            </tr>
            <tr style="border-bottom:1px solid #eee">
              <td style="padding:12px 0;color:#5c6478">API Key</td>
              <td style="padding:12px 0;font-weight:600;font-family:monospace;font-size:13px">${escHtml(apiKey)}</td>
            </tr>
            <tr style="border-bottom:1px solid #eee">
              <td style="padding:12px 0;color:#5c6478">Leadformulier</td>
              <td style="padding:12px 0"><a href="${escHtml(formUrl)}" style="color:#6366f1">${escHtml(formUrl)}</a></td>
            </tr>
          </table>
          <a href="${escHtml(dashboardUrl)}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open Dashboard</a>
          <p style="margin-top:32px;font-size:13px;color:#a0aab8">Vragen? Stuur ons een bericht. — Team Helvaro</p>
        </div>`
    })
  });
}
