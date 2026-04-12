const AIRTABLE_TOKEN = process.env.API_Airtable;
const AIRTABLE_BASE = process.env.BASE_AIRTABLE;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const LEADS_TABLE = "tbliukTnDAbEDcZmt";
const CLIENTS_TABLE = "tblPidTrwGRzRt4LZ";

module.exports = async function handler(req, res) {
  // Allow CORS for Bubble
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const { name, phone, project_code } = req.body;

  console.log(`Formulier ontvangen: naam=${name}, telefoon=${phone}, code=${project_code}`);

  if (!phone || !project_code) {
    return res.status(400).json({ error: "Telefoon en projectcode zijn verplicht" });
  }

  // Clean phone number — remove spaces, dashes, leading 0, add country code if needed
  let cleanPhone = phone.replace(/[\s\-\(\)]/g, "");
  if (cleanPhone.startsWith("0")) cleanPhone = "32" + cleanPhone.slice(1);
  if (cleanPhone.startsWith("+")) cleanPhone = cleanPhone.slice(1);

  try {
    // 1. Find client by project code
    const client = await getClientByCode(project_code);
    if (!client) {
      console.error(`Geen client gevonden voor code: ${project_code}`);
      return res.status(404).json({ error: "Ongeldige projectcode" });
    }
    console.log(`Client gevonden: ${client.fields["Client Name"]}`);

    // 2. Check if lead already exists
    let lead = await getLeadByPhone(cleanPhone);
    if (lead) {
      console.log(`Lead bestaat al: ${lead.id}`);
      return res.status(200).json({ success: true, message: "Lead bestaat al" });
    }

    // 3. Create new lead
    lead = await createLead(cleanPhone, name, project_code, client.id);
    console.log(`Lead aangemaakt: ${lead.id}`);

    // 4. Send first WhatsApp message
    const clientName = client.fields["Client Name"] || "ons team";
    const welcomeMessage = `Hallo${name ? " " + name : ""}! 👋\n\nBedankt voor uw interesse. Ik ben een AI-assistent van ${clientName}.\n\nIk stel u graag een paar korte vragen om u zo goed mogelijk te helpen. Mag ik beginnen?`;

    await sendWhatsApp(cleanPhone, welcomeMessage);
    console.log("Welkomstbericht verstuurd");

    return res.status(200).json({ success: true, message: "Lead aangemaakt en bericht verstuurd" });

  } catch (err) {
    console.error("Fout in form handler:", err.message);
    return res.status(500).json({ error: "Interne serverfout" });
  }
};

// ─── AIRTABLE ────────────────────────────────────────────────────────────────

async function getClientByCode(code) {
  const filter = encodeURIComponent(`{Project Code}="${code.toUpperCase()}"`);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${CLIENTS_TABLE}?filterByFormula=${filter}&maxRecords=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const data = await res.json();
  if (data.error) console.error("Airtable fout (client):", JSON.stringify(data.error));
  return data.records?.[0] || null;
}

async function getLeadByPhone(phone) {
  const filter = encodeURIComponent(`{Phone}="${phone}"`);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${LEADS_TABLE}?filterByFormula=${filter}&maxRecords=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const data = await res.json();
  if (data.error) console.error("Airtable fout (lead):", JSON.stringify(data.error));
  return data.records?.[0] || null;
}

async function createLead(phone, name, projectCode, clientId) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${LEADS_TABLE}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        Phone: phone,
        Name: name || "",
        "Project Code": projectCode.toUpperCase(),
        "Conversation State": "new",
        Client: [clientId],
      },
    }),
  });
  const data = await res.json();
  if (data.error) console.error("Airtable fout (aanmaken):", JSON.stringify(data.error));
  return data;
}

// ─── WHATSAPP ────────────────────────────────────────────────────────────────

async function sendWhatsApp(to, message) {
  const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message },
    }),
  });
  const data = await res.json();
  if (data.error) console.error("WhatsApp fout:", JSON.stringify(data.error));
  return data;
}
