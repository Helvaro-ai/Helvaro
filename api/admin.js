// Admin endpoint. GET: all clients + lead stats | POST: create new client
// Protected by ADMIN_KEY env var (timing-safe comparison)
const crypto = require('crypto');

// Single-shot Airtable fetch. No retries (admin is low-frequency)
async function atFetch(url, opts) {
  return fetch(url, opts);
}

// Rate limiter. 20 req / 60s per IP
const _rl = new Map();

// Presence map. ApiKey (sha256 prefix) -> { ts, clientName }
// Cleared on cold start; that's OK for "online now" semantics.
const _presence = new Map();
function _presenceKey(apiKey) {
  return crypto.createHash('sha256').update(String(apiKey)).digest('hex').slice(0, 16);
}
function _gcPresence() {
  const cutoff = Date.now() - 30 * 60_000; // 30 min. Twice the "online" window
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

// Friendly initial password: easy to read aloud + retype, still strong enough
// for 12-char entropy. We avoid look-alikes (0/O, 1/l/I) so the klant can
// reliably type it from the welcome mail before resetting via /forgot-password.
function generateFriendlyPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I, O
  const lower = 'abcdefghjkmnpqrstuvwxyz';    // no i, l, o
  const digit = '23456789';                   // no 0, 1
  const all   = upper + lower + digit;
  const pick = (set) => set[crypto.randomBytes(1)[0] % set.length];
  // Guarantee at least one of each class, then fill to 12 chars
  let out = pick(upper) + pick(lower) + pick(digit);
  for (let i = 0; i < 9; i++) out += pick(all);
  // Shuffle (Fisher-Yates with crypto bytes)
  const arr = out.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomBytes(1)[0] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

// Strip dashes (em/en/regular as zin-verbinder) and any euro pricing that
// leaked past the prompt's "no prices, no dashes" instruction. Last-line
// defense. The AI usually obeys but this guarantees the contract.
function scrubPost(text) {
  if (!text) return '';
  let t = String(text);

  // 1. Dashes as zinsverbinder: ". ", ". ", " - " between words/phrases
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
  // spins up. Strict pattern match, never reflect arbitrary origins.
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

  // ── POST. Create new client (admin OR invite-code onboarding) ────────────
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    const ONBOARD_CODE = process.env.ONBOARD_CODE;
    const ADMIN_KEY    = process.env.ADMIN_KEY;

    // ── test-email (admin only) ─────────────────────────────────────────────
    // POST { mode: 'test-email', to?: 'address@x.com' }
    // Sends a tiny test through Resend and returns the FULL Resend response
    // (status + body) so you can see exactly why a send fails (e.g. Domain
    // not verified, invalid key, etc.) without digging through logs.
    if (body.mode === 'test-email') {
      const tProvided = String(req.headers['x-api-key'] || '').trim();
      if (!isValidAdminToken(tProvided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
      const to = String(body.to || process.env.NOTIFY_EMAIL || '').trim();
      if (!to) return res.status(200).json({ ok: false, reason: 'No "to" address. Pass {"to":"..."} or set NOTIFY_EMAIL env var' });
      const { sendMail } = require('./_mailer');
      const result = await sendMail({
        to,
        subject: 'Helvaro mailtest — ' + new Date().toISOString().slice(0, 16),
        html:    '<p>Als je dit leest, werkt de e-mailbezorging van Helvaro.</p>'
      }).catch(err => ({ ok: false, error: err && err.message }));
      return res.status(200).json({
        ok:     result.ok,
        via:    result.via || null,        // 'smtp' of 'resend'
        error:  result.error || null,
        to,
        envSet: {
          SMTP_HOST:      !!process.env.SMTP_HOST,
          SMTP_USER:      !!process.env.SMTP_USER,
          SMTP_PASS:      !!process.env.SMTP_PASS,
          RESEND_API_KEY: !!process.env.RESEND_API_KEY,
          RESEND_FROM:    !!process.env.RESEND_FROM,
          NOTIFY_EMAIL:   !!process.env.NOTIFY_EMAIL
        }
      });
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
            '- Product: AI qualificeert leads automatisch via WhatsApp en boekt serieuze prospects direct in een afspraak',
            '- Founders: Frade (technisch) + Teljo (marketing/sales)',
            '- Doel: 5 klanten met 3-maands contract voor 20 juni 2026 (35 dagen resterend)',
            '- Doelgroep: marketingbureaus, vastgoedkantoren, coaches in Gent/Antwerpen',
            '- Prospects: CNIP, Ants Agency, VICUS Vastgoed, Opex Consulting, Bureau 9000, Concordia, Nouchka Design, SilverLine Studio, Magelaan',
            '- Prijs: €1.000/maand · alles inbegrepen · 14 dagen trial voor €1',
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
          // Day-sector rotation, aligned with the actual target sectors on
          // helvaro.pro (insurance, real estate, recruitment, B2B SaaS,
          // coaching, automotive).
          const daySectors = {
            1: 'verzekeringskantoren en independent makelaars',
            2: 'vastgoedkantoren en immo-makelaars',
            3: 'recruitment- en wervingsbureaus',
            4: 'B2B SaaS bedrijven met inkomende demo-aanvragen',
            5: 'business coaches en consultants',
            6: 'autoverkopers en automotive bedrijven',
            0: 'ondernemers die groeien via leadgeneratie'
          };
          const sector = String(body.sector || daySectors[day] || 'B2B bedrijven met veel inkomende leads');

          // Helvaro brand facts. Concrete, no fluff, NO PRICING.
          // Pricing on social posts attracts the wrong buyer and weakens the
          // pain hook. Sell on outcome (deals saved), not on a tag.
          // Source for the product facts: helvaro.pro
          const brandFacts = [
            'Helvaro: Belgische AI startup. Co-founders: Frade (tech) en Teljo (sales).',
            '',
            'Wat het doet (helvaro.pro):',
            '  > AI-gestuurde sales follow-up via WhatsApp voor salesteams.',
            '  > Kwalificeert leads automatisch (warm vs koud) en boekt afspraken zonder menselijke tussenkomst.',
            '  > Integreert met elk bestaand CRM-systeem.',
            '  > Real-time dashboard en wekelijkse e-mailrapporten met de cijfers die ertoe doen.',
            '  > Aanpasbare workflows per klant.',
            '',
            'Cijfers die kloppen:',
            '  > Reactie binnen 30 seconden, 24/7.',
            '  > Klanten besparen gemiddeld 20+ uur per week op manuele opvolging.',
            '  > SLA: response binnen 4 uur gegarandeerd.',
            '  > Implementatie binnen 72 uur, niet maanden.',
            '',
            'Doelsectoren: verzekeringen, recruitment, automotive, B2B SaaS, vastgoed, coaching.',
            '',
            'De pijn die we oplossen, dit moet centraal staan in de post:',
            '  > Leads die binnenkomen en in een onbeantwoorde inbox verdwijnen. Te laat opgevolgd is hetzelfde als nooit opgevolgd.',
            '  > Sales spendeert dagen aan manuele follow-up via telefoon en mail. De echte gesprekken die opbrengen worden gemist.',
            '  > 95% van de leads is koud. Tijd verspild aan rommel terwijl warme leads afkoelen.',
            '  > Aanvragen \'s avonds, in het weekend, tijdens vakanties. Niemand reageert. Concurrent wel.',
            '  > Geen zicht op welke prospects warm zijn. Geen rapportage, geen scoring, gewoon hopen.',
            '  > Extra salesmensen aannemen om dat op te lossen kost handenvol geld en lost het niet op.',
            '',
            'Concrete gemiste-deal scenarios om uit te putten:',
            '  > Vrijdag 22u, lead voor een woning van 280k komt binnen. Niemand belt. Maandag is hij elders aan het tekenen.',
            '  > Recruiter krijgt 14 sollicitanten op een vacature. Tegen dat hij ze opbelt zijn de 3 sterke profielen al ergens anders in gesprek.',
            '  > Verzekeringsmakelaar mist een aanvraag voor een hospitalisatieverzekering omdat het mailtje in spam belandde. Klant tekent online bij de eerste die wel reageerde.',
            '  > Weekend: 12 demo-aanvragen op de B2B SaaS website. Maandag 9u: 3 zijn al in trial bij de concurrent.',
            '  > Eén gemiste deal betaalt het Helvaro-budget van een heel jaar. Eén.',
            '',
            'NOOIT vermelden in een post: prijs, bedrag, euro per maand, "vanaf X". Geld hoort thuis in een DM, niet in een post.'
          ].join('\n');

          // Type-specific angle. Every angle leans on a missed-deal moment.
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
            'ABSOLUTE VERBODEN. Gebruik deze NOOIT:',
            'Woorden: "In de snel veranderende wereld", "Excited to announce", "Trots om te delen", "Game-changer", "Revolutionair", "Naadloos", "Robuust", "Innovatief", "Leverage", "In het digitale tijdperk", "Als we eerlijk zijn" als opener, "The future of", "Disruptief".',
            'Leestekens: GEEN em-dashes (—), GEEN en-dashes (–), GEEN gewone "-" dashes als zinsverbinder. Gebruik in plaats daarvan een komma, een punt, of een nieuwe lijn. Dashes maken een post AI-achtig.',
            'Prijzen: NOOIT een prijs, bedrag, "vanaf X euro", "€X/maand", maandelijkse kost, of welk getal dan ook gevolgd door €. Geen pricing in posts. Punt.',
            'Geen opsomming van 5+ punten achter elkaar. Geen alinea\'s langer dan 2 zinnen.',
            '',
            'CONTENT-EIS. DE POST MOET PIJN VOELBAAR MAKEN:',
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
            'Visuele tip: 1 zin wat voor beeld/reel erbij past',
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
            'Gecontacteerd':  'Dit is de eerste outreach. Wek nieuwsgierigheid zonder te pushen.',
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
            '[body. Max 110 woorden, persoonlijk, 1 CTA, Nederlands]'
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

    // ── mode=generate-content: AI genereert week aan social posts ───────────
    // body: { mode: 'generate-content', startDate?: 'YYYY-MM-DD', days?: 7 }
    // Default: 7 dagen vanaf morgen, 3 posts per dag (LinkedIn, Instagram, Facebook).
    // Schrijft alles als status=draft naar Marketing Posts tabel. Klant approved
    // daarna manueel via dashboard of Airtable.
    if (body.mode === 'generate-content') {
      const provided = String(req.headers['x-api-key'] || '').trim();
      if (!isValidAdminToken(provided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
      const days = Math.min(14, Math.max(1, parseInt(body.days || 7, 10)));
      const startDate = body.startDate ? new Date(body.startDate) : new Date(Date.now() + 24*60*60*1000);
      const result = await generateContentWeek(AIRTABLE_TOKEN, BASE_ID, days, startDate);
      return res.status(200).json(result);
    }

    // ── mode=list-content: haal de drafts/approved/posted op ────────────────
    // body: { mode: 'list-content', status?: 'draft'|'approved'|'posted', limit?: 50 }
    if (body.mode === 'list-content') {
      const provided = String(req.headers['x-api-key'] || '').trim();
      if (!isValidAdminToken(provided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
      const status = String(body.status || '').trim();
      const limit  = Math.min(100, Math.max(1, parseInt(body.limit || 50, 10)));
      const formula = status ? encodeURIComponent(`{Status}="${status}"`) : '';
      const url = `https://api.airtable.com/v0/${BASE_ID}/tblPxnfb5MThgsnaA?pageSize=${limit}${formula ? `&filterByFormula=${formula}` : ''}&sort%5B0%5D%5Bfield%5D=Scheduled%20For&sort%5B0%5D%5Bdirection%5D=asc`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const d = await r.json();
      return res.status(200).json({ posts: d.records || [] });
    }

    // ── mode=update-content: approve/edit/skip een specifieke post ──────────
    // body: { mode: 'update-content', id: 'rec...', status?, content?, scheduledFor? }
    if (body.mode === 'update-content') {
      const provided = String(req.headers['x-api-key'] || '').trim();
      if (!isValidAdminToken(provided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
      const id = String(body.id || '').trim();
      if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return res.status(400).json({ error: 'Ongeldig record ID' });
      const fields = {};
      if (body.status !== undefined && ['draft','approved','posted','failed','skipped'].includes(body.status)) {
        fields.Status = body.status;
      }
      if (body.content !== undefined)      fields.Content      = String(body.content).slice(0, 3000);
      if (body.scheduledFor !== undefined) fields['Scheduled For'] = body.scheduledFor;
      if (body.imageUrl !== undefined)     fields['Image URL'] = String(body.imageUrl).slice(0, 500);
      if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'Niets om bij te werken' });
      const r = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/tblPxnfb5MThgsnaA/${id}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields })
        }
      );
      const d = await r.json();
      if (!r.ok) return res.status(500).json({ error: d.error?.message || 'Update failed' });
      return res.status(200).json({ ok: true, record: d });
    }

    // ── mode=generate-image: genereer 1 afbeelding voor 1 post (per record) ──
    // body: { mode: 'generate-image', id: 'rec...' }
    // Apart per post zodat we nooit de 60s functie-timeout raken.
    if (body.mode === 'generate-image') {
      const provided = String(req.headers['x-api-key'] || '').trim();
      if (!isValidAdminToken(provided, ADMIN_KEY)) {
        return res.status(401).json({ error: 'Ongeldige admin key' });
      }
      const id = String(body.id || '').trim();
      if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return res.status(400).json({ error: 'Ongeldig record ID' });
      // Haal de post op
      const gr = await fetch(`https://api.airtable.com/v0/${BASE_ID}/tblPxnfb5MThgsnaA/${id}`, {
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
      });
      const grec = await gr.json();
      if (!gr.ok) return res.status(404).json({ error: 'Post niet gevonden' });
      const f = grec.fields || {};
      const platform = String(f.Platform || '').toLowerCase();
      if (platform === 'linkedin') return res.status(200).json({ ok: true, skipped: true, reason: 'LinkedIn = tekst-only' });
      const imgPrompt = String(f['Image Prompt'] || '').trim()
        || `modern professional ${platform || 'business'} scene, clean photography, no text`;
      let imageUrl = await generateAIImage(imgPrompt, platform).catch(() => '');
      if (!imageUrl) imageUrl = await fetchPexelsImage(imgPrompt.split(' ').slice(0, 6).join(' ')).catch(() => '');
      if (!imageUrl) return res.status(502).json({ error: 'Beeldgeneratie mislukt (zie logs)' });
      const pr = await fetch(`https://api.airtable.com/v0/${BASE_ID}/tblPxnfb5MThgsnaA/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { 'Image URL': imageUrl } })
      });
      if (!pr.ok) { const pd = await pr.json().catch(() => ({})); return res.status(500).json({ error: pd.error?.message || 'Opslaan mislukt' }); }
      return res.status(200).json({ ok: true, imageUrl });
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
      const inviteResult = await sendInviteEmail({ toEmail, toName, inviteLink });
      if (!inviteResult || !inviteResult.ok) {
        return res.status(502).json({ error: 'E-mail versturen mislukt (' + ((inviteResult && inviteResult.error) || 'onbekend') + '). Gebruik de handmatige link hieronder.' });
      }
      return res.status(200).json({ success: true, via: inviteResult.via });
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

    const clientName     = String(body.clientName     || '').trim().slice(0, 100);
    const projectCode    = String(body.projectCode    || '').trim().toUpperCase().slice(0, 50);
    const email          = String(body.email          || '').trim().slice(0, 200);
    const calendlyLink   = String(body.calendlyLink   || '').trim().slice(0, 500);
    // Extended onboarding fields (all optional. Graceful fallback if not provided)
    const aiName         = String(body.aiName         || '').trim().slice(0, 60);
    const autoReplyTpl   = String(body.autoReplyTpl   || '').trim().slice(0, 1000);
    const website        = String(body.website        || '').trim().slice(0, 500);
    const address        = String(body.address        || '').trim().slice(0, 300);
    const aiInstructions = String(body.aiInstructions || '').trim().slice(0, 3000);
    const sector         = String(body.sector         || '').trim().slice(0, 100);
    const phone          = String(body.phone          || '').trim().slice(0, 50);

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
      // Build the Airtable fields payload using FIELD IDs (immune to renames).
      // Klanten / "Client Config" table: tblPidTrwGRzRt4LZ
      //   fldAnB848Sr5jl6dq  Client Name
      //   fldN4dL0bGgfBOXwM  Project Code
      //   fldhmnzVjrb2AyqJr  API Key
      //   fldNEj1ysRgINOOtr  Calendly Link
      //   fld2GjRvjpsxI8XD0  Email
      //   fldecVolseGXtQaAN  Phone
      //   fldRvoe1JMPOtPWC7  AI Name
      //   fldOGdVq6T54xEo6W  Auto-Reply Template
      //   fldzBclLhryWQ1veO  Website
      //   fldTvMSdTZOyNgWod  Adres
      //   fld1lqHctRbqFGQf5  AI Instructions
      //   fld0BsPnDbBOkTHzr  Niche  (singleSelect. Typecast:true auto-creates new options)
      const fields = {
        fldAnB848Sr5jl6dq: clientName,
        fldN4dL0bGgfBOXwM: projectCode,
        fldhmnzVjrb2AyqJr: apiKey
      };
      if (calendlyLink)   fields.fldNEj1ysRgINOOtr = calendlyLink;
      if (email)          fields.fld2GjRvjpsxI8XD0 = email;
      if (phone)          fields.fldecVolseGXtQaAN = phone;
      if (aiName)         fields.fldRvoe1JMPOtPWC7 = aiName;
      if (autoReplyTpl)   fields.fldOGdVq6T54xEo6W = autoReplyTpl;
      if (website)        fields.fldzBclLhryWQ1veO = website;
      if (address)        fields.fldTvMSdTZOyNgWod = address;
      if (aiInstructions) fields.fld1lqHctRbqFGQf5 = aiInstructions;
      if (sector)         fields.fld0BsPnDbBOkTHzr = sector;

      const createRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}`,
        {
          method:  'POST',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          // typecast:true lets Airtable auto-create select options + relaxes type coercion
          body: JSON.stringify({ fields, typecast: true })
        }
      );
      const createData = await createRes.json();
      if (!createRes.ok) {
        console.error('[admin] create error:', JSON.stringify(createData).slice(0, 200));
        return res.status(500).json({ error: 'Aanmaken mislukt: ' + (createData?.error?.message || createRes.status) });
      }

      const formUrl      = `https://app.helvaro.pro/start/${projectCode}`;
      const dashboardUrl = `https://app.helvaro.pro/dashboard`;

      // ── Also create the matching User record so the klant can actually log in.
      //    Generate a friendly random password (caller can override via body.password).
      //    USERS_TABLE = tbl2hrPW7gIx5XF4S. Same field IDs as in auth.js.
      let loginPassword = String(body.password || '').trim();
      if (!loginPassword || loginPassword.length < 8) loginPassword = generateFriendlyPassword();
      let userCreated = false;
      if (email) {
        try {
          // Look up by email first so we don't create duplicates on retry
          const USERS_TABLE = 'tbl2hrPW7gIx5XF4S';
          const uFormula = encodeURIComponent(`{Email}="${escapeFormula(email)}"`);
          const lookup = await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE}?filterByFormula=${uFormula}&maxRecords=1`,
            { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
          );
          const lookupData = await lookup.json();
          if (lookup.ok && (lookupData.records || []).length === 0) {
            const userRes = await fetch(
              `https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE}`,
              {
                method:  'POST',
                headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fields: {
                    fldsqiSy41CCDickr: email,           // Email
                    fldqi8JWgFgJF4X4R: require('bcryptjs').hashSync(loginPassword, 10),   // Password Hash (bcrypt; auth.js verifieert)
                    fldmKwegSUj1joru3: clientName,      // Client Name
                    fldbrCpBuQjJBfZsv: projectCode,     // Project Code
                    fldxZMgVXSy7EShDL: apiKey,          // API Key
                    fldb8sGE3Bslch8f8: true             // Active
                  },
                  typecast: true
                })
              }
            );
            if (userRes.ok) userCreated = true;
            else console.error('[admin] user create failed:', await userRes.text().catch(() => ''));
          } else if (lookup.ok) {
            console.warn('[admin] user already exists for', email, '— skipping user create');
          }
        } catch (err) {
          console.error('[admin] user create error:', err.message);
        }
      }

      // Welkomstmail bewust NIET geautomatiseerd. Admin kopieert de
      // ready-to-paste mailtekst uit de dashboard en stuurt zelf (vanuit
      // eigen mailbox sindi.s@usehelvaro.pro). Dit voorkomt Resend domain-
      // verification gedoe en geeft de eerste klant-interactie een echte
      // persoonlijke uitstraling (van een echt persoon, niet van een
      // noreply adres).

      return res.status(200).json({
        id: createData.id, apiKey, projectCode, clientName, formUrl, dashboardUrl,
        userCreated,
        loginPassword: userCreated ? loginPassword : undefined  // surfaced once to the admin caller; not persisted in response logs
      });
    } catch (err) {
      console.error('[admin] create error:', err.message);
      return res.status(500).json({ error: 'Serverfout' });
    }
  }

  // ── GET. All clients + lead stats (admin only) ──────────────────────────
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

async function sendWelcomeEmail({ clientName, projectCode, apiKey, email, formUrl, dashboardUrl, loginPassword }) {
  // De welkomstmail gaat via het standaard verzendadres (SMTP_FROM = noreply@helvaro.pro),
  // betrouwbaar bezorgd. Maar met een Reply-To naar een echt postvak kan de klant
  // gewoon antwoorden en komt dat bij een mens terecht. Zo: deliverability + persoonlijk.
  const replyTo = process.env.REPLY_TO || 'sindi.s@usehelvaro.pro';
  // Login-blok wordt enkel toegevoegd als we ook een User hebben aangemaakt (en dus een password hebben)
  const loginBlock = loginPassword ? `
            <h3 style="margin:24px 0 8px;color:#0f1117">Login gegevens</h3>
            <div style="background:#f3f4ff;border:1px solid #c7d2fe;border-radius:10px;padding:18px;margin-bottom:8px">
              <table style="width:100%;border-collapse:collapse">
                <tr>
                  <td style="padding:6px 0;color:#5c6478;width:110px;font-size:13px">E-mail</td>
                  <td style="padding:6px 0;font-weight:600;font-family:monospace;font-size:14px">${escHtml(email)}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#5c6478;font-size:13px">Wachtwoord</td>
                  <td style="padding:6px 0;font-weight:600;font-family:monospace;font-size:15px;color:#3730a3;letter-spacing:1px">${escHtml(loginPassword)}</td>
                </tr>
              </table>
            </div>
            <p style="font-size:12px;color:#5c6478;margin:6px 0 18px">Wijzig je wachtwoord na de eerste login via <a href="https://app.helvaro.pro/forgot-password" style="color:#6366f1">Wachtwoord vergeten</a>.</p>
          ` : '';
  const html = `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;color:#0f1117">
          <div style="background:#080c14;padding:32px;border-radius:12px;text-align:center;margin-bottom:24px">
            <h1 style="color:#818cf8;font-family:monospace;letter-spacing:4px;margin:0">HELVARO</h1>
          </div>
          <h2 style="margin-bottom:8px">Welkom, ${escHtml(clientName)}</h2>
          <p style="color:#5c6478;margin-bottom:24px">Je Helvaro account staat klaar. Hieronder vind je alles om vandaag nog je eerste lead binnen te halen.</p>
          ${loginBlock}
          <h3 style="margin:24px 0 8px;color:#0f1117">Jouw lead-formulier</h3>
          <p style="color:#5c6478;margin:0 0 8px;font-size:13px">Plak deze URL in je advertenties, op je website of in je e-mail handtekening:</p>
          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:18px;font-family:monospace;font-size:13px;word-break:break-all">
            <a href="${escHtml(formUrl)}" style="color:#6366f1;text-decoration:none">${escHtml(formUrl)}</a>
          </div>
          <h3 style="margin:24px 0 8px;color:#0f1117">Eerste 3 stappen</h3>
          <ol style="color:#374151;line-height:1.7;padding-left:20px;margin-bottom:24px">
            <li>Log in op <a href="${escHtml(dashboardUrl)}" style="color:#6366f1">je dashboard</a></li>
            <li>Open <strong>AI Persoonlijkheid</strong> en pas de AI-naam + welkomstbericht aan</li>
            <li>Test zelf je formulier. Je krijgt direct WhatsApp van je AI</li>
          </ol>
          <p style="text-align:center">
            <a href="${escHtml(dashboardUrl)}" style="display:inline-block;padding:14px 28px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open Dashboard</a>
          </p>
          <p style="margin-top:32px;font-size:13px;color:#a0aab8;border-top:1px solid #eee;padding-top:16px">Vragen? Antwoord op deze mail. Team Helvaro</p>
        </div>`;
  const { sendMail } = require('./_mailer');
  await sendMail({ to: email, replyTo, subject: 'Welkom bij Helvaro — je account is klaar', html })
    .catch(err => console.error('[welcome mail]', err && err.message));
}

async function sendInviteEmail({ toEmail, toName, inviteLink }) {
  const greeting = toName ? `Hallo ${escHtml(toName)}` : 'Hallo';
  const html = `
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
          <p style="font-size:12px;color:#a0aab8">Vragen? Neem contact op met uw contactpersoon. Team Helvaro</p>
        </div>`;
  const { sendMail } = require('./_mailer');
  const replyTo = process.env.REPLY_TO || 'sindi.s@usehelvaro.pro';
  return sendMail({ to: toEmail, subject: 'U bent uitgenodigd voor Helvaro', html, replyTo })
    .catch(err => { console.error('[invite mail]', err && err.message); return { ok: false, error: err && err.message }; });
}

// ─── CONTENT GENERATOR ────────────────────────────────────────────────────────
// Wekelijkse 21-posts batch (7 dagen × 3 platforms) of partial run via admin
// mode='generate-content'. Per platform-dag combo: pick een content pillar,
// vraag Claude Haiku 4.5 om een post + hashtags, schrijf naar Airtable als draft.

const CONTENT_PILLARS = [
  { name: 'pain-point',       weight: 20, focus: 'Schets een herkenbaar probleem dat KMO-eigenaren met leads hebben. Concreet voorbeeld (auto-handel, kapper, advocaat). Eindig met een vraag of hint naar de oplossing.' },
  { name: 'solution',         weight: 20, focus: 'Hoe Helvaro een specifiek probleem oplost. AI WhatsApp die in 30 seconden kwalificeert. Geen sales pitch, maar concreet "zo werkt het".' },
  { name: 'industry-insight', weight: 15, focus: 'Inzicht uit B2B lead-data. Cijfers, percentages, trends. "80% van leads loopt weg binnen 5 min" stijl. Maak het scrollwaardig.' },
  { name: 'founder-pov',      weight: 15, focus: 'Eerlijke observatie als oprichter van een SaaS. Iets dat je deze week geleerd, vroeg, of besefte. Mens-achtig, niet corporate.' },
  { name: 'educational',      weight: 15, focus: 'Concrete tip die KMO-eigenaars zelf kunnen toepassen om hun lead-flow te verbeteren. 3 vragen, 5 stappen, etc.' },
  { name: 'behind-scenes',    focus: 'Wat er deze week is gebouwd of veranderd in Helvaro. Klein product moment. Maakt het tastbaar dat er een mens achter zit.' },
  { name: 'customer-win',     focus: 'Hypothetische klant-story OF echte cijfers van een klant (met permissie). Resultaat-gedreven.' },
  { name: 'personal-struggle', focus: 'Een eerlijk persoonlijk probleem of worsteling als solo-oprichter die Helvaro bouwt: twijfel, een tegenslag, een fout en de les eruit, of iets moeilijks van deze week. Kwetsbaar en echt, geen humblebrag. Ik-vorm. Eindig met een reflectie of vraag.' },
  { name: 'company-story',     focus: 'Waarom Helvaro bestaat en waar het naartoe gaat. De missie: KMOs helpen geen leads meer te verliezen. Persoonlijke "waarom ik dit bouw" hoek, het verhaal achter het bedrijf. Geen verkooppraatje.' }
];

// LinkedIn leunt op persoonlijke + bedrijfsverhalen (founder-stem), niet op product-pitch.
const LINKEDIN_PILLARS = ['founder-pov', 'personal-struggle', 'company-story', 'behind-scenes', 'industry-insight'];
// Instagram/Facebook: alleen marketing-pijlers, geen persoonlijke founder-content.
const MARKETING_PILLARS = ['pain-point', 'solution', 'industry-insight', 'educational', 'customer-win'];
// Persoonlijke groei (founder-stem) voor de persoonlijke LinkedIn-slot.
const PERSONAL_PILLARS = ['founder-pov', 'personal-struggle', 'company-story', 'behind-scenes'];

// Echte momenten uit de bouwreis van Helvaro, BEWUST geabstraheerd tot de menselijke
// les. Voeden de persoonlijke/founder-posts zodat ze authentiek aanvoelen. Hier staat
// met opzet NIETS gevoeligs in: geen security, geen tools bij naam, geen kapotte zaken.
// De NOOIT-LEKKEN regel in de prompt bewaakt dat de AI er ook niets bij verzint.
const FOUNDER_JOURNEY = [
  'De keuze om een externe tool te schrappen en het zelf, geintegreerd te bouwen: minder afhankelijkheid, meer grip op de klantervaring.',
  'Bewust een mens-in-de-loop houden in plaats van alles meteen automatiseren, zolang er nog maar weinig klanten zijn.',
  'Als bootstrapper kiezen voor simpele, betaalbare oplossingen in plaats van een dure, indrukwekkende stack.',
  'De discipline om niets te bouwen wat je niet echt gaat gebruiken.',
  'Het geduld dat het kost om met grote platformen te integreren.',
  'De afweging tussen snel willen lanceren en het zorgvuldig en goed doen.',
  'Solo bouwen: prioriteren wat klanten binnenhaalt boven wat technisch indrukwekkend is.',
  'Een feature volledig herzien nadat de eerste aanpak niet bleek te passen.',
  'Leren dat saai en betrouwbaar vaak wint van slim en fragiel.',
  'Eerlijk durven zeggen dat een eerdere aanpak niet werkte, en opnieuw beginnen.'
];
const JOURNEY_PILLARS = ['personal-struggle', 'company-story', 'behind-scenes', 'founder-pov'];

const PLATFORM_TONES = {
  linkedin:  { tone: 'Persoonlijke founder-stem in de ik-vorm. Een concreet, echt moment met EEN duidelijke les. Reflectief alleen als het moment dat echt was, geen corporate inspiratie-cadans, geen fake-les framing. 150-300 woorden, kort genoeg uitgelegd voor mensen buiten de niche. Sterke hook in zin 1 (geen opwarmzin). Eindig met een concrete les, niet met een vraag om reacties te farmen.', maxLength: 2900, hashtagCount: 3 },
  instagram: { tone: 'Kort en visueel, 50-120 woorden. EEN claim. Hook in zin 1, geen opwarmzin. De caption scherpt het beeld aan, herhaalt het niet. Eindig met een concreet inzicht (een vraag alleen als die echt past, nooit om reacties te farmen).', maxLength: 2200, hashtagCount: 7 },
  facebook:  { tone: 'Community-toon, 100-180 woorden, ruimte voor een klein verhaal maar EEN claim. Hook in zin 1, geen opwarmzin. Specifiek, niet vaag. Eindig met een concreet inzicht of het verhaal, niet met een reactie-farm vraag.', maxLength: 5000, hashtagCount: 4 }
};

function pickPillarByMode(mode) {
  // 'personal' = persoonlijke groei (founder-stem). Anders = marketing (gewogen).
  if (mode === 'personal') {
    const pool = CONTENT_PILLARS.filter(p => PERSONAL_PILLARS.includes(p.name));
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const pool = CONTENT_PILLARS.filter(p => MARKETING_PILLARS.includes(p.name));
  const weighted = pool.flatMap(p => Array(p.weight || 5).fill(p));
  return weighted[Math.floor(Math.random() * weighted.length)];
}

async function generateOnePost(platform, pillar, dateIso, learn) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY;
  if (!ANTHROPIC_KEY) { console.error('[content-gen] ANTHROPIC_API_KEY niet ingesteld'); return null; }
  const tone = PLATFORM_TONES[platform];
  let journeyContext = '';
  if (JOURNEY_PILLARS.includes(pillar.name)) {
    const theme = FOUNDER_JOURNEY[Math.floor(Math.random() * FOUNDER_JOURNEY.length)];
    journeyContext = `\nECHT MOMENT UIT DE REIS (bouw de post hierrond, maak de les universeel en herkenbaar, verzin geen details):\n${theme}\n`;
  }
  // Leer-loop: voed eerdere keuzes van Sindi terug. Goedgekeurd/geplaatst = volg de
  // toon; overgeslagen = vermijd die stijl. Nooit letterlijk kopieren.
  let learnContext = '';
  if (learn && ((learn.good && learn.good.length) || (learn.bad && learn.bad.length))) {
    const g = (learn.good || []).slice(0, 2).map(s => `- "${s}"`).join('\n');
    const b = (learn.bad  || []).slice(0, 1).map(s => `- "${s}"`).join('\n');
    learnContext = `\nLEER VAN SINDI'S KEUZES (neem de TOON over, kopieer niet letterlijk):\n${g ? `Goedgekeurd, dit werkt:\n${g}\n` : ''}${b ? `Overgeslagen, vermijd deze stijl/onderwerp:\n${b}\n` : ''}`;
  }
  const prompt = `Je schrijft een social media post voor Helvaro op ${platform}.

OVER HELVARO:
Helvaro is een Belgische B2B SaaS. KMOs (auto-handel, kappers, advocaten, vastgoed, dentists, ...) krijgen een AI die hun WhatsApp leads in 30 seconden kwalificeert. €1.000/maand. NL/FR/EN. Lead vult formulier in op de website van de klant -> AI van Helvaro stuurt direct WhatsApp -> voert natuurlijk gesprek -> markeert qualified -> klant krijgt notif. Zonder Helvaro: lead loopt weg na 5-10 min.

CONTENT PIJLER VOOR DEZE POST: ${pillar.name}
${pillar.focus}
${journeyContext}${learnContext}
PLATFORM TONE:
${tone.tone}

KRITIEKE REGELS:
- EEN claim per post. Argumenteert de post twee dingen, kies er een.
- SPECIFIEK boven bijvoeglijk: een concrete situatie, een echt getal of een moment ("een autohandelaar verloor een lead van 30.000 euro door 12 minuten te laat te antwoorden"), nooit vage adjectieven.
- STERKE eerste zin, geen opwarmzin. Schrap zin 1 als die alleen opbouwt.
- GEEN reactie-farm vraag op het einde. Een vraag mag alleen als die echt uit de post volgt.
- GEEN emojis (Helvaro policy)
- GEEN em-dashes ( - ), gebruik gewone punten
- GEEN hype/cliches: "Did you know", "Stel je voor", "In een wereld waar", "game-changer", "revolutionair", "naadloos", "ontketen", "the future of"
- Schrijf in het Nederlands, zoals een echte ondernemer praat
- Geen vermelding van prijs (€1.000/maand) tenzij pillar=pain-point of customer-win
- NOOIT LEKKEN: noem geen technische details, geen security-, wachtwoord- of datalek-onderwerpen, geen specifieke tools/leveranciers bij naam (positief noch negatief), geen klantnamen of klantdata, geen interne werking of infrastructuur. Suggereer NOOIT dat iets in het product kapot, onveilig of onaf is. Abstraheer altijd naar de menselijke les. Bij twijfel: laat het weg.

OUTPUT FORMAT (strikt):
TITLE: <korte interne titel max 60 chars>
CONTENT: <de post tekst>
HASHTAGS: <${tone.hashtagCount} hashtags gescheiden door spaties, lowercase, beginnen met #>
IMAGE_PROMPT: <Engelse beschrijving voor een AI-beeldgenerator. Een professionele, moderne, fotorealistische scene die het topic visueel ondersteunt. Clean, brand-safe, geen tekst of letters in beeld, geen logos. Bv "modern Belgian car dealership showroom, salesperson checking smartphone, warm natural light, professional photography, no text". Beschrijf scene, sfeer en stijl in 1-2 zinnen.>

Schrijf nu de post.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const d = await r.json();
    if (!r.ok || d.error) {
      console.error('[content-gen] Anthropic err:', JSON.stringify(d.error || d).slice(0, 200));
      return null;
    }
    const raw = (d.content?.[0]?.text || '').trim();
    // Parse the structured output
    const titleM    = raw.match(/TITLE:\s*(.+?)(?:\n|$)/i);
    const contentM  = raw.match(/CONTENT:\s*([\s\S]+?)(?:\n(?:HASHTAGS|VISUAL_QUERY):|$)/i);
    const hashtagsM = raw.match(/HASHTAGS:\s*(.+?)(?:\n|$)/i);
    const imgPromptM = raw.match(/IMAGE_PROMPT:\s*([\s\S]+?)(?:\n[A-Z_]+:|$)/i);
    if (!contentM) return null;
    // Strip dashes/emojis as defense in depth
    let content = contentM[1].trim().replace(/[—–]/g, '.').slice(0, tone.maxLength);
    // Remove emojis using same regex policy as elsewhere
    content = content.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');

    // Beeld wordt NIET hier gegenereerd (zou 504-timeout geven bij 14 beelden in
    // een request). We bewaren alleen de beeld-prompt; de afbeelding wordt later
    // per post apart gegenereerd via mode=generate-image. LinkedIn = tekst-only.
    let imagePrompt = '';
    if (platform === 'instagram' || platform === 'facebook') {
      imagePrompt = (imgPromptM ? imgPromptM[1] : '').trim().replace(/\s+/g, ' ').slice(0, 800)
        || `modern professional ${platform} business scene, clean photography, no text`;
    }

    return {
      title:    (titleM ? titleM[1] : `${platform} ${pillar.name}`).trim().slice(0, 60),
      content,
      hashtags: (hashtagsM ? hashtagsM[1] : '').trim().slice(0, 200),
      imagePrompt
    };
  } catch (err) {
    console.error('[content-gen] exception:', err.message);
    return null;
  }
}

// Upload een buffer naar Vercel Blob -> permanente publieke URL (of '' als niet kan).
async function uploadToBlob(buffer, contentType, platform) {
  let put;
  try { ({ put } = require('@vercel/blob')); }
  catch (e) { console.error('[ai-image] @vercel/blob niet beschikbaar:', e.message); return ''; }
  if (!process.env.BLOB_READ_WRITE_TOKEN) { console.warn('[ai-image] geen BLOB_READ_WRITE_TOKEN'); return ''; }
  const ext = (contentType || '').includes('png') ? 'png' : 'jpg';
  const filename = `social/${platform}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const blob = await put(filename, buffer, {
    access: 'public', contentType: contentType || 'image/png', token: process.env.BLOB_READ_WRITE_TOKEN
  });
  return (blob.url || '').slice(0, 500);
}

// OpenAI gpt-image-1-mini: goedkoop (~$0.005-0.015/beeld), actueel model (dall-e-3 is
// uit de API sinds mei 2026). Vereist een GEVERIFIEERDE org; anders 403 en GEEN credit
// verbruikt (we vallen dan stil terug op Pollinations). Geeft b64 terug -> upload Blob.
async function generateOpenAIImage(prompt, platform) {
  const KEY = process.env.OPENAI_API_KEY || process.env.OPENAI;
  if (!KEY) return '';
  if (!process.env.BLOB_READ_WRITE_TOKEN) return '';   // zonder hosting geen zin
  try {
    const size = platform === 'instagram' ? '1024x1024' : '1536x1024';   // IG vierkant, FB landscape
    const enriched = `${prompt}. Professional photography, clean, brand-safe, no text, no letters, no watermark.`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 55000);
    let r;
    try {
      r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model: 'gpt-image-1-mini', prompt: enriched.slice(0, 3000), size, quality: 'medium', n: 1 }),
        signal: ctrl.signal
      });
    } finally { clearTimeout(t); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) { console.error('[ai-image] OpenAI err', r.status, JSON.stringify(d.error || '').slice(0, 220)); return ''; }
    const b64 = d.data && d.data[0] && d.data[0].b64_json;
    if (!b64) { console.error('[ai-image] OpenAI gaf geen b64'); return ''; }
    return await uploadToBlob(Buffer.from(b64, 'base64'), 'image/png', platform);
  } catch (err) { console.error('[ai-image] OpenAI exception:', err.message); return ''; }
}

