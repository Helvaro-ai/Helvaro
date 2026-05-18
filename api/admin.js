// Admin endpoint — GET: all clients + lead stats | POST: create new client
// Protected by ADMIN_KEY env var (timing-safe comparison)
const crypto = require('crypto');

// Single-shot Airtable fetch — no retries (admin is low-frequency)
async function atFetch(url, opts) {
  return fetch(url, opts);
}

// Rate limiter — 20 req / 60s per IP
const _rl = new Map();

// Presence map — apiKey (sha256 prefix) -> { ts, clientName }
// Cleared on cold start; that's OK for "online now" semantics.
const _presence = new Map();
function _presenceKey(apiKey) {
  return crypto.createHash('sha256').update(String(apiKey)).digest('hex').slice(0, 16);
}
function _gcPresence() {
  const cutoff = Date.now() - 30 * 60_000; // 30 min — twice the "online" window
  for (const [k, v] of _presence) if (v.ts < cutoff) _presence.delete(k);
}
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

// Strip dashes (em/en/regular as zin-verbinder) and any euro pricing that
// leaked past the prompt's "no prices, no dashes" instruction. Last-line
// defense — the AI usually obeys but this guarantees the contract.
function scrubPost(text) {
  if (!text) return '';
  let t = String(text);

  // 1. Dashes as zinsverbinder: " — ", " – ", " - " between words/phrases
  //    Replace with ". " or ", " depending on what follows.
  //    Keep dashes inside hashtags, URLs, and dates (1-2 digits-1-2 digits).
  t = t.replace(/\s+[—–]\s+/g, '. ');                  // em/en dash with spaces
  t = t.replace(/([a-zà-ÿ])\s-\s([a-zà-ÿ])/gi, '$1, $2'); // " - " between words
  t = t.replace(/^[—–-]\s+/gm, '');                    // leading dash on a line

  // 2. Euro prices anywhere: €149, € 149, 149€, 149 euro, "vanaf X euro/maand",
  //    "€X per maand", any number followed by "/mnd" or "/maand" if it follows €.
  //    Replace whole sentences that contain pricing with an empty string and
  //    collapse double newlines.
  t = t.split('\n').filter(line => {
    const hasEuroPrice = /(€\s?\d|[\d.,]+\s?€|\b\d{2,4}\s?(?:euro|eur)\b|vanaf\s?€?\s?\d|\b\d+\s?\/\s?(?:mnd|maand|month))/i.test(line);
    return !hasEuroPrice;
  }).join('\n');

  // 3. Collapse triple+ blank lines that the filter might create.
  t = t.replace(/\n{3,}/g, '\n\n').trim();

  return t;
}

