/*
 * De schermtaal van het dashboard.
 *
 * ── Twee talen die niets met elkaar te maken hebben ─────────────────────────
 * api/_lang.js gaat over de taal waarin de AI met een LEAD praat (40 talen,
 * met aanspreekvormen en WhatsApp-sjablonen). api/_i18n.js gaat over de taal
 * van de KNOPPEN die de makelaar ziet. Een Brussels kantoor kan Franstalige
 * leads bedienen met een Nederlands dashboard; die twee mogen elkaar niet
 * overschrijven. Deze test bewaakt dat ze gescheiden blijven.
 *
 * ── Waarom "fr-BE" hier een eigen test heeft ────────────────────────────────
 * _lang.normalizeLanguageCode('fr-BE') geeft 'nl' terug: bij een onbekende
 * waarde valt hij terug op de standaardtaal, en met de regiocode erbij is
 * 'fr-BE' onbekend. Browsers sturen in Accept-Language bijna ALTIJD een
 * regiocode. Had _i18n die functie hergebruikt, dan was er nooit iemand op een
 * Franse pagina beland en had niemand geweten waarom.
 */
'use strict';

const i18n = require('../api/_i18n.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 260));
  ok ? pass++ : fail++;
};
const req = (url, headers) => ({ url, headers: headers || {} });

console.log('\n— de volgorde: wie wint van wie —');
{
  const oudeEnv = process.env.DASHBOARD_LANG;
  delete process.env.DASHBOARD_LANG;

  ck('?lang= wint van alles',
     i18n.resolveer(req('/dashboard?lang=fr', { cookie: 'hv_lang=de', 'accept-language': 'en' })) === 'fr', null);
  ck('cookie wint van de browser',
     i18n.resolveer(req('/dashboard', { cookie: 'hv_lang=de', 'accept-language': 'en' })) === 'de', null);
  ck('de browser telt als er niets gekozen is',
     i18n.resolveer(req('/dashboard', { 'accept-language': 'en-GB,en' })) === 'en', null);
  ck('en anders Nederlands', i18n.resolveer(req('/dashboard')) === 'nl', null);

  process.env.DASHBOARD_LANG = 'de';
  ck('DASHBOARD_LANG is de terugval van de eigenaar',
     i18n.resolveer(req('/dashboard')) === 'de', null);
  ck('maar de bezoeker wint daarvan',
     i18n.resolveer(req('/dashboard', { cookie: 'hv_lang=fr' })) === 'fr', null);
  if (oudeEnv === undefined) delete process.env.DASHBOARD_LANG; else process.env.DASHBOARD_LANG = oudeEnv;
}

console.log('\n— regiocodes, want die stuurt elke browser mee —');
{
  ck('fr-BE -> fr', i18n.resolveer(req('/dashboard', { 'accept-language': 'fr-BE,fr;q=0.9' })) === 'fr', null);
  ck('nl-BE -> nl', i18n.resolveer(req('/dashboard', { 'accept-language': 'nl-BE' })) === 'nl', null);
  ck('de_AT -> de', i18n.kort('de_AT') === 'de', i18n.kort('de_AT'));
  /* Dit is precies waar _lang.js de fout in gaat; als _i18n die ooit gaat
     hergebruiken, valt deze test om. */
  const _lang = require('../api/_lang.js');
  ck('en _lang.js zou hier "nl" van maken (daarom eigen normalisatie)',
     _lang.normalizeLanguageCode('fr-BE') === 'nl', _lang.normalizeLanguageCode('fr-BE'));
}

console.log('\n— onzin leidt nooit tot een kapot scherm —');
{
  for (const rommel of ['es', 'zz', '', '../etc', 'nl; DROP', null]) {
    const uit = i18n.resolveer(req('/dashboard', { cookie: 'hv_lang=' + rommel }));
    ck(`cookie "${rommel}" -> een geldige taal (${uit})`, i18n.TALEN.indexOf(uit) > -1, uit);
  }
  ck('een kapotte URL laat de rest van de keten werken',
     i18n.TALEN.indexOf(i18n.resolveer({ url: '%%%', headers: { cookie: 'hv_lang=fr' } })) > -1, null);
}

