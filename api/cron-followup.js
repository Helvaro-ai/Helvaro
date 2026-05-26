// Vercel cron — runs daily at 09:00 UTC
// Sends a follow-up WhatsApp to leads that:
//   - Status is still 'new'
//   - Were created between 24h and 48h ago (so exactly one follow-up per lead)
//   - Haven't received a follow-up yet (Conversation History has only 1 AI message)

module.exports = async function handler(req, res) {
  // Vercel calls cron endpoints with GET; block other methods
  if (req.method !== 'GET') return res.status(405).end();

  // Protect with CRON_SECRET so only Vercel can trigger this
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const LEADS_TABLE    = 'tbliukTnDAbEDcZmt';
  const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
  const WHATSAPP_TOKEN  = process.env.WHATSAPP_TOKEN;

  const now    = new Date();
  const ago24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const ago48h = new Date(now - 48 * 60 * 60 * 1000).toISOString();

  try {
    // Fetch leads created between 24h and 48h ago that are still 'new'
    // Use field IDs in formula — immune to field renames in Airtable
    const formula = encodeURIComponent(
      `AND({fld8mkrEWcyq7mUip}="new",{fldR0r13EU4RwrtvH}<"${ago24h}",{fldR0r13EU4RwrtvH}>"${ago48h}")`
    );
    const url  = `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}?filterByFormula=${formula}&pageSize=50`;
    const lRes = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });

    if (lRes.status === 429) {
      console.warn('[cron-followup] Airtable 429 — follow-ups uitgesteld tot morgen');
      return res.status(200).json({ checked: 0, sent: 0, skipped: 'rate_limited' });
    }
    const lData = await lRes.json();
    if (!lRes.ok) throw new Error('Airtable ' + lRes.status);

    const leads = lData.records || [];
    let sent = 0;
    const followedUp = [];

    for (const lead of leads) {
      const phone = lead.fields['fld6YaitW0lMqHUrd'] || lead.fields['Phone'] || '';
      const name  = lead.fields['fldbk0LVNckOU0bqA']  || lead.fields['Name']  || '';
      if (!phone) continue;

      // Only send if conversation has ≤1 AI message (lead never replied)
      let history = [];
      try { history = JSON.parse(lead.fields['Conversation History'] || '[]'); } catch { history = []; }
      const userReplies = history.filter(m => m.role === 'user').length;
      if (userReplies > 0) continue; // They replied — no follow-up needed

      const firstName = name.split(' ')[0] || name;
      const msg = `Hé ${firstName}, we hebben je bericht gekregen maar nog niks teruggehoord. Is er iets waarmee ik je kan helpen?`;

      // ── 24-uurs venster: na 24u STIL mag je geen freeform meer sturen ─────
      // (Meta-policy: account-bans bij overtreding). Stuur een goedgekeurde
      // template als die geconfigureerd is. Anders: skip de follow-up — beter
      // geen follow-up dan een account-ban.
      // Template moet vooraf in WhatsApp Manager → Message Templates worden
      // aangemaakt en goedgekeurd. Variabele {{1}} = de voornaam.
      const TEMPLATE_NAME = process.env.FOLLOWUP_TEMPLATE_NAME;
      const TEMPLATE_LANG = process.env.FOLLOWUP_TEMPLATE_LANG || 'nl';
      if (TEMPLATE_NAME) {
        await sendWATemplate(phone, TEMPLATE_NAME, TEMPLATE_LANG, [firstName], PHONE_NUMBER_ID, WHATSAPP_TOKEN);
      } else {
        console.warn(`[cron-followup] FOLLOWUP_TEMPLATE_NAME niet geconfigureerd — skip ${phone} (freeform >24u zou ban riskeren)`);
        continue;  // skip — don't risk a Meta ban
      }

      // Mark follow-up sent — prevents duplicate follow-ups on next cron run
      const pRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${lead.id}`,
        {
          method:  'PATCH',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fields: { fld8mkrEWcyq7mUip: 'in_progress' } })
        }
      );
      if (!pRes.ok) {
        console.error(`[cron-followup] PATCH mislukt voor ${lead.id} (${pRes.status}) — lead wordt morgen opnieuw geprobeerd`);
      }

      sent++;
      followedUp.push(name || phone);
      // Slight delay to avoid WhatsApp rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[cron-followup] Checked ${leads.length} leads, sent ${sent} follow-ups`);

    // ── Daily summary email ──────────────────────────────────────────────────
    if (sent > 0) {
      const escE = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const rows = followedUp.map(n =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${escE(n)}</td></tr>`
      ).join('');
      sendResendEmail({
        subject: `📋 Helvaro — ${sent} follow-up${sent > 1 ? 's' : ''} verstuurd vandaag`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto">
            <h2 style="color:#1e6fd9">Dagelijkse follow-up update</h2>
            <p style="color:#444">${sent} van ${leads.length} onderzochte leads ontvingen vandaag een WhatsApp follow-up:</p>
            <table style="width:100%;border-collapse:collapse;margin-top:8px">
              <thead><tr><th style="text-align:left;padding:6px 10px;background:#f5f5f5;color:#666;font-size:12px">Lead naam</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
            <a href="https://app.helvaro.pro/dashboard" style="display:inline-block;margin-top:20px;padding:10px 20px;background:#1e6fd9;color:#fff;border-radius:8px;text-decoration:none">Open Dashboard</a>
          </div>`
      }).catch(() => {});
    }

    // ── Quality rating check (daily) ──────────────────────────────────────────
    // Pulls the current WhatsApp quality rating for our phone number. If it's
    // YELLOW or RED, fire an email alert so Helvaro support can act before Meta
    // throttles or bans the number.
    const qualityResult = await checkQualityRating(PHONE_NUMBER_ID, WHATSAPP_TOKEN).catch(e => {
      console.error('[cron-followup] quality check failed:', e.message);
      return null;
    });

    // ── Weekly client report (Mondays) ───────────────────────────────────────
    // Stuurt elke maandag (UTC) een overzichts-email naar elke klant met hun
    // Rapport Email ingesteld. Per-klant: leads/week, qualified, conversie, top 5.
    let weeklyResult = null;
    if (now.getUTCDay() === 1) {   // 0=Sun, 1=Mon
      weeklyResult = await sendWeeklyClientReports(AIRTABLE_TOKEN, BASE_ID, LEADS_TABLE).catch(e => {
        console.error('[cron-followup] weekly report failed:', e.message);
        return null;
      });
    }

    return res.status(200).json({ checked: leads.length, sent, quality: qualityResult, weekly: weeklyResult });

  } catch (err) {
    console.error('[cron-followup] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ── Quality rating check ─────────────────────────────────────────────────────
// Calls the Meta Graph API to fetch this phone number's current quality rating.
// Meta returns "GREEN" / "YELLOW" / "RED" / "UNKNOWN". RED = throttling imminent
// or already happening; YELLOW = warning. Fires an email so support can act.
async function checkQualityRating(phoneNumberId, token) {
  if (!phoneNumberId || !token) return null;
  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}?fields=quality_rating,name_status,verified_name`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    console.error('[quality] Meta fout', r.status, txt.slice(0, 200));
    return null;
  }
  const d = await r.json();
  const quality = d.quality_rating || 'UNKNOWN';
  console.log('[quality] rating =', quality, '| name_status =', d.name_status);

  if (quality === 'RED' || quality === 'YELLOW') {
    const icon = quality === 'RED' ? '🔴' : '🟡';
    sendResendEmail({
      subject: `${icon} WhatsApp quality rating ${quality} — actie nodig`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:20px">
          <h2 style="color:${quality === 'RED' ? '#dc2626' : '#d97706'}">${icon} WhatsApp Quality: ${quality}</h2>
          <p>De WhatsApp Business phone number quality is gezakt naar <strong>${quality}</strong>.</p>
          ${quality === 'RED'
            ? '<p style="background:#fef2f2;padding:12px;border-radius:8px;color:#b91c1c"><strong>RED = throttling actief.</strong> Meta beperkt het aantal berichten dat je per dag mag sturen. Bij meerdere RED-dagen riskeer je een permanente ban.</p>'
            : '<p style="background:#fffbeb;padding:12px;border-radius:8px;color:#92400e"><strong>YELLOW = waarschuwing.</strong> Te veel blocks of spam-reports — quality zakt verder als je niks doet.</p>'}
          <h3 style="margin-top:24px">Wat nu doen</h3>
          <ul style="line-height:1.7">
            <li>Check welke klanten templates gebruiken die spammy zijn</li>
            <li>Verifieer dat alle leads echt opt-in zijn (formulier gecheckt)</li>
            <li>Pauzeer eventueel outbound campagnes voor 48u tot quality herstelt</li>
            <li>Open <a href="https://business.facebook.com/wa/manage/phone-numbers" style="color:#1e6fd9">WhatsApp Manager → Phone Numbers</a> voor details</li>
          </ul>
          <p style="font-size:12px;color:#999;margin-top:24px">Phone Number ID: ${phoneNumberId}<br>Verified name: ${d.verified_name || '—'} (status: ${d.name_status || '—'})</p>
        </div>`
    }).catch(() => {});
  }
  return { quality, name_status: d.name_status };
}