module.exports = async function handler(req, res) {
  // Allow the Helvaro app, the legacy Netlify Founder site, and any Cloudflare
  // Pages (*.pages.dev) or Workers (*.workers.dev) preview the founder team
  // spins up — strict pattern match, never reflect arbitrary origins.
  const allowedOrigins = ['https://app.helvaro.pro', 'https://founderyou.netlify.app'];
  const origin = req.headers.origin || '';
  const okCf = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(pages|workers)\.dev$/.test(origin);
  const ok = allowedOrigins.includes(origin) || okCf;
  res.setHeader('Access-Control-Allow-Origin', ok ? origin : 'https://app.helvaro.pro');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.setHeader('Vary', 'Origin');

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

    // ── test-email (admin only) ─────────────────────────────────────────────
    // POST { mode: 'test-email', to?: 'address@x.com' }
    // Sends a tiny test through Resend and returns the FULL Resend response
    // (status + body) so you can see exactly why a send fails (e.g. domain
    // not verified, invalid key, etc.) without digging through logs.
    if (body.mode === 'test-email') {
      const tProvided = String(req.headers['x-api-key'] || '').trim();
      if (!isValidAdminToken(tProvided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
      const RESEND_KEY = process.env.RESEND_API_KEY;
      if (!RESEND_KEY) return res.status(200).json({ ok: false, reason: 'RESEND_API_KEY env var not set on Vercel' });
      const to   = String(body.to || process.env.NOTIFY_EMAIL || '').trim();
      if (!to)   return res.status(200).json({ ok: false, reason: 'No "to" address — pass {"to":"..."} or set NOTIFY_EMAIL env var' });
      const from = process.env.RESEND_FROM || 'Helvaro <noreply@helvaro.pro>';
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            from, to: [to],
            subject: 'Helvaro Resend test — ' + new Date().toISOString().slice(0, 16),
            html:    '<p>If you can read this, Resend works. From: <code>' + escHtml(from) + '</code></p>'
          })
        });
        const txt = await r.text().catch(() => '');
        let data; try { data = JSON.parse(txt); } catch { data = txt; }
        return res.status(200).json({
          ok:           r.ok,
          status:       r.status,
          from,
          to,
          resendBody:   data,
          envSet: {
            RESEND_API_KEY: !!process.env.RESEND_API_KEY,
            RESEND_FROM:    !!process.env.RESEND_FROM,
            NOTIFY_EMAIL:   !!process.env.NOTIFY_EMAIL
          }
        });
      } catch (err) {
        return res.status(200).json({ ok: false, reason: 'network error', error: err && err.message });
      }
    }

    // ── presence-ping (any logged-in user) ──────────────────────────────────
    // Lightweight heartbeat: stores apiKey hash + clientName in module map.
    // Used by founder dashboard to show "online now" dots for each client.
    if (body.mode === 'presence-ping') {
      const ak = String(req.headers['x-api-key'] || '').trim();
      if (!ak) return res.status(401).json({ error: 'apiKey required' });
      const cn = String(body.clientName || '').trim().slice(0, 80);
      _presence.set(_presenceKey(ak), { ts: Date.now(), clientName: cn });
      if (_presence.size > 500) _gcPresence();
      return res.status(200).json({ ok: true });
    }

    // ── founder modes: pipeline + goals + AI advice (admin only) ────────────
    const FOUNDER_MODES = ['pipeline-create','pipeline-update','pipeline-delete','goal-save','goal-delete','ai-advice','ai-chat','linkedin-post','content-post','personalized-dm'];
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

          // Helvaro brand facts — concrete, no fluff, NO PRICING.
          // Pricing on social posts attracts the wrong buyer and weakens the
          // pain hook. We sell on outcome (deals saved), not on a price tag.
          const brandFacts = [
            'Helvaro: Belgische AI startup, Gent. Opgericht door Frade (tech) en Teljo (sales).',
            'Wat het doet: AI reageert automatisch op leads via WhatsApp, stelt kwalificatievragen, boekt alleen warme afspraken in de agenda.',
            'Cijfers die kloppen: binnen 30 seconden reactie, 24/7, klanten besparen gemiddeld 20+ uur per week, installatie in 30 minuten.',
            'De pijn die we oplossen — dit moet centraal staan:',
            '  • Lead komt binnen om 22u. Niemand belt. De volgende dag is hij al klant bij de concurrent. Deal weg.',
            '  • Sales belt 50 leads per dag. 45 zijn rommel. De 5 echte? Op slechte momenten gemiste call, voicemail, geen reactie. Deal weg.',
            '  • Hot lead vult formulier in. Reactie volgt 4 uur later. Lead is intussen afgeleid, op vakantie, of bij iemand anders. Deal weg.',
            '  • Weekend: 12 formulieren ingevuld. Maandag 9u: 3 van die mensen al elders een afspraak. Deal weg.',
            '  • Een gemiste deal van €5.000 betaalt een jaar Helvaro. Eén. Per. Jaar.',
            'Sectoren: vastgoed, coaching, marketing bureaus, KMO\'s, consultants.',
            'NOOIT vermelden in een post: prijs, bedrag, euro per maand, "vanaf X euro". Geld komt pas ter sprake in DMs.'
          ].join('\n');

          // Type-specific angle — every angle leans on a missed-deal moment.
          const typeAngles = {
            pijnpunt:    'Vertel concreet over een gemiste deal. Een echte situatie: tijdstip, klant, sector, bedrag. Niet abstract. "Vrijdag 21:47, een vastgoedlead voor een appartement van 280k. Niemand belde. Maandag was hij al ergens anders aan het tekenen." Maak de lezer zenuwachtig over hoeveel van die deals door ZIJN handen glippen.',
            feature:     'Toon hoe de WhatsApp AI in de praktijk werkt zonder dat een lead ooit door de mazen valt. Lead vult formulier in, 30 seconden later krijgt hij WhatsApp, AI stelt 4 kwalificatievragen, warme afspraak boekt zichzelf. Stap voor stap, in concrete tijdstippen.',
            resultaat:   'Eén concrete, herkenbare uitkomst: nooit meer een lead missen buiten kantooruren, zelfs niet om 23u op zondag. Gebruik een voor/na of een specifiek getal van een klant. Verwijs naar de pijn die WEG is, niet naar features.',
            vergelijking:'Klassieke aanpak versus Helvaro. Geen buzzwords, eerlijk de cijfers naast elkaar leggen: leads per maand binnen, reactiesnelheid, conversie, gemiste deals, uren per week verloren. Verlies van deals is de cruciale rij.',
            founder:     'Schrijf als Teljo. 20-iets, Gent. Je zag bedrijven keer op keer dezelfde fout maken: leads kwamen binnen en niemand belde op tijd. Je was die persoon zelf ook. Frade bouwt de tech, jij verkoopt het. Eerlijk, licht kwetsbaar, geen hype, geen prijslijst.',
            update:      'Kort kijkje achter de schermen: wat er deze week is gebouwd, geleerd of mislukt bij Helvaro. Eerlijke startup update. Geen persbericht.'
          };
          const typeAngle = typeAngles[contentType] || typeAngles.pijnpunt;

          // SYSTEM: persona + strict format rules
          const liSystemPrompt = [
            'Je bent Teljo, 22 jaar, co-founder van Helvaro in Gent. Je schrijft LinkedIn posts zoals een echte ondernemer. Direct, concreet, geen AI-taal.',
            '',
            'ABSOLUTE VERBODEN — gebruik deze NOOIT:',
            'Woorden: "In de snel veranderende wereld", "Excited to announce", "Trots om te delen", "Game-changer", "Revolutionair", "Naadloos", "Robuust", "Innovatief", "Leverage", "In het digitale tijdperk", "Als we eerlijk zijn" als opener, "The future of", "Disruptief".',
            'Leestekens: GEEN em-dashes (—), GEEN en-dashes (–), GEEN gewone "-" dashes als zinsverbinder. Gebruik in plaats daarvan een komma, een punt, of een nieuwe lijn. Dashes maken een post AI-achtig.',
            'Prijzen: NOOIT een prijs, bedrag, "vanaf X euro", "€X/maand", maandelijkse kost, of welk getal dan ook gevolgd door €. Geen pricing in posts. Punt.',
            'Geen opsomming van 5+ punten achter elkaar. Geen alinea\'s langer dan 2 zinnen.',
            '',
            'CONTENT-EIS — DE POST MOET PIJN VOELBAAR MAKEN:',
            'Werk altijd met een concreet voorbeeld van een GEMISTE DEAL. Tijdstip, sector, bedrag van de deal, wat er fout ging. De lezer moet denken: "shit, dat gebeurt bij mij ook." Vermijd algemeenheden.',
            '',
            'VERPLICHT FORMAT voor LinkedIn:',
            'Lijn 1: de haak. Max 10 woorden. Dit is alles wat mensen zien voor "...meer weergeven". Maak het raak: een statement, een getal, een vraag die doet nadenken.',
            '[lege lijn]',
            'Dan: 4-6 blokken van max 2 zinnen, telkens gescheiden door een lege lijn.',
            'Gebruik > voor lijsten (max 3-4 items). Nooit • en nooit ─.',
            'Eindig met 1 concrete vraag OF een zachte CTA (DM sturen, reageer hieronder).',
            '[lege lijn]',
            'Max 3 hashtags. Punt.',
            '',
            'Schrijf alleen de post. Geen uitleg, geen "Hier is je post:".'
          ].join('\n');

          const igSystemPrompt = [
            'Je bent Teljo, co-founder van Helvaro. Je schrijft Instagram captions die klinken als een echte jonge Belgische ondernemer. Niet als een social media manager.',
            '',
            'ABSOLUTE VERBODEN:',
            'Corporate taal. Emoji-spam (max 5 totaal). Lange alinea\'s. AI-zinnen.',
            'GEEN dashes: geen em-dash (—), geen en-dash (–), geen "-" als zinsverbinder. Vervang door komma, punt of nieuwe lijn.',
            'GEEN prijzen, bedragen, "€X/maand" of welke kost dan ook. Pricing hoort niet in een post.',
            '',
            'CONTENT-EIS: maak de pijn van een gemiste deal voelbaar in concrete termen. Tijdstip, sector, bedrag van de deal die verdween. Niet abstract.',
            '',
            'FORMAT:',
            'Lijn 1: hook met 1 emoji (max 10 woorden, wat mensen zien voor "...meer")',
            '[lege lijn]',
            '2-3 korte blokken (telkens max 2 zinnen, lege lijn ertussen)',
            '3 voordelen als lijst: elk met emoji en max 7 woorden',
            '1 CTA-zin',
            '[lege lijn]',
            '12-15 hashtags (mix niche + breed)',
            '[lege lijn]',
            '📸 Visuele tip: 1 zin wat voor beeld/reel erbij past',
            '',
            'Schrijf alleen de caption. Geen uitleg.'
          ].join('\n');

          let contentPrompt, systemPrompt;
          if (platform === 'instagram') {
            systemPrompt = igSystemPrompt;
            contentPrompt = [
              'Schrijf een Instagram caption voor Helvaro.',
              'Doelgroep: ' + sector + '.',
              'Invalshoek: ' + typeAngle,
              '',
              'Brand feiten die je MAG gebruiken (niet verplicht allemaal):',
              brandFacts
            ].join('\n');
          } else {
            systemPrompt = liSystemPrompt;
            contentPrompt = [
              'Schrijf een LinkedIn post voor Helvaro.',
              'Doelgroep: ' + sector + '.',
              'Invalshoek: ' + typeAngle,
              '',
              'Brand feiten die je MAG gebruiken als het past (niet allemaal verplicht):',
              brandFacts
            ].join('\n');
          }

          const aiRes2 = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-haiku-4-5',
              max_tokens: 600,
              system: systemPrompt,
              messages: [{ role: 'user', content: contentPrompt }]
            })
          });
          const aiData3 = await aiRes2.json();
          if (!aiRes2.ok) return res.status(500).json({ error: 'AI fout: ' + (aiData3?.error?.message || aiRes2.status) });
          let post = aiData3.content?.[0]?.text || '';
          post = scrubPost(post);
          return res.status(200).json({ post });
        }

        // ── personalized-dm ────────────────────────────────────────────────────
        if (body.mode === 'personalized-dm') {
          const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
          if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY niet ingesteld' });
          const bedrijf  = String(body.bedrijf  || '').trim().slice(0, 100);
          const sector   = String(body.sector   || '').trim().slice(0, 100);
          const fase     = String(body.fase     || 'Gecontacteerd').trim();
          const platform = String(body.platform || 'linkedin');
          const notities = String(body.notities || '').trim().slice(0, 400);
          const dagen    = Number(body.dagen    || 0);
          if (!bedrijf) return res.status(400).json({ error: 'Bedrijfsnaam verplicht' });

          const phaseCtx = {
            'Gecontacteerd':  'Dit is de eerste outreach — wek nieuwsgierigheid zonder te pushen.',
            'Geinteresseerd': 'Ze hebben interesse getoond. Leid naar een demo of gesprek.',
            'Geïnteresseerd': 'Ze hebben interesse getoond. Leid naar een demo of gesprek.',
            'Beslissing':     'Ze overwegen het actief. Neem de laatste twijfel weg en sluit af.'
          };
          const dayNote = dagen > 0 ? ' Ze zijn al ' + dagen + ' dag(en) in deze fase zonder update.' : '';

          const emailPrompt = [
            'Schrijf een cold email voor Helvaro aan ' + bedrijf + (sector ? ' (' + sector + ')' : '') + '.',
            'Fase: ' + fase + '. ' + (phaseCtx[fase] || '') + dayNote,
            (notities ? 'Extra info: ' + notities : ''),
            '',
            'Helvaro = Belgische AI: volgt leads op via WhatsApp binnen 30 sec, 24/7. Alleen warme afspraken in de agenda. Installatie 30 min.',
            '',
            'Schrijf EXACT in dit format:',
            'Onderwerp: [max 8 woorden]',
            '',
            '[body — max 110 woorden, persoonlijk, 1 CTA, Nederlands]'
          ].filter(Boolean).join('\n');

          const linkedinPrompt = [
            'Schrijf een LinkedIn DM voor Helvaro aan ' + bedrijf + (sector ? ' (' + sector + ')' : '') + '.',
            'Fase: ' + fase + '. ' + (phaseCtx[fase] || '') + dayNote,
            (notities ? 'Extra info: ' + notities : ''),
            '',
            'Helvaro = Belgische AI: volgt leads op via WhatsApp binnen 30 sec, 24/7. Alleen warme afspraken in de agenda.',
            '',
            'Eisen: max 5 zinnen, noem ' + bedrijf + ' bij naam, geen sales-pitch gevoel, eindig met 1 simpele vraag, Nederlands.'
          ].filter(Boolean).join('\n');

          const dmPrompt = platform === 'email' ? emailPrompt : linkedinPrompt;
          const aiResDm = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 350, messages: [{ role: 'user', content: dmPrompt }] })
          });
          const aiDmData = await aiResDm.json();
          if (!aiResDm.ok) return res.status(500).json({ error: 'AI fout: ' + (aiDmData?.error?.message || aiResDm.status) });
          return res.status(200).json({ message: aiDmData.content?.[0]?.text || '' });
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
      const lastSeen = c.apiKey ? (_presence.get(_presenceKey(c.apiKey))?.ts || 0) : 0;
      if (!c.projectCode) return { ...c, totalLeads: 0, newLeads: 0, qualified: 0, appointments: 0, firstLeadDate: '', lastSeen };
      try {
        const formula = encodeURIComponent(`{fldSmczuyUJd26HLe}="${escapeFormula(c.projectCode)}"`);
        const lRes = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}?filterByFormula=${formula}&fields[]=fld8mkrEWcyq7mUip&fields[]=fld0hAZJ5wgaXrNTn&fields[]=fldyIGNetqcSEkoaK&fields[]=fldR0r13EU4RwrtvH&pageSize=100`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        const lData   = await lRes.json();
        const records = lData.records || [];
        // Oldest lead date = client's "first lead" timestamp (proxy for tenure start)
        let firstLeadDate = '';
        for (const rec of records) {
          const d = rec.fields['fldR0r13EU4RwrtvH'] || '';
          if (d && (!firstLeadDate || d < firstLeadDate)) firstLeadDate = d;
        }
        return {
          ...c,
          totalLeads:    records.length,
          newLeads:      records.filter(r => r.fields['fld8mkrEWcyq7mUip'] === 'new').length,
          qualified:     records.filter(r => r.fields['fld0hAZJ5wgaXrNTn'] === true).length,
          appointments:  records.filter(r => r.fields['fldyIGNetqcSEkoaK'] === true).length,
          firstLeadDate,
          lastSeen
        };
      } catch {
        return { ...c, totalLeads: 0, newLeads: 0, qualified: 0, appointments: 0, firstLeadDate: '', lastSeen };
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
  if (!RESEND_KEY) { console.warn('[resend welcome] skipped: RESEND_API_KEY missing'); return; }
  const FROM = process.env.RESEND_FROM || 'Helvaro <noreply@helvaro.pro>';
  let r;
  try {
  r = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    FROM,
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
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    console.error('[resend welcome] failed', r.status, body.slice(0, 400));
  }
  } catch (err) {
    console.error('[resend welcome] network error:', err && err.message);
  }
}

async function sendInviteEmail({ toEmail, toName, inviteLink }) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) { console.warn('[resend invite] skipped: RESEND_API_KEY missing'); return; }
  const FROM = process.env.RESEND_FROM || 'Helvaro <noreply@helvaro.pro>';
  const greeting = toName ? `Hallo ${escHtml(toName)}` : 'Hallo';
  let r;
  try {
  r = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    FROM,
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
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    console.error('[resend invite] failed', r.status, body.slice(0, 400));
  }
  } catch (err) {
    console.error('[resend invite] network error:', err && err.message);
  }
}
