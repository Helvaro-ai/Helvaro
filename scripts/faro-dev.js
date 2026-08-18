#!/usr/bin/env node
'use strict';
/*
 * Local dev server for the Faro.
 *
 *   node scripts/faro-dev.js            → http://localhost:4321
 *   PORT=5000 node scripts/faro-dev.js
 *
 * ── What it is for ───────────────────────────────────────────────────────────
 * Seeing Faro work without Vercel, without Airtable, without Clerk
 * and without an API key. It serves api/dashboard.js's HTML and routes
 * /api/faro to api/_faro/handler.js with a fixed local session.
 *
 * Everything in the request path is the REAL code: the same handler, the same
 * orchestrator, the same tool registry, the same SSE framing, the same
 * confirmation gate. Only three things are substituted, and each is an env var
 * the production deploy simply does not set:
 *
 *   FARO_PROVIDER=demo        scripted responses instead of a model
 *   FARO_DEMO_MODE=1          fixture leads/pipeline instead of Airtable
 *   FARO_WORKSPACE_ENABLED=1  the feature flag, off in production until chosen
 *
 * ── This is a dev tool, not a deployment ─────────────────────────────────────
 * It binds localhost, has no authentication, and hands every request the same
 * fake tenant. It must never run anywhere reachable. Vercel ignores scripts/
 * entirely, so it cannot deploy by accident.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Set before requiring anything under api/_faro — config.js reads these at load.
process.env.FARO_WORKSPACE_ENABLED = process.env.FARO_WORKSPACE_ENABLED || '1';
process.env.FARO_PROVIDER = process.env.FARO_PROVIDER || 'demo';
process.env.FARO_DEMO_MODE = process.env.FARO_DEMO_MODE || '1';

/* ── Command Center fixture ──────────────────────────────────────────────────
   The Command Center reads real Airtable rows through api/_leads-read.js. This
   server has no Airtable, so it stubs the ONE function that fetches, with a
   spread of leads chosen to exercise every category: ready-to-book, high
   priority, at risk, high value, gone cold, plus the cases that must be
   EXCLUDED (booked, lost, no phone). Production never loads this file. */
