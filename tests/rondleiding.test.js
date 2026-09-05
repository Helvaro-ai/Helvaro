/*
 * Faro als gids: wat hij van een scherm weet, en de rondleiding.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * Een dashboard dat zichzelf overal uitlegt wordt onleesbaar voor wie het al
 * kent. De uitleg staat daarom bij Faro: hij vertelt het aan wie het vraagt en
 * zwijgt tegen de rest.
 *
 * Dat werkt alleen als drie dingen kloppen, en dat zijn de drie die hier
 * bewaakt worden:
 *
 *  1. HIJ KENT ELK SCHERM. Een scherm dat in de navigatie staat maar niet in
 *     PAGINAS, is een scherm waarover Faro "daar weet ik niets van" zegt --
 *     terwijl de gebruiker er op dat moment naar kijkt.
 *
 *  2. DE RONDLEIDING KRIMPT. Wie alles al ingericht heeft en toch langs zeven
 *     schermen wordt gesleept, klikt hem weg -- en mist dan ook de stappen die
 *     hij wel nodig had.
 *
 *  3. ONBEKEND = WEL TONEN. Elk signaal dat ontbreekt telt als "nog niet
 *     gedaan". Een stap te veel is hinderlijk, een stap te weinig laat iemand
 *     vastlopen. Die asymmetrie is een keuze en hoort niet stil om te draaien.
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
const scherm = require('../api/_faro/scherm');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

console.log('\n  Faro kent elk scherm dat in de navigatie staat');
{
  const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
  const nav = [...new Set([...dash.matchAll(/data-page="([a-z0-9-]+)"/g)].map((m) => m[1]))];
  const gedekt = Object.keys(scherm.PAGINAS);
  const gaten = nav.filter((p) => gedekt.indexOf(p) === -1);
  ck('geen enkel navigatie-item ontbreekt', gaten.length === 0, gaten);
  ck('er zijn schermen gedefinieerd', gedekt.length >= 14, gedekt.length);
}

console.log('\n  elk scherm beantwoordt de drie vragen');
{
  const missend = [];
  for (const [k, v] of Object.entries(scherm.PAGINAS)) {
    if (!v.naam || !v.wat) missend.push(k + ':basis');
    if (!v.acties) missend.push(k + ':acties');
    if (!v.waarom) missend.push(k + ':waarom');
  }
  ck('elk scherm heeft naam, wat, acties en waarom', missend.length === 0, missend);

  /* `waarom` is het veld dat een rondleiding van een opsomming onderscheidt.
     Een waarom van vijf woorden is een label, geen reden. */
  const kort = Object.entries(scherm.PAGINAS).filter(([, v]) => (v.waarom || '').length < 60).map(([k]) => k);
  ck('elk waarom zegt echt iets (>= 60 tekens)', kort.length === 0, kort);
}

console.log('\n  de rondleiding krimpt naarmate je verder bent');
{
  const nieuw = scherm.tour({});
  const klaar = scherm.tour({ aiIngesteld: true, heeftAanbod: true, agendaGekoppeld: true, creditsLaag: false });
  const tel = (t) => (t.match(/^\d+\. /gm) || []).length;
  ck('een nieuwe klant krijgt meerdere stappen', tel(nieuw) >= 5, tel(nieuw));
  ck('een ingerichte klant krijgt er minder', tel(klaar) < tel(nieuw), { nieuw: tel(nieuw), klaar: tel(klaar) });
  ck('maar nooit nul', tel(klaar) >= 1, tel(klaar));

  /* Onbekend telt als niet-gedaan. Dit is de asymmetrie uit de kop. */
  ck('een leeg signaal geeft de LANGE rondleiding', tel(scherm.tour({})) === tel(scherm.tour({ aiIngesteld: false })));
  ck('een onzin-signaal ook', tel(scherm.tour({ aiIngesteld: 'ja' })) === tel(nieuw));
}

console.log('\n  de korte variant hoort bij elke beurt te kunnen');
{
  const kort = scherm.tour({}, { kort: true });
  ck('is er', !!kort);
  ck('en is echt kort', kort.split('\n').length <= 2 && kort.length < 400, { regels: kort.split('\n').length, tekens: kort.length });
  ck('noemt de schermen in volgorde', /->/.test(kort), kort.slice(0, 80));
  /* De volledige tekst is er voor een expliciete ingang; die mag lang zijn. */
  ck('de volledige variant is wel uitgebreid', scherm.tour({}).length > 800);
}

