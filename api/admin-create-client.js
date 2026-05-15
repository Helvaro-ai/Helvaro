// Admin — create a new client record in Airtable.
// Protected by the same admin token derivation as admin.js.
// POST /api/admin-create-client
//   Body: { clientName, projectCode, email?, calendlyLink? }
// Returns: { id, apiKey, projectCode, formUrl, dashboardUrl }
const crypto = require('crypto');

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
  const expected = crypto.createHmac('sha256', adminKey).update('helvaro-admin-v1').digest('hex');
  return safeEqual(provided, expected);
}

function escapeFormula(val) {
  return String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Generate a URL-safe API key — 32 chars, alphanumeric + dash/underscore
function generateApiKey() {
  return crypto.randomBytes(24).toString('base64url').slice(0, 32);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://app.helvaro.pro');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ADMIN_KEY = process.env.ADMIN_KEY;
  const provided  = String(req.headers['x-api-key'] || '').trim();
  if (!isValidAdminToken(provided, ADMIN_KEY)) {
    return res.status(401).json({ error: 'Ongeldige admin key' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body || typeof body !== 'object') body = {};

  // ── Validate inputs ───────────────────────────────────────────────────────
  const clientName   = String(body.clientName   || '').trim().slice(0, 100);
  const projectCode  = String(body.projectCode  || '').trim().toUpperCase().slice(0, 50);
  const email        = String(body.email        || '').trim().slice(0, 200);
  const calendlyLink = String(body.calendlyLink || '').trim().slice(0, 500);

  if (!clientName)  return res.status(400).json({ error: 'Naam is verplicht' });
  if (!projectCode) return res.status(400).json({ error: 'Projectcode is verplicht' });
  if (!/^[A-Z0-9_]{2,50}$/.test(projectCode)) {
    return res.status(400).json({ error: 'Projectcode mag alleen letters, cijfers en _ bevatten' });
  }

  const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const CLIENTS_TABLE  = 'tblPidTrwGRzRt4LZ';

  try {
    // ── Check for duplicate project code ──────────────────────────────────
    const formula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(projectCode)}"`);
    const checkRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );
    const checkData = await checkRes.json();
    if ((checkData.records || []).length > 0) {
      return res.status(409).json({ error: `Projectcode '${projectCode}' bestaat al` });
    }

    // ── Generate API key & create record ──────────────────────────────────
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
      console.error('[admin-create] Airtable error:', JSON.stringify(createData).slice(0, 200));
      return res.status(500).json({ error: 'Aanmaken mislukt: ' + (createData?.error?.message || createRes.status) });
    }

    const formUrl      = `https://app.helvaro.pro/start/${projectCode}`;
    const dashboardUrl = `https://app.helvaro.pro/dashboard`;

    // ── Welcome email (fire-and-forget) ───────────────────────────────────
    if (email) {
      sendWelcomeEmail({ clientName, projectCode, apiKey, email, formUrl, dashboardUrl }).catch(() => {});
    }

    return res.status(200).json({
      id:           createData.id,
      apiKey,
      projectCode,
      clientName,
      formUrl,
      dashboardUrl
    });

  } catch (err) {
    console.error('[admin-create] Error:', err.message);
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
          <div style="display:flex;gap:12px">
            <a href="${escHtml(dashboardUrl)}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open Dashboard</a>
            <a href="${escHtml(formUrl)}" style="display:inline-block;padding:12px 24px;background:#f5f6fb;color:#0f1117;border-radius:8px;text-decoration:none;font-weight:600;border:1px solid #dde1ed">Bekijk Formulier</a>
          </div>
          <p style="margin-top:32px;font-size:13px;color:#a0aab8">Vragen? Stuur ons een bericht. — Team Helvaro</p>
        </div>`
    })
  });
}
