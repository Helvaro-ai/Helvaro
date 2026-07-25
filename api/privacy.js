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
  <p>De exacte prijs wordt schriftelijk bevestigd vóór aanvang van de samenwerking. Alle bedragen zijn excl. Btw, tenzij anders vermeld.</p>

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
  <p>Helvaro is niet aansprakelijk voor indirecte schade, gederfde inkomsten of het niet converteren van leads. Helvaro levert een platform en AI-tool. Het resultaat hangt mede af van de kwaliteit van het aanbod van de Klant.</p>
  <p>De totale aansprakelijkheid van Helvaro is in alle gevallen beperkt tot het bedrag dat de Klant in de afgelopen 3 maanden heeft betaald.</p>

  <h2>10. Beschikbaarheid</h2>
  <p>Helvaro streeft naar een uptime van minimaal 99%. Geplande onderhoudsmomenten worden zo mogelijk vooraf gecommuniceerd. Helvaro is niet aansprakelijk voor onderbrekingen buiten haar controle (bijv. Storing bij Meta, Airtable of Vercel).</p>

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
  <p><strong>Helvaro BV</strong>. Laatst bijgewerkt: juli 2026</p>

  <h2>1. Wie zijn wij?</h2>
  <p>Helvaro BV is een B2B SaaS-platform dat bedrijven helpt met geautomatiseerde leadkwalificatie via WhatsApp. Contacteer ons via <a href="mailto:hello@helvaro.pro">hello@helvaro.pro</a>.</p>

  <h2>2. Welke gegevens verzamelen wij?</h2>
  <ul>
    <li>Naam en telefoonnummer (via het contactformulier of via WhatsApp)</li>
    <li>WhatsApp-berichten die u uitwisselt met onze AI-assistent, inclusief de volledige gespreksgeschiedenis</li>
    <li>Een AI-gegenereerde kwalificatiescore en samenvatting van het gesprek</li>
    <li>Uw IP-adres wordt kortstondig gebruikt om misbruik te voorkomen (bv. te veel aanvragen in korte tijd), maar wordt niet opgeslagen in onze database</li>
  </ul>
  <p>Wij verzamelen vandaag standaard geen e-mailadres van u als lead. Mocht dat in de toekomst wijzigen (bijvoorbeeld voor een nieuwe functie), werken wij dit privacybeleid bij vóór wij dat doen.</p>

  <h2>3. Waarvoor gebruiken wij uw gegevens?</h2>
  <p>Uw gegevens worden gebruikt om u te contacteren, uw vraag via onze AI-assistent op WhatsApp te beantwoorden, en te bepalen of er een match is met de dienstverlening van het bedrijf waarmee u contact opnam. Wij verkopen uw gegevens nooit aan derden.</p>

  <h2>4. Hoe lang bewaren wij uw gegevens?</h2>
  <p>Uw gegevens worden bewaard zolang dit nodig is voor het doel waarvoor ze verzameld zijn, of totdat u verzoekt om verwijdering. Concreet:</p>
  <ul>
    <li><strong>Gekwalificeerde leads</strong> (waarmee een klantrelatie tot stand kwam of nog kan komen) worden bewaard zolang die klantrelatie dit vereist.</li>
    <li><strong>Niet-gekwalificeerde of koude leads</strong> waarbij 6 maanden lang geen activiteit meer was, worden automatisch geanonimiseerd: naam, telefoonnummer en de volledige gespreksinhoud worden verwijderd. Geanonimiseerde, niet tot een persoon herleidbare statistieken (bv. aantal leads, conversiecijfers) blijven wel bewaard voor rapportagedoeleinden.</li>
  </ul>
  <p>U kan op elk moment vroegtijdige verwijdering of anonimisering van uw gegevens aanvragen — zie sectie 7 hieronder.</p>

  <h2>5. Wie verwerkt uw gegevens?</h2>
  <p>Naast het bedrijf waarmee u rechtstreeks contact opneemt, schakelt Helvaro de volgende partijen (subverwerkers) in om de dienst te kunnen leveren:</p>
  <ul>
    <li><strong>Anthropic PBC</strong> (Verenigde Staten) — verwerkt de inhoud van uw WhatsApp-gesprek om de AI-antwoorden te genereren.</li>
    <li><strong>Meta Platforms Ireland Ltd.</strong> — verzorgt het berichtenverkeer via WhatsApp Business.</li>
    <li><strong>Vercel Inc.</strong> (Verenigde Staten) — hosting en uitvoering van deze applicatie.</li>
    <li><strong>Airtable (Formagrid Inc., Verenigde Staten)</strong> — database waarin uw lead- en gespreksgegevens worden opgeslagen.</li>
    <li><strong>Namecheap Private Email</strong> (SMTP, via hello@helvaro.pro) — verzendt notificatie-e-mails; Resend wordt gebruikt als automatische fallback wanneer die verzending niet lukt.</li>
  </ul>
  <p>Deze lijst komt overeen met Bijlage 3 van onze verwerkersovereenkomst. Wij houden ze actueel en werken dit beleid bij zodra ze wijzigt.</p>

  <h2>6. Internationale doorgifte</h2>
  <p>Sommige van de hierboven genoemde partijen zijn gevestigd buiten de Europese Economische Ruimte (EER), met name in de Verenigde Staten (o.a. Anthropic, Vercel en Airtable). Voor die doorgiften steunen wij op een geldig doorgiftemechanisme onder de AVG, zoals de Standard Contractual Clauses (SCC) van de Europese Commissie of, waar van toepassing, het EU-US Data Privacy Framework — dezelfde waarborgen die zijn vastgelegd in onze verwerkersovereenkomst met klanten.</p>

  <h2>7. Uw rechten</h2>
  <p>U heeft het recht om uw gegevens in te zien, te corrigeren, te beperken, over te dragen of te laten verwijderen, en u kan bezwaar maken tegen de verwerking. Stuur hiervoor een e-mail naar <a href="mailto:hello@helvaro.pro">hello@helvaro.pro</a>.</p>

  <h2>8. Cookies</h2>
  <p>Wij gebruiken geen tracking cookies. Onze website maakt gebruik van lokale opslag (localStorage) voor authenticatie, met een geldigheidsduur van 7 dagen.</p>

  <h2>9. Beveiliging en opslag</h2>
  <p>Uw gegevens worden beveiligd opgeslagen via Airtable en verwerkt door deze applicatie, die draait op Vercel. Alle verbindingen zijn versleuteld via HTTPS/TLS.</p>

  <h2>10. Contact</h2>
  <p>Voor vragen over dit privacybeleid: <a href="mailto:hello@helvaro.pro">hello@helvaro.pro</a>. Voor vragen specifiek over gegevensbescherming kan u terecht bij onze gegevensbeschermingscontactpersoon: <a href="mailto:sindi.s@usehelvaro.pro">sindi.s@usehelvaro.pro</a>.</p>

  <footer>
    Helvaro BV · <a href="/privacy">Privacybeleid</a> · <a href="/terms">Algemene Voorwaarden</a>
  </footer>
</body>
</html>`);
};