console.log('\n  een dealer hoort geen panden');
{
  const dealer = scherm.tour({ vertical: 'dealership' }, { kort: true });
  const makelaar = scherm.tour({}, { kort: true });
  ck('dealer ziet Voertuigen', /Voertuigen/.test(dealer), dealer.slice(-90));
  ck('en geen Panden', !/Panden/.test(dealer), dealer.slice(-90));
  ck('makelaar ziet nog steeds Panden', /Panden/.test(makelaar));

  const ui = scherm.sanitize({ pagina: 'panden', vertical: 'dealership' });
  const blok = scherm.render(ui);
  ck('het schermblok noemt Voertuigen', /Scherm: Voertuigen/.test(blok), blok.split('\n')[1]);
  ck('en de uitleg gaat over autos', /voertuig|auto|kilometerstand/i.test(blok));
  ck('een makelaar krijgt daar nog Panden', /Scherm: Panden/.test(scherm.render(scherm.sanitize({ pagina: 'panden' }))));
}

console.log('\n  de context blijft afgeschermd');
{
  /* De ui-context komt uit de BROWSER en is dus door de gebruiker te
     vervalsen. sanitize() is de grens; alles wat er niet expliciet door mag,
     hoort te verdwijnen. */
  const vuil = scherm.sanitize({
    pagina: 'founder', vertical: 'dealership', aiIngesteld: true,
    onzin: 'x', script: '<script>', apiKey: 'geheim',
  });
  ck('een back-officepagina komt er niet door', vuil.pagina === undefined, vuil.pagina);
  ck('onbekende sleutels verdwijnen', vuil.onzin === undefined && vuil.apiKey === undefined, Object.keys(vuil));
  ck('bekende sleutels blijven', vuil.vertical === 'dealership' && vuil.aiIngesteld === true, vuil);

  ck('een onbekende vertical wordt genegeerd',
    scherm.sanitize({ vertical: 'garage' }).vertical === undefined);
  ck('een niet-boolean signaal wordt genegeerd',
    scherm.sanitize({ heeftAanbod: 'ja' }).heeftAanbod === undefined);
}

console.log('\n  het scherm zegt wat je hier kunt en waarom');
{
  const blok = scherm.render(scherm.sanitize({ pagina: 'formulier' }));
  ck('acties staan erin', /Wat hier kan:/.test(blok));
  ck('waarom staat erin', /Waarom dit scherm bestaat:/.test(blok));
  /* Bij een LEEG scherm is de eerste stap het enige nuttige antwoord: er is
     geen data om naar te kijken. */
  const leeg = scherm.render(scherm.sanitize({ pagina: 'panden', toestand: 'leeg' }));
  ck('een leeg scherm noemt de eerste stap', /het meeste oplevert:/.test(leeg), leeg.slice(-200));
  ck('een gevuld scherm doet dat niet', !/het meeste oplevert:/.test(blok));
}

console.log('\n  de client stuurt de signalen die dit voedt');
{
  const cl = fs.readFileSync(BASE + 'api/_faro/ui/client.js', 'utf8');
  for (const sig of ['vertical', 'aiIngesteld', 'heeftAanbod', 'creditsLaag']) {
    ck('client zet ctx.' + sig, new RegExp('ctx\\.' + sig + '\\s*=').test(cl));
  }
  /* Ik schreef dit eerst tegen state.credits, en dat bestaat niet -- het
     signaal was veilig maar zou nooit zijn afgegaan. De echte bron is
     _creditUsage.percentUsed. */
  /* Opmerkingen eruit: de vorige versie viel over de opmerking die UITLEGT dat
     state.credits niet bestaat. Een test die zijn eigen proza leest, bewaakt
     niets -- dezelfde val als eerder in dit project. */
  const clCode = cl.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ck('credits komen uit _creditUsage, niet uit een verzonnen state.credits',
    /_creditUsage[\s\S]{0,120}percentUsed/.test(clCode) && !/state\.credits/.test(clCode));

  const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
  ck('pandState houdt bij of hij geladen is', /geladen:\s*false/.test(dash) && /pandState\.geladen\s*=\s*true/.test(dash));
}

