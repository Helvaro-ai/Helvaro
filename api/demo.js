module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Helvaro Widget Demo</title>
<link rel="icon" href="/favicon.png" type="image/png">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', sans-serif;
    background: #121212;
    color: #F9F9F9;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    background: #1A1A1A;
    border: 1px solid #333333;
    border-radius: 18px;
    padding: 40px;
    max-width: 480px;
    width: 100%;
    text-align: center;
  }
  h1 {
    font-family: 'Inter', sans-serif;
    font-variant-numeric: tabular-nums;
    font-size: 28px;
    color: #E8D7B1;
    margin-bottom: 12px;
    letter-spacing: 2px;
  }
  p { color: #999999; font-size: 15px; line-height: 1.7; margin-bottom: 16px; }
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
    background: rgba(232, 215, 177, 0.1);
    border: 1px solid rgba(232, 215, 177, 0.3);
    color: #E8D7B1;
    border-radius: 20px;
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 600;
  }
</style>
<style>
  /* Self-hosted Inter (GDPR — no request to Google's CDN). Loading a webfont
     from Google's font CDN sends the visitor's IP to Google on every page
     view; a Munich court ruled in 2022 that doing so without consent breaches
     the GDPR. Same treatment as the dashboard, which was fixed earlier. */
  @font-face {
    font-family: 'Inter';
    font-style: normal;
    font-weight: 300 700;
    font-display: swap;
    src: url('/fonts/inter-var.woff2') format('woff2');
  }
</style>
</head>
<body>
<div class="card">
  <h1>HELVARO</h1>
  <p>Dit is de widget demo pagina.<br>Klik op de blauwe knop rechtsonder om de widget te testen.</p>
  <div class="arrow">↘️</div>
  <span class="badge">Widget actief</span>
  <p style="margin-top:20px;font-size:13px;color:#666666">
    Leads komen binnen in Airtable onder project <strong style="color:#E8D7B1">HELVARO</strong>
  </p>
</div>
<script src="/form-widget.js" data-project="HELVARO" async></script>
</body>
</html>`);
};
