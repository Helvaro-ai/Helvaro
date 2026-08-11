// ── Live AI-demo voor de website ─────────────────────────────────────────────
// Laat een bezoeker op helvaro.pro echt met de AI praten, in plaats van naar een
// nagemaakte screenshot te kijken. Draait op Helvaro's EIGEN klantrecord: de
// persoonlijkheid, de instructies en de taal komen uit het dashboard dat Sindi
// al heeft, en de leads komen in haar gewone leadlijst terecht. Helvaro verkoopt
// zichzelf met zijn eigen product — en zij kan de demo bijsturen zonder code.
//
// ── Waarom dit een aparte module is ──────────────────────────────────────────
// De AI-motor (runAI) woont in whatsapp.js en zit daar verweven met webhooks,
// telefoonnummers en handtekeningen. Die losbreken is riskant werk aan het
// bestand waar het geld verdiend wordt. Deze module krijgt runAI dus gewoon
// meegegeven; whatsapp.js takt bovenaan af naar handleDemoChat() en verder
// verandert daar niets.
//
// ── Dit is een publiek endpoint dat geld kost ────────────────────────────────
// Iedereen op internet kan hier tokens verbranden. Daarom vier grenzen, van
// goedkoop naar duur:
//   1. lengte per bericht      — 400 tekens
//   2. lengte van het gesprek  — 12 beurten, daarna stopt de demo netjes
//   3. snelheid per IP         — 20 berichten per 10 minuten
//   4. het creditsysteem       — de harde bovengrens, ingesteld in de app
// De eerste drie zijn gratis en vangen 99% af. De vierde is het vangnet dat
// bepaalt wat het maximaal kan kosten, en die staat in Airtable zodat Sindi hem
// kan verlagen zonder deploy.
//
// De gespreksgeschiedenis komt van de browser en is dus te manipuleren. Dat is
// bewust: server-side sessies overleven een cold start niet en zouden voor een
// demo van een paar beurten meer stuk maken dan oplossen. De caps hierboven
// begrenzen wat manipulatie kan kosten — een opgeblazen geschiedenis wordt
// gewoon afgekapt op 12 beurten van 400 tekens.

const _rl      = require('./_ratelimit');
const credits  = require('./_credits');

const LEADS_TABLE = 'tbliukTnDAbEDcZmt';

const MAX_MSG_CHARS   = 400;
const MAX_TURNS       = 12;
const RL_MAX          = 20;               // berichten
const RL_WINDOW_MS    = 10 * 60 * 1000;   // per 10 minuten, per IP

// Welke klant de demo speelt. Standaard Helvaro zelf; via env te wijzigen als
// Sindi hem ooit een ander profiel wil laten spelen zonder deploy.
function demoProjectCode() {
  return (process.env.DEMO_PROJECT_CODE || 'HELVARO').trim();
}

// De demo staat uit tenzij expliciet aangezet. Een publiek endpoint dat geld
// kost hoort niet vanzelf te gaan draaien omdat er code op de server staat.
function isEnabled() {
  return process.env.DEMO_CHAT_ENABLED === '1';
}

// Alleen de eigen site mag dit aanroepen. Geen wildcard: dit endpoint kost geld,
// dus het is geen publieke API die iedereen in zijn eigen pagina mag hangen.
const ALLOWED_ORIGINS = new Set([
  'https://helvaro.pro',
  'https://www.helvaro.pro',
  'https://app.helvaro.pro',
]);

