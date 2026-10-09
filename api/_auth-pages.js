'use strict';
/*
 * De drie losse wachtwoordpagina's: /forgot-password, /reset-password en de
 * uitkomst van /verify-email. Ze stonden in api/auth.js in een oude blauwe
 * stijl en alleen in het Nederlands, terwijl de welkomstmail van een nieuwe
 * klant er rechtstreeks naartoe linkt. Nu: hetzelfde warme licht als het
 * inlogscherm (donker alleen voor wie zelf voor donker koos) (DESIGN.md: zand als vulling, warme inkt, geen glow), in de taal
 * van de bezoeker (?lang=, cookie, Accept-Language -- zie _i18n.resolveer).
 *
 * De API antwoordt nog in het Nederlands. In het Nederlands tonen we die
 * tekst (die is specifiek); in een andere taal een vertaalde melding op basis
 * van de status, zoals het dashboard dat ook doet (serverTekst).
 */

const _i18n = require('./_i18n');

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* JSON in een <script>: </script> en U+2028/9 mogen er niet letterlijk in. */
function jsonVoorScript(o) {
  return JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const CSS = `
  @font-face { font-family: 'Inter'; src: url('/fonts/inter-var.woff2') format('woff2'); font-weight: 100 900; font-display: swap; }
  @font-face { font-family: 'Space Grotesk'; src: url('/fonts/space-grotesk-var.woff2') format('woff2'); font-weight: 300 700; font-display: swap; }
  /* Licht is de standaard, net als in de app en op het inlogscherm. Zelfde
     waarden als [data-theme=light] #login-page in api/_dash/styles.js; donker
     alleen voor wie zelf voor donker koos (hv-theme-v2, zie het scriptje in
     pagina()). */
  :root {
    color-scheme: light;
    --stage: #F3EDE1; --card: #FAF6EE; --line: #D9CCB0; --field: #FFFDF9; --field-line: #857A63; --field-hover: #6B6252;
    --text: #1F1D19; --muted: #6B6252; --placeholder: #7A705E; --ink: #6E5320;
    --fill: #E8D7B1; --fill-edge: #BFA877; --on-fill: #1A1A1A; --ring: rgba(110,83,32,.20); --link-line: rgba(110,83,32,.40);
    --ok-ink: #226838; --ok-bg: rgba(47,143,78,.10); --ok-line: rgba(47,143,78,.32);
    --err-ink: #A52D25; --err-bg: rgba(194,53,43,.08); --err-line: rgba(194,53,43,.32);
    --shadow: 0 1px 2px rgba(23,19,12,.06), 0 12px 32px -12px rgba(23,19,12,.14);
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --stage: #17140F; --card: #211D16; --line: #3A3327; --field: #17140F; --field-line: #706D66; --field-hover: #574B37;
    --text: #F1E9DA; --muted: #A79B85; --placeholder: #9A9489; --ink: #F0E4C8;
    --fill: #E8D7B1; --fill-edge: #E8D7B1; --on-fill: #1A1A1A; --ring: rgba(232,215,177,.16); --link-line: rgba(240,228,200,.35);
    --ok-ink: #B5D3A5; --ok-bg: rgba(127,176,105,.12); --ok-line: rgba(127,176,105,.32);
    --err-ink: #E7756B; --err-bg: rgba(228,102,90,.10); --err-line: rgba(228,102,90,.28);
    --shadow: none;
  }
  * { box-sizing: border-box; }
  html { font-size: 15px; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px 16px;
    background: var(--stage); color: var(--text); font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; -webkit-font-smoothing: antialiased; }
  .kaart { width: 100%; max-width: 440px; background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 36px 32px 28px; box-shadow: var(--shadow); }
  .logo { display: block; width: 136px; height: auto; margin: 0 0 32px; }
  h1 { margin: 0 0 10px; font-family: 'Space Grotesk', 'Inter', sans-serif; font-size: 1.8667rem; line-height: 1.15; font-weight: 700; letter-spacing: -0.02em; color: var(--text); text-wrap: balance; }
  .sub { margin: 0 0 28px; color: var(--muted); font-size: 1rem; line-height: 1.55; }
  label { display: block; margin: 0 0 8px; color: var(--muted); font-size: 0.8667rem; font-weight: 600; }
  label + input { margin-bottom: 0; }
  .veld + .veld { margin-top: 16px; }
  input { width: 100%; height: 48px; padding: 0 14px; background: var(--field); color: var(--text); border: 1px solid var(--field-line); border-radius: 10px;
    font: inherit; font-size: 1rem; caret-color: var(--ink); transition: border-color .15s ease, box-shadow .15s ease; }
  input::placeholder { color: var(--placeholder); }
  input:hover { border-color: var(--field-hover); }
  input:focus { outline: none; border-color: var(--ink); box-shadow: 0 0 0 3px var(--ring); }
  button { width: 100%; height: 50px; margin-top: 22px; background: var(--fill); color: var(--on-fill); border: 1px solid var(--fill-edge); border-radius: 10px; box-shadow: var(--shadow);
    font-family: 'Space Grotesk', 'Inter', sans-serif; font-size: 1rem; font-weight: 600; cursor: pointer; transition: filter .15s ease, transform .1s ease; }
  button:hover { filter: brightness(1.05); }
  button:active { transform: translateY(1px); }
  button:disabled { opacity: .6; cursor: default; filter: none; transform: none; box-shadow: none; }
  button:focus-visible, a:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
  .melding { margin-top: 16px; padding: 12px 14px; border-radius: 10px; font-size: 0.9333rem; line-height: 1.5; }
  .melding[hidden] { display: none; }
  .melding.ok { background: var(--ok-bg); border: 1px solid var(--ok-line); color: var(--ok-ink); }
  .melding.fout { background: var(--err-bg); border: 1px solid var(--err-line); color: var(--err-ink); }
  .terug { display: inline-block; margin-top: 24px; color: var(--ink); font-size: 0.9333rem; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--link-line); }
  .terug:hover { color: var(--text); text-decoration-color: currentColor; }
  .teken { width: 44px; height: 44px; border-radius: 999px; margin: 0 0 20px; display: flex; align-items: center; justify-content: center; }
  .teken.ok { background: var(--ok-bg); color: var(--ok-ink); }
  .teken.fout { background: var(--err-bg); color: var(--err-ink); }
  ::selection { background: rgba(232,215,177,.65); color: var(--text); }
  @media (max-width: 480px) { .kaart { padding: 28px 22px 24px; } h1 { font-size: 1.6rem; } }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

function taal(req) { return _i18n.resolveer(req || { url: '/', headers: {} }); }

function pagina(lang, titel, binnen) {
  return `<!DOCTYPE html>
<html lang="${esc(lang)}"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${esc(titel)} · Helvaro</title>
  <link rel="icon" href="/favicon.png" type="image/png">
  <script>try{if(localStorage.getItem('hv-theme-v2')==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}</script>
  <style>${CSS}</style>
</head><body>
  <main class="kaart">
    <img class="logo" src="/logo.png" alt="Helvaro">
${binnen}
  </main>
</body></html>`;
}

/* Gedeelde clientlogica: een formulier posten, de knop bezig zetten, de
   melding tonen. W = de vertaalde teksten voor deze pagina. */
const KLIENT = `
function toon(m, tekst, soort) { m.textContent = tekst; m.className = 'melding ' + soort; m.hidden = false; }
function serverTekst(d, status, W) {
  var eigen = d && (d.message || d.error);
  if (W.lang === 'nl' && eigen) return eigen;
  if (status === 429) return W.teVeel;
  if (status === 400) return W.ongeldig;
  return W.fout;
}`;

function renderForgotPage(req, res) {
  const lang = taal(req);
  const T = (k) => _i18n.t(lang, k);
  const W = { lang, bezig: T('pw.bezig'), knop: T('pw.vergeten.knop'), verstuurd: T('pw.vergeten.verstuurd'),
    ok: T('pw.vergeten.ok'), fout: T('pw.fout'), net: T('pw.netwerk'), teVeel: T('log.teVeel'), ongeldig: T('log.mailOngeldig') };
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(pagina(lang, T('pw.vergeten.titel'), `
    <h1>${esc(T('pw.vergeten.titel'))}</h1>
    <p class="sub">${esc(T('pw.vergeten.sub'))}</p>
    <form id="f" novalidate>
      <label for="email">${esc(T('login.email'))}</label>
      <input id="email" type="email" autocomplete="email" required placeholder="${esc(T('login.email.ph'))}">
      <button id="btn" type="submit">${esc(W.knop)}</button>
    </form>
    <div id="m" class="melding" role="status" aria-live="polite" hidden></div>
    <a class="terug" href="/dashboard">${esc(T('pw.terug'))}</a>
<script>
var W = ${jsonVoorScript(W)};
${KLIENT}
var f = document.getElementById('f'), btn = document.getElementById('btn'), m = document.getElementById('m'), inp = document.getElementById('email');
f.addEventListener('submit', async function (e) {
  e.preventDefault();
  var email = inp.value.trim();
  m.hidden = true;
  if (!email || !inp.checkValidity()) { toon(m, W.ongeldig, 'fout'); inp.focus(); return; }
  btn.disabled = true; btn.textContent = W.bezig;
  try {
    var r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'request-reset', email: email }) });
    var d = await r.json().catch(function () { return {}; });
    if (r.ok) { toon(m, W.lang === 'nl' && d.message ? d.message : W.ok, 'ok'); btn.textContent = W.verstuurd; return; }
    toon(m, serverTekst(d, r.status, W), 'fout');
  } catch (err) { toon(m, W.net, 'fout'); }
  btn.disabled = false; btn.textContent = W.knop;
});
</script>`));
}

function renderResetPage(req, res) {
  const lang = taal(req);
  const T = (k) => _i18n.t(lang, k);
  const q = (req.url || '').split('?')[1] || '';
  const token = (new URLSearchParams(q).get('token') || '').replace(/[^A-Za-z0-9._\-]/g, '').slice(0, 1024);
  const W = { lang, bezig: T('pw.bezig'), knop: T('pw.reset.knop'), klaar: T('pw.reset.klaar'), ok: T('pw.reset.ok'),
    kort: T('pw.reset.kort'), anders: T('pw.reset.anders'), geenLink: T('pw.reset.geenLink'),
    fout: T('pw.fout'), net: T('pw.netwerk'), teVeel: T('log.teVeel'), ongeldig: T('pw.reset.verlopen') };
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(pagina(lang, T('pw.reset.titel'), `
    <h1>${esc(T('pw.reset.titel'))}</h1>
    <p class="sub">${esc(T('pw.reset.sub'))}</p>
    <form id="f" novalidate>
      <div class="veld">
        <label for="p1">${esc(T('pw.reset.nieuw'))}</label>
        <input id="p1" type="password" autocomplete="new-password" required minlength="8" placeholder="${esc(T('pw.reset.ph1'))}">
      </div>
      <div class="veld">
        <label for="p2">${esc(T('pw.reset.bevestig'))}</label>
        <input id="p2" type="password" autocomplete="new-password" required minlength="8" placeholder="${esc(T('pw.reset.ph2'))}">
      </div>
      <button id="btn" type="submit">${esc(W.knop)}</button>
    </form>
    <div id="m" class="melding" role="status" aria-live="polite" hidden></div>
    <a class="terug" href="/dashboard">${esc(T('pw.terug'))}</a>