// Pollinations.ai: gratis, geen key, geen tegoed. Vangnet als OpenAI niet kan.
async function generatePollinationsImage(prompt, platform) {
  try {
    const width  = platform === 'instagram' ? 1024 : 1280;
    const height = platform === 'instagram' ? 1024 : 720;
    const seed = Math.floor(Math.random() * 1e9);
    const enriched = `${prompt}. Professional photography, clean, brand-safe, no text, no watermark, no letters.`;
    const params = new URLSearchParams({ width: String(width), height: String(height), seed: String(seed), model: 'flux', nologo: 'true', enhance: 'true' });
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(enriched.slice(0, 1500))}?${params}`;
    const headers = {};
    if (process.env.POLLINATIONS_TOKEN) headers.Authorization = `Bearer ${process.env.POLLINATIONS_TOKEN}`;
    // Zonder Blob: geef een compacte directe Pollinations-URL terug (browser laadt rechtstreeks).
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      const sp = new URLSearchParams({ width: String(width), height: String(height), seed: String(seed), model: 'flux', nologo: 'true' });
      const direct = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 120))}?${sp}`;
      return direct.length <= 500 ? direct : (`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 60))}?${sp}`).slice(0, 500);
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 45000);
    let r;
    try { r = await fetch(url, { headers, signal: ctrl.signal }); }
    finally { clearTimeout(t); }
    if (!r.ok) { console.error('[ai-image] Pollinations err', r.status); return ''; }
    const ct = r.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) { console.error('[ai-image] Pollinations gaf geen beeld:', ct); return ''; }
    const buffer = Buffer.from(await r.arrayBuffer());
    if (buffer.length < 1000) return '';
    return await uploadToBlob(buffer, ct, platform);
  } catch (err) { console.error('[ai-image] Pollinations exception:', err.message); return ''; }
}

