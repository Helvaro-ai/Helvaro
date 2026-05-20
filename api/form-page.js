// Client-facing lead form page — personalized per client (AI Name + Client Name)
// served from the Klanten / Client Config Airtable table.

module.exports = async function handler(req, res) {
  const code = (req.url || '').split('/').filter(Boolean).pop() || 'HELVARO';
  let project = decodeURIComponent(code).toUpperCase();

  // Strict validation — only alphanumeric + underscore, prevents XSS in JS context
  if (!/^[A-Z0-9_]{1,50}$/.test(project)) {
    project = 'HELVARO';
  }

  // ── Pull client config (best-effort; falls back to defaults on any error) ──
  let aiName       = 'Mathis';
  let clientName   = 'Helvaro';
  let niche        = '';
  try {
    const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
    const BASE_ID        = process.env.BASE_AIRTABLE;
    const CLIENTS_TABLE  = 'tblPidTrwGRzRt4LZ';
    if (AIRTABLE_TOKEN && BASE_ID) {
      const formula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${project.replace(/"/g, '\\"')}"`);
      // 3-second hard cap so a slow Airtable can't slow down the form-page render
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const r = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
        { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }, signal: ctrl.signal }
      ).catch(() => null);
      clearTimeout(t);
      if (r && r.ok) {
        const d = await r.json().catch(() => ({}));
        const rec = (d.records || [])[0];
        if (rec) {
          aiName     = (rec.fields['fldRvoe1JMPOtPWC7'] || rec.fields['AI Name']     || aiName).toString().trim().slice(0, 60) || aiName;
          clientName = (rec.fields['fldAnB848Sr5jl6dq'] || rec.fields['Client Name'] || clientName).toString().trim().slice(0, 100) || clientName;
          niche      = (rec.fields['fld0BsPnDbBOkTHzr'] || rec.fields['Niche']        || '').toString().trim();
        }
      }
    }
  } catch { /* silent — fallback to defaults */ }

  // Strip control chars + escape for HTML / JS string contexts (defense in depth)
  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escJs(s) { return String(s || '').replace(/[\x00-\x1F\x7F]/g, '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

  const firstName       = aiName.split(/\s+/)[0] || aiName;
  const initial         = (firstName[0] || 'M').toUpperCase();
  const safeAiName      = escHtml(aiName);
  const safeFirstName   = escHtml(firstName);
  const safeClientName  = escHtml(clientName);

  // Sector-specific small touches in the chat-bubble intro
  const nicheHooks = {
    dentist:     'Ik help je graag bij je vragen over je gebit of een behandeling.',
    real_estate: 'Ik help je graag verder, of je nu een woning zoekt of er één wil verkopen.',
    lawyer:      'Ik help je graag verder met juridisch advies of een dossier.',
    finance:     'Ik help je graag met je financiële vraag.'
  };
  const nicheIntro = nicheHooks[niche] || 'Ik help je graag verder — laat hieronder je gegevens achter en je hoort meteen van me.';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');     // always render fresh — client just changed AI Name
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.status(200).send(`<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeFirstName} van ${safeClientName} — neem contact op</title>
<meta name="description" content="${safeFirstName} reageert binnen 1 minuut via WhatsApp.">
<link rel="icon" href="/favicon.png" type="image/png">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: radial-gradient(circle at 20% 0%, #1a2540 0%, #050811 55%);
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    padding: 24px 16px;
    color: #e8eef7;
  }
  .card {
    background: #0b1224; border: 1px solid rgba(99,102,241,.28);
    border-radius: 20px;
    width: 100%; max-width: 460px;
    box-shadow: 0 20px 60px rgba(0,0,0,.5);
    overflow: hidden;
  }

  /* WhatsApp-style chat header */
  .chat-hdr {
    background: #14233f;
    padding: 18px 22px;
    display: flex; align-items: center; gap: 14px;
    border-bottom: 1px solid rgba(99,102,241,.18);
  }
  .avatar {
    width: 48px; height: 48px; border-radius: 50%;
    background: linear-gradient(135deg, #14b8a6, #5eead4);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 700; font-size: 19px;
    flex-shrink: 0; position: relative;
  }
  .online-dot {
    position: absolute; right: 0; bottom: 1px;
    width: 12px; height: 12px; border-radius: 50%;
    background: #22c55e; border: 2px solid #14233f;
    box-shadow: 0 0 6px rgba(34,197,94,.7);
    animation: dotPulse 1.6s ease-in-out infinite;
  }
  @keyframes dotPulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
  .hdr-text { flex: 1; min-width: 0; }
  .hdr-name { font-size: 15px; font-weight: 700; color: #fff; }
  .hdr-status { font-size: 12px; color: #22c55e; font-weight: 600; }
  .hdr-brand { font-size: 11px; color: #6a85b0; margin-top: 2px; }

  /* Chat-style intro bubble */
  .chat-area {
    padding: 22px 22px 8px;
    background:
      radial-gradient(circle at 10% 90%, rgba(99,102,241,.04) 0%, transparent 60%),
      #0b1224;
  }
  .bubble {
    background: rgba(99,102,241,.10); border: 1px solid rgba(99,102,241,.18);
    border-bottom-left-radius: 4px; border-radius: 14px;
    padding: 12px 14px; font-size: 14px; line-height: 1.5;
    color: #e8eef7; max-width: 88%; margin-bottom: 6px;
    animation: bubbleIn .35s ease;
  }
  @keyframes bubbleIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .bubble-meta { font-size: 11px; color: #6a85b0; margin-bottom: 14px; padding-left: 4px; }
  .bubble strong { color: #fff; font-weight: 600; }

  /* Form */
  .form-area { padding: 6px 22px 24px; }
  label {
    display: block; font-size: 11px; font-weight: 700;
    color: #818cf8; letter-spacing: .08em; text-transform: uppercase;
    margin-bottom: 7px; margin-top: 14px;
  }
  input {
    width: 100%; background: #0a1320;
    border: 1px solid rgba(99,102,241,.22); border-radius: 11px;
    padding: 13px 15px; color: #e8eef7; font-size: 15px;
    font-family: inherit; outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  input:focus { border-color: rgba(129,140,248,.6); box-shadow: 0 0 0 3px rgba(99,102,241,.10); }
  input::placeholder { color: #3d5070; }

  button {
    width: 100%; margin-top: 18px;
    background: linear-gradient(135deg, #6366f1, #818cf8);
    color: #fff; border: none; border-radius: 11px;
    padding: 14px; font-weight: 700; font-size: 15px;
    font-family: inherit; cursor: pointer; letter-spacing: .2px;
    transition: opacity .15s, box-shadow .2s;
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  }
  button:hover:not(:disabled) { box-shadow: 0 6px 24px rgba(99,102,241,.45); }
  button:disabled { opacity: .55; cursor: not-allowed; }
  .btn-icon { display: inline-flex; }

  .error {
    display: none; color: #ff6378; font-size: 13px;
    margin-top: 14px; padding: 10px 14px;
    background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.22);
    border-radius: 9px;
  }

  /* Success state */
  .success { display: none; padding: 32px 26px 22px; text-align: center; }
  .success .tick {
    width: 64px; height: 64px;
    background: rgba(34,197,94,.12); border: 2px solid rgba(34,197,94,.4);
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    margin: 0 auto 18px; font-size: 30px; color: #22c55e;
  }
  .success h3 { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 8px; }
  .success p { color: #a0b8d8; font-size: 14px; line-height: 1.65; }
  .success strong { color: #22c55e; }
  .success-steps {
    margin-top: 22px; padding: 14px 16px;
    background: rgba(34,197,94,.06); border: 1px solid rgba(34,197,94,.18);
    border-radius: 10px; text-align: left;
  }
  .success-step { display: flex; align-items: center; gap: 10px; padding: 4px 0; font-size: 13px; color: #c5d4e8; }
  .success-step .num {
    width: 20px; height: 20px; border-radius: 50%;
    background: #22c55e; color: #fff; font-size: 11px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }

  /* Footer trust strip */
  .trust {
    display: flex; align-items: center; justify-content: center;
    gap: 14px; padding: 14px 22px 22px;
    flex-wrap: wrap; border-top: 1px solid rgba(99,102,241,.12);
  }
  .trust-item {
    display: inline-flex; align-items: center; gap: 5px;
    color: #6a85b0; font-size: 11px;
  }
  .trust-item span { font-size: 13px; }
  .powered {
    text-align: center; font-size: 10px; color: #3d5070;
    padding: 6px 0 14px; letter-spacing: .03em;
  }
  .powered a { color: #6a85b0; text-decoration: none; }

  @media (max-width: 480px) {
    body { padding: 12px 10px; align-items: flex-start; }
    .card { border-radius: 16px; }
    .chat-hdr, .chat-area, .form-area { padding-left: 18px; padding-right: 18px; }
  }
</style>
</head>
<body>
<div class="card">

  <!-- WhatsApp-style header with the AI persona -->
  <div class="chat-hdr">
    <div class="avatar">
      ${escHtml(initial)}
      <span class="online-dot" title="${safeFirstName} is online"></span>
    </div>
    <div class="hdr-text">
      <div class="hdr-name">${safeAiName}</div>
      <div class="hdr-status">● Online — reageert binnen 1 min</div>
      <div class="hdr-brand">${safeClientName}</div>
    </div>
  </div>

  <!-- Chat-bubble intro -->
  <div class="chat-area" id="chat-area">
    <div class="bubble">
      Hey 👋 ik ben <strong>${safeFirstName}</strong> van <strong>${safeClientName}</strong>.<br>
      ${escHtml(nicheIntro)}
    </div>
    <div class="bubble-meta">${safeFirstName} typt nu...</div>
  </div>

  <!-- Form (default visible) -->
  <div class="form-area" id="form">
    <label for="naam">Hoe mag ik je noemen?</label>
    <input id="naam" type="text" placeholder="Jouw naam" autocomplete="name">

    <label for="tel">Je WhatsApp nummer</label>
    <input id="tel" type="tel" placeholder="0478 12 34 56" autocomplete="tel" inputmode="tel">

    <button id="btn">
      <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.4 0-.6.1-.2.3-.7.9-.9 1.1-.1.1-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.3-.4.1-.2 0-.3 0-.5 0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4 0-.7.3-.3.3-.9.9-.9 2.2 0 1.3.9 2.5 1 2.7.1.1 1.8 2.7 4.3 3.7.6.2 1.1.4 1.4.5.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.6-.3z"/>
      </svg>
      Stuur ${safeFirstName} mijn gegevens
    </button>
    <div class="error" id="err"></div>
  </div>

  <!-- Success -->
  <div class="success" id="ok">
    <div class="tick">✓</div>
    <h3>Bedankt, <span id="ok-name">vriend</span>!</h3>
    <p><strong>${safeFirstName}</strong> stuurt je nu een persoonlijk bericht via WhatsApp.</p>
    <div class="success-steps">
      <div class="success-step"><span class="num">1</span> Check je WhatsApp binnen 1 min</div>
      <div class="success-step"><span class="num">2</span> Beantwoord ${safeFirstName}'s vraag</div>
      <div class="success-step"><span class="num">3</span> We plannen een afspraak als jij wil</div>
    </div>
  </div>

  <!-- Trust strip -->
  <div class="trust">
    <div class="trust-item"><span>🔒</span> Geen spam, ooit</div>
    <div class="trust-item"><span>⚡</span> Reactie binnen 1 min</div>
    <div class="trust-item"><span>🤝</span> Vrijblijvend</div>
  </div>
  <div class="powered">Powered by <a href="https://app.helvaro.pro" target="_blank" rel="noopener">Helvaro</a></div>
</div>

<script>
var PROJECT  = '${escJs(project)}';
var AI_FIRST = '${escJs(firstName)}';
var API      = 'https://app.helvaro.pro/api/form/' + encodeURIComponent(PROJECT);

var btn  = document.getElementById('btn');
var err  = document.getElementById('err');
var form = document.getElementById('form');
var ok   = document.getElementById('ok');

btn.addEventListener('click', function() {
  var name  = document.getElementById('naam').value.trim();
  var phone = document.getElementById('tel').value.trim();

  err.style.display = 'none';
  if (!name || !phone) {
    err.textContent   = 'Vul je naam en telefoonnummer in zodat ' + AI_FIRST + ' contact kan opnemen.';
    err.style.display = 'block';
    return;
  }

  btn.innerHTML  = 'Een momentje...';
  btn.disabled   = true;

  fetch(API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name: name, phone: phone, bron: 'Advertentie' })
  })
  .then(function(r) {
    if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Fout'); });
    var firstName = name.split(' ')[0];
    var okName = document.getElementById('ok-name');
    if (okName) okName.textContent = firstName || 'vriend';
    form.style.display = 'none';
    document.getElementById('chat-area').style.display = 'none';
    ok.style.display   = 'block';
  })
  .catch(function(e) {
    err.textContent   = e.message || 'Er ging iets mis. Probeer opnieuw.';
    err.style.display = 'block';
    btn.innerHTML     = 'Stuur ' + AI_FIRST + ' mijn gegevens';
    btn.disabled      = false;
  });
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && form.style.display !== 'none') btn.click();
});
</script>
</body>
</html>`);
};
