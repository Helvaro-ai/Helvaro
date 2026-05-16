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

    const ONBOARD_CODE = process.env.ONBOARD_CODE;
    const ADMIN_KEY    = process.env.ADMIN_KEY;

    // ── founder modes: pipeline + goals + AI advice (admin only) ────────────
    const FOUNDER_MODES = ['pipeline-create','pipeline-update','pipeline-delete','goal-save','goal-delete','ai-advice','ai-chat','linkedin-post'];
    if (FOUNDER_MODES.includes(body.mode)) {
      const fProvided = String(req.headers['x-api-key'] || '').trim();
      if (!isValidAdminToken(fProvided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
      const MYSTARTUP_BASE = 'appjJW396QWRaNOVi';
      const PIPELINE_TABLE = 'tblihBS81FqGUZoY1';
      const GOALS_TABLE    = 'tblAFVa64xoHmp942';

      try {
        // ── pipeline-create ──────────────────────────────────────────────────
        if (body.mode === 'pipeline-create') {
          const naam     = String(body.naam     || '').trim().slice(0, 100);
          const bedrijf  = String(body.bedrijf  || '').trim().slice(0, 100);
          const email    = String(body.email    || '').trim().slice(0, 200);
          const fase     = String(body.fase     || 'Gecontacteerd').trim();
          const notities = String(body.notities || '').trim().slice(0, 2000);
          if (!naam) return res.status(400).json({ error: 'Naam is verplicht' });
          const r = await fetch(`https://api.airtable.com/v0/${MYSTARTUP_BASE}/${PIPELINE_TABLE}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: {
              'Naam': naam, 'Bedrijf': bedrijf, 'Email': email,
              'Fase': fase, 'Notities': notities,
              'Aangemaakt': new Date().toISOString().slice(0, 10)
            }})
          });
          const d = await r.json();
          if (!r.ok) return res.status(500).json({ error: d?.error?.message || 'Aanmaken mislukt' });
          return res.status(200).json({ id: d.id, success: true });
        }

        // ── pipeline-update ──────────────────────────────────────────────────
        if (body.mode === 'pipeline-update') {
          const recId = String(body.id || '').trim();
          if (!recId) return res.status(400).json({ error: 'ID verplicht' });
          const fields = {};
          if (body.naam     !== undefined) fields['Naam']      = String(body.naam).trim().slice(0, 100);
          if (body.bedrijf  !== undefined) fields['Bedrijf']   = String(body.bedrijf).trim().slice(0, 100);
          if (body.email    !== undefined) fields['Email']     = String(body.email).trim().slice(0, 200);
          if (body.fase     !== undefined) fields['Fase']      = String(body.fase).trim();
          if (body.notities !== undefined) fields['Notities']  = String(body.notities).trim().slice(0, 2000);
          const r = await fetch(`https://api.airtable.com/v0/${MYSTARTUP_BASE}/${PIPELINE_TABLE}/${recId}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields })
          });
          const d = await r.json();
          if (!r.ok) return res.status(500).json({ error: d?.error?.message || 'Update mislukt' });
          return res.status(200).json({ success: true });
        }

        // ── pipeline-delete ──────────────────────────────────────────────────
        if (body.mode === 'pipeline-delete') {
          const recId = String(body.id || '').trim();
          if (!recId) return res.status(400).json({ error: 'ID verplicht' });
          const r = await fetch(`https://api.airtable.com/v0/${MYSTARTUP_BASE}/${PIPELINE_TABLE}/${recId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
          });
          if (!r.ok) return res.status(500).json({ error: 'Verwijderen mislukt' });
          return res.status(200).json({ success: true });
        }

        // ── goal-save (create or update) ─────────────────────────────────────
        if (body.mode === 'goal-save') {
          const doel     = String(body.doel     || '').trim().slice(0, 200);
          const target   = Number(body.target)  || 0;
          const eenheid  = String(body.eenheid  || '').trim().slice(0, 50);
          const deadline = String(body.deadline || '').trim();
          const actief   = body.actief !== false;
          if (!doel) return res.status(400).json({ error: 'Doel is verplicht' });
          const fields = { 'Doel': doel, 'Target': target, 'Eenheid': eenheid, 'Actief': actief };
          if (deadline) fields['Deadline'] = deadline;
          let r, d;
          if (body.id) {
            r = await fetch(`https://api.airtable.com/v0/${MYSTARTUP_BASE}/${GOALS_TABLE}/${body.id}`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ fields })
            });
          } else {
            r = await fetch(`https://api.airtable.com/v0/${MYSTARTUP_BASE}/${GOALS_TABLE}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ fields })
            });
          }
          d = await r.json();
          if (!r.ok) return res.status(500).json({ error: d?.error?.message || 'Opslaan mislukt' });
          return res.status(200).json({ id: d.id, success: true });
        }

        // ── goal-delete ──────────────────────────────────────────────────────
        if (body.mode === 'goal-delete') {
          const recId = String(body.id || '').trim();
          if (!recId) return res.status(400).json({ error: 'ID verplicht' });
          const r = await fetch(`https://api.airtable.com/v0/${MYSTARTUP_BASE}/${GOALS_TABLE}/${recId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
          });
          if (!r.ok) return res.status(500).json({ error: 'Verwijderen mislukt' });
          return res.status(200).json({ success: true });
        }

        // ── ai-advice ────────────────────────────────────────────────────────
        if (body.mode === 'ai-advice') {
          const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
          if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY niet ingesteld' });
          const ctx = body.context || {};
          const prompt = [
            'Je bent een strategische startup-adviseur voor Helvaro, een Belgische AI-aangedreven leadkwalificatie SaaS.',
            '',
            'Huidige status:',
            '- Actieve klanten: ' + (ctx.clients || 0),
            '- Leads deze maand: ' + (ctx.leadsMonth || 0),
            '- Gekwalificeerd: ' + (ctx.qualified || 0) + '%',
            '- Nieuwe ongelezen leads: ' + (ctx.newLeads || 0),
            '',
            'Sales pipeline:',
            '- Gecontacteerd: ' + (ctx.pipeContacted || 0) + ' prospects',
            '- Geïnteresseerd: ' + (ctx.pipeInterested || 0) + ' prospects',
            '- Beslissing: ' + (ctx.pipeDecision || 0) + ' prospects',
            '- Gewonnen: ' + (ctx.pipeWon || 0),
            '',
            (ctx.goals && ctx.goals.length ? 'Doelen:\n' + ctx.goals.map(g => '- ' + g.doel + ': target ' + g.target + ' ' + g.eenheid + (g.deadline ? ' (deadline ' + g.deadline + ')' : '')).join('\n') : ''),
            '',
            'Geef de 3 meest impactvolle acties voor deze week. Wees concreet, kort en direct. Antwoord in het Nederlands.'
          ].filter(Boolean).join('\n');

          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key':         ANTHROPIC_KEY,
              'anthropic-version': '2023-06-01',
              'Content-Type':      'application/json'
            },
            body: JSON.stringify({
              model:      'claude-haiku-4-5',
              max_tokens: 600,
              messages:   [{ role: 'user', content: prompt }]
            })
          });
          const aiData = await aiRes.json();
          if (!aiRes.ok) return res.status(500).json({ error: 'AI fout: ' + (aiData?.error?.message || aiRes.status) });
          const advice = aiData.content?.[0]?.text || 'Geen advies beschikbaar.';
          return res.status(200).json({ advice });
        }

        // ── ai-chat ────────────────────────────────────────────────────────────
        if (body.mode === 'ai-chat') {
          const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
          if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY niet ingesteld' });
          const rawMsgs = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
          const validMessages = rawMsgs
            .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
          if (!validMessages.length) return res.status(400).json({ error: 'Geen berichten' });

          const systemPrompt = [
            'Je bent een concrete business coach voor Helvaro, een Belgische AI-startup.',
            '',
            'Helvaro context:',
            '- Product: AI qualificeert leads automatisch via WhatsApp en plant serieuze prospects in de Calendly agenda',
            '- Founders: Frade (technisch) + Teljo (marketing/sales)',
            '- Doel: 5 klanten met 3-maands contract voor 20 juni 2026 (35 dagen resterend)',
            '- Doelgroep: marketingbureaus, vastgoedkantoren, coaches in Gent/Antwerpen',
            '- Prospects: CNIP, Ants Agency, VICUS Vastgoed, Opex Consulting, Bureau 9000, Concordia, Nouchka Design, SilverLine Studio, Magelaan',
            '- Prijzen: Starter €149/mnd, Groei €249/mnd, Agency €399/mnd (3 mnd contract)',
            '',
            'Geef altijd concrete, korte antwoorden in het Nederlands. Max 3 paragrafen. Doe aan actie, niet theorie.'
          ].join('\n');

          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 500, system: systemPrompt, messages: validMessages })
          });
          const aiData2 = await aiRes.json();
          if (!aiRes.ok) return res.status(500).json({ error: 'AI fout: ' + (aiData2?.error?.message || aiRes.status) });
          const reply = aiData2.content?.[0]?.text || 'Geen antwoord beschikbaar.';
          return res.status(200).json({ reply });
        }

        // ── content-post (linkedin + instagram, all types) ─────────────────────
        if (body.mode === 'linkedin-post' || body.mode === 'content-post') {
          const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
          if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY niet ingesteld' });

          const platform   = String(body.platform   || 'linkedin');
          const contentType = String(body.contentType || 'pijnpunt');
          const day = new Date().getDay();
          const daySectors = {
            1: 'marketingbureaus en digitale agencies',
            2: 'vastgoedkantoren en immobureaus',
            3: 'business coaches en consultants',
            4: 'KMO\'s en ondernemers in Gent/Antwerpen',
            5: 'salesteams die groeien via leadgeneratie'
          };
          const sector = String(body.sector || daySectors[day] || 'ondernemers die groeien via leadgeneratie');

          // Brand context (scraped from helvaro.pro)
          const brandContext = [
            'Helvaro = Belgische AI startup voor automatische WhatsApp leadopvolging.',
            'Tagline: "AI-gedreven Sales Opvolging. Helvaro volgt elke lead automatisch op via WhatsApp en AI, binnen 30 seconden, zodat jouw salesteam alleen nog praat met mensen die klaar zijn."',
            'Key messages:',
            '- Reageert binnen 30 seconden, 24/7, ook buiten kantooruren',
            '- Alleen gekwalificeerde, warme leads in je agenda',
            '- Geen extra salesmedewerkers nodig',
            '- Bespaar 20+ uur per week',
            '- Installatie in 30 minuten, geen technische kennis',
            '- "Jouw leads verdienen een betere opvolging dan een mail die nooit beantwoord wordt"',
            'Sectoren: vastgoed, coaching, B2B SaaS, verzekeringen, recruitment, automotive',
            'Prijzen: Starter (100 leads/mnd), Growth (300 leads/mnd), Scale (onbeperkt)'
          ].join('\n');

          // Build prompt per platform + type
          const typePrompts = {
            pijnpunt: 'Schrijf vanuit het perspectief van het pijnpunt: leads die binnenkomen maar niet snel genoeg worden opgevolgd. Bedrijven verliezen dagelijks warme leads door trage opvolging. Begin met dit pijnpunt.',
            feature:  'Spotlight de WhatsApp AI functie: reageert binnen 30 seconden, 24/7, stelt de juiste kwalificatievragen en plant alleen warme afspraken. Toon het als een gamechanger voor het salesproces.',
            resultaat: 'Focus op concrete resultaten: 20+ uur bespaard per week, alleen warme leads in de agenda, geen gemiste aanvragen buiten kantooruren. Gebruik cijfers en vergelijkingen.',
            vergelijking: 'Maak een contrast tussen de oude manier (manueel bellen, mails sturen, leads laten liggen) en Helvaro (30 sec reactie, AI kwalificeert, agenda vult automatisch). Gebruik een voor/na structuur.',
            founder: 'Schrijf vanuit het founders-perspectief: twee jonge Belgische ondernemers (Frade bouwt de technologie, Teljo doet sales) die een echt probleem oplossen dat ze zelf zagen bij bedrijven. Authentiek, persoonlijk.',
            update:  'Schrijf een "what we\'re building" update: Helvaro is live, eerste klanten, WhatsApp AI werkt 24/7. Geef een kijkje achter de schermen van een B2B SaaS startup in Gent.'
          };
          const typeInstruction = typePrompts[contentType] || typePrompts.pijnpunt;

          let contentPrompt;
          if (platform === 'instagram') {
            contentPrompt = [
              'Schrijf een Instagram caption voor Helvaro gericht op ' + sector + '.',
              '',
              brandContext,
              '',
              'Content focus: ' + typeInstruction,
              '',
              'Format EXACT zo:',
              '— Eerste zin: korte hook met emoji (max 12 woorden, dit is wat mensen zien vóór "meer lezen")',
              '— 2-3 korte alinea\'s (totaal max 90 woorden)',
              '— 1 bullet list met 3 voordelen (elk max 8 woorden, begin met emoji)',
              '— Zachte CTA (1 zin)',
              '— Lege regel',
              '— 15 hashtags: mix van niche (#leadgeneratie #salesautomation #whatsappmarketing) en breed (#ondernemen #salesteam #startup)',
              '',
              '🖼️ Visuele tip: (beschrijf in 1 zin welk beeld/reel het best bij deze post past)',
              '',
              'Schrijf in het Nederlands. Menselijke toon, geen corporate taal.'
            ].join('\n');
          } else {
            // LinkedIn
            contentPrompt = [
              'Schrijf een LinkedIn post voor Helvaro gericht op ' + sector + '.',
              '',
              brandContext,
              '',
              'Content focus: ' + typeInstruction,
              '',
              'Eisen:',
              '- 160-220 woorden',
              '- Geen "Ik ben trots" of "Excited to announce" opening',
              '- Eerste zin is direct en pakkend — trekt mensen die scrollen',
              '- Gebruik white space (korte alinea\'s van max 3 regels)',
              '- Concreet voorbeeld of stat in het midden',
              '- Zachte CTA (DM sturen, reactie vragen, link in comments)',
              '- 3-5 relevante hashtags op het einde',
              '- Directe, menselijke toon — geen buzzwords',
              '- In het Nederlands',
              '',
              'Schrijf alleen de post zelf, geen uitleg.'
            ].join('\n');
          }

          const aiRes2 = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 700, messages: [{ role: 'user', content: contentPrompt }] })
          });
          const aiData3 = await aiRes2.json();
          if (!aiRes2.ok) return res.status(500).json({ error: 'AI fout: ' + (aiData3?.error?.message || aiRes2.status) });
          const post = aiData3.content?.[0]?.text || '';
          return res.status(200).json({ post });
        }

      } catch (err) {
        console.error('[admin] founder POST error:', err.message);
        return res.status(500).json({ error: 'Serverfout' });
      }
    }

    // ── mode=invite: admin sends an invite email to a client ─────────────────
    if (body.mode === 'invite') {
      const provided = String(req.headers['x-api-key'] || '').trim();
      if (!isValidAdminToken(provided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
      if (!ONBOARD_CODE) {
        return res.status(500).json({ error: 'ONBOARD_CODE niet ingesteld op Vercel' });
      }
      const toEmail = String(body.email || '').trim().slice(0, 200);
      const toName  = String(body.name  || '').trim().slice(0, 100);
      if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
        return res.status(400).json({ error: 'Geldig e-mailadres is verplicht' });
      }
      const inviteLink = `https://app.helvaro.pro/onboard?invite=${encodeURIComponent(ONBOARD_CODE)}`;
      await sendInviteEmail({ toEmail, toName, inviteLink });
      return res.status(200).json({ success: true });
    }

    // ── mode=onboard: client self-registration via invite code ────────────────
    const isOnboard = body.mode === 'onboard';
    if (isOnboard) {
      const provided = String(body.inviteCode || '').trim();
      if (!ONBOARD_CODE || !safeEqual(provided, ONBOARD_CODE)) {
        return res.status(401).json({ error: 'Ongeldige uitnodigingscode' });
      }
    } else {
      // Regular admin path
      const provided = String(req.headers['x-api-key'] || '').trim();
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

  // ── GET founder routes (/api/admin?section=founder&type=...) ────────────
  const MYSTARTUP_BASE  = 'appjJW396QWRaNOVi';
  const PIPELINE_TABLE  = 'tblihBS81FqGUZoY1';
  const GOALS_TABLE     = 'tblAFVa64xoHmp942';

  if (req.query && req.query.section === 'founder') {
    const type = req.query.type || 'all';
    try {
      if (type === 'pipeline') {
        const r = await fetch(
          `https://api.airtable.com/v0/${MYSTARTUP_BASE}/${PIPELINE_TABLE}?pageSize=100`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        const d = await r.json();
        const pipeline = (d.records || []).map(rec => ({
          id:          rec.id,
          naam:        rec.fields['Naam']       || '',
          bedrijf:     rec.fields['Bedrijf']    || '',
          email:       rec.fields['Email']      || '',
          fase:        rec.fields['Fase']       || 'Gecontacteerd',
          notities:    rec.fields['Notities']   || '',
          aangemaakt:  rec.fields['Aangemaakt'] || ''
        }));
        return res.status(200).json({ pipeline });
      }
      if (type === 'goals') {
        const r = await fetch(
          `https://api.airtable.com/v0/${MYSTARTUP_BASE}/${GOALS_TABLE}?pageSize=100`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        const d = await r.json();
        const goals = (d.records || []).map(rec => ({
          id:       rec.id,
          doel:     rec.fields['Doel']     || '',
          target:   rec.fields['Target']   || 0,
          eenheid:  rec.fields['Eenheid']  || '',
          deadline: rec.fields['Deadline'] || '',
          actief:   rec.fields['Actief']   || false
        }));
        return res.status(200).json({ goals });
      }
      return res.status(400).json({ error: 'Onbekend type' });
    } catch (err) {
      console.error('[admin] founder GET error:', err.message);
      return res.status(500).json({ error: 'Serverfout' });
    }
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

async function sendInviteEmail({ toEmail, toName, inviteLink }) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return;
  const greeting = toName ? `Hallo ${escHtml(toName)}` : 'Hallo';
  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'Helvaro <noreply@helvaro.pro>',
      to:      [toEmail],
      subject: 'U bent uitgenodigd voor Helvaro',
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;color:#0f1117">
          <div style="background:#080c14;padding:32px;border-radius:12px;text-align:center;margin-bottom:24px">
            <h1 style="color:#818cf8;font-family:monospace;letter-spacing:4px;margin:0">HELVARO</h1>
          </div>
          <h2 style="margin-bottom:8px">${greeting}!</h2>
          <p style="color:#5c6478;margin-bottom:24px;line-height:1.6">
            U bent uitgenodigd om uw Helvaro account aan te maken.<br>
            Klik op de knop hieronder om uw gegevens in te vullen en direct toegang te krijgen tot uw persoonlijk dashboard.
          </p>
          <div style="text-align:center;margin-bottom:28px">
            <a href="${escHtml(inviteLink)}" style="display:inline-block;padding:14px 32px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">
              Account aanmaken →
            </a>
          </div>
          <p style="font-size:13px;color:#a0aab8;margin-bottom:8px">Of kopieer deze link in uw browser:</p>
          <p style="font-size:12px;color:#6366f1;word-break:break-all;margin-bottom:32px">${escHtml(inviteLink)}</p>
          <hr style="border:none;border-top:1px solid #eee;margin-bottom:24px">
          <p style="font-size:12px;color:#a0aab8">Vragen? Neem contact op met uw contactpersoon. — Team Helvaro</p>
        </div>`
    })
  });
}
