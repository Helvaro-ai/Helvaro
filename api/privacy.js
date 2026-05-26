const CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 760px; margin: 60px auto; padding: 0 24px; color: #111; line-height: 1.7; }
  h1 { font-size: 2rem; margin-bottom: 8px; }
  h2 { font-size: 1.15rem; margin-top: 40px; margin-bottom: 6px; }
  p, li { color: #444; }
  a { color: #0066cc; }
  .back { display: inline-block; margin-bottom: 32px; font-size: 14px; color: #0066cc; text-decoration: none; }
  .back:hover { text-decoration: underline; }
  footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #eee; font-size: 13px; color: #999; }
`;

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const path = (req.url || '').split('?')[0];

  // ── Terms of Service ────────────────────────────────────────────────────────
  if (path.endsWith('/terms')) {
    return res.status(200).send(`<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Algemene Voorwaarden. Helvaro</title>
  <link rel="icon" href="/favicon.png" type="image/png">
  <style>${CSS}</style>
</head>
<body>
  <a class="back" href="/">← Terug naar Helvaro</a>
  <h1>Algemene Voorwaarden</h1>
  <p><strong>Helvaro BV</strong>. Laatst bijgewerkt: mei 2026</p>

  <h2>1. Partijen</h2>
  <p>Deze algemene voorwaarden zijn van toepassing op alle overeenkomsten tussen <strong>Helvaro BV</strong> (hierna "Helvaro") en de opdrachtgever (hierna "Klant"). Door gebruik te maken van de diensten van Helvaro, accepteert de Klant deze voorwaarden.</p>

  <h2>2. Dienstverlening</h2>
  <p>Helvaro biedt een B2B SaaS-platform voor geautomatiseerde leadkwalificatie via WhatsApp en een bijhorend dashboard. De exacte diensten worden vastgelegd in een apart voorstel of offerte.</p>

  <h2>3. Abonnementen en prijzen</h2>
  <p>Helvaro werkt met één standaardabonnement:</p>
  <ul>
    <li><strong>Helvaro</strong>. €1.000 per maand · alles inbegrepen (onbeperkt aantal leads, 24/7 AI op WhatsApp, Calendly integratie, dashboard, premium support)</li>
    <li><strong>Op maat</strong>. voor enterprise of high-volume klanten: prijs op aanvraag</li>
  </ul>
  <p>De exacte prijs wordt schriftelijk bevestigd vóór aanvang van de samenwerking. Alle bedragen zijn excl. btw, tenzij anders vermeld.</p>

  <h2>4. Proefperiode</h2>
  <p>Nieuwe klanten ontvangen een gratis proefperiode van <strong>14 kalenderdagen</strong>. Na afloop van de proefperiode gaat de Klant automatisch over naar het afgesproken abonnement, tenzij schriftelijk anders overeengekomen.</p>

  <h2>5. Contractduur en verlenging</h2>
  <p>Na de proefperiode gaat de overeenkomst in voor een initiële looptijd van <strong>3 maanden</strong>. Na deze periode wordt de overeenkomst maandelijks verlengd, tenzij de Klant minimaal 30 dagen voor het einde van de lopende periode schriftelijk opzegt via <a href="mailto:hello@helvaro.pro">hello@helvaro.pro</a>.</p>

  <h2>6. Betaling</h2>
  <p>Facturen worden maandelijks vooraf verstuurd en dienen binnen <strong>14 dagen</strong> na factuurdatum te worden voldaan. Bij niet-tijdige betaling behoudt Helvaro het recht om toegang tot het platform tijdelijk op te schorten tot betaling is ontvangen.</p>

  <h2>7. Gebruik van het platform</h2>
  <p>Het is de Klant niet toegestaan om:</p>
  <ul>
    <li>Het platform door te verkopen of beschikbaar te stellen aan derden</li>
    <li>Het systeem te gebruiken voor spam, misleiding of illegale doeleinden</li>
    <li>Inloggegevens te delen met personen buiten de eigen organisatie</li>
  </ul>

  <h2>8. Eigendom van data</h2>
  <p>Alle leaddata die via het Helvaro-platform wordt verzameld, blijft eigendom van de Klant. Helvaro verwerkt deze data uitsluitend ten behoeve van de dienstverlening en deelt deze nooit met derden.</p>

  <h2>9. Aansprakelijkheid</h2>
  <p>Helvaro is niet aansprakelijk voor indirecte schade, gederfde inkomsten of het niet converteren van leads. Helvaro levert een platform en AI-tool. het resultaat hangt mede af van de kwaliteit van het aanbod van de Klant.</p>
  <p>De totale aansprakelijkheid van Helvaro is in alle gevallen beperkt tot het bedrag dat de Klant in de afgelopen 3 maanden heeft betaald.</p>

  <h2>10. Beschikbaarheid</h2>
  <p>Helvaro streeft naar een uptime van minimaal 99%. Geplande onderhoudsmomenten worden zo mogelijk vooraf gecommuniceerd. Helvaro is niet aansprakelijk voor onderbrekingen buiten haar controle (bijv. storing bij Meta, Airtable of Vercel).</p>

  <h2>11. Vertrouwelijkheid</h2>
  <p>Beide partijen behandelen informatie die in het kader van de samenwerking wordt uitgewisseld als vertrouwelijk en delen deze niet met derden zonder schriftelijke toestemming.</p>

  <h2>12. Wijzigingen in voorwaarden</h2>
  <p>Helvaro behoudt het recht deze voorwaarden te wijzigen. Klanten worden minimaal 30 dagen vooraf per e-mail geïnformeerd. Voortgezet gebruik na de ingangsdatum geldt als acceptatie.</p>

  <h2>13. Toepasselijk recht</h2>
  <p>Op deze overeenkomst is het Belgisch recht van toepassing. Geschillen worden bij voorkeur in onderling overleg opgelost. Indien dit niet lukt, is de bevoegde rechtbank te Antwerpen exclusief bevoegd.</p>

  <h2>14. Contact</h2>
  <p>Voor vragen over deze voorwaarden: <a href="mailto:hello@helvaro.pro">hello@helvaro.pro</a></p>

  <footer>
    Helvaro BV · <a href="/privacy">Privacybeleid</a> · <a href="/terms">Algemene Voorwaarden</a>
  </footer>
</body>
</html>`);
  }

  // ── Privacy Policy ──────────────────────────────────────────────────────────
  return res.status(200).send(`<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacybeleid. Helvaro</title>
  <link rel="icon" href="/favicon.png" type="image/png">
  <style>${CSS}</style>
</head>
<body>
  <a class="back" href="/">← Terug naar Helvaro</a>
  <h1>Privacybeleid</h1>
  <p><strong>Helvaro BV</strong>. Laatst bijgewerkt: mei 2026</p>

  <h2>1. Wie zijn wij?</h2>
  <p>Helvaro BV is een B2B SaaS-platform dat bedrijven helpt met geautomatiseerde leadkwalificatie via WhatsApp. Contacteer ons via <a href="mailto:hello@helvaro.pro">hello@helvaro.pro</a>.</p>

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

  <footer>
    Helvaro BV · <a href="/privacy">Privacybeleid</a> · <a href="/terms">Algemene Voorwaarden</a>
  </footer>
</body>
</html>`);
};