function setCors(req, res) {
  const origin = String((req.headers && req.headers.origin) || '');
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Vercel zet x-vercel-forwarded-for zelf vanaf de echte edge-verbinding en
// overschrijft wat de client meestuurt; x-forwarded-for is wél te vervalsen.
// Zelfde volgorde als de rest van de codebase.
function clientIp(req) {
  const h = req.headers || {};
  return String(h['x-vercel-forwarded-for'] || h['x-forwarded-for'] || '')
    .split(',')[0].trim() || 'unknown';
}

function clean(s, max) {
  return String(s == null ? '' : s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim().slice(0, max);
}

// Zelfde regels als api/form.js, zodat een demo-lead exact hetzelfde genormaliseerde
// nummer krijgt als een formulier-lead. Wijkt dit af, dan matcht WhatsApp het
// binnenkomende bericht straks niet aan deze lead.
function normalizePhone(raw) {
  let p = String(raw || '').replace(/[\s\-()\.]/g, '');
  if      (p.startsWith('00')) p = p.slice(2);
  else if (p.startsWith('+'))  p = p.slice(1);
  else if (p.startsWith('0'))  p = '32' + p.slice(1);
  return /^\d{8,15}$/.test(p) ? p : '';
}

// handleDemoChat(req, res, deps)
//   deps.runAI            — uit whatsapp.js
//   deps.getClientByCode  — uit whatsapp.js
//   deps.atFetch          — uit whatsapp.js (Airtable met 429-retry)
async function handleDemoChat(req, res, deps) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });
  if (!isEnabled())             return res.status(503).json({ error: 'Demo staat uit' });

  // hit() gooit zelf nooit — bij een onbereikbare Upstash valt hij terug op
  // in-memory tellers per instance. Dat is zwakker (een cold start reset hem)
  // maar nog steeds een rem, en beter dan de demo platleggen.
  const ip = clientIp(req);
  const gate = await _rl.hit('demo', ip, RL_MAX, RL_WINDOW_MS);
  if (gate && gate.limited) {
    return res.status(429).json({ error: 'Even rustig aan — probeer het over een paar minuten opnieuw.' });
  }

  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch { body = {}; }
  if (!body || typeof body !== 'object') body = {};

  // Geschiedenis van de browser, hard begrensd. Alleen de laatste MAX_TURNS
  // beurten gaan mee, elk afgekapt — zo kan een opgeblazen payload nooit meer
  // kosten dan een normaal gesprek.
  const rawHistory = Array.isArray(body.history) ? body.history.slice(-MAX_TURNS) : [];
  const history = rawHistory
    .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
    .map(m => ({ role: m.role, content: clean(m.content, MAX_MSG_CHARS) }))
    .filter(m => m.content);

  const message = clean(body.message, MAX_MSG_CHARS);
  if (!message) return res.status(400).json({ error: 'Leeg bericht' });

  if (history.length >= MAX_TURNS) {
    return res.status(200).json({
      done: true,
      reply: 'Dit is waar de demo stopt — in het echt praat de AI gewoon door tot je lead geboekt is. Laat je nummer achter, dan neemt hij het over op WhatsApp.',
      askContact: true,
    });
  }

  const projectCode = demoProjectCode();

  // Creditcheck vóór de AI-call, niet erna. Anders betaal je voor het bericht
  // dat je had willen weigeren.
  try {
    const c = await credits.checkCredits(projectCode, credits.FEATURES.WHATSAPP_CONVERSATION);
    if (c && c.allowed === false) {
      console.warn('[demo] tegoed op voor', projectCode);
      return res.status(200).json({
        done: true,
        reply: 'De demo is even uitgeput voor vandaag. Laat je nummer achter, dan neemt iemand contact op.',
        askContact: true,
      });
    }
  } catch (e) {
    // Creditsysteem onbereikbaar: hier wél doorlaten. Het is een begroting, geen
    // beveiliging, en de drie caps hierboven staan nog steeds overeind.
    console.warn('[demo] creditcheck mislukt, ga door:', e && e.message);
  }

  let client;
  try {
    client = await deps.getClientByCode(projectCode);
  } catch (e) {
    console.error('[demo] klantconfig ophalen mislukt:', e && e.message);
    return res.status(503).json({ error: 'Demo tijdelijk niet beschikbaar' });
  }
  if (!client) {
    console.error('[demo] geen Client Config voor', projectCode, '— zet DEMO_PROJECT_CODE juist');
    return res.status(503).json({ error: 'Demo tijdelijk niet beschikbaar' });
  }

  const f = client.fields || {};
  const aiName       = f['fldRvoe1JMPOtPWC7'] || f['AI Name']         || 'Mathis';
  const clientName   = f['fldAnB848Sr5jl6dq'] || f['Client Name']     || 'Helvaro';
  const instructions = f['fld1lqHctRbqFGQf5'] || f['AI Instructions'] || '';
  const website      = f['fldzBclLhryWQ1veO'] || f['Website']         || '';
  const address      = f['fldTvMSdTZOyNgWod'] || f['Adres']           || '';
  const lang         = f['fld1iiV9XwSbgAACZ'] || f['Language']        || 'nl';

  const convo = history.concat([{ role: 'user', content: message }]);

  let ai;
  try {
    ai = await deps.runAI(convo, instructions, clean(body.name, 80), aiName, clientName, website, address, lang, {
      matchLeadLanguage: true,   // een demo krijgt bezoekers in NL, FR en EN
    });
  } catch (e) {
    console.error('[demo] AI-call mislukt:', e && e.message);
    return res.status(200).json({ reply: 'Sorry, even een technische hapering. Probeer het nog eens.' });
  }

  // Pas NA een geslaagde call afboeken, en per bericht — niet per gesprek zoals
  // WhatsApp doet. Bij WhatsApp is één lead één gesprek; hier kan iemand blijven
  // typen zonder ooit een lead te worden, dus per bericht meten is eerlijker
  // tegenover de begroting.
  try {
    await credits.recordUsage(projectCode, credits.FEATURES.WHATSAPP_CONVERSATION, { credits: 2 });
  } catch (e) {
    console.warn('[demo] credits afboeken mislukt:', e && e.message);
  }

  const reply = (ai && ai.message) || 'Sorry, dat begreep ik even niet.';
  let leadCreated = false;

  // Lead pas aanmaken als de bezoeker zelf een nummer geeft. Anders staat de
  // leadlijst binnen een week vol met mensen die één keer "hoi" typten.
  const phone = normalizePhone(body.contact);
  if (phone) {
    try {
      leadCreated = await createDemoLead(deps, {
        projectCode,
        name:    clean(body.name, 80) || 'Websitebezoeker',
        phone,
        history: convo.concat([{ role: 'assistant', content: reply }]),
        summary: (ai && ai.summary) || '',
      });
    } catch (e) {
      // Niet fataal voor de bezoeker: hij heeft zijn gesprek gehad. Wel loggen,
      // want dit is precies de lead die Sindi wil hebben.
      console.error('[demo] lead aanmaken mislukt:', e && e.message);
    }
  }

  return res.status(200).json({
    reply,
    done:       !!(ai && ai.done),
    askContact: !!(ai && ai.done) && !phone,
    leadCreated,
  });
}

