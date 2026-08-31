/*
 * Wat de UI-audit op de live app vond, en wat er nu tegen staat.
 *
 * Elk blok hieronder hoort bij een bevinding die op app.helvaro.pro is
 * gemeten, niet bedacht. De reden staat erbij, want een kale assertie op
 * "min-width:0" is over een half jaar niet te plaatsen.
 */
'use strict';

process.env.FARO_WORKSPACE_ENABLED = '1';

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 260));
  ok ? pass++ : fail++;
};

/* CSS-commentaar eruit voordat er iets beweerd wordt.

   Dit ging hier echt mis: de uitleg boven de regel bevat zelf de woorden
   "min-width:0" en "visibility:hidden". Een test die op die tekst zoekt blijft
   dus groen als je de REGEL weghaalt en het commentaar laat staan -- precies de
   fout die je wilt vangen. Gemerkt door de regel te verwijderen en te zien dat
   de test niets zei. */
const kaal = (css) => String(css).replace(/\/\*[\s\S]*?\*\//g, '');

delete require.cache[require.resolve('../api/dashboard.js')];
const dash = require('../api/dashboard.js');
let html = '';
dash({ method: 'GET', url: '/dashboard', headers: {} },
     { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
const js = (html.match(/<script>([\s\S]*?)<\/script>/g) || [])
  .map((x) => x.replace(/<\/?script>/g, '')).sort((a, b) => b.length - a.length)[0] || '';

console.log('\n— de Pipeline liep 205px buiten beeld —');
{
  /* Gemeten op 1440px: .main-content was 1420 breed op left:220 (dus tot 1640),
     terwijl elke andere pagina 1215-1220 was. body{overflow-x:hidden} verborg
     dat, dus de laatste kanbankolom en de knoppen rechts in de kopbalk waren
     niet te bereiken -- ook niet met scrollen. Oorzaak: een flex-kind heeft
     min-width:auto en kan niet kleiner dan zijn inhoud. */
  /* Aan het begin van een REGEL verankeren. Zonder ^ matcht ".main-content {"
     ook de staart van "body.sidebar-collapsed .main-content {", en dan meet je
     een heel andere regel dan je denkt. */
  const main = (html.match(/^\.main-content \{[\s\S]*?^\}/m) || [''])[0];
  const page = (html.match(/^\.page-content \{[\s\S]*?^\}/m) || [''])[0];
  ck('het juiste .main-content-blok is gevonden', /margin-left:\s*220px/.test(main), main.slice(0, 120));
  ck('.main-content mag krimpen',  /min-width:\s*0/.test(kaal(main)), main.slice(0, 120));
  ck('.page-content mag krimpen',  /min-width:\s*0/.test(kaal(page)), page.slice(0, 120));
  const bord = (html.match(/^\.pipeline-board \{[\s\S]*?^\}/m) || [''])[0];
  ck('en het bord schuift zelf',   /overflow-x:\s*auto/.test(kaal(bord)), bord.slice(0, 160));
}

console.log('\n— het registratieformulier stond half in het Engels —');
{
  /* CLERK_NL is geen handgeschreven blok meer maar JSON die de server per taal
     opbouwt uit api/_i18n.js. Dat is ook een betere test: we controleren nu wat
     er ECHT in de pagina staat, niet hoe het in de bron geschreven is. */
  const blokMatch = js.match(/var CLERK_NL = (\{[\s\S]*?\});/);
  ck('CLERK_NL gevonden', !!blokMatch, null);
  let clerk = {};
  try { clerk = JSON.parse(blokMatch[1]); } catch (e) { ck('CLERK_NL is geldige JSON', false, e.message); }
  for (const [sleutel, waarde] of [
    ['formFieldLabel__firstName', 'Voornaam'],
    ['formFieldLabel__lastName', 'Achternaam'],
    ['formFieldHintText__optional', 'Optioneel'],
  ]) {
    ck(`${sleutel} -> ${waarde}`, clerk[sleutel] === waarde, clerk[sleutel]);
  }
  ck('de wachtwoordfout is vertaald',
     /^Je wachtwoord/.test((clerk.unstable__errors || {}).form_password_length_too_short || ''),
     (clerk.unstable__errors || {}).form_password_length_too_short);
  /* Het aantal tekens komt uit het Clerk-dashboard. Staat het hier als cijfer,
     dan liegt de melding zodra die regel verandert. */
  {
    const m = (clerk.unstable__errors || {}).form_password_length_too_short || '';
    ck('en noemt het aantal niet als hardgecodeerd cijfer',
       m.indexOf('{{length}}') > -1 && !/\b(8|12|15|16|20)\b/.test(m), m);
  }
}

console.log('\n— de oude inlogvelden trokken de wachtwoordmanager weg —');
{
  /* Ze staan er nog als vangnet voor als Clerk niet laadt. Maar zolang Clerk
     WEL staat zijn ze onzichtbaar en dragen ze autocomplete="username" en
     "current-password" -- precies waar een wachtwoordmanager op mikt. */
  ck('de velden bestaan nog (het vangnet blijft)',
     html.indexOf('id="login-email"') > -1 && html.indexOf('id="login-password"') > -1, null);
  ck('er is één plek die ze aan/uit zet', /function oudeVeldenActief\(actief\)/.test(js), null);
  ck('een gemonteerde Clerk zet ze uit',
     /clerk\.mountSignIn\(host, CLERK_APPEARANCE\);\s*\n\s*oudeVeldenActief\(false\);/.test(js)
     && /clerk\.mountSignUp\(host, CLERK_APPEARANCE\);\s*\n\s*oudeVeldenActief\(false\);/.test(js), null);
  ck('en het tonen van het eigen formulier zet ze weer aan',
     /function eigenFormulier\(zichtbaar\) \{[\s\S]{0,900}oudeVeldenActief\(!!zichtbaar\)/.test(js), null);
  /* Staat Clerk helemaal uit, dan komt oudeVeldenActief(false) nooit langs en
     werkt het klassieke formulier zoals altijd. Dat is waarom het NIET in de
     HTML als disabled staat. */
  ck('ze staan niet als disabled in de HTML zelf',
     !/id="login-email"[^>]*disabled/.test(html) && !/id="login-password"[^>]*disabled/.test(html), null);
}

console.log('\n— een dialoogvenster hield de focus niet vast —');
{
  /* Live gemeten op #koop-modal: na openen bleef document.activeElement op
     BODY staan, Escape deed niets, en Tab liep door de pagina erachter. Het
     venster belooft met aria-modal="true" het tegendeel. */
  ck('er is een gedeelde helper', /function modalToetsenbord\(venster, sluit\)/.test(js), null);
  ck('de focus gaat het venster in', /var eerste = modalFocusbaar\(venster\)\[0\]/.test(js), null);
  ck('Escape sluit', /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); sluit\(\); return; \}/.test(js), null);
  ck('Tab maakt de cirkel rond',
     /document\.activeElement === laatste[\s\S]{0,80}eerste2\.focus\(\)/.test(js), null);
  ck('en de focus gaat terug na sluiten',
     /function modalToetsenbordUit\(\)[\s\S]{0,600}_modalVorigeFocus\.focus\(\)/.test(js), null);
  ck('het koopvenster gebruikt hem',
     /modalToetsenbord\(document\.getElementById\('koop-modal'\), closeKoopModal\)/.test(js), null);
  ck('en meldt zich af bij het sluiten',
     /function closeKoopModal\(\) \{[\s\S]{0,300}modalToetsenbordUit\(\)/.test(js), null);
}

console.log('\n— het detailpaneel stond buiten beeld maar in de tabvolgorde —');
{
  const dicht = (html.match(/^\.detail-panel \{[\s\S]*?^\}/m) || [''])[0];
  const open  = (html.match(/^\.detail-panel\.visible \{[\s\S]*?^\}/m) || [''])[0];
  ck('het juiste .detail-panel-blok is gevonden', /width:\s*480px/.test(dicht), dicht.slice(0, 120));
  ck('dicht = visibility:hidden', /visibility:\s*hidden/.test(kaal(dicht)), dicht.slice(0, 160));
  ck('open  = visibility:visible', /visibility:\s*visible/.test(kaal(open)), open.slice(0, 160));
  /* Zonder vertraging bij het sluiten springt het paneel halverwege weg in
     plaats van uit te schuiven. */
  ck('en de animatie blijft heel',
     /visibility 0s linear var\(--dur-enter\)/.test(dicht) && /visibility 0s linear 0s/.test(open), null);
}

console.log('\n— twee aanraakdoelen waren te klein —');
{
  const dot = (html.match(/^\.brand-dot \{[\s\S]*?^\}/m) || [''])[0];
  const tc  = (html.match(/^\.toast-close \{[\s\S]*?^\}/m) || [''])[0];
  ck('de diabolletjes zijn 24px hoog', /height:\s*24px/.test(kaal(dot)), dot.slice(0, 140));
  ck('maar zien er nog uit als een streepje van 4px',
     /center \/ 20px 4px no-repeat/.test(dot), dot.slice(0, 200));
  ck('het kruisje van een melding is 24x24',
     /min-width:\s*24px/.test(kaal(tc)) && /min-height:\s*24px/.test(kaal(tc)), tc.slice(0, 160));
}

console.log('\n— een mislukte offerte laat geen kale kop achter —');
{
  ck('er komt uitleg in plaats van een lege tegelrij',
     /De bedragen konden niet opgehaald worden/.test(js), null);
  ck('maar een eerder geslaagde lijst blijft staan',
     /if \(tegelsEl && !koopState\.presets\.length\)/.test(js), null);
}

console.log('\n— de codestap bij inloggen stond volledig in het Engels —');
{
  /* Wachtwoord-inloggen staat UIT op de Clerk-instantie (supportedFirstFactors
     gaf alleen email_code + oauth_google). Iedereen belandt dus op de
     codestap, en die was Engels: "Check your email", "Didn't receive a code?
     Resend". */
  const c2 = JSON.parse((js.match(/var CLERK_NL = (\{[\s\S]*?\});/) || ['', '{}'])[1]);
  ck('signIn.emailCode is vertaald', c2.signIn.emailCode.title === 'Kijk in je mailbox', c2.signIn.emailCode.title);
  ck('de opnieuw-versturen-link ook', /^Geen code ontvangen/.test(c2.signIn.emailCode.resendButton), c2.signIn.emailCode.resendButton);
  ck('en "andere manier" ook', c2.signIn.alternativeMethods.title === 'Op een andere manier inloggen', c2.signIn.alternativeMethods.title);
}

console.log('\n— het merkpaneel stapelde onder de footer op smal —');
{
  const mq = (html.match(/@media \(max-width: 860px\) \{[\s\S]*?\n\}/) || [''])[0];
  ck('het paneel gaat weg onder 860px', /\.login-brand-side \{ display: none; \}/.test(kaal(mq)), mq.slice(0, 200));
  ck('en het logo neemt minder ruimte', /\.login-logo-top img \{ max-width: 150px; \}/.test(kaal(mq)), null);
}

console.log('\n— twee lege toestanden naast elkaar bij Gesprekken —');
{
  ck('een lege lijst krijgt de volle breedte', /\.conv-layout\.leeg \.conv-list \{[\s\S]{0,120}width: 100%/.test(html), null);
  ck('en de rechterhelft verdwijnt', /\.conv-layout\.leeg \.conv-detail \{ display: none; \}/.test(html), null);
  ck('de klasse wordt gezet op basis van het aantal', /classList\.toggle\('leeg', withConvs\.length === 0\)/.test(js), null);
}

console.log('\n— Facturatie liet lege kaarten achter bij een storing —');
{
  ck('de kaarten krijgen tekst bij een fout', /Niet opgehaald\. Ververs de pagina\./.test(js), null);
  /* Twee banners gaven verschillend advies voor dezelfde storing. */
  ck('en het advies is overal hetzelfde',
     !/Probeer het zo meteen opnieuw/.test(js) || /Ververs de pagina/.test(js), null);
}

console.log('\n— skeletten bleven eeuwig draaien na een fout —');
{
  ck('er is een functie die ze stopt', /function stopSkeletten\(\)/.test(js), null);
  ck('de foutbanner roept hem aan', /el\.style\.display = 'flex';[\s\S]{0,700}stopSkeletten\(\)/.test(js), null);
  ck('en "Laden..." wordt een eerlijke tekst', /lab\.textContent = 'Niet opgehaald'/.test(js), null);
}

console.log('\n— Instellingen toonde een plan dat niet bestaat —');
{
  ck('"Pro" staat niet meer hardgecodeerd in de HTML',
     !/>Pro<\/span>/.test(html), null);
  ck('de badge heeft een id', /id="set-plan"/.test(html), null);
  ck('en de naam komt uit de plannenlijst', /planState\.plannen \|\| \[\]\)\.filter/.test(js), null);
}

console.log('\n— /login en /signup gaven 404 —');
{
  const vercel = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'vercel.json'), 'utf8'));
  const bronnen = vercel.rewrites.map((r) => r.source);
  ck('/login bestaat',  bronnen.indexOf('/login') > -1, bronnen.join(','));
  ck('/signup bestaat', bronnen.indexOf('/signup') > -1, null);
  ck('en /signup opent het registratieformulier',
     /location\.pathname\)\) mountClerkSignUp\(clerk\)/.test(js)
     && js.indexOf('signup') > -1, null);
}

