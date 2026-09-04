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

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