// Zelfde velden en vorm als api/form.js, zodat een demo-lead in het dashboard
// niet te onderscheiden is van een formulier-lead en de bestaande opvolging
// (WhatsApp, nurture, rapportage) hem gewoon meepakt.
async function createDemoLead(deps, { projectCode, name, phone, history, summary }) {
  const BASE_ID = process.env.BASE_AIRTABLE;
  const TOKEN   = process.env.API_AIRTABLE;
  if (!BASE_ID || !TOKEN) return false;

  const r = await deps.atFetch(`https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        fldbk0LVNckOU0bqA: name,
        fld6YaitW0lMqHUrd: phone,
        fldSmczuyUJd26HLe: projectCode,
        fld8mkrEWcyq7mUip: 'new',
        fldGoerozqdea4BfU: 'Website',
        fldR0r13EU4RwrtvH: new Date().toISOString(),
        fldqerIiw5qyQjXHr: String(summary || '').slice(0, 600),
        fldwDOLZKlAhfigbh: JSON.stringify(history).slice(0, 90000),
        // Toestemming: de bezoeker geeft zijn nummer zelf op met de melding
        // erbij dat er contact opgenomen wordt. Zelfde vorm als form.js zodat
        // het dashboard hem kan lezen.
        fldoLRI5W12ThTls7: JSON.stringify({
          _v: 1, notes: [], tasks: [], calls: [],
          consent: { given: true, ts: new Date().toISOString(), source: 'website-demo' },
        }),
      },
      typecast: true,
    }),
  });
  if (!r.ok) {
    console.error('[demo] Airtable weigerde de lead:', r.status, (await r.text().catch(() => '')).slice(0, 200));
    return false;
  }
  return true;
}

module.exports = { handleDemoChat, isEnabled, demoProjectCode, normalizePhone, MAX_TURNS, MAX_MSG_CHARS };
