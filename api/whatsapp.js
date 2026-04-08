const VERIFY_TOKEN = "leadbot_verify_token";

const AIRTABLE_TOKEN = process.env.API_Airtable;
const AIRTABLE_BASE = process.env.BASE_AIRTABLE;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const LEADS_TABLE = "tbliukTnDAbEDcZmt";
const CLIENTS_TABLE = "tblPidTrwGRzRt4LZ";

// ─── WEBHOOK HANDLER ────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  if (req.method === "POST") {
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message || message.type !== "text") {
      return res.status(200).send("OK");
    }

    const phone = message.from;
    const text = message.text.body;

    console.log(`Bericht van ${phone}: ${text}`);

    try {
      await processMessage(phone, text);
    } catch (err) {
      console.error("Fout bij verwerken bericht:", err);
    }

    return res.status(200).send("OK");
  }

  return res.status(405).send("Method Not Allowed");
};

// ─── MAIN LOGIC ─────────────────────────────────────────────────────────────

async function processMessage(phone, text) {
  const client = await getClient();
  if (!client) {
    await sendWhatsApp(phone, "Systeem is nog niet geconfigureerd.");
    return;
  }

  let lead = await getLead(phone);
  if (!lead) {
    lead = await createLead(phone, client.id);
  }

  const history = buildHistory(lead, text);
  const aiResponse = await runAI(history, client.fields["AI Instructions"], lead);

  await updateLead(lead.id, {
    "Last Message": text,
    "Conversation State": aiResponse.done ? "completed" : "in_progress",
    ...(aiResponse.done && {
      "Qualified": aiResponse.qualified,
      "Reason": aiResponse.reason,
      "AI Summary": aiResponse.summary,
      "Ability": aiResponse.ability,
      "Urgency": aiResponse.urgency,
      "Fit": aiResponse.fit,
    }),
  });

  await sendWhatsApp(phone, aiResponse.message);

  if (aiResponse.qualified && !lead.fields["Booking Link Sent"]) {
    const calendly = client.fields["Calendly Link"];
    if (calendly) {
      await sendWhatsApp(phone, `Boek hier uw afspraak: ${calendly}`);
      await updateLead(lead.id, { "Booking Link Sent": true });
    }
  }
}

// ─── AI ─────────────────────────────────────────────────────────────────────

async function runAI(history, instructions, lead) {
  const systemPrompt = `
Je bent een AI-assistent die leads kwalificeert via WhatsApp.

Jouw taak:
1. Voer een natuurlijk, vriendelijk gesprek in het Nederlands
2. Beoordeel de lead op basis van: Financiële capaciteit (kunnen ze het betalen?), Urgentie (hoe snel willen ze dit?), Fit (zijn ze een goede match?)
3. Stel ÉÉN vraag per keer — houd het conversationeel, niet als een formulier
4. Na 3 tot 5 berichten, maak een kwalificatiebeslissing

Instructies van de klant:
${instructions}

Wanneer je genoeg informatie hebt om een beslissing te nemen, eindig je bericht met dit JSON-blok (op een nieuwe regel):
DECISION:{"qualified":true/false,"reason":"korte reden in het Nederlands","summary":"1-2 zinnen samenvatting van de lead in het Nederlands","ability":"low/medium/high","urgency":"low/medium/high","fit":"poor/moderate/strong"}

Voeg het DECISION-blok ALLEEN toe als je genoeg informatie hebt. Anders antwoord je gewoon natuurlijk in het Nederlands.
`.trim();

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: history,
    }),
  });

  const data = await response.json();
  const raw = data.content?.[0]?.text || "";

  const decisionMatch = raw.match(/DECISION:(\{.*\})/s);
  if (decisionMatch) {
    try {
      const decision = JSON.parse(decisionMatch[1]);
      const message = raw.replace(/DECISION:(\{.*\})/s, "").trim();
      return { done: true, message, ...decision };
    } catch (e) {
      console.error("Fout bij parsen beslissing:", e);
    }
  }

  return { done: false, message: raw };
}

function buildHistory(lead, newMessage) {
  const history = [];

  if (lead.fields["Last Message"]) {
    history.push({ role: "assistant", content: "Hallo! Hoe kan ik u helpen?" });
    history.push({ role: "user", content: lead.fields["Last Message"] });
  }

  history.push({ role: "user", content: newMessage });
  return history;
}

// ─── AIRTABLE ────────────────────────────────────────────────────────────────

async function getClient() {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${CLIENTS_TABLE}?maxRecords=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const data = await res.json();
  return data.records?.[0] || null;
}

async function getLead(phone) {
  const filter = encodeURIComponent(`{Phone}="${phone}"`);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${LEADS_TABLE}?filterByFormula=${filter}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const data = await res.json();
  return data.records?.[0] || null;
}

async function createLead(phone, clientId) {
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
        "Conversation State": "new",
        Client: [clientId],
      },
    }),
  });
  return await res.json();
}

async function updateLead(recordId, fields) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${LEADS_TABLE}/${recordId}`;
  await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
}

// ─── WHATSAPP ────────────────────────────────────────────────────────────────

async function sendWhatsApp(to, message) {
  const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
  await fetch(url, {
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
}