console.log('\n  de lege pipeline zegt EEN ding, niet vijf keer niets');
{
  /* Er stond per kolom "Geen leads". Met nul leads las dat als vijf keer
     hetzelfde naast elkaar -- een muur van niets, op precies het scherm dat
     een nieuwe klant opent om te zien of het werkt. Vijf lege kolommen
     vertellen bovendien niets wat de kolomkoppen niet al zeggen.

     De grens is belangrijk: zodra er ergens EEN lead staat zijn de kolommen
     wel zinvol, want dan betekent een lege kolom iets ("niets in de
     afspraakfase"). Dan hoort die melding per kolom te blijven. */
  const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
  const i = dash.indexOf('function renderPipeline');
  const blok = dash.slice(i, i + 3000);
  ck('er is een tak voor een volledig lege pipeline', /if \(!leads\.length\)/.test(blok));
  ck('en hij komt VOOR de kolommen', blok.indexOf('if (!leads.length)') < blok.indexOf('board.innerHTML = cols.map'));
  ck('met een vertaalde tekst, niet hardgecodeerd', /tr\('pipe\.leeg\.titel'\)/.test(blok));
  ck('de per-kolom melding blijft bestaan voor als er WEL leads zijn',
    /Geen leads/.test(blok));

  const i18n = require('../api/_i18n');
  let ontbreekt = [];
  for (const k of ['pipe.leeg.titel', 'pipe.leeg.tekst']) {
    for (const t of ['nl', 'fr', 'en', 'de']) {
      const v = i18n.t(t, k);
      if (!v || v === k) ontbreekt.push(k + '/' + t);
    }
  }
  ck('in vier talen', ontbreekt.length === 0, ontbreekt);
  ck('en echt vertaald, niet gekopieerd',
    i18n.t('fr', 'pipe.leeg.titel') !== i18n.t('nl', 'pipe.leeg.titel'));
}

console.log('\n  de zijbalk groepeert op wat iemand zoekt');
{
  const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
  const i = dash.indexOf('nav.group.work');
  const nav = dash.slice(i - 300, dash.indexOf('</nav>', i));
  const groepen = {};
  let huidig = null;
  const re = /(nav-group-label[^>]*>\$\{T\('([a-z.]+)'\)\}|data-page="([a-z0-9-]+)")/g;
  let m;
  while ((m = re.exec(nav)) !== null) {
    if (m[2]) { huidig = m[2].split('.').pop(); groepen[huidig] = []; }
    else if (huidig) groepen[huidig].push(m[3]);
  }

  ck('er zijn vier groepen', Object.keys(groepen).length === 4, Object.keys(groepen));

  /* AI-beeld stond onder INZICHT. Het MAAKT beelden; het vertelt je niets over
     wat er gebeurd is. Wie zocht naar "waar zie ik hoe het gaat" kwam een
     generator tegen, en wie een beeld wilde maken zocht hem niet onder inzicht. */
  ck('ai-beeld staat niet meer bij inzicht', (groepen.insight || []).indexOf('ai-beeld') === -1, groepen.insight);
  ck('maar bij inrichten', (groepen.setup || []).indexOf('ai-beeld') !== -1, groepen.setup);

  /* Facturatie gaat over je ACCOUNT, niet over hoe het product zich gedraagt.
     Dat verschil is precies wat iemand zoekt die zijn factuur wil. */
  ck('facturatie heeft een eigen groep', (groepen.account || []).indexOf('facturatie') !== -1, groepen.account);
  ck('en instellingen niet', (groepen.account || []).indexOf('instellingen') === -1, groepen.account);
  ck('instellingen hoort bij inrichten', (groepen.setup || []).indexOf('instellingen') !== -1, groepen.setup);

  ck('het dagelijkse werk blijft bij elkaar',
    ['dashboard', 'pipeline', 'gesprekken', 'panden', 'kalender'].every((x) => (groepen.work || []).indexOf(x) !== -1),
    groepen.work);
  ck('geen enkel item is verdwenen',
    Object.values(groepen).flat().length === 14, Object.values(groepen).flat().length);

  const i18n = require('../api/_i18n');
  for (const k of ['nav.group.setup', 'nav.group.account']) {
    ck(k + ' in vier talen',
      ['nl', 'fr', 'en', 'de'].every((t) => i18n.t(t, k) && i18n.t(t, k) !== k));
    ck(k + ' is echt vertaald',
      i18n.t('fr', k) !== i18n.t('nl', k), { nl: i18n.t('nl', k), fr: i18n.t('fr', k) });
  }
}