const _leadsRead = require('../api/_leads-read');
const _DAY = 86400000;
const _now = Date.now();
const _convo = (leadMsgs, ourMsgs, lastLeadAgoDays) => {
  const t = [];
  for (let i = 0; i < ourMsgs; i++) t.push({ role: 'assistant', content: 'bericht ' + i, ts: _now - (lastLeadAgoDays + 1) * _DAY + i * 60000 });
  for (let i = 0; i < leadMsgs; i++) t.push({ role: 'user', content: 'antwoord ' + i, ts: _now - lastLeadAgoDays * _DAY + i * 60000 });
  return JSON.stringify(t);
};
const _fixtureLeads = [
  { naam: 'Marie Declercq', tel: '+32470111111', q: true, score: 9.4, budget: '€475.000', urg: 'Hoog',
    bron: 'Formulier', sam: 'Zoekt een villa in Knokke, wil binnen 60 dagen kopen.', convo: [7, 8, 0.2] },
  { naam: 'Thomas Van Acker', tel: '+32470222222', q: true, score: 8.1, budget: '€620.000', urg: 'Middel',
    bron: 'WhatsApp', sam: 'Appartement met zeezicht, budget bevestigd.', convo: [4, 4, 0.6] },
  { naam: 'Jonas Peeters', tel: '+32470333333', q: true, score: 9.2, budget: '€520.000', urg: 'Hoog',
    bron: 'Instagram', sam: 'Wil binnen 3 maanden kopen, tweede woning.', convo: [6, 6, 1] },
  { naam: 'Sophie Maes', tel: '+32470444444', q: true, score: 8.7, budget: '€390.000', urg: 'Middel',
    bron: 'Formulier', sam: 'Starterswoning, financiering rond.', convo: [5, 6, 4] },
  { naam: 'Karel Janssens', tel: '+32470555555', q: true, score: 7.5, budget: '€310.000', urg: 'Laag',
    bron: 'Telefoon', sam: 'Orienteert zich, geen haast.', convo: [2, 4, 11] },
  { naam: 'Greet Willems', tel: '+32470666666', q: true, score: 9.0, budget: '€800.000', urg: 'Hoog',
    bron: 'Formulier', sam: 'Bezichtiging staat gepland.', convo: [6, 6, 1], booked: true },
  { naam: 'Vera Coppens', tel: '+32470777777', q: false, score: 3, budget: '€200.000', urg: 'Laag',
    bron: 'Website', sam: 'Zoekt huurwoning, past niet.', status: 'Verloren' },
  { naam: 'Bram De Smet', tel: '', q: true, score: 8.0, budget: '€450.000', urg: 'Middel',
    bron: 'Formulier', sam: 'Geen telefoonnummer achtergelaten.', convo: [3, 3, 1] },
  { naam: 'Ilse Vermeulen', tel: '+32470888888', q: true, score: 8.4, budget: '€540.000', urg: 'Hoog',
    bron: 'Instagram', sam: 'Zoekt nieuwbouw, budget flexibel.', convo: [4, 5, 2.5] },
  { naam: 'Pieter Goossens', tel: '+32470999999', q: false, score: 5.5, budget: '€280.000', urg: 'Middel',
    bron: 'Website', sam: 'Nog aan het rondkijken.', convo: [1, 3, 6] },
];
_leadsRead.fetchLeads = async () => ({
  truncated: false,
  leads: _fixtureLeads.map((f, i) => ({
    id: 'recFIXT' + String(i).padStart(9, '0'),
    naam: f.naam, telefoon: f.tel, status: f.status || (f.q ? 'Gekwalificeerd' : 'Nieuw'),
    qualified: !!f.q, reden: '', samenvatting: f.sam, capaciteit: '', urgentie: f.urg, fit: '',
    bron: f.bron, boekingslinkVerstuurd: false, afspraakGeboekt: !!f.booked, notities: '',
    gesprek: f.convo ? _convo(f.convo[0], f.convo[1], f.convo[2]) : '',
    leadScore: f.score, opgepikt: false, verwachteWaarde: f.budget,
    reactietijd: 20 + i * 7, datum: new Date(_now - (2 + i) * _DAY).toISOString(),
  })),
});

const dashboard = require('../api/dashboard');
const faroHandler = require('../api/_faro/handler');

const PORT = Number(process.env.PORT || 4321);
const ROOT = path.join(__dirname, '..');

/* The fake local tenant. In production this comes from a verified signed
   session (see api/faro.js); here it is a constant, which is exactly why this
   server must never be exposed. */
const LOCAL_AUTH = {
  projectCode: 'LOCALDEV',
  userId: 'local@helvaro.test',
  lang: process.env.DASHBOARD_LANG || 'nl',
  isAdmin: false,
};

/* Minimal Express-ish shims — the api/ handlers expect res.status().json()
   and res.setHeader/send, which node's ServerResponse does not provide. */
function decorate(req, res) {
  res.status = function (code) { res.statusCode = code; return res; };
  res.json = function (obj) {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = function (body) { res.end(body); return res; };
  return { req, res };
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });
}

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.js': 'text/javascript',
  '.css': 'text/css', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.html': 'text/html',
};

/* Static files. Serves public/ at the root and public/ai/ at /ai/ so the mascot
   assets resolve at the same paths they will use in production. */
