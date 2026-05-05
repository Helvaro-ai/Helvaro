module.exports = function handler(req, res) {
  const code = (req.url || '').split('/').filter(Boolean).pop() || 'HELVARO';
  const project = decodeURIComponent(code).toUpperCase();

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gratis kennismakingsgesprek — Helvaro</title>
<link rel="icon" href="/favicon.png" type="image/png">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', sans-serif;
    background: #030812;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
  }

  .card {
    background: #060e1f;
    border: 1px solid rgba(30,111,217,.35);
    border-radius: 20px;
    padding: 40px 36px;
    width: 100%;
    max-width: 420px;
    box-shadow: 0 0 60px rgba(30,111,217,.12);
  }

  .logo {
    font-family: 'Orbitron', monospace;
    font-size: 22px;
    font-weight: 700;
    background: linear-gradient(135deg, #fff, #00d4ff);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: 2px;
    text-align: center;
    margin-bottom: 8px;
  }

  .tagline {
    text-align: center;
    color: #6a85b0;
    font-size: 14px;
    margin-bottom: 32px;
    line-height: 1.6;
  }

  .tagline strong {
    color: #a0b8d8;
    display: block;
    font-size: 18px;
    margin-bottom: 6px;
  }

  label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: #00d4ff;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    margin-bottom: 7px;
  }

  input {
    width: 100%;
    background: #0a1628;
    border: 1px solid rgba(30,111,217,.25);
    border-radius: 10px;
    padding: 14px 16px;
    color: #e8f0ff;
    font-size: 15px;
    font-family: 'Inter', sans-serif;
    margin-bottom: 18px;
    outline: none;
    transition: border-color .15s, box-shadow .15s;
  }

  input:focus {
    border-color: rgba(43,143,255,.6);
    box-shadow: 0 0 0 3px rgba(43,143,255,.1);
  }

  input::placeholder { color: #3d5070; }

  button {
    width: 100%;
    background: linear-gradient(135deg, #1e6fd9, #0099cc);
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 15px;
    font-weight: 600;
    font-size: 15px;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
    letter-spacing: .4px;
    transition: box-shadow .2s, opacity .15s;
    margin-top: 4px;
  }

  button:hover:not(:disabled) { box-shadow: 0 0 24px rgba(30,111,217,.5); }
  button:disabled { opacity: .6; cursor: not-allowed; }

  .error {
    display: none;
    color: #ff4560;
    font-size: 13px;
    margin-top: 12px;
    padding: 10px 14px;
    background: rgba(255,69,96,.08);
    border: 1px solid rgba(255,69,96,.2);
    border-radius: 8px;
  }

  .success {
    display: none;
    text-align: center;
    padding: 16px 0;
  }

  .tick {
    width: 60px;
    height: 60px;
    background: rgba(0,229,160,.1);
    border: 2px solid rgba(0,229,160,.3);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 18px;
    font-size: 26px;
  }

  .success p {
    color: #a0b8d8;
    font-size: 15px;
    line-height: 1.7;
  }

  .success strong { color: #00e5a0; }

  .trust {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-top: 24px;
    flex-wrap: wrap;
  }

  .trust-item {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #4a6080;
    font-size: 12px;
  }

  .trust-item span { color: #00d4ff; font-size: 14px; }
</style>
</head>
<body>
<div class="card">
  <div class="logo">HELVARO</div>
  <div class="tagline">
    <strong>Gratis kennismakingsgesprek</strong>
    Vul je gegevens in en wij nemen<br>binnen de minuut contact op via WhatsApp
  </div>

  <div id="form">
    <label for="naam">Naam</label>
    <input id="naam" type="text" placeholder="Jouw naam" autocomplete="name">

    <label for="tel">WhatsApp nummer</label>
    <input id="tel" type="tel" placeholder="0478 12 34 56" autocomplete="tel">

    <button id="btn">Stuur mij een bericht</button>
    <div class="error" id="err"></div>
  </div>

  <div class="success" id="ok">
    <div class="tick">✓</div>
    <p><strong>Bedankt!</strong><br>Je ontvangt zo meteen een WhatsApp berichtje van ons.</p>
  </div>

  <div class="trust">
    <div class="trust-item"><span>🔒</span> Geen spam</div>
    <div class="trust-item"><span>⚡</span> Reactie binnen 1 min</div>
    <div class="trust-item"><span>🤝</span> Vrijblijvend</div>
  </div>
</div>

<script>
var PROJECT = '${project}';
var API     = 'https://app.helvaro.pro/api/form/' + encodeURIComponent(PROJECT);

var btn  = document.getElementById('btn');
var err  = document.getElementById('err');
var form = document.getElementById('form');
var ok   = document.getElementById('ok');

btn.addEventListener('click', function() {
  var name  = document.getElementById('naam').value.trim();
  var phone = document.getElementById('tel').value.trim();

  err.style.display = 'none';
  if (!name || !phone) {
    err.textContent   = 'Vul je naam en telefoonnummer in.';
    err.style.display = 'block';
    return;
  }

  btn.textContent = 'Even geduld...';
  btn.disabled    = true;

  fetch(API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name: name, phone: phone, bron: 'Advertentie' })
  })
  .then(function(r) {
    if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Fout'); });
    form.style.display = 'none';
    ok.style.display   = 'block';
  })
  .catch(function(e) {
    err.textContent   = e.message || 'Er ging iets mis. Probeer opnieuw.';
    err.style.display = 'block';
    btn.textContent   = 'Stuur mij een bericht';
    btn.disabled      = false;
  });
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') btn.click();
});
</script>
</body>
</html>`);
};
