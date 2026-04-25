module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
    const aiName     = cfg.fldRvoe1JMPOtPWC7 || cfg['AI Name']      || 'Mathis';
    const clientName = cfg.fldAnB848Sr5jl6dq  || cfg['Client Name'] || 'Helvaro';

    // ── Normalise phone — stored in Airtable in international digits-only format
    // so it matches what WhatsApp sends as message.from (e.g. "32466358427")
    let waPhone = phone.replace(/[\s\-\(\)\.]/g, '');
    if      (waPhone.startsWith('00')) waPhone = waPhone.slice(2);
    else if (waPhone.startsWith('+'))  waPhone = waPhone.slice(1);
    else if (waPhone.startsWith('0'))  waPhone = '32' + waPhone.slice(1);

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

    // ── Non-blocking side effects ───────────────────────────────────────────────

    // 1. WhatsApp greeting to the lead
    const waGreeting =
      `Hallo ${sanitize(name)}! 👋 Ik ben ${sanitize(aiName)} van ${sanitize(clientName)}. ` +
      `Ik zag dat je interesse hebt — top! Mag ik je even een paar snelle vragen stellen om te zien hoe we je het beste kunnen helpen?`;
    sendWA(waPhone, waGreeting);

    // 2. WhatsApp notification to the Helvaro owner
    const notifyPhone = process.env.NOTIFY_PHONE;
    if (notifyPhone) {
      const notifyMsg =
        `🔔 *Nieuwe lead!*\n\n` +
        `👤 Naam: ${sanitize(name)}\n` +
        `📱 Tel: ${phone}\n` +
        `🏢 Project: ${project_code}\n` +
        `📍 Bron: ${sanitize(bron)}\n\n` +
        `Dashboard: https://helvaro-helvaros-projects.vercel.app/dashboard`;
      sendWA(notifyPhone, notifyMsg);
    }

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

function sendWA(to, message) {
  fetch(
    `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message }
      })
    }
  ).catch(err => console.error(`WhatsApp naar ${to} mislukt:`, err.message));
}
