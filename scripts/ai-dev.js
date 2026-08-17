#!/usr/bin/env node
'use strict';
/*
 * Local dev server for the Helvaro AI workspace.
 *
 *   node scripts/ai-dev.js            → http://localhost:4321
 *   PORT=5000 node scripts/ai-dev.js
 *
 * ── What it is for ───────────────────────────────────────────────────────────
 * Seeing the AI workspace work without Vercel, without Airtable, without Clerk
 * and without an API key. It serves api/dashboard.js's HTML and routes
 * /api/ai to api/_ai/handler.js with a fixed local session.
 *
 * Everything in the request path is the REAL code: the same handler, the same
 * orchestrator, the same tool registry, the same SSE framing, the same
 * confirmation gate. Only three things are substituted, and each is an env var
 * the production deploy simply does not set:
 *
 *   AI_PROVIDER=demo        scripted responses instead of a model
 *   AI_DEMO_MODE=1          fixture leads/pipeline instead of Airtable
 *   AI_WORKSPACE_ENABLED=1  the feature flag, off in production until chosen
 *
 * ── This is a dev tool, not a deployment ─────────────────────────────────────
 * It binds localhost, has no authentication, and hands every request the same
 * fake tenant. It must never run anywhere reachable. Vercel ignores scripts/
 * entirely, so it cannot deploy by accident.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Set before requiring anything under api/_ai — config.js reads these at load.
process.env.AI_WORKSPACE_ENABLED = process.env.AI_WORKSPACE_ENABLED || '1';
process.env.AI_PROVIDER = process.env.AI_PROVIDER || 'demo';
process.env.AI_DEMO_MODE = process.env.AI_DEMO_MODE || '1';

const dashboard = require('../api/dashboard');
const aiHandler = require('../api/_ai/handler');

const PORT = Number(process.env.PORT || 4321);
const ROOT = path.join(__dirname, '..');

/* The fake local tenant. In production this comes from a verified signed
   session (see api/ai.js); here it is a constant, which is exactly why this
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
    if (p === '/api/ai') {
      req.body = await readBody(req);
      return aiHandler.handle(req, res, LOCAL_AUTH);
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
  const cfg = require('../api/_ai/config');
  console.log(`
  Helvaro AI — local dev
  ──────────────────────────────────────────────
  http://localhost:${PORT}

  provider   ${cfg.providerName()}${cfg.providerName() === 'demo' ? '  (scripted, no API calls)' : ''}
  fixtures   ${process.env.AI_DEMO_MODE === '1' ? 'on  (sample leads, not real data)' : 'off'}
  language   ${LOCAL_AUTH.lang}
  tenant     ${LOCAL_AUTH.projectCode}  (fake — localhost only)

  Click "AI" in the top centre. Try:
    "Wie zijn mijn beste leads?"      → streams + lead cards
    "Stuur ze een opvolgbericht"      → confirmation gate
    "Analyseer mijn pipeline"         → stat card
  ──────────────────────────────────────────────
`);
});