// ── Resend email helper ──────────────────────────────────────────────────────
async function sendResendEmail({ subject, html }) {
  const key = process.env.RESEND_API_KEY;
  const addr = process.env.NOTIFY_EMAIL;
  if (!key)  { console.warn('[resend cron] skipped: RESEND_API_KEY missing'); return; }
  if (!addr) { console.warn('[resend cron] skipped: NOTIFY_EMAIL missing');   return; }
  const from = process.env.RESEND_FROM || 'Sindi @ Helvaro <sindi.s@usehelvaro.pro>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ from, to: [addr], subject, html })
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('[resend cron] failed', r.status, body.slice(0, 400));
    }
  } catch (err) {
    console.error('[resend cron] network error:', err && err.message);
  }
}

// ── Weekly per-client report ─────────────────────────────────────────────────
// Op maandag (UTC) bouwt deze functie voor elke klant met een Rapport Email een
// samenvatting van de afgelopen 7 dagen en mailt die naar de klant zelf.
// Fail-soft: een mislukte klant blokkeert de andere niet.
async function sendWeeklyClientReports(airtableToken, baseId, leadsTable) {
  const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';
  const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Haal alle actieve klanten met een Rapport Email op
  const cFormula = encodeURIComponent(`AND({Active}=1, NOT({Rapport Email}=""))`);
  const cRes = await fetch(
    `https://api.airtable.com/v0/${baseId}/${CLIENTS_TABLE}?filterByFormula=${cFormula}&pageSize=100`,
    { headers: { Authorization: `Bearer ${airtableToken}` } }
  );
  if (!cRes.ok) { console.error('[weekly] clients fetch failed', cRes.status); return null; }
  const clients = (await cRes.json()).records || [];
  console.log(`[weekly] ${clients.length} clients with Rapport Email`);

  let sent = 0, skipped = 0;
  for (const client of clients) {
    const projectCode  = client.fields['fldN4dL0bGgfBOXwM']  || client.fields['Project Code']  || '';
    const clientName   = client.fields['fldAnB848Sr5jl6dq']  || client.fields['Client Name']   || '';
    const reportEmail  = client.fields['fldDBJCN6dVMA8jax']  || client.fields['Rapport Email'] || '';
    if (!projectCode || !reportEmail) { skipped++; continue; }

    // 2. Haal alle leads van deze klant uit de afgelopen 7 dagen
    const lFormula = encodeURIComponent(`AND({Project Code}="${projectCode.replace(/"/g, '\\"')}", {Created At}>"${weekAgoIso}")`);
    const lRes = await fetch(
      `https://api.airtable.com/v0/${baseId}/${leadsTable}?filterByFormula=${lFormula}&pageSize=100`,
      { headers: { Authorization: `Bearer ${airtableToken}` } }
    );
    if (!lRes.ok) { console.error('[weekly] leads fetch failed for', projectCode, lRes.status); skipped++; continue; }
    const leads = (await lRes.json()).records || [];

    // 3. Stats berekenen
    const total = leads.length;
    const qualified  = leads.filter(l => l.fields['Qualified'] === true);
    const responseTimes = leads.map(l => l.fields['Response Time (sec)']).filter(t => typeof t === 'number' && t > 0);
    const avgResponse = responseTimes.length
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null;
    const conversionPct = total > 0 ? Math.round((qualified.length / total) * 100) : 0;

    // Top 5 gekwalificeerde leads gesorteerd op score
    const top5 = [...qualified]
      .sort((a, b) => (b.fields['Lead Score'] || 0) - (a.fields['Lead Score'] || 0))
      .slice(0, 5);

    // 4. Email versturen
    const ok = await sendWeeklyReportEmail({
      to: reportEmail, clientName, projectCode,
      stats: { total, qualified: qualified.length, conversionPct, avgResponse },
      top5
    });
    if (ok) sent++; else skipped++;
    // Spread rate-limit pressure on Resend
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(`[weekly] sent ${sent}, skipped ${skipped}`);
  return { sent, skipped, total: clients.length };
}

async function sendWeeklyReportEmail({ to, clientName, projectCode, stats, top5 }) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) { console.warn('[weekly] RESEND_API_KEY missing'); return false; }
  const FROM = process.env.RESEND_FROM || 'Sindi @ Helvaro <sindi.s@usehelvaro.pro>';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const fmtTime = s => s == null ? '—' : (s < 60 ? `${s}s` : `${Math.round(s/60)}m`);
  const topRows = top5.length
    ? top5.map(l => {
        const f = l.fields || {};
        return `<tr>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;font-weight:600">${esc(f['Name'] || '—')}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;color:#666;font-size:13px">${esc(f['AI Summary'] || '—')}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;color:#1e6fd9">${f['Lead Score'] || 0}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="3" style="padding:18px;text-align:center;color:#999;font-style:italic">Nog geen gekwalificeerde leads deze week — komt nog!</td></tr>`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:auto;padding:24px;color:#111;background:#fff">
      <h2 style="color:#1e6fd9;margin:0 0 4px">Weekrapport — ${esc(clientName)}</h2>
      <p style="color:#666;margin:0 0 28px;font-size:14px">Overzicht van de afgelopen 7 dagen op je Helvaro account.</p>

      <table style="width:100%;border-collapse:separate;border-spacing:8px;margin-bottom:24px">
        <tr>
          <td style="background:#f0f6ff;border-radius:12px;padding:18px;text-align:center;width:25%">
            <div style="font-size:28px;font-weight:700;color:#1e6fd9">${stats.total}</div>
            <div style="font-size:12px;color:#666;margin-top:4px">Nieuwe leads</div>
          </td>
          <td style="background:#ecfdf5;border-radius:12px;padding:18px;text-align:center;width:25%">
            <div style="font-size:28px;font-weight:700;color:#059669">${stats.qualified}</div>
            <div style="font-size:12px;color:#666;margin-top:4px">Gekwalificeerd</div>
          </td>
          <td style="background:#fef3c7;border-radius:12px;padding:18px;text-align:center;width:25%">
            <div style="font-size:28px;font-weight:700;color:#d97706">${stats.conversionPct}%</div>
            <div style="font-size:12px;color:#666;margin-top:4px">Conversie</div>
          </td>
          <td style="background:#f3e8ff;border-radius:12px;padding:18px;text-align:center;width:25%">
            <div style="font-size:28px;font-weight:700;color:#7c3aed">${fmtTime(stats.avgResponse)}</div>
            <div style="font-size:12px;color:#666;margin-top:4px">Gem. responstijd</div>
          </td>
        </tr>
      </table>

      <h3 style="margin:0 0 12px;font-size:16px">🔥 Top 5 gekwalificeerde leads</h3>
      <table style="width:100%;border-collapse:collapse;background:#fafbfc;border-radius:10px;overflow:hidden">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="text-align:left;padding:10px 8px;font-size:12px;color:#6b7280;font-weight:600">Naam</th>
            <th style="text-align:left;padding:10px 8px;font-size:12px;color:#6b7280;font-weight:600">Samenvatting</th>
            <th style="text-align:right;padding:10px 8px;font-size:12px;color:#6b7280;font-weight:600">Score</th>
          </tr>
        </thead>
        <tbody>${topRows}</tbody>
      </table>

      <p style="text-align:center;margin:28px 0 8px">
        <a href="https://app.helvaro.pro/dashboard" style="display:inline-block;padding:14px 28px;background:#1e6fd9;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open Dashboard</a>
      </p>

      <p style="margin-top:32px;font-size:12px;color:#999;border-top:1px solid #eee;padding-top:16px;text-align:center">
        Helvaro · AI-gestuurde lead-kwalificatie via WhatsApp · <a href="https://helvaro.pro" style="color:#999">helvaro.pro</a>
      </p>
    </div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ from: FROM, to: [to], subject: `📊 Helvaro weekrapport — ${clientName}`, html })
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error('[weekly] resend fail', r.status, txt.slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[weekly] network error:', err && err.message);
    return false;
  }
}

// Stuur een goedgekeurde Meta-template (verplicht buiten het 24u customer-service venster).
// `params` = de body-variabelen die in de template als {{1}}, {{2}}, ... staan.
function sendWATemplate(to, templateName, lang, params, phoneNumberId, token) {
  const components = (params && params.length)
    ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: String(p) })) }]
    : [];
  return fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: { name: templateName, language: { code: lang }, components }
      })
    }
  ).then(async r => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) console.error(`[cron-followup] template "${templateName}" naar ${to} mislukt:`, JSON.stringify(d.error || d));
  }).catch(err => console.error(`[cron-followup] template netwerk fout naar ${to}:`, err.message));
}

function sendWA(to, message, phoneNumberId, token) {
  return fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message }
      })
    }
  ).then(async r => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) console.error(`[cron-followup] WA fout naar ${to}:`, JSON.stringify(d.error || d));
  }).catch(err => console.error(`[cron-followup] WA netwerk fout naar ${to}:`, err.message));
}