console.log('\n  de onboarding zegt tegen een dealer iets anders');
{
  const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
  /* Een dealer die te horen krijgt "deel deze link onder je advertenties" doet
     daar niets mee: zijn leads komen van AutoScout24, waar de link al bestaat.
     En hij hoeft niet op een goedgekeurd sjabloon te wachten, want de KOPER
     begint het gesprek -- dan is het 24-uursvenster open. */
  ck('de slotstap kijkt naar de vertical', /var dealer = \(typeof isDealer/.test(dash));
  ck('en heeft een eigen tekst', /tr\('wiz\.klaar\.dealer'\)/.test(dash));
  ck('de koppelingenstap ook', /tr\('wiz\.wa\.dealer'\)/.test(dash));
  ck('en slaat de sjabloon-controle over voor een dealer',
    /isDealer\(\)\) \{[\s\S]{0,400}wiz\.wa\.dealer[\s\S]{0,300}\} else \{[\s\S]{0,80}wizardWhatsAppStatus/.test(dash));

  const i18n = require('../api/_i18n');
  for (const k of ['wiz.klaar.dealer', 'wiz.wa.dealer', 'wiz.wa.dealer.badge']) {
    ck(k + ' in vier talen',
      ['nl', 'fr', 'en', 'de'].every((t) => i18n.t(t, k) && i18n.t(t, k) !== k));
    /* Bestaan is niet genoeg. Een sleutel waar in alle vier de talen dezelfde
       Nederlandse zin staat, komt door een bestaanscontrole heen en laat een
       Waalse dealer alsnog Nederlands lezen -- en dat is precies het soort
       'vertaald' dat niemand opmerkt tot een klant het meldt. */
    ck(k + ' is echt vertaald, niet gekopieerd',
      i18n.t('fr', k) !== i18n.t('nl', k) && i18n.t('de', k) !== i18n.t('nl', k),
      { nl: i18n.t('nl', k).slice(0, 40), fr: i18n.t('fr', k).slice(0, 40) });
  }
  /* De makelaarstekst mag NIET verdwenen zijn -- dit is een tak erbij, geen
     vervanging. */
  ck('de makelaarstekst bestaat nog', i18n.t('nl', 'wiz.klaar.gcal').length > 10);
  ck('en wizardWhatsAppStatus wordt nog aangeroepen', /wizardWhatsAppStatus\(\);/.test(dash));
}

console.log('\n  je kunt later van markt wisselen, en dat verwijdert niets');
{
  const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
  ck('er is een keuzelijst in Instellingen', /id="set-markt"/.test(dash));
  ck('met drie keuzes', ['real_estate', 'dealership', 'other'].every((v) => dash.indexOf('value="' + v + '"') !== -1));

  /* Bovenaan, en dat is geen willekeurige plek: deze ene keuze bepaalt welke
     schermen je verderop ziet. Onderaan zou iemand eerst tien instellingen
     doorlopen die misschien niet voor hem gelden. */
  const p1 = dash.indexOf('id="page-instellingen"');
  ck('de marktsectie staat bovenaan Instellingen',
    dash.indexOf('id="set-markt"', p1) - p1 < 2500, dash.indexOf('id="set-markt"', p1) - p1);

  const fnRuw = dash.slice(dash.indexOf('async function marktWisselen'), dash.indexOf('function marktSubtekst'));
  /* Opmerkingen eruit voordat er op AFSTAND gematcht wordt. Een regex als
     catch[\s\S]{0,200}kiezer.value valt anders om zodra er een uitleg tussen
     komt te staan -- en dan wordt de afstand opgerekt in plaats van de code
     bekeken. Dit is de derde keer dat die val toeslaat in dit project. */
  const fn = fnRuw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ck('marktWisselen bestaat', fn.length > 100);

  /* Sector EN vertical samen wegschrijven is de enige manier waarop ze niet
     uit elkaar lopen -- en uit elkaar lopen betekent hier: een dealer die over
     panden leest. */
  ck('schrijft sector en vertical samen weg', /sector: gekozen, vertical: nieuweVertical/.test(fn));
  ck('past de schermen meteen aan', /zetVertical\(nieuweVertical/.test(fn));
  ck('en maakt de caches leeg', /tabVergeet/.test(fn));

  /* Een keuzelijst die op de nieuwe waarde blijft staan terwijl er niets is
     opgeslagen, is erger dan een foutmelding: de klant denkt dat het gelukt is. */
  /* Stond eerst als `kiezer.value = (vorige === 'dealership') ? ... : ...`.
     Met vijf markten is dat een opzoeking geworden in dezelfde lijst die de
     wizard toont; de EIS blijft dat de keuzelijst terugspringt naar wat er
     WAS, en niet blijft staan op wat niet is opgeslagen. */
  ck('bij een fout wordt de keuzelijst teruggezet',
    /catch[\s\S]{0,260}kiezer\.value = hvSectorBijVertical\(vorige\)/.test(fn));
  ck('en de lijst wordt weer aanklikbaar', /finally[\s\S]{0,120}disabled = false/.test(fn));

  /* Niets verwijderen is wat deze knop veilig maakt. Een verwijder-aanroep
     hier zou betekenen dat wisselen data kost. */
  ck('er wordt niets verwijderd', !/archive|delete|verwijder/i.test(fn), fn.slice(0, 200));

  const i18n = require('../api/_i18n');
  ck('de uitleg zegt dat er niets verdwijnt', /verwijdert niets/.test(i18n.t('nl', 'set.markt.uitleg')));
  for (const k of ['set.markt', 'set.markt.uitleg', 'set.markt.dealership', 'set.markt.gewisseld']) {
    ck(k + ' in vier talen', ['nl', 'fr', 'en', 'de'].every((t) => i18n.t(t, k) && i18n.t(t, k) !== k));
    ck(k + ' is echt vertaald', i18n.t('fr', k) !== i18n.t('nl', k));
  }
}

console.log('\n  van scherm wisselen is geen harde knip meer');
{
  const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
  /* Van scherm wisselen was display:none naar display:block -- de hele inhoud
     wordt in EEN frame vervangen. Er is dan geen enkel signaal dat er iets
     nieuws is gekomen; het oog ziet alleen dat alles anders is. */
  ck('er is een binnenkomst-animatie', /@keyframes paginaBinnen/.test(dash));
  ck('en die hangt aan het actieve scherm', /\.page\.active \{ animation: paginaBinnen/.test(dash));

  /* display laat zich niet animeren; daarom een keyframe en geen transition.
     Als iemand dit ooit naar een transition verbouwt, doet het niets meer. */
  const blok2 = dash.slice(dash.indexOf('@keyframes paginaBinnen'), dash.indexOf('@keyframes paginaBinnen') + 900);
  ck('hij gebruikt opacity en translate, niet display', /opacity/.test(blok2) && /translateY/.test(blok2));

  /* Omhoog en niet opzij: zijwaarts suggereert een richting (vooruit, terug) en
     die is er niet -- de zijbalk is geen volgorde. */
  ck('de beweging gaat omhoog, niet opzij', !/translateX/.test(blok2), blok2.slice(0, 160));

  /* Wie beweging heeft uitgezet krijgt het scherm meteen. Een halve animatie of
     een vertraging is daar juist verkeerd. */
  ck('reduced-motion zet hem uit',
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,300}\.page\.active \{ animation: none/.test(dash));

  /* Kort genoeg om niet in de weg te zitten. Dit is gereedschap waar iemand de
     hele dag doorheen klikt; een overgang die je OPMERKT wordt vertraging. */
  const duur = /animation: paginaBinnen var\(--dur-base, (\d+)ms\)/.exec(dash);
  ck('en hij duurt hoogstens 250ms', duur && Number(duur[1]) <= 250, duur && duur[1]);
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