console.log('\n— één manier om te wisselen, niet drie —');
{
  ck('de dubbele regel onder de kaart is weg',
     /function setClerkToggle\(view\) \{[\s\S]{0,200}el\.style\.display = 'none'/.test(js), null);
  ck('en er is geen dode functie blijven staan', js.indexOf('setClerkToggleOud') === -1, null);
}

/* ── www.helvaro.pro hoorde hier nooit bij ──────────────────────────────────
   Dat domein hangt per ongeluk aan dit Vercel-project. Gevolg was echt schade:
   Google indexeerde het INLOGSCHERM als hoofdresultaat voor "helvaro", met de
   wizardteksten als omschrijving, in plaats van de marketingsite. Er stond al
   een noindex-header tegen; deze redirect maakt bovendien ondubbelzinnig welk
   adres het echte is.

   Het subtiele zit in de VOLGORDE. Vercel loopt redirects van boven naar
   beneden. Staat de host-regel onder "/" -> "/dashboard", dan wordt www eerst
   naar /dashboard gestuurd en pas daarna doorverwezen: een extra sprong, en op
   de verkeerde host. Daarom controleert deze test niet alleen dát de regel
   bestaat, maar dat hij BOVENAAN staat. */
console.log('\n— www wordt doorgestuurd naar het echte adres —');
{
  const vercel = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'vercel.json'), 'utf8'));
  const red = vercel.redirects || [];
  const isWww = (r) => (r.has || []).some((h) => h.type === 'host' && h.value === 'www.helvaro.pro');
  const idxWww = red.findIndex(isWww);
  const idxRoot = red.findIndex((r) => r.source === '/' && !r.has);

  /* Live gebleken: ":pad*" matcht de KALE "/" niet. www.helvaro.pro/ ging
     daardoor eerst naar /dashboard OP WWW, en pas die pagina verwees door --
     twee sprongen, en de eerste op de verkeerde host. Daarom een eigen regel
     voor de root. Deze assertie bestaat omdat de vorige versie hem miste. */
  ck('de kale "/" heeft een eigen www-regel',
     red.some((r) => isWww(r) && r.source === '/'),
     JSON.stringify(red.filter(isWww).map((r) => r.source)));
  ck('er is een host-regel voor www', idxWww > -1, JSON.stringify(red.map((r) => r.source)));
  ck('en die staat vóór de "/" -> "/dashboard" regel', idxWww > -1 && idxRoot > -1 && idxWww < idxRoot,
     `www op ${idxWww}, root op ${idxRoot}`);
  /* Er zijn nu TWEE www-regels: een voor de kale "/" en een voor al het
     andere. De padcontrole hoort bij de tweede -- op de eerste zou hij per
     definitie falen, want daar is geen pad. */
  const wwwRegels = red.filter(isWww);
  const wildcard = wwwRegels.find((r) => /:pad\*/.test(r.source));
  ck('alle www-regels wijzen naar app.helvaro.pro',
     wwwRegels.length > 0 && wwwRegels.every((r) => /^https:\/\/app\.helvaro\.pro\//.test(r.destination)),
     wwwRegels.map((r) => r.destination).join(' | '));
  /* Het pad moet meeverhuizen. Zonder :pad* belandt iemand met een bladwijzer
     naar /dashboard of /start op de voorpagina in plaats van waar hij heen wou. */
  ck('en de wildcardregel neemt het pad mee',
     !!wildcard && /:pad\*/.test(wildcard.destination),
     wildcard ? wildcard.source + ' -> ' + wildcard.destination : '(geen wildcardregel)');
  ck('alle www-regels zijn permanent, zodat Google ze overneemt',
     wwwRegels.every((r) => r.permanent === true), null);
  /* De apex mag NIET meeverhuizen: daar staat de marketingsite, een ander
     Vercel-project. Die per ongeluk doorsturen haalt de website offline. */
  ck('de apex helvaro.pro blijft ongemoeid',
     !red.some((r) => (r.has || []).some((h) => h.value === 'helvaro.pro')), null);
}

