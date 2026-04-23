const BASE             = process.env.BASE_AIRTABLE;
const TOKEN            = process.env.API_Airtable;
const WHATSAPP_TOKEN   = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID  = process.env.PHONE_NUMBER_ID;

const LEADS_TABLE  = 'tbliukTnDAbEDcZmt';
const CLIENT_TABLE = 'tblPidTrwGRzRt4LZ';

const LF = {
  name:        'fldbk0LVNckOU0bqA',
  phone:       'fld6YaitW0lMqHUrd',
  projectCode: 'fldSmczuyUJd26HLe',
  status:      'fld8mkrEWcyq7mUip',
  bron:        'fldGoerozqdea4BfU',
  createdAt:   'fldR0r13EU4RwrtvH',
};

const CF = {
  clientName:  'fldAnB848Sr5jl6dq',
  projectCode: 'fldN4dL0bGgfBOXwM',
  aiName:      'fldRvoe1JMPOtPWC7',
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

function normalisePhone(raw) {
  let p = String(raw).replace(/[\s\-().]/g, '');
  if (p.startsWith('+')) return p;
  if (p.startsWith('00')) return '+' + p.slice(2);
  if (p.startsWith('0'))  return '+32' + p.slice(1);
  if (p.startsWith('32')) return '+' + p;
  return p;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body         = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { name, phone } = body;
  const project_code = body.project_code || 'HELVARO';
  const bron         = body.bron         || 'Website';

  if (!name || !phone) {
    return res.status(400).json({ error: 'Naam en telefoonnummer zijn verplicht.' });
  }

  // Look up Client Config
  let client;
  try {
    const formula = encodeURIComponent(`{${CF.projectCode}}="${project_code}"`);
    const data    = await airtable(`/${CLIENT_TABLE}?filterByFormula=${formula}&maxRecords=1`);
    client        = data.records?.[0];
  } catch (err) {
    console.error('[form] client lookup:', err.message);
    return res.status(500).json({ error: 'Fout bij ophalen clientgegevens.' });
  }

  if (!client) {
    return res.status(404).json({ error: 'Ongeldige projectcode.' });
  }

  const clientName = client.fields[CF.clientName] || 'Helvaro';
  const aiName     = client.fields[CF.aiName]     || 'Mathis';

  // Create lead record
  let recordId;
  try {
    const result = await airtable(`/${LEADS_TABLE}`, {
      method: 'POST',
      body: JSON.stringify({
        records: [{
          fields: {
            [LF.name]:        name,
            [LF.phone]:       phone,
            [LF.projectCode]: project_code,
            [LF.status]:      'new',
            [LF.bron]:        bron,
            [LF.createdAt]:   new Date().toISOString(),
          },
        }],
      }),
    });
    recordId = result.records?.[0]?.id;
  } catch (err) {
    console.error('[form] create lead:', err.message);
    return res.status(500).json({ error: 'Kon lead niet aanmaken.' });
  }

  // Send WhatsApp message (non-blocking — don't fail the response if WA fails)
  try {
    const waPhone  = normalisePhone(phone);
    const message  = `Hallo ${name}! 👋 Ik ben ${aiName} van ${clientName}. Ik zag dat je interesse hebt — top! Mag ik je even een paar snelle vragen stellen om te zien hoe we je het beste kunnen helpen?`;
    await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:   waPhone,
        type: 'text',
        text: { body: message },
      }),
    });
  } catch (err) {
    console.error('[form] WhatsApp:', err.message);
    // Continue — lead is already created
  }

  return res.status(200).json({ success: true, id: recordId });
}
