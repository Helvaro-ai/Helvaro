const AIRTABLE_TOKEN = process.env.API_Airtable;
const AIRTABLE_BASE = process.env.BASE_AIRTABLE;

const LEADS_TABLE = "tbliukTnDAbEDcZmt";
const CLIENTS_TABLE = "tblPidTrwGRzRt4LZ";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  // ─── AUTH ───────────────────────────────────────────────────────────────────
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) return res.status(401).json({ error: "API key ontbreekt" });

  const client = await getClientByApiKey(apiKey);
  if (!client) return res.status(403).json({ error: "Ongeldige API key" });

  const projectCode = client.fields["Project Code"];
  console.log(`Dashboard verzoek voor: ${client.fields["Client Name"]}`);

  // ─── QUERY PARAMS (filters) ──────────────────────────────────────────────────
  const { status, qualified, bron, export: exportCsv, rapport } = req.query;

  try {
    const allLeads = await getLeadsByProjectCode(projectCode);

    // ─── STATS ────────────────────────────────────────────────────────────────
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const total = allLeads.length;
    const qualifiedLeads = allLeads.filter(l => l.fields["Qualified"]);
    const bookedLeads = allLeads.filter(l => l.fields["Appointment Booked"]);
    const thisMonthLeads = allLeads.filter(l => {
      const created = new Date(l.fields["Created At"] || l.createdTime);
      return created >= startOfMonth;
    });
    const lastWeekLeads = allLeads.filter(l => {
      const created = new Date(l.fields["Created At"] || l.createdTime);
      return created >= sevenDaysAgo;
    });

    const responseTimes = allLeads
      .map(l => l.fields["Response Time (sec)"])
      .filter(t => t && t > 0);
    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;

    const conversionRate = total > 0
      ? Math.round((qualifiedLeads.length / total) * 100)
      : 0;

    const leadLimiet = client.fields["Lead Limiet"] || 300;
    const limietGebruikt = Math.round((thisMonthLeads.length / leadLimiet) * 100);

    // ─── WEEKRAPPORT ──────────────────────────────────────────────────────────
    if (rapport === "week") {
      const weekQualified = lastWeekLeads.filter(l => l.fields["Qualified"]);
      const weekBooked = lastWeekLeads.filter(l => l.fields["Appointment Booked"]);
      return res.status(200).json({
        rapport: {
          periode: `${sevenDaysAgo.toLocaleDateString("nl-BE")} - ${now.toLocaleDateString("nl-BE")}`,
          totaalLeads: lastWeekLeads.length,
          gekwalificeerd: weekQualified.length,
          afspraken: weekBooked.length,
          conversie: lastWeekLeads.length > 0
            ? Math.round((weekQualified.length / lastWeekLeads.length) * 100)
            : 0,
          gekwalificeerdeLijst: weekQualified.map(l => ({
            naam: l.fields["Name"] || "Onbekend",
            telefoon: l.fields["Phone"],
            samenvatting: l.fields["AI Summary"] || "",
            datum: l.fields["Created At"] || l.createdTime,
          })),
        },
      });
    }

    // ─── CSV EXPORT ───────────────────────────────────────────────────────────
    if (exportCsv === "true") {
      const headers = ["Naam", "Telefoon", "Status", "Gekwalificeerd", "Reden", "Samenvatting", "Capaciteit", "Urgentie", "Fit", "Bron", "Boekingslink Verstuurd", "Afspraak Geboekt", "Datum"];
      const rows = allLeads.map(l => [
        l.fields["Name"] || "",
        l.fields["Phone"] || "",
        l.fields["Conversation State"]?.name || l.fields["Conversation State"] || "",
        l.fields["Qualified"] ? "Ja" : "Nee",
        l.fields["Reason"] || "",
        l.fields["AI Summary"] || "",
        l.fields["Ability"]?.name || l.fields["Ability"] || "",
        l.fields["Urgency"]?.name || l.fields["Urgency"] || "",
        l.fields["Fit"]?.name || l.fields["Fit"] || "",
        l.fields["Bron"]?.name || l.fields["Bron"] || "",
        l.fields["Booking Link Sent"] ? "Ja" : "Nee",
        l.fields["Appointment Booked"] ? "Ja" : "Nee",
        l.fields["Created At"] || l.createdTime || "",
      ]);

      const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="leads-${projectCode}-${now.toISOString().split("T")[0]}.csv"`);
      return res.status(200).send(csv);
    }

    // ─── FILTER LEADS ─────────────────────────────────────────────────────────
    let filtered = [...allLeads];

    if (status && status !== "alle") {
      filtered = filtered.filter(l => {
        const state = l.fields["Conversation State"]?.name || l.fields["Conversation State"];
        return state === status;
      });
    }

    if (qualified && qualified !== "alle") {
      const wantQualified = qualified === "ja";
      filtered = filtered.filter(l => l.fields["Qualified"] === wantQualified);
    }

    if (bron && bron !== "alle") {
      filtered = filtered.filter(l => {
        const source = l.fields["Bron"]?.name || l.fields["Bron"];
        return source === bron;
      });
    }

    // ─── RESPONSE ─────────────────────────────────────────────────────────────
    return res.status(200).json({
      client: {
        naam: client.fields["Client Name"],
        niche: client.fields["Niche"]?.name || client.fields["Niche"],
        plan: client.fields["Plan"]?.name || client.fields["Plan"] || "Pro",
      },
      stats: {
        total,
        qualified: qualifiedLeads.length,
        booked: bookedLeads.length,
        conversionRate,
        thisMonth: thisMonthLeads.length,
        avgResponseTime,
        leadLimiet,
        limietGebruikt,
      },
      leads: filtered.map(l => ({
        id: l.id,
        naam: l.fields["Name"] || "Onbekend",
        telefoon: l.fields["Phone"] || "",
        status: l.fields["Conversation State"]?.name || l.fields["Conversation State"] || "",
        qualified: l.fields["Qualified"] || false,
        reden: l.fields["Reason"] || "",
        samenvatting: l.fields["AI Summary"] || "",
        capaciteit: l.fields["Ability"]?.name || l.fields["Ability"] || "",
        urgentie: l.fields["Urgency"]?.name || l.fields["Urgency"] || "",
        fit: l.fields["Fit"]?.name || l.fields["Fit"] || "",
        bron: l.fields["Bron"]?.name || l.fields["Bron"] || "",
        boekingslinkVerstuurd: l.fields["Booking Link Sent"] || false,
        afspraakGeboekt: l.fields["Appointment Booked"] || false,
        notities: l.fields["Notities"] || "",
        reactietijd: l.fields["Response Time (sec)"] || 0,
        datum: l.fields["Created At"] || l.createdTime,
      })),
    });

  } catch (err) {
    console.error("Fout bij ophalen leads:", err.message);
    return res.status(500).json({ error: "Interne serverfout" });
  }
};

// ─── AIRTABLE ────────────────────────────────────────────────────────────────

async function getClientByApiKey(apiKey) {
  const filter = encodeURIComponent(`{API Key}="${apiKey}"`);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${CLIENTS_TABLE}?filterByFormula=${filter}&maxRecords=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const data = await res.json();
  if (data.error) console.error("Airtable fout (client):", JSON.stringify(data.error));
  return data.records?.[0] || null;
}

async function getLeadsByProjectCode(projectCode) {
  const filter = encodeURIComponent(`{Project Code}="${projectCode}"`);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${LEADS_TABLE}?filterByFormula=${filter}&sort[0][field]=Created%20At&sort[0][direction]=desc`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const data = await res.json();
  if (data.error) console.error("Airtable fout (leads):", JSON.stringify(data.error));
  return data.records || [];
}