function serveStatic(urlPath, res) {
  const rel = urlPath.replace(/^\/+/, '');
  const file = path.join(ROOT, 'public', rel);
  // Refuse anything that escapes public/ — trivial here, but a dev server that
  // serves arbitrary repo files is a habit worth not forming.
  if (!file.startsWith(path.join(ROOT, 'public'))) { res.statusCode = 403; return res.end('forbidden'); }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  decorate(req, res);

  try {
    if (p === '/api/faro') {
      req.body = await readBody(req);
      return faroHandler.handle(req, res, LOCAL_AUTH);
    }

    // Faro's Beelden panel drives the SAME api/leads.js property-* modes the
    // CRM's AI-beeld page drove, rather than owning a second copy of that
    // guard chain. Locally there is no Airtable and no OpenAI key, so those
    // three modes are answered here — with the REAL option arrays out of
    // api/_images.js, so the panel renders the true eight axes and a label
    // added there shows up locally without touching this file.
    if (p === '/api/leads') {
      req.body = await readBody(req);
      const images = require('../api/_images');
      const opt = (arr) => arr.map((x) => ({ key: x.key, label: x.label }));
      switch (req.body.mode) {
        case 'property-styles':
          return res.status(200).json({
            styles: opt(images.PROPERTY_STYLES),
            roomTypes: opt(images.ROOM_TYPES),
            furnitureLevels: opt(images.FURNITURE_LEVELS),
            wallFinishes: opt(images.WALL_FINISHES),
            wallColors: opt(images.WALL_COLORS),
            floorTypes: opt(images.FLOOR_TYPES),
            lightingMoods: opt(images.LIGHTING_MOODS),
            renovationDepths: opt(images.RENOVATION_DEPTHS),
            defaultRenovationDepth: images.DEFAULT_RENOVATION_DEPTH,
            extraAxes: images.EXTRA_AXES.map((a) => ({ key: a.key, label: a.label, options: opt(a.list) })),
            objectAxes: images.OBJECT_AXES.map((a) => ({ key: a.key, label: a.label })),
          });
        case 'property-list':
          return res.status(200).json({ images: [] });
        case 'command-center': {
          // The REAL intelligence layer over the fixture rows above, so what
          // renders locally is what production computes — only the source of
          // the rows is substituted.
          const _command = require('../api/_command');
          const { leads: cmdLeads } = await _leadsRead.fetchLeads('LOCALDEV', {});
          return res.status(200).json(_command.build(cmdLeads, {
            calendarConnected: true, appointmentsToday: 2,
          }));
        }
        case 'property-generate':
          // Never fake a generated image: a placeholder here would make a
          // broken pipeline look like a working one.
          return res.status(503).json({ error: 'Beeldgeneratie vereist OPENAI_API_KEY — niet ingesteld lokaal.' });
        default:
          return res.status(400).json({ error: 'mode not stubbed in faro-dev' });
      }
    }

    if (p === '/' || p === '/dashboard') {
      req.query = Object.fromEntries(url.searchParams);
      req.headers.cookie = req.headers.cookie || '';
      return dashboard(req, res);
    }

    if (serveStatic(p, res) !== false) return undefined;

    res.statusCode = 404;
    return res.end('not found');
  } catch (err) {
    // Print the real error locally — this is the one place a stack trace helps
    // rather than leaks, since the only audience is the developer running it.
    console.error(`\n✗ ${req.method} ${p}\n`, err);
    if (!res.headersSent) { res.statusCode = 500; res.end('server error'); }
    return undefined;
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const cfg = require('../api/_faro/config');
  console.log(`
  Faro — local dev
  ──────────────────────────────────────────────
  http://localhost:${PORT}

  provider   ${cfg.providerName()}${cfg.providerName() === 'demo' ? '  (scripted, no API calls)' : ''}
  fixtures   ${process.env.FARO_DEMO_MODE === '1' ? 'on  (sample leads, not real data)' : 'off'}
  language   ${LOCAL_AUTH.lang}
  tenant     ${LOCAL_AUTH.projectCode}  (fake — localhost only)

  Open Faro from the topbar pill, or Ctrl/⌘-J. Try:
    "Wie zijn mijn beste leads?"      → streams + lead cards
    "Stuur ze een opvolgbericht"      → confirmation gate
    "Analyseer mijn pipeline"         → stat card
    attach a photo + "maak dit modern" → generates in the chat
                                          (needs OPENAI_API_KEY; without it
                                           you get the honest error card)
  ──────────────────────────────────────────────
`);
});