// Orchestrator: OpenAI gpt-image-1-mini primair, Pollinations als gratis vangnet.
async function generateAIImage(prompt, platform) {
  let url = await generateOpenAIImage(prompt, platform).catch(() => '');
  if (!url) url = await generatePollinationsImage(prompt, platform).catch(() => '');
  return url;
}

// Pexels API. Gratis 200 req/uur. Vraagt 1 random foto die matcht met query.
// Fallback wanneer AI-beeldgeneratie niet beschikbaar is of faalt.
async function fetchPexelsImage(query) {
  const PEXELS_KEY = process.env.PEXELS_API_KEY;
  if (!PEXELS_KEY) {
    console.warn('[pexels] PEXELS_API_KEY niet ingesteld. Posts krijgen geen foto.');
    return '';
  }
  try {
    // per_page=15 + random pick zorgt voor variatie als zelfde query meerdere keren
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`;
    const r = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
    if (!r.ok) {
      console.error('[pexels] err', r.status, query);
      return '';
    }
    const d = await r.json();
    const photos = d.photos || [];
    if (photos.length === 0) return '';
    const photo = photos[Math.floor(Math.random() * photos.length)];
    // src.large is ~940px wide. Goed voor Instagram + Facebook feed.
    return (photo.src?.large || photo.src?.original || '').slice(0, 500);
  } catch (err) {
    console.error('[pexels] exception:', err.message);
    return '';
  }
}

// Leer-loop: haal recente posts op en bucket per platform in goed (approved/posted)
// en slecht (skipped). Geeft { instagram:{good:[],bad:[]}, facebook:{...}, linkedin:{...} }.
// Snippets ingekort; het model neemt de TOON over, kopieert niet letterlijk.
async function fetchLearningExamples(airtableToken, baseId) {
  const POSTS_TABLE = 'tblPxnfb5MThgsnaA';
  const out = {};
  try {
    const url = `https://api.airtable.com/v0/${baseId}/${POSTS_TABLE}?pageSize=80&sort%5B0%5D%5Bfield%5D=Created%20At&sort%5B0%5D%5Bdirection%5D=desc`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${airtableToken}` } });
    if (!r.ok) return out;
    const d = await r.json();
    for (const rec of (d.records || [])) {
      const f = rec.fields || {};
      const platform = String(f.Platform || '').toLowerCase();
      const status   = String(f.Status   || '').toLowerCase();
      const content  = String(f.Content  || '').trim();
      if (!platform || !content) continue;
      const bucket = out[platform] || (out[platform] = { good: [], bad: [] });
      const snippet = content.replace(/\s+/g, ' ').slice(0, 220);
      if ((status === 'approved' || status === 'posted') && bucket.good.length < 4) bucket.good.push(snippet);
      else if (status === 'skipped' && bucket.bad.length < 3) bucket.bad.push(snippet);
    }
  } catch (err) { console.error('[content-gen] leer-loop ophalen mislukt:', err.message); }
  return out;
}

