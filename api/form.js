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

    const name         = (body.name         || '').trim();
    const phone        = (body.phone        || '').trim();
    const project_code = (body.project_code || 'HELVARO').trim();
    const bron         = (body.bron         || 'Website').trim();

    if (!name)  return res.status(400).json({ error: 'Naam is verplicht' });
    if (!phone) return res.status(400).json({ error: 'Telefoonnummer is verplicht' });

    // Look up client config
    const formula = encodeURIComponent(`{Project Code}="${project_code}"`);
    const cRes = await fetch(
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

    // Create lead record
    const createRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            fldbk0LVNckOU0bqA: name,
            fld6YaitW0lMqHUrd: phone,
            fldSmczuyUJd26HLe: project_code,
            fld8mkrEWcyq7mUip: 'new',
            fldGoerozqdea4BfU: bron,
            fldR0r13EU4RwrtvH: new Date().toISOString()
          }
        })
      }
    );
    const createData = await createRes.json();
    if (!createRes.ok) return res.status(500).json({ error: 'Lead aanmaken mislukt', details: createData });

    // Normalise phone number for WhatsApp (Belgian format)
    let waPhone = phone.replace(/[\s\-\(\)\.]/g, '');
    if (waPhone.startsWith('00'))       waPhone = '+' + waPhone.slice(2);
    else if (waPhone.startsWith('0'))   waPhone = '+32' + waPhone.slice(1);
    else if (!waPhone.startsWith('+'))  waPhone = '+32' + waPhone;

    // Send WhatsApp message (non-blocking — lead is already saved even if this fails)
    const waMsg = `Hallo ${name}! 👋 Ik ben ${aiName} van ${clientName}. Ik zag dat je interesse hebt — top! Mag ik je even een paar snelle vragen stellen om te zien hoe we je het beste kunnen helpen?`;
    fetch(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: waPhone, type: 'text', text: { body: waMsg } })
      }
    ).catch(err => console.error('WhatsApp send failed:', err.message));

    return res.status(200).json({ success: true, id: createData.id });

  } catch (err) {
    console.error('Form error:', err);
    return res.status(500).json({ error: 'Serverfout: ' + err.message });
  }
};
