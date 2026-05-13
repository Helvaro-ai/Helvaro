// Rate limit — max 5 form submissions per IP per 10 minutes
const formAttempts = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const window = 10 * 60 * 1000;
  const attempts = (formAttempts.get(ip) || []).filter(t => now - t < window);
  attempts.push(now);
  formAttempts.set(ip, attempts);
  return attempts.length > 5;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Te veel aanvragen. Probeer later opnieuw.' });
  }

  const AIRTABLE_TOKEN = process.env.API_Airtable;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const LEADS_TABLE    = 'tbliukTnDAbEDcZmt';
  const CLIENTS_TABLE  = 'tblPidTrwGRzRt4LZ';

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    // ── Extract & validate project_code ────────────────────────────────────────
    let project_code = '';
    const urlPath = (req.url || '').split('?')[0];
    const parts   = urlPath.split('/').filter(Boolean);
    const formIdx = parts.indexOf('form');
    if (formIdx !== -1 && parts[formIdx + 1]) {
      project_code = decodeURIComponent(parts[formIdx + 1]).trim().toUpperCase();
    }
    if (!project_code) project_code = String(body.project_code || '').trim().toUpperCase();
    if (!project_code) project_code = 'HELVARO';

    // Only allow alphanumeric + underscore project codes
    if (!/^[A-Z0-9_]{1,50}$/.test(project_code)) {
      return res.status(400).json({ error: 'Ongeldige projectcode' });
    }

    // ── Extract & validate name / phone ────────────────────────────────────────
    const name  = String(body.name  || '').trim().slice(0, 100);
    const phone = String(body.phone || '').trim().slice(0, 30);
    const bron  = String(body.bron  || 'Website').trim().slice(0, 50);

    if (!name)  return res.status(400).json({ error: 'Naam is verplicht' });
    if (!phone) return res.status(400).json({ error: 'Telefoonnummer is verplicht' });

    // ── Look up client config ───────────────────────────────────────────────────
    const formula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(project_code)}"`);
    const cRes  = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );
    const cData = await cRes.json();
    if (!cData.records || cData.records.length === 0) {
      return res.status(404).json({ error: 'Ongeldige projectcode' });
    }

    const cfg        = cData.records[0].fields;
    const aiName     = 'Mathis Willems';
    const clientName = cfg.fldAnB848Sr5jl6dq  || cfg['Client Name'] || 'Helvaro';

    // ── Normalise phone — stored in Airtable in international digits-only format
    // so it matches what WhatsApp sends as message.from (e.g. "32466358427")
    let waPhone = phone.replace(/[\s\-\(\)\.]/g, '');
    if      (waPhone.startsWith('00')) waPhone = waPhone.slice(2);
    else if (waPhone.startsWith('+'))  waPhone = waPhone.slice(1);
    else if (waPhone.startsWith('0'))  waPhone = '32' + waPhone.slice(1);

    // Validate: digits only, 8-15 chars (standard E.164 range)
    if (!/^\d{8,15}$/.test(waPhone)) {
      return res.status(400).json({ error: 'Ongeldig telefoonnummer — gebruik cijfers' });
    }

    // ── Create lead in Airtable ────────────────────────────────────────────────
    const createRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            fldbk0LVNckOU0bqA: name,
            fld6YaitW0lMqHUrd: waPhone,   // normalized — must match WhatsApp's message.from
            fldSmczuyUJd26HLe: project_code,
            fld8mkrEWcyq7mUip: 'new',
            fldGoerozqdea4BfU: bron,
            fldR0r13EU4RwrtvH: new Date().toISOString()
          }
        })
      }
    );
    const createData = await createRes.json();
    if (!createRes.ok) {
      console.error('Airtable create error:', createRes.status);
      return res.status(500).json({ error: 'Lead aanmaken mislukt' });
    }

    // ── Respond to browser immediately, send WhatsApp after 60s delay ──────────
    const firstName   = sanitize(name).split(' ')[0];
    const waGreeting  = `Hey ${firstName}! ${sanitize(aiName)} hier van ${sanitize(clientName)}. Zag dat je je gegevens achterliet. Wat bracht je bij ons?`;
    const notifyPhone = process.env.NOTIFY_PHONE;
    const notifyMsg   = notifyPhone
      ? `Nieuwe lead!\n\nNaam: ${sanitize(name)}\nTel: ${phone}\nProject: ${project_code}\nBron: ${sanitize(bron)}\n\nDashboard: https://app.helvaro.pro/dashboard`
      : null;

    // Fire after 45 seconds — feels like a real person picking up the form
    // Note: Vercel maxDuration is 60s, so 45s delay + processing leaves ~15s buffer
    const leadId = createData.id;
    setTimeout(async () => {
      const waOk = await sendWA(waPhone, waGreeting);
      if (!waOk) {
        // WhatsApp failed — flag lead so dashboard shows it in "Niet bereikbaar"
        await flagWaFailed(leadId, AIRTABLE_TOKEN, BASE_ID, LEADS_TABLE);
      }
      if (notifyPhone && notifyMsg) await sendWA(notifyPhone, notifyMsg);
    }, 45000);

    // Email notification (fire-and-forget)
    sendEmailNotification({ name, phone, project_code, bron, clientName }).catch(() => {});

    return res.status(200).json({ success: true, id: createData.id });

  } catch (err) {
    console.error('Form error:', err.message);
    return res.status(500).json({ error: 'Serverfout. Probeer later opnieuw.' });
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeFormula(val) {
  return val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Strip control characters and limit length before embedding in messages
function sanitize(val) {
  return String(val || '').replace(/[\x00-\x1F\x7F]/g, '').slice(0, 100);
}

function escEmail(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendEmailNotification({ name, phone, project_code, bron, clientName }) {
  const RESEND_KEY   = process.env.RESEND_API_KEY;
  const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
  if (!RESEND_KEY || !NOTIFY_EMAIL) return;

  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'Helvaro <noreply@helvaro.pro>',
      to:      [NOTIFY_EMAIL],
      subject: `Nieuwe lead — ${name} (${project_code})`,
      html:    `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#1e6fd9">Nieuwe lead voor ${escEmail(clientName)}</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;color:#666">Naam</td><td style="padding:8px;font-weight:600">${escEmail(name)}</td></tr>
            <tr><td style="padding:8px;color:#666">Telefoon</td><td style="padding:8px;font-weight:600">${escEmail(phone)}</td></tr>
            <tr><td style="padding:8px;color:#666">Project</td><td style="padding:8px">${escEmail(project_code)}</td></tr>
            <tr><td style="padding:8px;color:#666">Bron</td><td style="padding:8px">${escEmail(bron)}</td></tr>
          </table>
          <a href="https://app.helvaro.pro/dashboard" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#1e6fd9;color:#fff;border-radius:8px;text-decoration:none">Open Dashboard</a>
        </div>`
    })
  }).catch(err => console.error('[form] E-mail notificatie mislukt:', err.message));
}

async function sendWA(to, message) {
  try {
    const r = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: message } })
      }
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) {
      console.error(`[form] WhatsApp naar ${to} mislukt (${r.status}):`, JSON.stringify(data.error || data));
      return false;
    }
    console.log(`[form] WhatsApp gestuurd naar ${to}`);
    return true;
  } catch (err) {
    console.error(`[form] WhatsApp netwerk fout naar ${to}:`, err.message);
    return false;
  }
}

async function flagWaFailed(leadId, token, baseId, tableId) {
  const notities = JSON.stringify({ _v: 1, notes: [], tasks: [], calls: [], waFailed: true });
  await fetch(
    `https://api.airtable.com/v0/${baseId}/${tableId}/${leadId}`,
    {
      method:  'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fields: { fldoLRI5W12ThTls7: notities } })
    }
  ).catch(err => console.error('[form] flagWaFailed error:', err.message));
}