<script>
var W = ${jsonVoorScript(W)};
var TOKEN = ${jsonVoorScript(token)};
${KLIENT}
var f = document.getElementById('f'), btn = document.getElementById('btn'), m = document.getElementById('m');
if (!TOKEN) { toon(m, W.geenLink, 'fout'); btn.disabled = true; }
f.addEventListener('submit', async function (e) {
  e.preventDefault();
  if (!TOKEN) return;
  var p1 = document.getElementById('p1').value, p2 = document.getElementById('p2').value;
  m.hidden = true;
  if (p1.length < 8) { toon(m, W.kort, 'fout'); document.getElementById('p1').focus(); return; }
  if (p1 !== p2)     { toon(m, W.anders, 'fout'); document.getElementById('p2').focus(); return; }
  btn.disabled = true; btn.textContent = W.bezig;
  try {
    var r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'reset-password', token: TOKEN, newPassword: p1 }) });
    var d = await r.json().catch(function () { return {}; });
    if (r.ok) {
      toon(m, W.lang === 'nl' && d.message ? d.message : W.ok, 'ok');
      btn.textContent = W.klaar;
      setTimeout(function () { window.location.href = '/dashboard'; }, 1500);
      return;
    }
    toon(m, serverTekst(d, r.status, W), 'fout');
  } catch (err) { toon(m, W.net, 'fout'); }
  btn.disabled = false; btn.textContent = W.knop;
});
</script>`));
}

const VINK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
const KRUIS = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

/** sleutel = een 'pw.verify.*'-tekst uit _i18n. */
function verifyResultPage(req, success, sleutel) {
  const lang = taal(req);
  const T = (k) => _i18n.t(lang, k);
  const titel = T(success ? 'pw.verify.ok' : 'pw.verify.mislukt');
  return pagina(lang, titel, `
    <div class="teken ${success ? 'ok' : 'fout'}">${success ? VINK : KRUIS}</div>
    <h1>${esc(titel)}</h1>
    <p class="sub" style="margin-bottom:0">${esc(T(sleutel))}</p>
    <a class="terug" href="/dashboard">${esc(T('pw.naarDashboard'))}</a>`);
}

module.exports = { renderForgotPage, renderResetPage, verifyResultPage };
