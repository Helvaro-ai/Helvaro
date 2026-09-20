/*
 * Uitloggen bleef inloggen (2026-09-20).
 *
 * Clerk roept fetch aan met een URL-object. De globale fetch-wrapper in het
 * dashboard las daar '' uit, hield dat voor same-origin en zette x-csrf-token
 * op Clerk's POST /v1/client/sessions. Eigen header op cross-origin = CORS-
 * preflight, Clerk weigert, 'Failed to fetch', signOut() mislukt stil, redirect
 * naar /dashboard, sessie leeft nog: je stond weer binnen.
 *
 * Deze test haalt de wrapper uit de gerenderde pagina en draait hem in een
 * mini-browser: string, Request en URL-object, same- en cross-origin.
 */
'use strict';

process.env.FARO_WORKSPACE_ENABLED = '1';
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`);
  ok ? pass++ : fail++;
};

delete require.cache[require.resolve(BASE + 'api/dashboard.js')];
const dash = require(BASE + 'api/dashboard.js');
let html = '';
dash({ method: 'GET', url: '/dashboard', headers: {} },
  { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });

/* De wrapper is een IIFE: van 'function csrfToken()' tot en met de sluitende
   '})();' na 'window.fetch = function'. */
const start = html.indexOf('(function () {\n  function csrfToken() {');
const eind  = html.indexOf('})();', html.indexOf('window.fetch = function', start)) + 5;
const wrapper = html.slice(start, eind);

console.log('\nDe fetch-wrapper herkent de herkomst van elke invoervorm');
ck('wrapper gevonden in de pagina', start > 0 && eind > start && wrapper.includes('window.fetch = function'), { start, eind });

async function draai(input, init) {
  const calls = [];
  const ctx = {
    document: { cookie: 'hv_csrf=TOKEN123' },
    location: { origin: 'https://app.helvaro.pro', href: 'https://app.helvaro.pro/dashboard' },
    URL, Headers, Request,
    CLERK_READY: false,
    console,
    setTimeout, clearTimeout,
  };
  ctx.window = ctx;
  ctx.window.fetch = function (i, o) { calls.push({ i, o }); return Promise.resolve({ ok: true }); };
  vm.createContext(ctx);
  vm.runInContext(wrapper, ctx);
  await ctx.window.fetch(input, init);
  const h = calls[0] && calls[0].o && calls[0].o.headers ? new Headers(calls[0].o.headers) : new Headers();
  return { csrf: h.get('x-csrf-token') };
}

(async () => {
  ck('string same-origin POST krijgt x-csrf-token',
    (await draai('/api/leads', { method: 'POST' })).csrf === 'TOKEN123');
  ck('string cross-origin POST krijgt hem niet',
    (await draai('https://clerk.helvaro.pro/v1/client/sessions', { method: 'POST' })).csrf === null);
  ck('URL-object cross-origin POST krijgt hem niet (de uitloglus)',
    (await draai(new URL('https://clerk.helvaro.pro/v1/client/sessions?_method=DELETE'), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).csrf === null);
  ck('URL-object same-origin POST krijgt hem wel',
    (await draai(new URL('https://app.helvaro.pro/api/leads'), { method: 'POST' })).csrf === 'TOKEN123');
  ck('Request cross-origin krijgt hem niet',
    (await draai(new Request('https://clerk.helvaro.pro/v1/client'), { method: 'POST' })).csrf === null);
  ck('GET krijgt nooit een token',
    (await draai('/api/leads', { method: 'GET' })).csrf === null);

  console.log('\nEen mislukte Clerk-uitlog stuurt niet door');
  ck('clerkSignOut redirect alleen na succes', html.includes("if (!gelukt) { try { toast(tr('tst.uitloggenMis'), 'error'); } catch (e) {} return; }\n  window.location.href = '/dashboard';"));
  const i18n = require(BASE + 'api/_i18n.js');
  ck('tst.uitloggenMis bestaat in vier talen', ['nl', 'fr', 'en', 'de'].every((t) => i18n.t(t, 'tst.uitloggenMis') !== 'tst.uitloggenMis'));

  console.log(`\n  ${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})();