console.log('\n— elke sleutel bestaat in ELKE taal —');
{
  /* Dit is de test die het onderhoud draagt. Een ontbrekende vertaling valt
     terug op Nederlands, dus je ZIET hem niet: het scherm blijft werken en er
     staat gewoon een Nederlands woord tussen het Frans. Zonder deze controle
     sluipt dat er bij elke nieuwe sleutel weer in. */
  const nlDict = i18n.woordenboek('nl');
  const sleutels = Object.keys(nlDict);
  ck('er zijn sleutels', sleutels.length > 20, sleutels.length);

  const ontbreekt = [];
  for (const taal of i18n.TALEN) {
    const d = i18n.woordenboek(taal);
    for (const k of sleutels) {
      if (!d[k] || !String(d[k]).trim()) ontbreekt.push(taal + ':' + k);
    }
  }
  ck('geen enkele ontbreekt', ontbreekt.length === 0, ontbreekt.slice(0, 8).join(', '));

  /* Vertaald, niet gekopieerd. Een handvol woorden is in meerdere talen
     hetzelfde (Pipeline, Exports) -- dat mag. Maar als de MEERDERHEID van een
     taal gelijk is aan het Nederlands, is die taal niet vertaald maar geplakt. */
  for (const taal of i18n.TALEN.filter((t) => t !== 'nl')) {
    const d = i18n.woordenboek(taal);
    const zelfde = sleutels.filter((k) => d[k] === nlDict[k]).length;
    ck(`${taal} is echt vertaald (${zelfde}/${sleutels.length} gelijk aan nl)`,
       zelfde < sleutels.length * 0.3, zelfde + ' van ' + sleutels.length);
  }
}

console.log('\n— variabelen worden ingevuld, in elke taal —');
{
  for (const taal of i18n.TALEN) {
    const s = i18n.t(taal, 'push.credit80.body', { used: 800, total: 1000 });
    ck(`${taal}: {used}/{total} ingevuld`, /800/.test(s) && /1000/.test(s) && !/\{used\}/.test(s), s.slice(0, 60));
  }
  ck('een onbekende sleutel geeft de sleutel terug, niet leeg',
     i18n.t('nl', 'bestaat.niet') === 'bestaat.niet', null);
}

