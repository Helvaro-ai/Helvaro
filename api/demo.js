module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Helvaro Widget Demo</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', sans-serif;
    background: #030812;
    color: #e8edf5;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    background: #060e1f;
    border: 1px solid #0f2040;
    border-radius: 16px;
    padding: 40px;
    max-width: 480px;
    width: 100%;
    text-align: center;
  }
  h1 {
    font-family: 'Orbitron', monospace;
    font-size: 28px;
    background: linear-gradient(135deg, #fff, #00d4ff);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 12px;
    letter-spacing: 2px;
  }
  p { color: #8899aa; font-size: 15px; line-height: 1.7; margin-bottom: 16px; }
  .arrow {
    font-size: 40px;
    margin: 24px 0;
    animation: bounce 1.5s infinite;
  }
  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(8px); }
  }
  .badge {
    display: inline-block;
    background: rgba(0, 212, 255, 0.1);
    border: 1px solid rgba(0, 212, 255, 0.3);
    color: #00d4ff;
    border-radius: 20px;
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 600;
  }
</style>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Inter:wght@400;500&display=swap" rel="stylesheet">
</head>
<body>
<div class="card">
  <h1>HELVARO</h1>
  <p>Dit is de widget demo pagina.<br>Klik op de blauwe knop rechtsonder om de widget te testen.</p>
  <div class="arrow">↘️</div>
  <span class="badge">Widget actief</span>
  <p style="margin-top:20px;font-size:13px;color:#4a5a70">
    Leads komen binnen in Airtable onder project <strong style="color:#00d4ff">HELVARO</strong>
  </p>
</div>
<script src="/form-widget.js" data-project="HELVARO" async></script>
</body>
</html>`);
};
