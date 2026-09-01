const CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 760px; margin: 60px auto; padding: 0 24px; color: #18160F; line-height: 1.7; background: #F7F5F0; }
  h1 { font-size: 2rem; margin-bottom: 8px; }
  h2 { font-size: 1.15rem; margin-top: 40px; margin-bottom: 6px; }
  p, li { color: #4A453C; }
  a { color: #8A6D3F; }
  .back { display: inline-block; margin-bottom: 32px; font-size: 14px; color: #8A6D3F; text-decoration: none; }
  .back:hover { text-decoration: underline; }
  footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #E4E0D6; font-size: 13px; color: #8A8478; }
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
  <title>Algemene Voorwaarden · Helvaro</title>
  <link rel="icon" href="/favicon.png" type="image/png">
  <style>${CSS}</style>
</head>
<body>
  <a class="back" href="/">← Terug naar Helvaro</a>
  <h1>Algemene Voorwaarden</h1>
  <p><strong>Helvaro BV</strong> &middot; Van kracht sinds 1 september 2026</p>

  <h2>1. Partijen en identificatie</h2>
  <p>Deze algemene voorwaarden zijn van toepassing op alle overeenkomsten tussen <strong>Helvaro BV</strong> (hierna "Helvaro") en de opdrachtgever (hierna "Klant"). Door gebruik te maken van de diensten van Helvaro aanvaardt de Klant deze voorwaarden.</p>
  <p>Helvaro is bereikbaar via <a href="mailto:hello@helvaro.pro">hello@helvaro.pro</a>. Helvaro richt zich uitsluitend op zakelijke klanten (B2B).</p>

  <h2>2. Dienstverlening</h2>
  <p>Helvaro is een SaaS-platform dat inkomende leads automatisch te woord staat via WhatsApp, ze kwalificeert met een AI-assistent, en de resultaten toont in een dashboard. Optioneel plant de assistent afspraken in de agenda van de Klant.</p>
  <p>Helvaro levert een platform en een AI-assistent. Helvaro levert geen leads, geen verkoopresultaat en geen omzetgarantie.</p>

  <h2>3. Abonnementen en prijzen</h2>
  <p>Helvaro werkt met drie abonnementen. Alle bedragen zijn <strong>inclusief 21% btw</strong> en gelden per maand:</p>
  <ul>
    <li><strong>Starter</strong> &mdash; &euro;249,99 per maand, 3.000 credits</li>
    <li><strong>Growth</strong> &mdash; &euro;499 per maand, 10.000 credits, inclusief beeldgeneratie</li>
    <li><strong>Scale</strong> &mdash; vanaf &euro;799 per maand, 20.000 credits. Dit is een vanafprijs: het tarief wordt per klant bepaald op basis van het verwachte volume en schriftelijk bevestigd vóór aanvang.</li>
  </ul>
  <p>Het actuele aanbod in het dashboard is leidend. Prijswijzigingen worden minimaal 30 dagen vooraf per e-mail aangekondigd en gelden nooit met terugwerkende kracht.</p>

  <h2>4. Credits</h2>
  <p>Het verbruik van het platform wordt afgerekend in credits. Eén gekwalificeerd WhatsApp-gesprek kost <strong>20 credits</strong>. Beeld- en videogeneratie en andere AI-functies hebben elk een eigen tarief, dat vóór gebruik in het dashboard zichtbaar is.</p>
  <ul>
    <li>Credits horen bij de lopende maand en worden bij verlenging opnieuw toegekend.</li>
    <li>Credits vertegenwoordigen geen geldwaarde, zijn niet overdraagbaar en worden niet uitbetaald.</li>
    <li>Is het maandtegoed op, dan kan de Klant bijkopen of wachten tot de volgende periode. Helvaro schort de dienst niet stil zonder dat dit in het dashboard zichtbaar is.</li>
    <li>Elke creditmutatie wordt vastgelegd in een grootboek dat de Klant in zijn dashboard kan inzien.</li>
  </ul>

  <h2>5. Proefperiode</h2>
  <p>Nieuwe klanten ontvangen een gratis proefperiode van <strong>14 kalenderdagen</strong>. Na afloop gaat de Klant automatisch over naar het gekozen abonnement, tenzij vóór het einde van de proefperiode schriftelijk wordt opgezegd.</p>

  <h2>6. Contractduur en verlenging</h2>
  <p>Na de proefperiode gaat de overeenkomst in voor een initiële looptijd van <strong>3 maanden</strong>. Daarna wordt de overeenkomst maandelijks verlengd, tenzij de Klant minimaal 30 dagen voor het einde van de lopende periode schriftelijk opzegt via <a href="mailto:hello@helvaro.pro">hello@helvaro.pro</a>.</p>

  <h2>7. Betaling</h2>
  <p>Facturen worden maandelijks vooraf verstuurd en dienen binnen <strong>14 dagen</strong> na factuurdatum te worden voldaan. Betalingen verlopen via onze betaalprovider Stripe; Helvaro bewaart zelf geen kaartgegevens. Bij niet-tijdige betaling kan Helvaro de toegang tot het platform opschorten tot betaling is ontvangen.</p>

  <h2>8. AI-functionaliteit</h2>
  <p>De assistent van Helvaro schrijft antwoorden met behulp van AI-taalmodellen. Dat betekent:</p>
  <ul>
    <li>Antwoorden worden per gesprek gegenereerd en zijn niet vooraf goedgekeurd. Ze kunnen onvolledig of onjuist zijn.</li>
    <li>De Klant blijft verantwoordelijk voor de inhoud die namens zijn bedrijf wordt verstuurd, en voor het toezicht daarop. Het dashboard toont elk gesprek volledig, zodat meelezen en ingrijpen altijd mogelijk is.</li>
    <li>De assistent geeft geen juridisch, medisch of financieel advies en mag daar door de Klant ook niet voor worden ingericht.</li>
    <li>Helvaro kan het onderliggende model wijzigen wanneer dat de kwaliteit of de kosten ten goede komt.</li>
  </ul>

  <h2>9. WhatsApp</h2>
  <p>Helvaro verstuurt berichten via het WhatsApp Business Platform van Meta. Daarop gelden ook de voorwaarden en het beleid van Meta, en die staan boven wat hier is afgesproken:</p>
  <ul>
    <li>Buiten het venster van 24 uur na het laatste bericht van de lead mag alleen een door Meta goedgekeurde sjabloon worden verstuurd. Goedkeuring gebeurt per taal en ligt bij Meta, niet bij Helvaro.</li>
    <li>Een lead die STOP (of een gelijkwaardig woord) antwoordt, wordt automatisch afgemeld en ontvangt geen berichten meer.</li>
    <li>De Klant staat ervoor in dat hij de contactgegevens die hij aanlevert rechtmatig heeft verkregen en dat de ontvanger contact mag verwachten.</li>
    <li>Meta kan een afzender beperken of blokkeren bij klachten. Helvaro kan het gebruik van een gedeeld nummer opschorten wanneer het gedrag van één klant de bezorging voor andere klanten in gevaar brengt.</li>
  </ul>

  <h2>10. Google Agenda</h2>
  <p>De Klant kan zijn Google Agenda koppelen zodat de assistent afspraken kan inplannen. Die koppeling is optioneel en het platform werkt ook zonder.</p>
  <ul>
    <li>Helvaro vraagt uitsluitend toegang tot agendagegevens: het lezen van beschikbaarheid en het aanmaken en beheren van afspraken. Geen e-mail, geen bestanden, geen contacten.</li>
    <li>De toegangssleutels worden versleuteld bewaard en komen nooit in de browser van de Klant of in de dienst zelf terecht.</li>
    <li>De Klant kan de koppeling op elk moment verbreken, in Helvaro of via zijn Google-account. Daarna plant de assistent geen afspraken meer in.</li>
  </ul>

  <h2>11. Gebruik van het platform</h2>
  <p>Het is de Klant niet toegestaan om:</p>
  <ul>
    <li>Het platform door te verkopen of beschikbaar te stellen aan derden</li>
    <li>Het systeem te gebruiken voor spam, misleiding of illegale doeleinden</li>
    <li>Inloggegevens te delen met personen buiten de eigen organisatie</li>
    <li>Het platform geautomatiseerd te belasten op een manier die de dienst voor anderen verstoort</li>
  </ul>

  <h2>12. Eigendom van data en intellectuele eigendom</h2>
  <p>Alle leaddata die via het platform wordt verzameld blijft eigendom van de Klant. Helvaro verwerkt die data uitsluitend om de dienst te leveren en verkoopt ze niet. Bij beëindiging kan de Klant zijn data opvragen; zie het <a href="/privacy">privacybeleid</a> voor bewaartermijnen.</p>
  <p>Het platform zelf, de broncode, de vormgeving en de merknaam Helvaro blijven eigendom van Helvaro. De Klant krijgt een niet-exclusief gebruiksrecht voor de duur van de overeenkomst. Teksten en beelden die de Klant met het platform genereert, mag hij vrij gebruiken.</p>

  <h2>13. Opschorting en beëindiging</h2>
  <p>Helvaro kan een account opschorten bij niet-betaling, bij gebruik in strijd met artikel 11, of wanneer het beleid van Meta of een andere leverancier daartoe verplicht. Behalve bij een acuut risico waarschuwt Helvaro vooraf en krijgt de Klant de gelegenheid het probleem te verhelpen.</p>
  <p>Beide partijen kunnen de overeenkomst met onmiddellijke ingang beëindigen bij een ernstige tekortkoming die na schriftelijke ingebrekestelling niet binnen 14 dagen is hersteld.</p>

  <h2>14. Beschikbaarheid en beperkingen</h2>
  <p>Helvaro streeft naar een beschikbaarheid van minimaal 99% en kondigt gepland onderhoud zo mogelijk vooraf aan. Helvaro is afhankelijk van externe diensten &mdash; onder meer Meta (WhatsApp), Google, Stripe, Clerk, Airtable en Vercel &mdash; en is niet aansprakelijk voor onderbrekingen die daar ontstaan.</p>

  <h2>15. Aansprakelijkheid</h2>
  <p>Helvaro is niet aansprakelijk voor indirecte schade, gederfde inkomsten of het niet converteren van leads. Het resultaat hangt mede af van het aanbod en de opvolging van de Klant.</p>
  <p>De totale aansprakelijkheid van Helvaro is in alle gevallen beperkt tot het bedrag dat de Klant in de voorafgaande 3 maanden heeft betaald. Deze beperking geldt niet bij opzet of bewuste roekeloosheid.</p>

  <h2>16. Vertrouwelijkheid</h2>
  <p>Beide partijen behandelen informatie die in het kader van de samenwerking wordt uitgewisseld als vertrouwelijk en delen die niet met derden zonder schriftelijke toestemming.</p>

  <h2>17. Wijzigingen in de dienst en in deze voorwaarden</h2>
  <p>Helvaro ontwikkelt het platform door en kan functies toevoegen, wijzigen of uitfaseren. Bij een wijziging die een bestaande functie wezenlijk beperkt, wordt de Klant minimaal 30 dagen vooraf geïnformeerd.</p>
  <p>Helvaro kan deze voorwaarden wijzigen. Klanten worden minimaal 30 dagen vooraf per e-mail geïnformeerd. Voortgezet gebruik na de ingangsdatum geldt als aanvaarding; wie niet akkoord gaat, kan tegen die datum kosteloos opzeggen.</p>

  <h2>18. Toepasselijk recht</h2>
  <p>Op deze overeenkomst is het Belgisch recht van toepassing. Geschillen worden bij voorkeur in onderling overleg opgelost. Lukt dat niet, dan is de rechtbank te Antwerpen exclusief bevoegd.</p>

  <h2>19. Contact</h2>
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
  <title>Privacybeleid · Helvaro</title>
  <link rel="icon" href="/favicon.png" type="image/png">
  <style>${CSS}</style>
</head>
<body>
  <a class="back" href="/">← Terug naar Helvaro</a>
  <h1>Privacybeleid</h1>
  <p><strong>Helvaro BV</strong>. Laatst bijgewerkt: augustus 2026</p>

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

  <h2>4. Fraudepreventie bij aanmelding van een nieuwe klant</h2>
  <p>Deze sectie geldt niet voor leads, maar voor bedrijven die zelf een Helvaro-account aanmaken via onze aanmeldpagina.</p>
  <p>Om misbruik van onze gratis proefperiode tegen te gaan (bv. massaal aangemaakte proefaccounts, bots, of pogingen tot concurrentie-onderzoek), verzamelen wij bij een nieuwe aanmelding een aantal extra technische signalen:</p>
  <ul>
    <li><strong>IP-adres</strong> van het toestel waarmee wordt aangemeld, gebruikt om het aantal aanmeldingen per IP-adres te beperken en om (via een omgekeerde DNS-check, zonder externe dienst) een indicatie te krijgen of het IP-adres bij een hostingprovider hoort in plaats van bij een gewone internetverbinding.</li>
    <li><strong>Apparaat-/browser-vingerafdruk</strong>: een technische, niet-herleidbare hash op basis van browserkenmerken (bv. schermresolutie, taal, tijdzone), gebruikt om te detecteren of hetzelfde toestel kort na elkaar meerdere accounts aanmaakt.</li>
    <li><strong>Het e-mailadres, e-maildomein, bedrijfsnaam en telefoonnummer</strong> die u zelf invult, vergeleken met onze bestaande klanten om dubbele proefaccounts te herkennen.</li>
  </ul>
  <p><strong>Rechtsgrond:</strong> ons gerechtvaardigd belang (art. 6(1)(f) AVG) om misbruik, fraude en geautomatiseerde aanmeldingen te voorkomen en de kwaliteit van onze dienst te beschermen.</p>
  <p><strong>Wat er nooit gebeurt:</strong> deze controle leidt nooit automatisch tot een afwijzing. Het systeem kan een aanmelding automatisch goedkeuren of markeren voor handmatige controle — een effectieve weigering gebeurt altijd pas na menselijke beoordeling. Het ontbreken van een (vindbare) website is op zich nooit een reden om een aanmelding te markeren of te weigeren.</p>
  <p><strong>Bewaartermijn:</strong> het IP-adres en de apparaat-vingerafdruk zijn enkel nuttig op het moment van aanmelding en worden daarom <strong>automatisch verwijderd na 30 dagen</strong> door dezelfde dagelijkse opschoningstaak die ook koude leads anonimiseert (zie sectie 5 hieronder). De uitkomst van de controle (een score en de gebruikte redenen, zonder het IP-adres of de vingerafdruk zelf) bewaren wij wel langer, als interne administratie van waarom een account is goedgekeurd of gemarkeerd.</p>

  <h2>5. Hoe lang bewaren wij uw gegevens?</h2>
  <p>Uw gegevens worden bewaard zolang dit nodig is voor het doel waarvoor ze verzameld zijn, of totdat u verzoekt om verwijdering. Concreet:</p>
  <ul>
    <li><strong>Gekwalificeerde leads</strong> (waarmee een klantrelatie tot stand kwam of nog kan komen) worden bewaard zolang die klantrelatie dit vereist.</li>
    <li><strong>Niet-gekwalificeerde of koude leads</strong> waarbij 6 maanden lang geen activiteit meer was, worden automatisch geanonimiseerd: naam, telefoonnummer en de volledige gespreksinhoud worden verwijderd. Geanonimiseerde, niet tot een persoon herleidbare statistieken (bv. aantal leads, conversiecijfers) blijven wel bewaard voor rapportagedoeleinden.</li>
    <li><strong>Fraudepreventie-signalen bij aanmelding</strong> (IP-adres, apparaat-vingerafdruk — zie sectie 4 hierboven) worden na 30 dagen automatisch verwijderd.</li>
  </ul>
  <p>U kan op elk moment vroegtijdige verwijdering of anonimisering van uw gegevens aanvragen — zie sectie 8 hieronder.</p>

  <h2>6. Wie verwerkt uw gegevens?</h2>
  <p>Naast het bedrijf waarmee u rechtstreeks contact opneemt, schakelt Helvaro de volgende partijen (subverwerkers) in om de dienst te kunnen leveren:</p>
  <ul>
    <li><strong>Anthropic PBC</strong> (Verenigde Staten) — verwerkt de inhoud van uw WhatsApp-gesprek om de AI-antwoorden te genereren.</li>
    <li><strong>Meta Platforms Ireland Ltd.</strong> — verzorgt het berichtenverkeer via WhatsApp Business.</li>
    <li><strong>Vercel Inc.</strong> (Verenigde Staten) — hosting en uitvoering van deze applicatie.</li>
    <li><strong>Airtable (Formagrid Inc., Verenigde Staten)</strong> — database waarin uw lead- en gespreksgegevens worden opgeslagen.</li>
    <li><strong>Namecheap Private Email</strong> (SMTP, via hello@helvaro.pro) — verzendt notificatie-e-mails; Resend wordt gebruikt als automatische fallback wanneer die verzending niet lukt.</li>
    <li><strong>Clerk Inc.</strong> (Verenigde Staten) — verzorgt het inloggen op het dashboard. Verwerkt het e-mailadres, het wachtwoord (versleuteld) en technische aanmeldgegevens zoals IP-adres, browser en aanmeldmomenten. Betreft uitsluitend accounts van klanten; leads komen hier niet in voor.</li>
    <li><strong>Upstash Inc.</strong> (Verenigde Staten) — telt kortstondig inlogpogingen per IP-adres om misbruik tegen te gaan. Bewaart geen namen of berichten, en de tellers verlopen automatisch binnen het kwartier.</li>
  </ul>
  <p>Deze lijst komt overeen met Bijlage 3 van onze verwerkersovereenkomst. Wij houden ze actueel en werken dit beleid bij zodra ze wijzigt.</p>

  <h2>7. Internationale doorgifte</h2>
  <p>Sommige van de hierboven genoemde partijen zijn gevestigd buiten de Europese Economische Ruimte (EER), met name in de Verenigde Staten (o.a. Anthropic, Vercel, Airtable, Clerk en Upstash). Voor die doorgiften steunen wij op een geldig doorgiftemechanisme onder de AVG, zoals de Standard Contractual Clauses (SCC) van de Europese Commissie of, waar van toepassing, het EU-US Data Privacy Framework — dezelfde waarborgen die zijn vastgelegd in onze verwerkersovereenkomst met klanten.</p>

  <h2>8. Uw rechten</h2>
  <p>U heeft het recht om uw gegevens in te zien, te corrigeren, te beperken, over te dragen of te laten verwijderen, en u kan bezwaar maken tegen de verwerking. Stuur hiervoor een e-mail naar <a href="mailto:hello@helvaro.pro">hello@helvaro.pro</a>.</p>

  <h2>9. Cookies</h2>
  <p>Wij gebruiken geen tracking cookies. Onze website maakt gebruik van lokale opslag (localStorage) voor authenticatie, met een geldigheidsduur van 7 dagen.</p>

  <h2>10. Beveiliging en opslag</h2>
  <p>Uw gegevens worden beveiligd opgeslagen via Airtable en verwerkt door deze applicatie, die draait op Vercel. Alle verbindingen zijn versleuteld via HTTPS/TLS.</p>

  <h2>11. Contact</h2>
  <p>Voor vragen over dit privacybeleid: <a href="mailto:hello@helvaro.pro">hello@helvaro.pro</a>. Voor vragen specifiek over gegevensbescherming kan u terecht bij onze gegevensbeschermingscontactpersoon: <a href="mailto:sindi.s@usehelvaro.pro">sindi.s@usehelvaro.pro</a>.</p>

  <footer>
    Helvaro BV · <a href="/privacy">Privacybeleid</a> · <a href="/terms">Algemene Voorwaarden</a>
  </footer>
</body>
</html>`);
};
