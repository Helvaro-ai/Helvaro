const _errors = require('./_errors');   // gedeelde foutentaxonomie, buitenste vangnet
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

module.exports = _errors.vangAf(function handler(req, res) {
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
  /* Engels op ?lang=en of als de browser Engels vraagt. Niet uit ijdelheid:
     Meta's App Review leest dit beleid en de instructies voor gegevens-
     verwijdering (data_deletion_url wijst naar /privacy#data-deletion) en
     doet dat in het Engels. Een Nederlandse pagina is toegestaan maar een
     reviewer die niets herkent, vraagt om "more information" -- een week
     kwijt. De Nederlandse tekst blijft de bron; hieronder staat de vertaling. */
  const q = (req.url || '').split('?')[1] || '';
  const wilEn = /(^|&)lang=en(&|$)/.test(q)
    || (!/(^|&)lang=/.test(q) && /^en\b/i.test(String(req.headers && req.headers['accept-language'] || '')));
  if (wilEn) return res.status(200).send(privacyEn());

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
  <p><strong>Helvaro BV</strong>. Laatst bijgewerkt: september 2026 · <a href="/privacy?lang=en">Read in English</a></p>

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
    <li><strong>Namecheap Private Email</strong> (SMTP, via hello@helvaro.pro) — verzendt notificatie-, verificatie- en wachtwoordherstelmails.</li>
    <li><strong>Stripe Payments Europe, Ltd.</strong> (Ierland, met verwerking in de Verenigde Staten) — verwerkt abonnementen en betalingen van klanten. Betreft uitsluitend accounts van klanten; leads komen hier niet in voor.</li>
    <li><strong>Google Ireland Ltd.</strong> — agenda-koppeling: wanneer een klant zijn Google Agenda koppelt, worden afspraken die uit uw gesprek volgen daarin aangemaakt (uw naam en het tijdstip van de afspraak).</li>
    <li><strong>OneSignal, Inc.</strong> (Verenigde Staten) — verstuurt meldingen naar het toestel van de klant over binnenkomende leads. Verwerkt geen berichtinhoud.</li>
    <li><strong>Clerk Inc.</strong> (Verenigde Staten) — verzorgt het inloggen op het dashboard. Verwerkt het e-mailadres, het wachtwoord (versleuteld) en technische aanmeldgegevens zoals IP-adres, browser en aanmeldmomenten. Betreft uitsluitend accounts van klanten; leads komen hier niet in voor.</li>
    <li><strong>Upstash Inc.</strong> (Verenigde Staten) — telt kortstondig inlogpogingen per IP-adres om misbruik tegen te gaan. Bewaart geen namen of berichten, en de tellers verlopen automatisch binnen het kwartier.</li>
  </ul>
  <p>Deze lijst komt overeen met Bijlage 3 van onze verwerkersovereenkomst. Wij houden ze actueel en werken dit beleid bij zodra ze wijzigt.</p>

  <h2>7. Internationale doorgifte</h2>
  <p>Sommige van de hierboven genoemde partijen zijn gevestigd buiten de Europese Economische Ruimte (EER), met name in de Verenigde Staten (o.a. Anthropic, Vercel, Airtable, Clerk en Upstash). Voor die doorgiften steunen wij op een geldig doorgiftemechanisme onder de AVG, zoals de Standard Contractual Clauses (SCC) van de Europese Commissie of, waar van toepassing, het EU-US Data Privacy Framework — dezelfde waarborgen die zijn vastgelegd in onze verwerkersovereenkomst met klanten.</p>

  <h2>8. Uw rechten</h2>
  <p>U heeft het recht om uw gegevens in te zien, te corrigeren, te beperken, over te dragen of te laten verwijderen, en u kan bezwaar maken tegen de verwerking. Stuur hiervoor een e-mail naar <a href="mailto:hello@helvaro.pro">hello@helvaro.pro</a>.</p>

  <h2 id="data-deletion">8b. Gegevens laten verwijderen</h2>
  <p>U hoeft geen account te hebben om verwijdering te vragen. Zo werkt het:</p>
  <ul>
    <li><strong>Als lead (u stuurde een WhatsApp-bericht naar een bedrijf dat Helvaro gebruikt):</strong> stuur in datzelfde WhatsApp-gesprek het woord <strong>STOP</strong>. U krijgt dan geen berichten meer. Wilt u ook uw naam, telefoonnummer en de gespreksinhoud verwijderd hebben, mail dan naar <a href="mailto:hello@helvaro.pro?subject=Verwijdering%20van%20mijn%20gegevens">hello@helvaro.pro</a> met het telefoonnummer waarmee u contact opnam. Wij verwijderen of anonimiseren uw gegevens binnen 30 dagen en bevestigen dat per e-mail.</li>
    <li><strong>Als klant (u heeft een Helvaro-account):</strong> ga in het dashboard naar <em>Instellingen → Account verwijderen</em>. Dat verwijdert onmiddellijk uw account, uw leads, gesprekken en afspraken. U kan hetzelfde ook aanvragen via <a href="mailto:hello@helvaro.pro?subject=Account%20wissen">hello@helvaro.pro</a>.</li>
    <li><strong>Via Facebook/Meta:</strong> heeft u Helvaro toestemming gegeven via een Meta-inlog- of koppelingsscherm, dan kan u die toestemming intrekken in uw Facebook-instellingen onder <em>Apps en websites</em>. Meta stuurt ons dan een verwijderingsverzoek dat wij op dezelfde manier afhandelen.</li>
  </ul>
  <p>Gegevens die wij wettelijk moeten bewaren (bv. facturen) blijven zolang de wet dat vereist; al het andere wordt verwijderd.</p>

  <h2>9. Cookies</h2>
  <p>Wij gebruiken geen tracking cookies. Onze website maakt gebruik van lokale opslag (localStorage) voor authenticatie, met een geldigheidsduur van 7 dagen.</p>

  <h2>10. Beveiliging en opslag</h2>
  <p>Uw gegevens worden beveiligd opgeslagen via Airtable en verwerkt door deze applicatie, die draait op Vercel. Alle verbindingen zijn versleuteld via HTTPS/TLS.</p>

  <h2>11. Contact</h2>
  <p>Voor vragen over dit privacybeleid: <a href="mailto:hello@helvaro.pro">hello@helvaro.pro</a>. Voor vragen specifiek over gegevensbescherming kan u terecht bij onze gegevensbeschermingscontactpersoon: <a href="mailto:sindi@helvaro.pro">sindi@helvaro.pro</a>.</p>

  <footer>
    Helvaro BV · <a href="/privacy">Privacybeleid</a> · <a href="/terms">Algemene Voorwaarden</a>
  </footer>
</body>
</html>`);
});

/* ── English privacy policy ───────────────────────────────────────────────────
   A translation of the Dutch text above, section for section. Change the
   Dutch one first, then this one; the Dutch version is the legal source. */
function privacyEn() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy · Helvaro</title>
  <link rel="icon" href="/favicon.png" type="image/png">
  <style>${CSS}</style>
</head>
<body>
  <a class="back" href="/">← Back to Helvaro</a>
  <h1>Privacy Policy</h1>
  <p><strong>Helvaro BV</strong>. Last updated: September 2026 · <a href="/privacy?lang=nl">Lees in het Nederlands</a></p>

  <h2>1. Who we are</h2>
  <p>Helvaro BV is a B2B SaaS platform that helps businesses qualify incoming leads automatically over WhatsApp. Contact us at <a href="mailto:hello@helvaro.pro">hello@helvaro.pro</a>.</p>

  <h2>2. What data we collect</h2>
  <ul>
    <li>Name and phone number (through a contact form or through WhatsApp)</li>
    <li>The WhatsApp messages you exchange with our AI assistant, including the full conversation history</li>
    <li>An AI-generated qualification score and summary of the conversation</li>
    <li>Your IP address is used briefly to prevent abuse (for example too many requests in a short time) but is not stored in our database</li>
  </ul>
  <p>We do not collect an e-mail address from you as a lead by default. Should that change (for example for a new feature), we will update this policy before we do so.</p>

  <h2>3. What we use your data for</h2>
  <p>Your data is used to contact you, to answer your question through our AI assistant on WhatsApp, and to determine whether there is a match with the services of the business you contacted. We never sell your data to third parties.</p>

  <h2>4. Fraud prevention when a new customer signs up</h2>
  <p>This section does not apply to leads but to businesses that create a Helvaro account through our sign-up page.</p>
  <p>To prevent abuse of our free trial (mass-created trial accounts, bots, competitor probing) we collect a few additional technical signals at sign-up:</p>
  <ul>
    <li><strong>IP address</strong> of the device used to sign up, to limit the number of sign-ups per IP address and to get an indication (via a reverse DNS check, without any external service) whether the address belongs to a hosting provider rather than an ordinary internet connection.</li>
    <li><strong>Device/browser fingerprint</strong>: a technical, non-identifying hash based on browser characteristics (screen resolution, language, time zone) used to detect the same device creating several accounts in quick succession.</li>
    <li><strong>The e-mail address, e-mail domain, company name and phone number</strong> you enter yourself, compared with our existing customers to recognise duplicate trial accounts.</li>
  </ul>
  <p><strong>Legal basis:</strong> our legitimate interest (Art. 6(1)(f) GDPR) in preventing abuse, fraud and automated sign-ups and in protecting the quality of our service.</p>
  <p><strong>What never happens:</strong> this check never leads to an automatic rejection. The system can approve a sign-up automatically or flag it for manual review — an actual refusal only ever follows human assessment. Not having a (findable) website is never by itself a reason to flag or refuse a sign-up.</p>
  <p><strong>Retention:</strong> the IP address and device fingerprint are only useful at the moment of sign-up and are therefore <strong>deleted automatically after 30 days</strong> by the same daily clean-up job that anonymises cold leads (see section 5). The outcome of the check (a score and the reasons used, without the IP address or fingerprint) is kept longer as an internal record of why an account was approved or flagged.</p>

  <h2>5. How long we keep your data</h2>
  <p>Your data is kept for as long as necessary for the purpose it was collected for, or until you ask for deletion. Concretely:</p>
  <ul>
    <li><strong>Qualified leads</strong> (where a customer relationship was or may still be established) are kept for as long as that relationship requires.</li>
    <li><strong>Unqualified or cold leads</strong> with no activity for 6 months are anonymised automatically: name, phone number and the full conversation content are deleted. Anonymised statistics that cannot be traced to a person (number of leads, conversion rates) are kept for reporting.</li>
    <li><strong>Sign-up fraud-prevention signals</strong> (IP address, device fingerprint — see section 4) are deleted automatically after 30 days.</li>
  </ul>
  <p>You can request earlier deletion or anonymisation of your data at any time — see sections 8 and 8b.</p>

  <h2>6. Who processes your data</h2>
  <p>Besides the business you contact directly, Helvaro relies on the following parties (sub-processors) to deliver the service:</p>
  <ul>
    <li><strong>Anthropic PBC</strong> (United States) — processes the content of your WhatsApp conversation to generate the AI replies.</li>
    <li><strong>Meta Platforms Ireland Ltd.</strong> — carries the message traffic through WhatsApp Business.</li>
    <li><strong>Vercel Inc.</strong> (United States) — hosting and execution of this application.</li>
    <li><strong>Airtable (Formagrid Inc., United States)</strong> — the database in which your lead and conversation data is stored.</li>
    <li><strong>Namecheap Private Email</strong> (SMTP, via hello@helvaro.pro) — sends notification, verification and password-reset e-mails.</li>
    <li><strong>Stripe Payments Europe, Ltd.</strong> (Ireland, with processing in the United States) — processes customer subscriptions and payments. Customer accounts only; leads never appear here.</li>
    <li><strong>Google Ireland Ltd.</strong> — calendar integration: when a customer connects Google Calendar, appointments that follow from your conversation are created there (your name and the time of the appointment).</li>
    <li><strong>OneSignal, Inc.</strong> (United States) — sends push notifications to the customer's device about incoming leads. Processes no message content.</li>
    <li><strong>Clerk Inc.</strong> (United States) — handles sign-in to the dashboard. Processes the e-mail address, the (hashed) password and technical sign-in data such as IP address, browser and sign-in times. Customer accounts only; leads never appear here.</li>
    <li><strong>Upstash Inc.</strong> (United States) — briefly counts sign-in attempts per IP address to prevent abuse. Stores no names or messages; counters expire within fifteen minutes.</li>
  </ul>
  <p>This list matches Annex 3 of our data processing agreement. We keep it current and update this policy whenever it changes.</p>

  <h2>7. International transfers</h2>
  <p>Some of the parties above are established outside the European Economic Area (EEA), notably in the United States (Anthropic, Vercel, Airtable, Clerk and Upstash among others). For those transfers we rely on a valid transfer mechanism under the GDPR, such as the European Commission's Standard Contractual Clauses (SCCs) or, where applicable, the EU-US Data Privacy Framework — the same safeguards laid down in our data processing agreement with customers.</p>

  <h2>8. Your rights</h2>
  <p>You have the right to access, rectify, restrict, port or erase your data, and to object to processing. E-mail <a href="mailto:hello@helvaro.pro">hello@helvaro.pro</a> to exercise any of these rights.</p>

  <h2 id="data-deletion">8b. How to have your data deleted</h2>
  <p>You do not need an account to request deletion. This is how it works:</p>
  <ul>
    <li><strong>As a lead (you sent a WhatsApp message to a business that uses Helvaro):</strong> send the word <strong>STOP</strong> in that same WhatsApp conversation. You will receive no further messages. If you also want your name, phone number and the conversation content deleted, e-mail <a href="mailto:hello@helvaro.pro?subject=Delete%20my%20data">hello@helvaro.pro</a> from any address and mention the phone number you used. We delete or anonymise your data within 30 days and confirm by e-mail.</li>
    <li><strong>As a customer (you have a Helvaro account):</strong> in the dashboard go to <em>Settings → Delete account</em>. This immediately deletes your account, your leads, conversations and appointments. You can also request the same via <a href="mailto:hello@helvaro.pro?subject=Delete%20my%20account">hello@helvaro.pro</a>.</li>
    <li><strong>Through Facebook/Meta:</strong> if you granted Helvaro access through a Meta login or connection screen, you can revoke that access in your Facebook settings under <em>Apps and Websites</em>. Meta then sends us a deletion request, which we handle in the same way.</li>
  </ul>
  <p>Data we are legally required to keep (for example invoices) is retained for as long as the law requires; everything else is deleted.</p>

  <h2>9. Cookies</h2>
  <p>We use no tracking cookies. Our website uses local storage (localStorage) for authentication, valid for 7 days.</p>

  <h2>10. Security and storage</h2>
  <p>Your data is stored securely in Airtable and processed by this application, which runs on Vercel. All connections are encrypted with HTTPS/TLS.</p>

  <h2>11. Contact</h2>
  <p>Questions about this privacy policy: <a href="mailto:hello@helvaro.pro">hello@helvaro.pro</a>. For questions specifically about data protection, contact our data protection contact: <a href="mailto:sindi@helvaro.pro">sindi@helvaro.pro</a>.</p>

  <footer>
    Helvaro BV · <a href="/privacy?lang=en">Privacy Policy</a> · <a href="/terms">Terms of Service</a>
  </footer>
</body>
</html>`;
}
