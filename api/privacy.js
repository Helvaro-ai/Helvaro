module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacybeleid — Helvaro</title>
  <link rel="icon" href="/favicon.png" type="image/png">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 760px; margin: 60px auto; padding: 0 24px; color: #111; line-height: 1.7; }
    h1 { font-size: 2rem; margin-bottom: 8px; }
    h2 { font-size: 1.2rem; margin-top: 40px; }
    p, li { color: #444; }
    a { color: #0066cc; }
  </style>
</head>
<body>
  <h1>Privacybeleid</h1>
  <p><strong>Helvaro</strong> — Laatst bijgewerkt: april 2026</p>

  <h2>1. Wie zijn wij?</h2>
  <p>Helvaro is een B2B SaaS-platform dat bedrijven helpt met geautomatiseerde leadkwalificatie via WhatsApp. Contacteer ons via <a href="mailto:hello@helvaro.pro">hello@helvaro.pro</a>.</p>

  <h2>2. Welke gegevens verzamelen wij?</h2>
  <ul>
    <li>Naam en telefoonnummer (via het contactformulier)</li>
    <li>WhatsApp-berichten die worden uitgewisseld met onze AI-assistent</li>
    <li>Gespreksgeschiedenis en kwalificatiescore</li>
  </ul>

  <h2>3. Waarvoor gebruiken wij uw gegevens?</h2>
  <p>Uw gegevens worden uitsluitend gebruikt om u te contacteren en te bepalen of er een match is met onze dienstverlening. Wij verkopen uw gegevens nooit aan derden.</p>

  <h2>4. Hoe lang bewaren wij uw gegevens?</h2>
  <p>Uw gegevens worden bewaard zolang dit nodig is voor het doel waarvoor ze verzameld zijn, of totdat u verzoekt om verwijdering.</p>

  <h2>5. Uw rechten</h2>
  <p>U heeft het recht om uw gegevens in te zien, te corrigeren of te laten verwijderen. Stuur hiervoor een e-mail naar <a href="mailto:hello@helvaro.pro">hello@helvaro.pro</a>.</p>

  <h2>6. Cookies</h2>
  <p>Wij gebruiken geen tracking cookies. Onze website maakt gebruik van sessie-opslag voor authenticatie.</p>

  <h2>7. Beveiliging</h2>
  <p>Alle gegevens worden beveiligd opgeslagen via Airtable en Vercel. Verbindingen zijn versleuteld via HTTPS.</p>

  <h2>8. Contact</h2>
  <p>Voor vragen over dit privacybeleid: <a href="mailto:hello@helvaro.pro">hello@helvaro.pro</a></p>
</body>
</html>`);
};