// Genereer N dagen aan content. Per dag: 3 posts (LinkedIn 08:30, IG 12:00, FB 18:00 Brussels-tijd).
async function generateContentWeek(airtableToken, baseId, days, startDate) {
  const POSTS_TABLE = 'tblPxnfb5MThgsnaA';
  // 6 posts per dag: 2 Instagram + 2 Facebook (marketing) + 2 LinkedIn
  // (1 persoonlijke groei + 1 Helvaro-marketing). Tijden in Brussel.
  const slots = [
    { name: 'linkedin',  hour: 8,  minute: 30, mode: 'personal'  },
    { name: 'instagram', hour: 11, minute: 0,  mode: 'marketing' },
    { name: 'facebook',  hour: 12, minute: 30, mode: 'marketing' },
    { name: 'linkedin',  hour: 13, minute: 30, mode: 'marketing' },
    { name: 'instagram', hour: 17, minute: 0,  mode: 'marketing' },
    { name: 'facebook',  hour: 18, minute: 30, mode: 'marketing' }
  ];

  let created = 0, failed = 0;
  const summary = [];

  // Leer-loop: haal 1x de recente keuzes van Sindi op (goedgekeurd vs overgeslagen),
  // per platform. Wordt aan elke generatie meegegeven zodat het model meebeweegt.
  const learnAll = await fetchLearningExamples(airtableToken, baseId).catch(() => ({}));

  for (let day = 0; day < days; day++) {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + day);

    // Genereer de 6 posts van deze dag PARALLEL (1 ronde i.p.v. 6 sequentiele
    // calls). Zo blijft 6 x 7 = 42 posts ruim binnen de 60s functie-limiet.
    const dayPosts = await Promise.all(slots.map(async (slot) => {
      const pillar = pickPillarByMode(slot.mode);
      const post = await generateOnePost(slot.name, pillar, date.toISOString(), learnAll[slot.name]).catch(() => null);
      return { slot, pillar, post };
    }));

    for (const { slot, pillar, post } of dayPosts) {
      if (!post) { failed++; continue; }
      // Brussels CET = UTC+1 (CEST = UTC+2); -1u correctie als CET-fallback.
      const scheduledUtc = new Date(Date.UTC(
        date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
        slot.hour - 1, slot.minute
      ));
      const fields = {
        Title:           post.title,
        Platform:        slot.name,
        Content:         post.content,
        'Scheduled For': scheduledUtc.toISOString(),
        // Volledig autonoom: posts gaan standaard direct 'approved' en worden door
        // de cron gepost. Zet AUTO_PUBLISH=false als je weer handmatig wil reviewen.
        Status:          process.env.AUTO_PUBLISH === 'false' ? 'draft' : 'approved',
        Pillar:          pillar.name,
        'AI Generated':  true,
        Hashtags:        post.hashtags,
        'Created At':    new Date().toISOString()
      };
      // Beeld-prompt bewaren voor IG + FB; afbeelding wordt later apart gegenereerd
      // via mode=generate-image (voorkomt timeout). LinkedIn = tekst-only.
      if (post.imagePrompt) fields['Image Prompt'] = post.imagePrompt;
      const r = await fetch(
        `https://api.airtable.com/v0/${baseId}/${POSTS_TABLE}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields, typecast: true })
        }
      );
      if (r.ok) {
        created++;
        summary.push({ date: scheduledUtc.toISOString(), platform: slot.name, pillar: pillar.name, preview: post.content.slice(0, 80) });
      } else {
        failed++;
        const errBody = await r.text().catch(() => '');
        console.error('[content-gen] Airtable err:', errBody.slice(0, 200));
      }
    }
  }
  return { ok: true, created, failed, summary };
}