/* ── Het leadformulier: drie dingen die live gemeten zijn ───────────────────
   Dit is de enige pagina die een LEAD te zien krijgt, en de enige waar Helvaro
   geld aan verdient. Alle drie de punten kwamen uit een echte meting in de
   browser, niet uit het lezen van de bron. */
console.log('\n— het leadformulier: aankondiging, focus en de iOS-zoom —');
{
  const fp = require('fs').readFileSync(require('path').join(__dirname, '..', 'api', 'form-page.js'), 'utf8');

  /* 1. De foutmelding werd door NIEMAND voorgelezen. Een schermlezergebruiker
        klikte op verzenden, er gebeurde ogenschijnlijk niets, en er was geen
        enkele aanwijzing waarom. Het inlogscherm van het dashboard had zijn
        role="alert" allang -- deze pagina niet. */
  ck('de foutmelding is een live region',
     /id="err"[^>]*role="alert"/.test(fp) && /id="err"[^>]*aria-live=/.test(fp), null);

  /* En dat hij op INHOUD getoond wordt in plaats van op een inline stijl. Met
     style.display kan de tekst er al staan voor het vak zichtbaar wordt, en dan
     kondigt een schermlezer niets aan -- de melding staat er dan wel, maar de
     aankondiging die we net toevoegden doet niets. */
  ck('en hij verschijnt op inhoud, niet op een inline display-stijl',
     /\.error:empty\s*\{\s*display:\s*none/.test(fp) && fp.indexOf("err.style.display") === -1,
     fp.indexOf('err.style.display') > -1 ? 'style.display staat er nog' : null);

  /* 2. iOS Safari zoomt in bij een invulveld onder 16px. Op 15px sprong het
        formulier bij elke tik in het telefoonveld. Alleen op touch, want met
        een muis is 15px de bedoelde maat. */
  ck('invoervelden zijn 16px op touch, tegen de iOS-zoom',
     /@media \(hover: none\) and \(pointer: coarse\) \{\s*input \{ font-size: 16px; \}/.test(fp), null);

  /* 3. Links hadden geen zichtbare focus. Gemeten in de browser: de velden en
        de knop hadden een ring, de privacylink en de footerlink niet. */
  ck('links hebben een zichtbare focusring', /a:focus-visible \{[\s\S]{0,80}outline:/.test(fp), null);

  /* De consent-gate blijft staan. Die is niet cosmetisch: zonder aangevinkte
     toestemming mag er geen WhatsApp uit, en dat is een AVG-grens. */
  ck('en de toestemmingsgrens staat er nog steeds',
     /if \(consent && !consent\.checked\)/.test(fp), null);
}

console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