console.log('\n— de pagina komt in de gekozen taal binnen —');
{
  process.env.FARO_WORKSPACE_ENABLED = '1';
  const render = (url, headers) => {
    delete require.cache[require.resolve('../api/dashboard.js')];
    const dash = require('../api/dashboard.js');
    let html = '';
    dash({ method: 'GET', url, headers: headers || {} },
         { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
    return html;
  };

  const nl = render('/dashboard');
  const fr = render('/dashboard?lang=fr');
  const de = render('/dashboard', { cookie: 'hv_lang=de' });

  ck('html lang volgt de taal',
     /<html lang="nl"/.test(nl) && /<html lang="fr"/.test(fr) && /<html lang="de"/.test(de), null);
  /* Het label staat op een eigen ingesprongen regel tussen icoon en </button>,
     dus niet strak tussen > en <. Zoeken op het woord binnen de navigatieknop. */
  const navLabel = (html, id) => {
    const i = html.indexOf('id="nav-' + id + '"');
    return i === -1 ? '' : html.slice(i, i + 900);
  };
  ck('de navigatie is vertaald',
     /Facturatie/.test(navLabel(nl, 'facturatie'))
     && /Facturation/.test(navLabel(fr, 'facturatie'))
     && /Abrechnung/.test(navLabel(de, 'facturatie')), navLabel(fr, 'facturatie').slice(-90));
  ck('en de groepskoppen ook',
     /aria-hidden="true">WERK</.test(nl) && /aria-hidden="true">TRAVAIL</.test(fr), null);

  /* Er mag geen moment zijn waarop er Nederlands staat dat daarna Frans wordt:
     de server zet het woordenboek van ÉÉN taal in de pagina. */
  ck('het woordenboek zit in de pagina', fr.indexOf('const T_DICT =') > -1, null);
  ck('en bevat alleen de gekozen taal',
     fr.indexOf('Facturation') > -1 && !/T_DICT = \{[^\n]*Abrechnung/.test(fr), null);

  /* De pagina is één grote template literal. Een backtick of ${ in een
     vertaling zou hem breken -- faro-check vangt dat ook, hier expliciet. */
  const dict = (fr.match(/const T_DICT = (\{[\s\S]*?\});/) || [])[1] || '';
  ck('het woordenboek is splice-veilig',
     dict.indexOf('`') === -1 && dict.indexOf('${') === -1, null);
}

console.log('\n— de inlogkaart spreekt dezelfde taal als de pagina —');
{
  /* Dit was het zichtbaarste gat: de pagina eromheen was Frans terwijl de
     kaart zelf Nederlands bleef, omdat de Clerk-vertalingen als één vast
     Nederlands blok in dashboard.js stonden. */
  for (const taal of i18n.TALEN) {
    const c = i18n.clerkLocalisatie(taal);
    ck(`${taal}: titel, knop en codestap gevuld`,
       !!(c.signIn.start.title && c.formButtonPrimary && c.signIn.emailCode.title
          && c.signIn.alternativeMethods.title && c.unstable__errors.form_identifier_not_found),
       JSON.stringify({ t: c.signIn.start.title, k: c.formButtonPrimary }));
  }
  const nlC = i18n.clerkLocalisatie('nl');
  const frC = i18n.clerkLocalisatie('fr');
  ck('en nl en fr verschillen echt',
     nlC.signIn.start.title !== frC.signIn.start.title
     && nlC.formButtonPrimary !== frC.formButtonPrimary, null);
  /* De sjabloonvariabelen van Clerk moeten heel blijven -- vertaal je
     {{identifier}} mee, dan staat er letterlijk dat woord op het scherm. */
  ck('Clerk-variabelen blijven staan',
     frC.socialButtonsBlockButton.indexOf('{{provider|titleize}}') > -1
     && frC.unstable__errors.form_password_length_too_short.indexOf('{{length}}') > -1, null);
}

console.log('\n— de taalkeuze blijft hangen —');
{
  process.env.FARO_WORKSPACE_ENABLED = '1';
  delete require.cache[require.resolve('../api/dashboard.js')];
  const dash = require('../api/dashboard.js');
  let html = '';
  dash({ method: 'GET', url: '/dashboard', headers: {} },
       { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });

  ck('er is een taalkiezer', html.indexOf('id="ui-taal"') > -1, null);
  ck('met vier talen',
     ['nl', 'fr', 'en', 'de'].every((c) => html.indexOf('value="' + c + '"') > -1), null);
  /* Een cookie en niet localStorage: de SERVER rendert de taal, dus die moet
     de keuze al bij het eerste verzoek kennen. */
  ck('de keuze gaat in een cookie', /document\.cookie = 'hv_lang='/.test(html), null);
  ck('en niet in localStorage',
     !/localStorage[^\n]{0,40}hv_lang/.test(html), null);
  ck('?lang= wordt uit de URL gehaald na het wisselen',
     /searchParams\.delete\('lang'\)/.test(html), null);
}

console.log('\n— de vertaalfunctie wordt door niets afgeschermd —');
{
  process.env.FARO_WORKSPACE_ENABLED = '1';
  delete require.cache[require.resolve('../api/dashboard.js')];
  const dash = require('../api/dashboard.js');
  let html = '';
  dash({ method: 'GET', url: '/dashboard', headers: {} },
       { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
  const js = (html.match(/<script>([\s\S]*?)<\/script>/g) || [])
    .map((x) => x.replace(/<\/?script>/g, '')).sort((a, b) => b.length - a.length)[0] || '';

  /* Dit ging live echt mis: navigateTo had een 'let t = titles[page]', en de
     titles-tabel erboven riep t('nav.dashboard') aan. Een lokale let met
     dezelfde naam zet de functie in de tijdelijke dode zone, dus navigeren gaf
     "Cannot access 't' before initialization" en deed helemaal niets meer.
     De tests zagen het niet, want die voeren navigateTo niet uit. */
  ck('de vertaalfunctie heet tr()', /function tr\(sleutel, vars\)/.test(js), null);
  /* Deze assertie keek eerst alleen naar t('sleutel. -- een letterlijke string
     meteen achter het haakje. Daardoor glipte zetModus() erdoor:
         t(modus === 'registreren' ? 'login.start' : 'login.welcome')
     De sleutel staat daar achter een ternary, dus het patroon matchte niet, de
     test bleef groen en op productie gooide Clerk "t is not defined" -- de
     inlogkaart monteerde niet meer en je viel terug op het oude formulier.
     Nu is de regel simpeler en strenger: er mag GEEN enkele kale t( meer staan.
     Dat is te controleren met grep op de bron, dus er is geen vorm van
     aanroepen die er alsnog langs kan. */
  ck('en er is geen enkele kale t(-aanroep meer over',
     !/[^a-zA-Z0-9_$.]t\(/.test(js), null);
  /* Een lokale 'let t' MAG blijven bestaan -- er zijn er acht, voor tagnamen en
     tijdstippen. Ze zijn alleen niet langer gevaarlijk. */
  ck('lokale t-variabelen zijn nu onschadelijk',
     /(let|var|const) t\s*=/.test(js) && /function tr\(/.test(js), null);
}

/* ── Het inlogscherm mag in geen enkele taal Nederlands lekken ───────────────
   Dit is het scherm waar een buitenlandse klant beslist of hij ons vertrouwt,
   en het was precies de plek waar het misging: een Engelse inlogkaart met een
   volledig Nederlands promopaneel ernaast, zij aan zij zichtbaar.

   Hoe we meten. Eerst probeerde ik een lijst Nederlandse woorden. Dat werkt
   niet tussen buurtalen: "hier" is Frans voor gisteren en "gratis" is gewoon
   Duits, dus die gaven vals alarm op correct vertaalde zinnen.

   Wat wel klopt: render dezelfde pagina twee keer, in het Nederlands en in de
   doeltaal, en vergelijk de ZICHTBARE zinnen. Staat een zin letterlijk in
   allebei, dan is hij niet vertaald -- dat is precies de fout die we zoeken,
   zonder aannames over welke woorden bij welke taal horen.

   De uitzonderingen hieronder zijn zinnen die in elke taal hetzelfde HOREN te
   zijn: merknamen en een e-mailplaceholder. Die lijst moet kort blijven; wordt
   hij lang, dan is dat een teken dat er iets niet vertaald wordt. */
console.log('\n— het inlogscherm lekt geen Nederlands —');
{
  delete require.cache[require.resolve('../api/dashboard.js')];
  const dash = require('../api/dashboard.js');

  const MAG_GELIJK = new Set([
    'WhatsApp', 'Helvaro',
    /* De taalnamen in de kiezer staan bewust in hun eigen taal: wie zoekt naar
       "Deutsch" moet dat woord zien staan, niet "Duits". */
    'Nederlands', 'Français', 'English', 'Deutsch',
    'name@company.be', 'Marie D.', 'Jonas P.', 'Sofie M.',
    /* Het copyrightfragment is een symbool en een jaartal. */
    '&copy; 2026',
    /* "Slide" is in het Engels hetzelfde woord als in het Nederlands. Frans
       (Diapositive) en Duits (Folie) verschillen wel, dus die worden nog echt
       gecontroleerd -- dit is geen gat in de test, alleen in deze ene taal. */
    'Slide 1', 'Slide 2', 'Slide 3']);

  const zinnenVan = (accept) => {
    let html = '';
    dash({ method: 'GET', url: '/dashboard', headers: accept ? { 'accept-language': accept } : {} },
         { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
    const start = html.indexOf('id="login-page"');
    const eind  = html.indexOf('id="dashboard-app"');
    if (start < 0 || eind <= start) return null;
    const stuk = html.slice(start, eind)
                     .replace(/<script[\s\S]*?<\/script>/g, ' ')
                     .replace(/<style[\s\S]*?<\/style>/g, ' ')
                     .replace(/<!--[\s\S]*?-->/g, ' ')
                     /* on*-attributen bevatten JavaScript met < en > erin. Zonder dit
                        leest de zin-extractie stukken code als zichtbare tekst. */
                     .replace(/\son[a-z]+="[^"]*"/g, ' ');
    const uit = new Set();
    stuk.replace(/>([^<>]+)</g, (m, t) => {
      const x = t.replace(/\s+/g, ' ').trim();
      if (x.length >= 6 && !/^[\d\s€%.,:/+-]+$/.test(x)) uit.add(x);
      return m;
    });
    /* De aria-labels tellen mee: dat is wat een schermlezer voorleest, en een
       Nederlands label op een Frans scherm is daar even fout als op het beeld. */
    stuk.replace(/aria-label="([^"]+)"/g, (m, t) => { if (t.trim().length >= 6) uit.add(t.trim()); return m; });
    return uit;
  };

  const nl = zinnenVan('nl-BE,nl');
  ck('het inlogscherm is te vinden in de pagina', !!nl && nl.size > 10, nl && nl.size);

  for (const [taal, accept] of [['fr', 'fr-BE,fr'], ['en', 'en-US,en'], ['de', 'de-DE,de']]) {
    const doel = zinnenVan(accept);
    const gelijk = [...(doel || [])].filter((z) => nl.has(z) && !MAG_GELIJK.has(z));
    ck(`${taal}: geen zin staat er nog letterlijk in het Nederlands`,
       gelijk.length === 0, gelijk.slice(0, 4).join(' | '));
  }

  /* En andersom: in het Nederlands MOET het Nederlands blijven. Zonder deze
     helft zou een lege vertaaltabel de test hierboven ook groen maken. */
  ck('nl: het promopaneel staat er wel gewoon in het Nederlands',
     nl.has('Antwoord binnen de minuut'), null);
}

/* De taalkiezer moet VOOR het inloggen bereikbaar zijn. Stond hij alleen in
   Instellingen, dan zat een Vlaamse makelaar met een Engelse browser vast op
   een Engels scherm tot na het inloggen -- precies wanneer hij nog moet
   beslissen of hij dit vertrouwt. */
console.log('\n— de taal is te kiezen voordat je binnen bent —');
{
  delete require.cache[require.resolve('../api/dashboard.js')];
  const dash = require('../api/dashboard.js');
  let html = '';
  dash({ method: 'GET', url: '/dashboard', headers: {} },
       { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
  const login = html.slice(html.indexOf('id="login-page"'), html.indexOf('id="dashboard-app"'));
  ck('er staat een taalkiezer op het inlogscherm', /id="login-taal"/.test(login), null);
  ck('met alle vier de talen',
     ['nl', 'fr', 'en', 'de'].every((c) => login.indexOf(`value="${c}"`) > -1), null);
  ck('en hij hangt aan taalWisselen', /id="login-taal"[\s\S]{0,120}taalWisselen/.test(login), null);
}

/* ── Een vertaling in een onclick-attribuut mag dat attribuut niet breken ────
   Dit ging live echt mis. Ik zette JSON.stringify(T('login.pw.hide')) in het
   onclick van de wachtwoord-toggle. JSON.stringify levert DUBBELE quotes, en
   dat attribuut staat zelf tussen dubbele quotes -- dus het attribuut eindigde
   halverwege en de rest van de JavaScript, inclusief een lap SVG, liep als
   losse HTML de pagina in. De console stond vol met
   `<circle> attribute r: Expected length` en de toggle deed niets meer.

   De testsuite was groen: die keek naar de vertaling, niet naar de vorm van het
   attribuut. Hier controleren we de vorm. */
console.log('\n— vertalingen in on*-attributen blijven binnen de quotes —');
{
  delete require.cache[require.resolve('../api/dashboard.js')];
  const dash = require('../api/dashboard.js');

  for (const [taal, accept] of [['nl', 'nl-BE,nl'], ['fr', 'fr-BE,fr'], ['en', 'en-US,en'], ['de', 'de-DE,de']]) {
    let html = '';
    dash({ method: 'GET', url: '/dashboard', headers: { 'accept-language': accept } },
         { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });

    /* Elk on*-attribuut moet netjes eindigen op zijn eigen aanhalingsteken.
       Een dubbele quote ERIN sluit hem te vroeg; dan matcht deze regex een
       kortere string en blijft er JavaScript buiten het attribuut staan. */
    let stuk = 0;
    html.replace(/\son[a-z]+="([^"]*)"/g, (m, inhoud) => {
      /* Een losse, niet-ontsnapte dubbele quote kan er per definitie niet in
         zitten (dan had de regex al eerder geknipt), dus we controleren het
         gevolg: eindigt de JavaScript midden in een string of een tag? */
      const openTags = (inhoud.match(/<[a-z]/gi) || []).length;
      const slotTags = (inhoud.match(/>/g) || []).length;
      if (openTags > 0 && slotTags === 0) stuk++;
      return m;
    });
    ck(`${taal}: geen on*-attribuut dat midden in een tag afbreekt`, stuk === 0, `${stuk} kapot`);

    /* En specifiek de toggle, want dat is degene die omviel. */
    const i = html.indexOf('btn-toggle-pw');
    const knop = html.slice(i, i + 1600);
    /* ALLE aanroepen, niet "er is er een die goed is". De toggle heeft er twee
       (tonen en verbergen) en mijn eerste versie van deze assertie vond de
       goede terwijl de andere kapot was -- de test was groen met de bug erin.
       Dat is erger dan geen test. */
    const setjes = knop.match(/setAttribute\('aria-label',[^)]*\)/g) || [];
    ck(`${taal}: de wachtwoord-toggle zet aria-label met ENKELE quotes`,
       setjes.length === 2 && setjes.every((x) => /^setAttribute\('aria-label','[^']*'\)$/.test(x)),
       setjes.join('  ||  ') || '(niet gevonden)');
  }
}

/* ── Het dashboard mag geen half Nederlands scherm zijn ────────────────────
   Live gevonden tijdens een E2E als klant: het account stond op Engels
   (lang="en"), en de landingspagina zette "Get started with Helvaro" boven een
   checklist die volledig in het Nederlands stond -- "Koppel je Google Agenda",
   "Vertel over je bedrijf", "3 van 5 klaar". Twaalf van de veertien schermen
   lekten Nederlands.

   Dit test op CONCRETE strings en niet op een woordenlijst-heuristiek. Een
   eerdere poging met "ziet dit er Nederlands uit?" sloeg aan op het Franse
   "hier" en het Duitse "gratis" -- een detector die vals alarm geeft, wordt
   uitgezet, en dan bewaakt hij niets meer. */
console.log('\n— de checklist en de proefbanner zijn vertaalbaar —');
{
  const NOOIT_BUITEN_NL = [
    'Koppel je Google Agenda',
    'Bekijk de plannen',
    'Ontvang je eerste lead',
    'Bijgewerkt zojuist',
    'Alle functies zijn beschikbaar',
    'Deel je formulierlink',
  ];
  const SLEUTELS = [
    'chk.email.title', 'chk.business.title', 'chk.ainame.title',
    'chk.gcal.title', 'chk.lead.title', 'chk.progress',
    'trial.cta', 'trial.sub', 'hdr.refresh', 'hdr.updated',
  ];

  for (const taal of ['en', 'fr', 'de']) {
    delete require.cache[require.resolve('../api/dashboard.js')];
    const dash = require('../api/dashboard.js');
    let html = '';
    dash({ method: 'GET', url: '/dashboard?lang=' + taal, headers: {} },
      { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });

    /* De strings mogen nog wel in COMMENTAAR staan; het gaat om wat de klant
       ziet. Daarom uit het woordenboek lezen in plaats van uit de ruwe HTML. */
    const m = html.match(/const T_DICT = (\{[\s\S]*?\});/);
    const dict = m ? JSON.parse(m[1]) : {};

    ck(`${taal}: alle checklist- en proefbanner-sleutels bestaan`,
      SLEUTELS.every((k) => typeof dict[k] === 'string' && dict[k].length > 1),
      SLEUTELS.filter((k) => !dict[k]));

    ck(`${taal}: en geen enkele daarvan is nog Nederlands`,
      !SLEUTELS.some((k) => NOOIT_BUITEN_NL.indexOf(dict[k]) !== -1),
      SLEUTELS.filter((k) => NOOIT_BUITEN_NL.indexOf(dict[k]) !== -1).map((k) => k + '=' + dict[k]));
  }

  /* En -- de belangrijkste -- de CODE moet die sleutels ook echt gebruiken.
     Mijn eerste versie las alleen het woordenboek, en dat is groen te krijgen
     met de bug er nog in: de sleutels bestaan en zijn vertaald, terwijl de
     checklist gewoon een hardgecodeerde Nederlandse titel rendert. Dat is
     precies het soort test dat je een vals gevoel van veiligheid geeft. */
  {
    delete require.cache[require.resolve('../api/dashboard.js')];
    const dashCode = require('../api/dashboard.js');
    let h = '';
    dashCode({ method: 'GET', url: '/dashboard?lang=en', headers: {} },
      { setHeader() {}, status() { return this; }, send(b) { h = String(b); }, json() {}, end() {} });

    const blok = h.slice(h.indexOf('function getOnboardingChecklistItems'),
                         h.indexOf('function chkItemAction'));
    ck('de checklist bouwt zijn titels met tr(), niet met vaste tekst',
      /title: tr\('chk\.email\.title'\)/.test(blok)
      && /title: tr\('chk\.business\.title'\)/.test(blok)
      && /title: tr\('chk\.ainame\.title'\)/.test(blok)
      && /title: tr\('chk\.gcal\.title'\)/.test(blok)
      && /title: tr\('chk\.lead\.title'\)/.test(blok),
      blok.slice(0, 200));
    ck('en er staat geen Nederlandse titel meer hardgecodeerd in dat blok',
      !/title: '(?:Koppel|Vertel|Ontvang|Geef|E-mailadres)/.test(blok), null);
  }

  /* De statkaarten zochten hun kleur en icoon op via het LABEL. Dat werkte
     zolang die labels vaste tekst waren; toen ze vertaalbaar werden vond de
     tabel niets meer en kregen alle zes de kaarten dezelfde blauwe cirkel.
     Live gezien op productie. Een opzoeksleutel mag geen tekst zijn die de
     gebruiker kan zien. */
  {
    delete require.cache[require.resolve('../api/dashboard.js')];
    const dashMeta = require('../api/dashboard.js');
    let h = '';
    dashMeta({ method: 'GET', url: '/dashboard?lang=en', headers: {} },
      { setHeader() {}, status() { return this; }, send(b) { h = String(b); }, json() {}, end() {} });
    ck('de statkaarten zoeken hun icoon op via een id, niet via het label',
      /META\[c\.id\]/.test(h) && !/META\[c\.label\]/.test(h), null);
    ck('en de META-tabel is ook op ids gesleuteld',
      /const META = \{\s*total:/.test(h), null);
    ck('de tijdsaanduiding is vertaalbaar (geen "Updated zojuist")',
      /return tr\('ago\.now'\)/.test(h) && !/'zojuist'/.test(h.replace(/\/\*[\s\S]*?\*\//g, '')), null);
  }

  // En in het Nederlands hoort er gewoon Nederlands te staan.
  delete require.cache[require.resolve('../api/dashboard.js')];
  const dashNl = require('../api/dashboard.js');
  let nlHtml = '';
  dashNl({ method: 'GET', url: '/dashboard?lang=nl', headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { nlHtml = String(b); }, json() {}, end() {} });
  const nlDict = JSON.parse((nlHtml.match(/const T_DICT = (\{[\s\S]*?\});/) || [])[1] || '{}');
  ck('nl: de Nederlandse tekst staat er nog steeds',
    nlDict['chk.gcal.title'] === 'Koppel je Google Agenda', nlDict['chk.gcal.title']);
}

/* ── Het ding heeft een naam ───────────────────────────────────────────────
   "AI" is geen naam, het is een technologie. Het product noemt zichzelf nu naar
   wat het IS: Faro is de assistent in het dashboard, en wat met de leads praat
   heet "je assistent" -- want die krijgt zijn eigen naam van de klant
   (ap.name), dus "Mathis" of "Sara", niet "de AI".

   TWEE UITZONDERINGEN, allebei met opzet:
   - img.honest: de mededeling dat een BEELD door een model gemaakt is. Daar is
     "AI" het juiste en eerlijke woord; dat is geen merknaam maar een
     waarschuwing aan de kijker.
   - de zin waarin de assistent zelf toegeeft dat hij een AI is als een lead
     ernaar vraagt. Die moet er juist staan.

   Alles daarbuiten hoort weg te blijven, ook in nieuwe teksten. */
console.log('\n— het product noemt zichzelf niet "AI" —');
{
  const TOEGESTAAN = new Set(['img.honest']);
  for (const taal of ['nl', 'fr', 'en', 'de']) {
    const d = i18n.woordenboek(taal);
    const fout = Object.keys(d)
      .filter((k) => !TOEGESTAAN.has(k))
      .filter((k) => /\b(AI|IA|KI)\b/.test(d[k]));
    ck(`${taal}: geen enkele tekst noemt het "AI"`, fout.length === 0,
       fout.map((k) => k + '=' + d[k].slice(0, 60)));
  }

  /* En het moet wél ergens "assistent" heten -- anders is de vervanging
     doorgeschoten en staat er nu helemaal niets. */
  for (const taal of ['nl', 'fr', 'en', 'de']) {
    const d = i18n.woordenboek(taal);
    const aantal = Object.keys(d).filter((k) => /assistent|assistant/i.test(d[k])).length;
    ck(`${taal}: het heet wel degelijk ergens "assistent" (${aantal}x)`, aantal >= 15, aantal);
  }
}

console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
